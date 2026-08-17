export type TyreCompound = 'soft' | 'medium' | 'hard'

export type TyreState = {
  compound: TyreCompound
  tempC: number
  wear: number
}

type CompoundSpec = {
  peakGrip: number
  optimalTempC: number
  tempWindow: number
  wearRate: number
}

const COMPOUNDS: Record<TyreCompound, CompoundSpec> = {
  soft: { peakGrip: 1.75, optimalTempC: 95, tempWindow: 30, wearRate: 4.0e-4 },
  medium: { peakGrip: 1.6, optimalTempC: 100, tempWindow: 35, wearRate: 2.5e-4 },
  hard: { peakGrip: 1.45, optimalTempC: 110, tempWindow: 40, wearRate: 1.6e-4 },
}

const HEATING = 90
const COOLING = 0.6
const AMBIENT_C = 25

/** Множитель сцепления с учётом состава, температуры и износа. */
export function gripFactor(state: TyreState): number {
  const spec = COMPOUNDS[state.compound]
  const offset = (state.tempC - spec.optimalTempC) / spec.tempWindow
  const tempPenalty = Math.exp(-offset * offset)
  const wearPenalty = 1 - 0.35 * state.wear
  return spec.peakGrip * tempPenalty * wearPenalty
}

/**
 * Продольная и боковая силы по упрощённой Magic Formula, ограниченные кругом
 * трения: суммарная сила не может превысить load * grip, поэтому разгон
 * "съедает" боковое сцепление и наоборот.
 */
export function tyreForce(
  state: TyreState,
  slipRatio: number,
  slipAngle: number,
  load: number,
): { longitudinal: number; lateral: number } {
  const grip = gripFactor(state)
  // Разгруженное колесо не передаёт силу: отрицательная нагрузка физически
  // означает, что колесо оторвалось от полотна.
  const limit = Math.max(0, load) * grip

  const longRaw = magicFormula(slipRatio, 10) * limit
  const latRaw = magicFormula(slipAngle / (Math.PI / 2), 8) * limit

  const magnitude = Math.hypot(longRaw, latRaw)
  if (magnitude <= limit || magnitude === 0) {
    return { longitudinal: longRaw, lateral: latRaw }
  }
  const scale = limit / magnitude
  return { longitudinal: longRaw * scale, lateral: latRaw * scale }
}

/** Нормализованная Magic Formula: растёт до пика, дальше падает — это и есть срыв. */
function magicFormula(slip: number, stiffness: number): number {
  return Math.sin(1.9 * Math.atan(stiffness * slip))
}

/** Нагрев от скольжения, остывание к окружающей температуре, накопление износа. */
export function updateTyre(state: TyreState, slipMagnitude: number, dt: number): TyreState {
  const spec = COMPOUNDS[state.compound]
  const heating = HEATING * Math.abs(slipMagnitude)
  const cooling = COOLING * (state.tempC - AMBIENT_C)
  return {
    compound: state.compound,
    tempC: state.tempC + (heating - cooling) * dt,
    wear: Math.min(1, state.wear + spec.wearRate * Math.abs(slipMagnitude) * dt),
  }
}

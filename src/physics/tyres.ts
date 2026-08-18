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
  // Коэффициент сцепления слика F1 — 1.8-2.0, а не 1.45-1.75: при заниженном
  // значении разгон упирался в буксование и 0-100 занимал 3.5 с вместо 2.6.
  soft: { peakGrip: 2.05, optimalTempC: 95, tempWindow: 45, wearRate: 4.0e-4 },
  medium: { peakGrip: 1.95, optimalTempC: 100, tempWindow: 50, wearRate: 2.5e-4 },
  hard: { peakGrip: 1.8, optimalTempC: 110, tempWindow: 55, wearRate: 1.6e-4 },
}

const HEATING = 90
// Охлаждение растёт с перегревом быстрее линейного: шина отдаёт тепло в диск и
// обод, и чем она горячее, тем интенсивнее. Прежний линейный отвод давал
// равновесие за 130 °C, где сцепление почти нулевое — машина глохла посреди
// заезда. Деление на 75^(exp−1) нормирует кривую так, что около 100 °C отвод
// совпадает с прежним линейным, иначе сломался бы прогрев на прямой.
const COOLING = 0.75
const COOLING_EXPONENT = 1.35
const AMBIENT_C = 25
/** Перегрев, на котором новая кривая охлаждения сшивается со старой линейной. */
const COOLING_REFERENCE_C = 75

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
  const excess = Math.max(0, state.tempC - AMBIENT_C)
  const cooling = COOLING * Math.pow(excess, COOLING_EXPONENT)
    / Math.pow(COOLING_REFERENCE_C, COOLING_EXPONENT - 1)
  return {
    compound: state.compound,
    // Нижняя граница — окружающая температура: остыть ниже воздуха шина не может,
    // а перелёт за один шаг иначе загонял бы её в минус на крупном dt.
    tempC: Math.max(AMBIENT_C, state.tempC + (heating - cooling) * dt),
    wear: Math.min(1, state.wear + spec.wearRate * Math.abs(slipMagnitude) * dt),
  }
}

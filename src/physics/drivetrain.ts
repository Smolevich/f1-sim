export type ErsState = {
  chargeJ: number
  deploying: boolean
}

export const GEAR_RATIOS: number[] = [12.5, 9.6, 7.8, 6.5, 5.6, 4.9, 4.35, 3.9]

/** Регламентный запас ERS на круг, джоули (4 МДж). */
export const MAX_ERS_J = 4_000_000
export const ERS_BOOST_W = 120_000

const PEAK_TORQUE_NM = 520
const PEAK_RPM = 10_500
const MAX_RPM = 15_000
const IDLE_RPM = 4_000
const WHEEL_RADIUS_M = 0.36
const RECOVERY_W = 250_000

/** Кривая момента: колокол с пиком на PEAK_RPM, срез после максимума. */
export function engineTorque(rpm: number): number {
  if (rpm <= 0 || rpm > MAX_RPM) return 0
  const offset = (rpm - PEAK_RPM) / PEAK_RPM
  return PEAK_TORQUE_NM * Math.max(0, 1 - 0.9 * offset * offset)
}

export function wheelTorque(rpm: number, gear: number, throttle: number): number {
  const ratio = GEAR_RATIOS[clampGear(gear) - 1]
  return engineTorque(rpm) * ratio * Math.max(0, Math.min(1, throttle))
}

export function rpmFor(speedMs: number, gear: number): number {
  const ratio = GEAR_RATIOS[clampGear(gear) - 1]
  const rpm = (speedMs / WHEEL_RADIUS_M) * ratio * (60 / (2 * Math.PI))
  return Math.min(MAX_RPM, Math.max(IDLE_RPM, rpm))
}

/** Передача, на которой обороты ближе всего к пиковым — основа автокоробки. */
export function bestGear(speedMs: number): number {
  let best = 1
  let bestDistance = Infinity
  for (let gear = 1; gear <= GEAR_RATIOS.length; gear++) {
    const distance = Math.abs(rpmFor(speedMs, gear) - PEAK_RPM)
    if (distance < bestDistance) {
      bestDistance = distance
      best = gear
    }
  }
  return best
}

export function updateErs(
  state: ErsState,
  throttle: number,
  braking: number,
  dt: number,
): ErsState {
  const recovered = RECOVERY_W * Math.max(0, Math.min(1, braking)) * dt
  const spent = state.deploying && throttle > 0.5 ? ERS_BOOST_W * dt : 0
  return {
    chargeJ: Math.max(0, Math.min(MAX_ERS_J, state.chargeJ + recovered - spent)),
    deploying: state.deploying,
  }
}

export function ersBoostW(state: ErsState): number {
  return state.deploying && state.chargeJ > 0 ? ERS_BOOST_W : 0
}

function clampGear(gear: number): number {
  return Math.max(1, Math.min(GEAR_RATIOS.length, Math.round(gear)))
}

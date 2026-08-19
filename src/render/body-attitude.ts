/**
 * Визуальный крен и клевок кузова.
 *
 * Подвеска физики жёсткая: замер по кругу с разгоном, поворотом и торможением
 * дал размах тангажа 0.52° и крена 3.6°. Машина идёт как по рельсам, и это
 * читается как «парит над дорогой» — глаз ждёт, что на торможении нос клюнет,
 * а в повороте кузов ляжет на внешнюю сторону.
 *
 * Наклон чисто визуальный: он добавляется к кватерниону рендера и не трогает
 * физику. Иначе пришлось бы смягчать подвеску, а это ломает управляемость,
 * которая уже настроена по реальным временам круга.
 */

/** Клевок на торможении и присед на разгоне, радиан на 1 g. */
const PITCH_PER_G = 0.016

/** Крен наружу поворота, радиан на 1 g. */
const ROLL_PER_G = 0.020

/** Больше этого кузов не наклоняется: у болида ход подвески в считаные мм. */
const MAX_PITCH_RAD = 0.035
const MAX_ROLL_RAD = 0.045

/** Темп, с которым наклон догоняет перегрузку. Медленнее — кузов «дышит». */
const SETTLE_RATE = 7

export type Attitude = { pitch: number; roll: number }

export const LEVEL: Attitude = { pitch: 0, roll: 0 }

function clamp(value: number, limit: number): number {
  return Math.max(-limit, Math.min(limit, value))
}

/**
 * Целевой наклон по продольному и поперечному ускорению в g.
 * Положительный longitudinalG — разгон, отрицательный — торможение.
 */
export function targetAttitude(longitudinalG: number, lateralG: number): Attitude {
  return {
    pitch: clamp(-longitudinalG * PITCH_PER_G, MAX_PITCH_RAD),
    roll: clamp(lateralG * ROLL_PER_G, MAX_ROLL_RAD),
  }
}

/** Экспоненциальное приближение к цели — кузов оседает, а не щёлкает. */
export function settle(current: Attitude, target: Attitude, dt: number): Attitude {
  const k = 1 - Math.exp(-SETTLE_RATE * Math.max(0, dt))
  return {
    pitch: current.pitch + (target.pitch - current.pitch) * k,
    roll: current.roll + (target.roll - current.roll) * k,
  }
}

/** Продольное ускорение в g по изменению скорости. */
export function longitudinalG(speedMs: number, previousMs: number, dt: number): number {
  if (dt <= 0) return 0
  return (speedMs - previousMs) / dt / 9.81
}

/**
 * Поперечное ускорение в g: v²/R, где радиус берётся из угла руля и базы.
 * Знак повторяет знак руля, чтобы кузов кренился наружу поворота.
 */
export function lateralG(speedMs: number, steer: number, wheelbaseM: number): number {
  const maxSteerRad = 0.3
  const angle = steer * maxSteerRad
  if (Math.abs(angle) < 1e-4) return 0
  const radius = wheelbaseM / Math.tan(Math.abs(angle))
  const g = (speedMs * speedMs) / radius / 9.81
  return Math.sign(angle) * g
}

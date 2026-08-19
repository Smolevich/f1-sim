export type Vec3 = { x: number; y: number; z: number }

export type CameraMode = 'chase' | 'tcam' | 'cockpit' | 'bonnet'

export const CAMERA_ORDER: CameraMode[] = ['chase', 'tcam', 'cockpit', 'bonnet']

const BASE_FOV = 70
const FOV_GAIN = 0.22
const MAX_FOV = 104

type Rig = { back: number; height: number; ahead: number }

/**
 * Отступы считаны под ближнюю плоскость камеры в 1 м (её задаёт scene.ts ради
 * точности буфера глубины): всё ближе метра к глазу срезается. Поэтому T-cam
 * отодвинут за корму — на 2.2 м он смотрел внутрь моторного отсека, — а капот
 * поставлен позади носа, иначе от болида в кадре не остаётся ничего.
 */
const RIGS: Record<CameraMode, Rig> = {
  chase: { back: 17, height: 7, ahead: 1 },
  tcam: { back: 5.5, height: 2.6, ahead: 8 },
  cockpit: { back: -0.2, height: 1.05, ahead: 12 },
  // back -2.4: на -0.9 камера оказывалась внутри монокока и показывала его
  // изнутри синим конусом. Нос болида кончается около z=+2.6, поэтому глаз
  // выносим за него.
  bonnet: { back: -2.4, height: 0.72, ahead: 14 },
}

export function nextMode(mode: CameraMode): CameraMode {
  return CAMERA_ORDER[(CAMERA_ORDER.indexOf(mode) + 1) % CAMERA_ORDER.length]
}

/**
 * Поле зрения растёт со скоростью — приём, которым гоночные игры продают
 * ощущение скорости: геометрия по краям кадра начинает лететь мимо быстрее.
 * Потолок нужен, иначе на максималке картинка уходит в рыбий глаз.
 */
export function cameraPose(
  mode: CameraMode, position: Vec3, headingRad: number, speedMs: number,
): { eye: Vec3; look: Vec3; fov: number } {
  const rig = RIGS[mode]
  const sin = Math.sin(headingRad)
  const cos = Math.cos(headingRad)

  return {
    eye: {
      x: position.x - sin * rig.back,
      y: position.y + rig.height,
      z: position.z - cos * rig.back,
    },
    look: {
      x: position.x + sin * rig.ahead,
      y: position.y + (mode === 'chase' ? 1 : 0.6),
      z: position.z + cos * rig.ahead,
    },
    fov: Math.min(MAX_FOV, BASE_FOV + speedMs * FOV_GAIN),
  }
}

/**
 * Экспоненциальное сглаживание, а не линейное: множитель считается через шаг
 * времени, поэтому камера ведёт себя одинаково на 60 и 144 кадрах в секунду.
 * Жёсткая привязка к болиду передаёт ему каждый рывок подвески — именно это
 * читается как «дёргается».
 */
export function smoothTowards(from: Vec3, to: Vec3, dt: number, rate: number): Vec3 {
  const k = 1 - Math.exp(-rate * dt)
  return {
    x: from.x + (to.x - from.x) * k,
    y: from.y + (to.y - from.y) * k,
    z: from.z + (to.z - from.z) * k,
  }
}

/**
 * Установившееся отставание сглаживателя от равномерно движущейся цели.
 *
 * Экспоненциальное сглаживание всегда отстаёт: за кадр оно закрывает долю k
 * разрыва, и при постоянной скорости разрыв застывает на v·dt·(1/k − 1).
 * На 235 км/ч при ставке 6 это 10.3 м — камера висит вдвое дальше своей риги
 * (замер: дистанция гуляла 21.9…28.3 м вместо 18.4). Каждое ускорение и
 * торможение меняет отставание, и это читается как «болид дёргает».
 */
export function lagDistance(speedMs: number, dt: number, rate: number): number {
  if (rate <= 0 || dt <= 0) return 0
  const k = 1 - Math.exp(-rate * dt)
  if (k <= 0) return 0
  return speedMs * dt * (1 / k - 1)
}

/**
 * Сдвигает цель вперёд на величину отставания, чтобы сглаженная камера
 * оказалась там, где рига её и ставит. Сглаживание продолжает гасить рывки
 * подвески, но перестаёт растягивать дистанцию на скорости.
 */
export function compensateLag(
  target: Vec3, heading: number, speedMs: number, dt: number, rate: number,
): Vec3 {
  const lag = lagDistance(speedMs, dt, rate)
  return {
    x: target.x + Math.sin(heading) * lag,
    y: target.y,
    z: target.z + Math.cos(heading) * lag,
  }
}

/**
 * Темп сглаживания по режиму: чем больше, тем жёстче камера привязана к болиду.
 * Из кокпита и с капота задержка читается как расхлябанность рулёжки, а не как
 * вес машины, поэтому там сглаживание почти отключено.
 */
export const SMOOTH_RATE: Record<CameraMode, number> = {
  chase: 6,
  tcam: 9,
  // 22 читалось как дёрганье: замер дал рывок камеры 0.17 м со скачками до
  // 0.54 м против 0.03 м у chase — каждое колебание подвески шло прямо в
  // кадр. 12 сохраняет отзывчивость рулёжки, но гасит вибрацию.
  cockpit: 12,
  bonnet: 12,
}

type Vec3 = { x: number; y: number; z: number }

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
  bonnet: { back: -0.9, height: 0.95, ahead: 14 },
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

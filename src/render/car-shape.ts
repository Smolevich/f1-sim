/**
 * Обводы болида: чистые числа, без three.js.
 *
 * Пропорции взяты с регламента 2022+ и сверены по фотографиям модели McLaren:
 * длина 5.63 м, ширина 2.00, колёсная база 3.60, колёса 0.72 в диаметре.
 * Держим их отдельно от построения меша, чтобы проверять силуэт тестами.
 */

export const LENGTH_M = 5.63
export const WIDTH_M = 2.0
export const WHEELBASE_M = 3.6
export const FRONT_AXLE_Z = WHEELBASE_M / 2
export const REAR_AXLE_Z = -WHEELBASE_M / 2

export const WHEEL_RADIUS_M = 0.36
export const FRONT_TYRE_WIDTH_M = 0.305
export const REAR_TYRE_WIDTH_M = 0.405
export const HALF_TRACK_M = 0.79

/** Днище: плоское дно с приподнятыми краями, как у машин с граунд-эффектом. */
export const FLOOR_Y = 0.06
export const FLOOR_HALF_WIDTH = 0.62

/**
 * Полуширина монокока по длине машины. Z отсчитывается от центра, нос на +Z.
 * Узкий нос, расширение к кокпиту, сужение к корме — тот силуэт, что на фото.
 */
export type Section = { z: number; halfWidth: number; top: number; bottom: number }

/**
 * Борт вдвое шире своей высоты (h/w около 0.55): болид приземистый. При
 * h/w около 1 монокок выходит узким и высоким, как лодка, — именно это
 * читалось на первом проходе.
 */
export const BODY_SECTIONS: readonly Section[] = [
  { z: 2.55, halfWidth: 0.075, top: 0.28, bottom: 0.16 },
  { z: 2.15, halfWidth: 0.12, top: 0.31, bottom: 0.14 },
  { z: 1.75, halfWidth: 0.20, top: 0.36, bottom: 0.11 },
  { z: 1.25, halfWidth: 0.30, top: 0.44, bottom: 0.09 },
  { z: 0.75, halfWidth: 0.40, top: 0.54, bottom: 0.07 },
  { z: 0.25, halfWidth: 0.46, top: 0.62, bottom: 0.06 },
  { z: -0.25, halfWidth: 0.47, top: 0.66, bottom: 0.06 },
  { z: -0.75, halfWidth: 0.44, top: 0.60, bottom: 0.06 },
  { z: -1.25, halfWidth: 0.37, top: 0.52, bottom: 0.07 },
  { z: -1.75, halfWidth: 0.28, top: 0.45, bottom: 0.09 },
  { z: -2.15, halfWidth: 0.20, top: 0.40, bottom: 0.12 },
  { z: -2.50, halfWidth: 0.13, top: 0.36, bottom: 0.15 },
]

/** Понтоны: вздутия по бортам между колёсами, с заборником спереди. */
/**
 * Понтоны низкие и короткие: на фото понтон доходит примерно до половины
 * высоты монокока, а над ним виден борт. Высокая коробка от колеса до колеса
 * закрывает весь силуэт и читается как кирпич.
 */
export const SIDEPOD = {
  frontZ: 0.85,
  rearZ: -1.15,
  halfWidth: 0.72,
  top: 0.46,
  bottom: 0.12,
  intakeZ: 0.80,
  intakeHeight: 0.26,
}

/** Переднее антикрыло: четыре плоскости с нарастающим углом. */
export const FRONT_WING = {
  z: 2.55,
  halfWidth: 0.95,
  chord: 0.52,
  elements: 4,
  baseY: 0.13,
  endplateHeight: 0.34,
}

/** Заднее антикрыло: основной профиль плюс закрылок DRS. */
export const REAR_WING = {
  z: -2.38,
  halfWidth: 0.52,
  chord: 0.36,
  mainY: 0.80,
  flapY: 0.94,
  endplateHeight: 0.38,
}

/** Halo: дуга над кокпитом со стойкой по центру. */
/**
 * Halo крепится к бортам кокпита, а не висит над машиной: на фото дуга
 * начинается от борта на уровне плеч пилота и поднимается к стойке впереди.
 */
export const HALO = {
  centreZ: 0.42,
  radius: 0.40,
  tubeRadius: 0.032,
  height: 0.74,
  pillarZ: 0.86,
}

export const COCKPIT = { z: 0.55, halfWidth: 0.26, rimY: 0.74 }

/** Воздухозаборник над головой пилота. */
/** Заборник сидит прямо за головой пилота и невысокий — иначе это плавник. */
export const AIRBOX = { z: -0.05, halfWidth: 0.15, top: 0.94, bottom: 0.72 }

/** Линейная интерполяция полуширины между сечениями — для тестов силуэта. */
export function halfWidthAt(z: number): number {
  const s = BODY_SECTIONS
  if (z >= s[0].z) return s[0].halfWidth
  if (z <= s[s.length - 1].z) return s[s.length - 1].halfWidth
  for (let i = 1; i < s.length; i += 1) {
    if (z >= s[i].z) {
      const t = (z - s[i].z) / (s[i - 1].z - s[i].z)
      return s[i].halfWidth + (s[i - 1].halfWidth - s[i].halfWidth) * t
    }
  }
  return 0
}

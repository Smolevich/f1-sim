/**
 * Раскраска кузова по зонам.
 *
 * Модель безымянная: все 73 меша называются Object_N, материалов тоже 73 и все
 * чёрные. Поэтому зона определяется геометрией — где деталь стоит на машине.
 * Заливка одним цветом делает болид похожим на пластиковую игрушку: у
 * настоящего карбоновое днище, тёмный halo и контрастная кромка антикрыльев.
 */
export type Zone = 'body' | 'carbon' | 'wing' | 'accent' | 'floor'

export type Placement = {
  /** Центр детали в координатах модели. */
  x: number
  y: number
  z: number
  /** Габарит детали. */
  height: number
}

/** Ось симметрии модели по X. */
const AXIS_X = 0.645

/** Пол машины: всё ниже этой высоты — карбоновое днище. */
const FLOOR_Y = 0.22

/** Кокпит и воздухозаборник: выше этой высоты идёт halo и крышка двигателя. */
const CANOPY_Y = 0.62

/** Носовая часть: переднее антикрыло начинается отсюда. */
const FRONT_WING_Z = 1.62

/** Корма: заднее антикрыло и диффузор. */
const REAR_WING_Z = -1.72

export function zoneFor(part: Placement): Zone {
  if (part.z > FRONT_WING_Z) return 'wing'
  if (part.z < REAR_WING_Z) return 'wing'
  if (part.y < FLOOR_Y) return 'floor'
  if (part.y > CANOPY_Y) return 'carbon'
  // Узкая полоса по осевой над кокпитом — акцент вдоль машины.
  if (Math.abs(part.x - AXIS_X) < 0.12 && part.height < 0.25) return 'accent'
  return 'body'
}

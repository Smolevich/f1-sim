/**
 * Интерполяция состояния между шагами физики.
 *
 * Физика шагает фиксированно 1/120 с, кадр рисуется когда успеет, и число
 * шагов на кадр колеблется: то один, то два. Кадр, берущий последнее
 * состояние физики как есть, показывает то отставание, то опережение —
 * замер дал средний рывок 0.28 м и максимум 1.01 м между кадрами, что и
 * читается как «болид дёргает» и «парит над дорогой».
 *
 * Кадр рисует положение между предыдущим и текущим шагом по доле остатка
 * накопителя. Картинка отстаёт максимум на один шаг (8 мс), зато движение
 * становится равномерным.
 */
export type Snapshot = {
  position: { x: number; y: number; z: number }
  orientation: { x: number; y: number; z: number; w: number }
}

/** Доля кадра внутри текущего шага: 0 — только что шагнули, 1 — пора шагать. */
export function blendFactor(pendingSeconds: number, stepSeconds: number): number {
  if (stepSeconds <= 0) return 1
  const raw = pendingSeconds / stepSeconds
  return Math.max(0, Math.min(1, raw))
}

export function lerpPosition(
  from: Snapshot['position'], to: Snapshot['position'], t: number,
): Snapshot['position'] {
  return {
    x: from.x + (to.x - from.x) * t,
    y: from.y + (to.y - from.y) * t,
    z: from.z + (to.z - from.z) * t,
  }
}

/**
 * Кратчайшая дуга между кватернионами. Знак выравнивается по скалярному
 * произведению: без этого поворот на 180° идёт «длинным путём», и болид
 * прокручивается вокруг оси вместо плавного доворота.
 */
export function slerpOrientation(
  from: Snapshot['orientation'], to: Snapshot['orientation'], t: number,
): Snapshot['orientation'] {
  let dot = from.x * to.x + from.y * to.y + from.z * to.z + from.w * to.w
  let tx = to.x
  let ty = to.y
  let tz = to.z
  let tw = to.w
  if (dot < 0) {
    dot = -dot
    tx = -tx
    ty = -ty
    tz = -tz
    tw = -tw
  }

  // Почти совпавшие кватернионы делим линейно: sin(угла) уходит в ноль и
  // деление на него даёт NaN.
  if (dot > 0.9995) {
    return normalise({
      x: from.x + (tx - from.x) * t,
      y: from.y + (ty - from.y) * t,
      z: from.z + (tz - from.z) * t,
      w: from.w + (tw - from.w) * t,
    })
  }

  const theta = Math.acos(dot)
  const sinTheta = Math.sin(theta)
  const a = Math.sin((1 - t) * theta) / sinTheta
  const b = Math.sin(t * theta) / sinTheta
  return {
    x: from.x * a + tx * b,
    y: from.y * a + ty * b,
    z: from.z * a + tz * b,
    w: from.w * a + tw * b,
  }
}

function normalise(q: Snapshot['orientation']): Snapshot['orientation'] {
  const len = Math.hypot(q.x, q.y, q.z, q.w)
  if (len === 0) return { x: 0, y: 0, z: 0, w: 1 }
  return { x: q.x / len, y: q.y / len, z: q.z / len, w: q.w / len }
}

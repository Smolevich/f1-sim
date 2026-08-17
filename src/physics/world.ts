export const FIXED_STEP = 1 / 120

/** Потолок шагов за кадр: после долгого фриза не пытаемся догнать всё разом. */
export const MAX_STEPS_PER_FRAME = 30

export type Accumulator = {
  pending: number
}

/**
 * Сколько шагов физики отработать в этом кадре. Шаг фиксирован, чтобы результат
 * не зависел от частоты кадров: иначе на 144 Гц машина едет иначе, чем на 60,
 * и времена кругов несравнимы.
 */
export function stepsFor(
  acc: Accumulator,
  frameSeconds: number,
): { steps: number; acc: Accumulator } {
  const pending = acc.pending + Math.max(0, frameSeconds)
  const steps = Math.min(MAX_STEPS_PER_FRAME, Math.floor(pending / FIXED_STEP))
  // Долг сверх потолка списываем, а не копим: иначе после долгого фриза игра
  // навсегда отстаёт и доигрывает устаревший ввод.
  const remainder = Math.min(pending - steps * FIXED_STEP, MAX_STEPS_PER_FRAME * FIXED_STEP)
  return { steps, acc: { pending: remainder } }
}

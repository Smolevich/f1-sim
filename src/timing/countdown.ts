/**
 * Обратный отсчёт перед стартом: пять красных огней гаснут разом, как на
 * настоящей стартовой решётке.
 */
export type CountdownState = {
  /** Сколько огней зажжено: 5 → 0. */
  lights: number
  /** Прошло от начала отсчёта, мс. */
  elapsedMs: number
  /** Отсчёт закончился, можно ехать. */
  released: boolean
}

/** Интервал между зажиганием огней. */
export const LIGHT_INTERVAL_MS = 900

/** Пауза после пятого огня до гашения — на решётке она случайная, здесь фиксированная. */
export const HOLD_MS = 1100

export const TOTAL_LIGHTS = 5

export const START: CountdownState = { lights: 0, elapsedMs: 0, released: false }

export function advance(state: CountdownState, dtMs: number): CountdownState {
  const elapsedMs = state.elapsedMs + Math.max(0, dtMs)
  const lit = Math.min(TOTAL_LIGHTS, Math.floor(elapsedMs / LIGHT_INTERVAL_MS))
  const allLitAtMs = TOTAL_LIGHTS * LIGHT_INTERVAL_MS
  const released = elapsedMs >= allLitAtMs + HOLD_MS
  return { lights: released ? 0 : lit, elapsedMs, released }
}

/** Полная длительность отсчёта — для тестов и подсказок. */
export function totalMs(): number {
  return TOTAL_LIGHTS * LIGHT_INTERVAL_MS + HOLD_MS
}

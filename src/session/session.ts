import type { LapResult } from '../timing/laptimer'

/** Сколько кругов даётся на лучшее время, прежде чем заезд закрывается. */
export const TOTAL_ATTEMPTS = 3

/** Сколько попыток добавляется, если игрок продолжает после финиша. */
const EXTRA_ATTEMPTS = TOTAL_ATTEMPTS

export type SessionState = {
  attemptsLeft: number
  bestMs: number | null
  finished: boolean
  paused: boolean
}

export function createSession(): SessionState {
  return { attemptsLeft: TOTAL_ATTEMPTS, bestMs: null, finished: false, paused: false }
}

/** Номер текущей попытки, 1..TOTAL_ATTEMPTS — для строки «ПОПЫТКА 2/3». */
export function attemptNumber(state: SessionState): number {
  const used = TOTAL_ATTEMPTS - state.attemptsLeft
  return Math.min(TOTAL_ATTEMPTS, used + 1)
}

/** Попытка потрачена; на нуле заезд закрывается. */
export function spendAttempt(state: SessionState): SessionState {
  const attemptsLeft = Math.max(0, state.attemptsLeft - 1)
  return { ...state, attemptsLeft, finished: attemptsLeft === 0 }
}

/** Круг доехан: тратит попытку, валидный — обновляет рекорд заезда. */
export function completeAttempt(state: SessionState, lap: LapResult): SessionState {
  const improved = lap.valid && (state.bestMs === null || lap.timeMs < state.bestMs)
  return { ...spendAttempt(state), bestMs: improved ? lap.timeMs : state.bestMs }
}

/** «Ещё круг» после финиша: рекорд заезда остаётся, попытки начинаются заново. */
export function continueBeyond(state: SessionState): SessionState {
  return { ...state, attemptsLeft: EXTRA_ATTEMPTS, finished: false, paused: false }
}

export function togglePause(state: SessionState): SessionState {
  return { ...state, paused: !state.paused }
}

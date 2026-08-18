import { expect, test } from 'vitest'
import {
  completeAttempt, continueBeyond, createSession, spendAttempt, togglePause,
  TOTAL_ATTEMPTS,
} from './session'

const lap = (timeMs: number, valid = true) => ({ timeMs, sectors: [0, 0, 0] as [number, number, number], valid })

test('заезд начинается с трёх попыток', () => {
  expect(createSession().attemptsLeft).toBe(TOTAL_ATTEMPTS)
  expect(TOTAL_ATTEMPTS).toBe(3)
})

test('валидный круг тратит попытку и запоминается как лучший', () => {
  const s = completeAttempt(createSession(), lap(90_000))
  expect(s.attemptsLeft).toBe(2)
  expect(s.bestMs).toBe(90_000)
})

test('лучший круг обновляется только при улучшении', () => {
  let s = completeAttempt(createSession(), lap(90_000))
  s = completeAttempt(s, lap(95_000))
  expect(s.bestMs).toBe(90_000)
  s = completeAttempt(s, lap(85_000))
  expect(s.bestMs).toBe(85_000)
})

test('невалидный круг тратит попытку, но не идёт в рекорд', () => {
  const s = completeAttempt(createSession(), lap(80_000, false))
  expect(s.attemptsLeft).toBe(2)
  expect(s.bestMs).toBeNull()
})

test('после трёх попыток заезд завершён', () => {
  let s = createSession()
  for (let i = 0; i < 3; i++) s = completeAttempt(s, lap(90_000 + i))
  expect(s.finished).toBe(true)
  expect(s.attemptsLeft).toBe(0)
})

test('попытки не уходят в минус', () => {
  let s = createSession()
  for (let i = 0; i < 6; i++) s = completeAttempt(s, lap(90_000))
  expect(s.attemptsLeft).toBe(0)
})

test('можно продолжить после финиша, лучший круг сохраняется', () => {
  let s = createSession()
  for (let i = 0; i < 3; i++) s = completeAttempt(s, lap(90_000))
  const after = continueBeyond(s)
  expect(after.finished).toBe(false)
  expect(after.bestMs).toBe(90_000)
  expect(after.attemptsLeft).toBeGreaterThan(0)
})

test('сброс круга тратит попытку', () => {
  expect(spendAttempt(createSession()).attemptsLeft).toBe(2)
})

test('пауза переключается', () => {
  const s = togglePause(createSession())
  expect(s.paused).toBe(true)
  expect(togglePause(s).paused).toBe(false)
})

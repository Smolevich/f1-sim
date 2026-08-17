import { expect, test } from 'vitest'
import { STEER_RATE, STEER_RETURN, steerTowards } from './keyboard'

test('руль доходит до упора примерно за 0.15 с', () => {
  let steer = 0
  let t = 0
  while (steer < 0.999 && t < 1) {
    steer = steerTowards(steer, 1, 1 / 120, STEER_RATE)
    t += 1 / 120
  }
  expect(t).toBeGreaterThan(0.10)
  expect(t).toBeLessThan(0.20)
})

test('руль возвращается в ноль быстрее, чем набирается', () => {
  expect(STEER_RETURN).toBeGreaterThan(STEER_RATE)
})

test('руль не перескакивает цель', () => {
  expect(steerTowards(0.99, 1, 1 / 120, 100)).toBeLessThanOrEqual(1)
  expect(steerTowards(-0.99, -1, 1 / 120, 100)).toBeGreaterThanOrEqual(-1)
})

test('при нулевой цели руль идёт к нулю', () => {
  expect(steerTowards(0.5, 0, 1 / 120, 5)).toBeLessThan(0.5)
  expect(steerTowards(-0.5, 0, 1 / 120, 5)).toBeGreaterThan(-0.5)
})

test('чувствительность ускоряет набор руля', () => {
  const slow = steerTowards(0, 1, 1 / 120, STEER_RATE)
  const fast = steerTowards(0, 1, 1 / 120, STEER_RATE * 2)
  expect(fast).toBeGreaterThan(slow)
})

import { expect, test } from 'vitest'
import { steerLimitForSpeed } from './vehicle'

const WB = 3.6
const MAX = 0.3

test('на месте доступен полный угол', () => {
  expect(steerLimitForSpeed(0, WB, MAX)).toBeCloseTo(MAX, 4)
})

test('на малой скорости угол ещё полный', () => {
  expect(steerLimitForSpeed(15, WB, MAX)).toBeCloseTo(MAX, 4)
})

test('на 200 км/ч угол сильно ограничен', () => {
  const limit = steerLimitForSpeed(200 / 3.6, WB, MAX)
  expect(limit).toBeLessThan(0.08)
  expect(limit).toBeGreaterThan(0.02)
})

test('предел падает с ростом скорости', () => {
  const at120 = steerLimitForSpeed(120 / 3.6, WB, MAX)
  const at250 = steerLimitForSpeed(250 / 3.6, WB, MAX)
  expect(at250).toBeLessThan(at120)
})

test('предел никогда не превышает максимальный угол', () => {
  for (const kmh of [0, 30, 90, 180, 320]) {
    expect(steerLimitForSpeed(kmh / 3.6, WB, MAX)).toBeLessThanOrEqual(MAX)
  }
})

test('предел всегда положительный', () => {
  expect(steerLimitForSpeed(400 / 3.6, WB, MAX)).toBeGreaterThan(0)
})

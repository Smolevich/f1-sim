import { expect, test } from 'vitest'
import { dustOpacity, dustScale } from './road-contact'

test('свежая пыль ярче старой', () => {
  expect(dustOpacity(0, 1)).toBeGreaterThan(dustOpacity(0.8, 1))
})

test('пыль полностью исчезает к концу жизни', () => {
  expect(dustOpacity(1, 1)).toBeCloseTo(0, 6)
})

test('возраст сверх срока не даёт отрицательной прозрачности', () => {
  expect(dustOpacity(5, 1)).toBeGreaterThanOrEqual(0)
})

test('облако пыли расходится со временем', () => {
  expect(dustScale(0.9, 1)).toBeGreaterThan(dustScale(0.1, 1))
})

test('нулевой срок жизни не роняет расчёт', () => {
  expect(dustOpacity(0.5, 0)).toBe(0)
  expect(dustScale(0.5, 0)).toBe(0)
})

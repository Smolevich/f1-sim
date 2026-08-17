import { expect, test } from 'vitest'
import { steerAngleFor, wheelSpinDelta } from './car'

test('колесо крутится тем быстрее, чем выше скорость', () => {
  expect(wheelSpinDelta(60, 0.1)).toBeGreaterThan(wheelSpinDelta(30, 0.1))
})

test('на стоянке колесо не крутится', () => {
  expect(wheelSpinDelta(0, 0.1)).toBe(0)
})

test('угол поворота колёс пропорционален рулю', () => {
  expect(steerAngleFor(1)).toBeGreaterThan(steerAngleFor(0.5))
  expect(steerAngleFor(-1)).toBeLessThan(0)
})

test('поворот колёс ограничен максимальным углом', () => {
  expect(Math.abs(steerAngleFor(5))).toBeLessThanOrEqual(Math.abs(steerAngleFor(1)))
})

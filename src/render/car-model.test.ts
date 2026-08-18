import { expect, test } from 'vitest'
import { scaleForWheelbase } from './car-model'

test('модель уменьшается, если её база больше целевой', () => {
  expect(scaleForWheelbase(7.2, 3.6)).toBeCloseTo(0.5, 3)
})

test('модель увеличивается, если её база меньше целевой', () => {
  expect(scaleForWheelbase(1.8, 3.6)).toBeCloseTo(2, 3)
})

test('совпадающая база даёт единичный масштаб', () => {
  expect(scaleForWheelbase(3.6, 3.6)).toBeCloseTo(1, 6)
})

test('нулевая или отрицательная база не роняет расчёт', () => {
  expect(scaleForWheelbase(0, 3.6)).toBe(1)
  expect(scaleForWheelbase(-2, 3.6)).toBe(1)
})

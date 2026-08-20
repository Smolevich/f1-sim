import { expect, test } from 'vitest'
import { frequencyFor, gainFor } from './engine'

test('тон растёт с оборотами', () => {
  expect(frequencyFor(10000)).toBeGreaterThan(frequencyFor(6000))
})

test('на холостых тон низкий, на пределе высокий', () => {
  expect(frequencyFor(4000)).toBeCloseTo(95, 0)
  expect(frequencyFor(12000)).toBeCloseTo(260, 0)
})

test('тон держится в области гула, а не визга', () => {
  // Регрессия: 620 Гц пилой давали визг, режущий слух.
  expect(frequencyFor(12000)).toBeLessThan(320)
})

test('обороты ниже холостых не роняют тон в минус', () => {
  expect(frequencyFor(0)).toBeGreaterThan(0)
})

test('обороты выше предела не задирают тон бесконечно', () => {
  expect(frequencyFor(20000)).toBeCloseTo(frequencyFor(12000), 3)
})

test('тон растёт быстрее к верхам — как у мотора', () => {
  const low = frequencyFor(6000) - frequencyFor(4000)
  const high = frequencyFor(12000) - frequencyFor(10000)
  expect(high).toBeGreaterThan(low)
})

test('газ поднимает громкость', () => {
  expect(gainFor(1, 9000)).toBeGreaterThan(gainFor(0, 9000))
})

test('на холостых мотор слышен, но тихо', () => {
  const idle = gainFor(0, 4000)
  expect(idle).toBeGreaterThan(0)
  expect(idle).toBeLessThan(gainFor(1, 12000) / 3)
})

test('громкость остаётся фоном, а не давит', () => {
  expect(gainFor(1, 12000)).toBeLessThan(0.025)
})

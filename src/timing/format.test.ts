import { expect, test } from 'vitest'
import { formatDelta, formatLapTime } from './format'

test('время круга в формате минуты:секунды.миллисекунды', () => {
  expect(formatLapTime(81_046)).toBe('1:21.046')
})

test('время меньше минуты всё равно с минутами', () => {
  expect(formatLapTime(9_500)).toBe('0:09.500')
})

test('нулевое время не ломает формат', () => {
  expect(formatLapTime(0)).toBe('0:00.000')
})

test('отрицательная дельта со знаком минус', () => {
  expect(formatDelta(-1600)).toBe('-1.600')
})

test('положительная дельта со знаком плюс', () => {
  expect(formatDelta(412)).toBe('+0.412')
})

test('нулевая дельта показывается как плюс ноль', () => {
  expect(formatDelta(0)).toBe('+0.000')
})

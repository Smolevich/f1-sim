import { expect, test } from 'vitest'
import { finishLines } from './overlays'

test('итог заезда показывает лучший круг', () => {
  expect(finishLines(83_456).join(' ')).toContain('1:23.456')
})

test('без чистого круга итог не врёт про время', () => {
  // Регрессия: null нельзя гнать через formatLapTime — получалось «0:00.000»,
  // то есть идеальный круг там, где игрок не доехал ни одного.
  const result = finishLines(null)[1]
  expect(result).toContain('НЕ БЫЛО')
  expect(result).not.toMatch(/\d:\d\d/)
})

test('в итогах есть выход: и продолжить, и начать заново', () => {
  const text = finishLines(90_000).join(' ')
  expect(text).toContain('Enter')
  expect(text).toContain('T')
})

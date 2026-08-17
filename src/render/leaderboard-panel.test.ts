import { expect, test } from 'vitest'
import { renderBoardText } from './leaderboard-panel'

const entries = [
  { name: 'STAS', timeMs: 82_140, assists: [] },
  { name: 'ALEX', timeMs: 83_900, assists: ['steer-smoothing'] },
]

test('строки нумеруются с единицы', () => {
  expect(renderBoardText(entries, 'STAS')[0]).toContain('1.')
})

test('время показывается в формате круга', () => {
  expect(renderBoardText(entries, 'STAS')[0]).toContain('1:22.140')
})

test('свой результат помечается', () => {
  const lines = renderBoardText(entries, 'STAS')
  expect(lines[0]).toContain('◀')
  expect(lines[1]).not.toContain('◀')
})

test('заезд без ассистов помечается', () => {
  expect(renderBoardText(entries, 'ALEX')[0]).toContain('⚡')
})

test('пустая таблица даёт понятную строку', () => {
  expect(renderBoardText([], 'STAS')[0].toLowerCase()).toContain('пока')
})

import { expect, test } from 'vitest'
import { boardRows, formatGap } from './board-rows'
import type { LeaderboardEntry } from '../net/leaderboard'

const lap = (name: string, timeMs: number, assists: string[] = []): LeaderboardEntry =>
  ({ name, timeMs, assists })

test('пустая таблица не даёт строк', () => {
  expect(boardRows([], 'STAS')).toEqual([])
})

test('у лидера отставания нет', () => {
  const rows = boardRows([lap('A', 90000), lap('B', 91500)], 'STAS')
  expect(rows[0].gap).toBe('')
})

test('отставание считается от лидера, а не от предыдущего', () => {
  // Так делает Формула-1: в таблице квалификации все гэпы к первому месту.
  const rows = boardRows([lap('A', 90000), lap('B', 91000), lap('C', 92500)], 'STAS')
  expect(rows[1].gap).toBe('+1.000')
  expect(rows[2].gap).toBe('+2.500')
})

test('позиции идут подряд с единицы', () => {
  const rows = boardRows([lap('A', 90000), lap('B', 91000)], 'STAS')
  expect(rows.map((r) => r.position)).toEqual([1, 2])
})

test('своя строка помечается', () => {
  const rows = boardRows([lap('A', 90000), lap('STAS', 91000)], 'STAS')
  expect(rows[0].mine).toBe(false)
  expect(rows[1].mine).toBe(true)
})

test('круг без ассистов отмечен как чистый', () => {
  const rows = boardRows([lap('A', 90000), lap('B', 91000, ['abs'])], 'STAS')
  expect(rows[0].clean).toBe(true)
  expect(rows[1].clean).toBe(false)
})

test('гэп показывается с тремя знаками — как в протоколе', () => {
  expect(formatGap(1234)).toBe('+1.234')
  expect(formatGap(87)).toBe('+0.087')
})

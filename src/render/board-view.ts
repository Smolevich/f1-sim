import { boardRows } from './board-rows'
import type { BoardRow } from './board-rows'
import type { LeaderboardEntry } from '../net/leaderboard'

/**
 * Таблица в стиле протокола Формулы-1: номер позиции на плашке, цветная
 * полоса слева, имя, время и отставание, выровненное по правому краю.
 *
 * Моноширинный текст с точками-заполнителями читался как консольный вывод,
 * а не как турнирная таблица.
 */
const ROW_HEIGHT = 26

function rowElement(row: BoardRow, compact: boolean): HTMLElement {
  const line = document.createElement('div')
  line.setAttribute(
    'style',
    'display:grid;grid-template-columns:22px 8px 1fr auto;align-items:center;' +
    `gap:8px;height:${compact ? ROW_HEIGHT - 4 : ROW_HEIGHT}px;` +
    'padding:0 8px 0 0;border-radius:4px;' +
    (row.mine ? 'background:rgba(78,201,255,.16);' : ''),
  )

  const position = document.createElement('div')
  position.textContent = String(row.position)
  position.setAttribute(
    'style',
    'text-align:center;font-weight:700;font-size:12px;color:#0b1016;' +
    'background:#e8edf3;border-radius:3px;line-height:18px;height:18px;',
  )

  // Полоса-акцент: у протокола F1 слева от имени стоит цвет команды.
  const stripe = document.createElement('div')
  stripe.setAttribute(
    'style',
    `height:${compact ? 14 : 18}px;border-radius:2px;` +
    `background:${row.mine ? '#4ec9ff' : '#5c6673'};`,
  )

  const name = document.createElement('div')
  name.textContent = row.name
  name.setAttribute(
    'style',
    'font-size:13px;font-weight:600;letter-spacing:.3px;' +
    'overflow:hidden;text-overflow:ellipsis;white-space:nowrap;' +
    (row.mine ? 'color:#eaf6ff;' : 'color:#dbe2ea;'),
  )

  const time = document.createElement('div')
  // У лидера — само время, у остальных отставание: так читается протокол.
  time.textContent = row.position === 1 ? row.time : row.gap
  time.setAttribute(
    'style',
    'font:600 13px/1 ui-monospace,SFMono-Regular,Menlo,monospace;' +
    'font-variant-numeric:tabular-nums;' +
    (row.position === 1 ? 'color:#ffffff;' : 'color:#9fb0c2;'),
  )

  line.append(position, stripe, name, time)
  return line
}

export function buildBoard(
  entries: readonly LeaderboardEntry[], you: string, compact = false,
): HTMLElement {
  const box = document.createElement('div')
  box.setAttribute('style', 'display:flex;flex-direction:column;gap:2px;')

  const rows = boardRows(entries, you)
  if (rows.length === 0) {
    const empty = document.createElement('div')
    empty.textContent = 'пока никого — время твоё'
    empty.setAttribute('style', 'font-size:12px;color:#8ea0b4;padding:4px 2px;')
    box.appendChild(empty)
    return box
  }

  for (const row of rows) box.appendChild(rowElement(row, compact))
  return box
}

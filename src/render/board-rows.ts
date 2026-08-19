import { formatLapTime } from '../timing/format'
import type { LeaderboardEntry } from '../net/leaderboard'

/**
 * Строки таблицы в том виде, в каком их показывает Формула-1: позиция,
 * имя, время лидера и отставание остальных.
 *
 * Логика отделена от разметки, чтобы проверять расчёт отставаний без DOM.
 */
export type BoardRow = {
  position: number
  name: string
  time: string
  /** Отставание от лидера: пусто у первого, иначе «+1.234». */
  gap: string
  /** Круг без ассистов — у Формулы-1 это отдельная пометка. */
  clean: boolean
  /** Строка принадлежит игроку: её подсвечивают. */
  mine: boolean
}

export function formatGap(ms: number): string {
  const seconds = ms / 1000
  return `+${seconds.toFixed(3)}`
}

export function boardRows(
  entries: readonly LeaderboardEntry[], you: string,
): BoardRow[] {
  if (entries.length === 0) return []
  const leader = entries[0].timeMs
  return entries.map((entry, index) => ({
    position: index + 1,
    name: entry.name,
    time: formatLapTime(entry.timeMs),
    gap: index === 0 ? '' : formatGap(entry.timeMs - leader),
    clean: entry.assists.length === 0,
    mine: entry.name === you,
  }))
}

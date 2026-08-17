import { fetchTop, type LeaderboardEntry } from '../net/leaderboard'
import { formatLapTime } from '../timing/format'

const TITLE = 'ТОП-5'

/**
 * Строки таблицы без заголовка: индекс строки совпадает с позицией в зачёте,
 * поэтому нумерация и пометки проверяются по тому же индексу, что и в данных.
 * Заголовок добавляет панель при выводе.
 */
export function renderBoardText(entries: LeaderboardEntry[], you: string): string[] {
  if (entries.length === 0) return ['пока никого']
  return entries.map((e, i) => {
    const clean = e.assists.length === 0 ? ' ⚡' : ''
    const mine = e.name === you ? ' ◀' : ''
    return `${i + 1}. ${e.name.padEnd(12)} ${formatLapTime(e.timeMs)}${clean}${mine}`
  })
}

const STYLE = `
position:fixed;right:16px;top:16px;z-index:10;
font:600 14px/1.6 ui-monospace,SFMono-Regular,Menlo,monospace;
color:#fff;text-shadow:0 1px 3px rgba(0,0,0,.85);
pointer-events:none;white-space:pre;text-align:right;
`

export class LeaderboardPanel {
  private root: HTMLDivElement

  constructor(private you: string, parent: HTMLElement = document.body) {
    this.root = document.createElement('div')
    this.root.setAttribute('style', STYLE)
    this.root.textContent = TITLE
    parent.appendChild(this.root)
  }

  async refresh(trackId: string): Promise<void> {
    const entries = await fetchTop(trackId)
    this.root.textContent = [TITLE, ...renderBoardText(entries, this.you)].join('\n')
  }
}

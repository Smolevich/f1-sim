import { fetchTop, type LeaderboardEntry } from '../net/leaderboard'
import { formatLapTime } from '../timing/format'
import { buildBoard } from './board-view'

const TITLE = 'ЛУЧШИЕ КРУГИ'

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

// Панель на трассе: тот же вид, что в меню, но на полупрозрачной подложке —
// поверх неба белый текст без фона читался плохо.
const STYLE = `
position:fixed;right:14px;top:14px;z-index:10;min-width:230px;
padding:9px 11px;border-radius:9px;
background:rgba(8,12,20,.55);backdrop-filter:blur(3px);
border:1px solid rgba(255,255,255,.12);
font:600 13px/1.5 ui-monospace,SFMono-Regular,Menlo,monospace;
color:#fff;pointer-events:none;
`

const CAPTION_STYLE = 'font-size:10px;letter-spacing:1.2px;color:#93a5b8;margin-bottom:6px;'

export class LeaderboardPanel {
  private root: HTMLDivElement

  private caption: HTMLDivElement

  constructor(private you: string, parent: HTMLElement = document.body) {
    this.root = document.createElement('div')
    this.root.setAttribute('style', STYLE)
    this.caption = document.createElement('div')
    this.caption.textContent = TITLE
    this.caption.setAttribute('style', CAPTION_STYLE)
    this.root.appendChild(this.caption)
    parent.appendChild(this.root)
  }

  async refresh(trackId: string): Promise<void> {
    const entries = await fetchTop(trackId)
    this.root.replaceChildren(this.caption, buildBoard(entries, this.you, true))
  }
}

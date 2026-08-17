import { formatDelta, formatLapTime } from '../timing/format'
import type { SectorIndex } from '../timing/laptimer'

export type HudModel = {
  speedKmh: number
  gear: number
  rpm: number
  drs: boolean
  currentMs: number
  bestMs: number | null
  deltaMs: number | null
  sector: SectorIndex
  sectorBest: [boolean, boolean, boolean]
  valid: boolean
  tyreTempC: number
}

export type HudText = {
  lapLine: string
  deltaLine: string
  speedLine: string
  sectorLine: string
}

/** Чистая часть HUD: собирает строки, ничего не знает про DOM. */
export function renderHudText(model: HudModel): HudText {
  const lapLine = model.valid
    ? `КРУГ ${formatLapTime(model.currentMs)}`
    : `КРУГ ${formatLapTime(model.currentMs)} — СРЕЗКА`

  const deltaLine = model.bestMs !== null && model.deltaMs !== null
    ? `ЛУЧШИЙ ${formatLapTime(model.bestMs)}   ${formatDelta(model.deltaMs)}`
    : 'ЛУЧШИЙ —'

  const speedLine = [
    `${Math.round(model.speedKmh)} км/ч`,
    `${model.gear}-я`,
    `${Math.round(model.rpm)} об`,
    `шины ${Math.round(model.tyreTempC)}°`,
    model.drs ? 'DRS' : '',
  ].filter((x) => x.length > 0).join('   ')

  const marks = model.sectorBest.map((best, i) => {
    const n = i + 1
    if (i === model.sector) return `[${n}]`
    return best ? `${n}*` : `${n}`
  })
  const sectorLine = `СЕКТОР ${marks.join(' ')}`

  return { lapLine, deltaLine, speedLine, sectorLine }
}

const STYLE = `
position:fixed;left:16px;top:16px;z-index:10;
font:600 15px/1.55 ui-monospace,SFMono-Regular,Menlo,monospace;
color:#fff;text-shadow:0 1px 3px rgba(0,0,0,.85);
pointer-events:none;white-space:pre;
`

export class Hud {
  private root: HTMLDivElement

  constructor(parent: HTMLElement = document.body) {
    this.root = document.createElement('div')
    this.root.setAttribute('style', STYLE)
    parent.appendChild(this.root)
  }

  update(model: HudModel): void {
    const t = renderHudText(model)
    this.root.textContent = `${t.lapLine}\n${t.deltaLine}\n${t.sectorLine}\n${t.speedLine}`
  }
}

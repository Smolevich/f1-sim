import { TOTAL_ATTEMPTS } from '../session/session'
import { formatDelta, formatLapTime } from '../timing/format'
import { OFF_TRACK_TOLERANCE, type SectorIndex } from '../timing/laptimer'

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
  attemptsLeft: number
  trackName: string
  trackLengthM: number
  offTrackCount: number
}

export type HudText = {
  titleLine: string
  lapLine: string
  deltaLine: string
  speedLine: string
  sectorLine: string
  attemptLine: string
}

/** Чистая часть HUD: собирает строки, ничего не знает про DOM. */
export function renderHudText(model: HudModel): HudText {
  const titleLine = `${model.trackName.toUpperCase()} · ${(model.trackLengthM / 1000).toFixed(3)} км`

  // Пока выезды не превысили порог, показываем счётчик, а не приговор: игрок
  // видит запас и не бросает круг из-за одного касания обочины.
  const lapTime = formatLapTime(model.currentMs)
  const lapLine = !model.valid
    ? `КРУГ ${lapTime} — СРЕЗКА`
    : model.offTrackCount > 0
      ? `КРУГ ${lapTime} — ВНЕ ТРАССЫ ${model.offTrackCount}/${OFF_TRACK_TOLERANCE}`
      : `КРУГ ${lapTime}`

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

  const used = TOTAL_ATTEMPTS - Math.max(0, model.attemptsLeft)
  const attemptLine = model.attemptsLeft > 0
    ? `ПОПЫТКА ${Math.min(TOTAL_ATTEMPTS, used + 1)}/${TOTAL_ATTEMPTS}`
    : 'ПОПЫТКИ КОНЧИЛИСЬ'

  return { titleLine, lapLine, deltaLine, speedLine, sectorLine, attemptLine }
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
    this.root.textContent = [
      t.titleLine, t.attemptLine, t.lapLine, t.deltaLine, t.sectorLine, t.speedLine,
    ].join('\n')
  }
}

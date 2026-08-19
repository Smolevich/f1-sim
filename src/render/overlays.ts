import { TOTAL_ATTEMPTS } from '../session/session'
import { formatLapTime } from '../timing/format'

const BACKDROP = `
position:fixed;inset:0;z-index:18;display:flex;
align-items:center;justify-content:center;
background:rgba(8,12,20,.72);backdrop-filter:blur(3px);
font:600 16px/1.6 ui-monospace,SFMono-Regular,Menlo,monospace;color:#fff;
`

const CARD = `
display:flex;flex-direction:column;gap:10px;align-items:center;
padding:26px 36px;border:1px solid rgba(255,255,255,.18);
border-radius:12px;background:rgba(0,0,0,.6);text-align:center;
`

/** Текст итогов заезда; чистая часть, чтобы проверять без DOM. */
export function finishLines(bestMs: number | null): string[] {
  const result = bestMs === null
    ? 'ЧИСТОГО КРУГА НЕ БЫЛО'
    : `ЛУЧШИЙ КРУГ ${formatLapTime(bestMs)}`
  return [
    'ЗАЕЗД ЗАВЕРШЁН',
    result,
    `ПОТРАЧЕНО ПОПЫТОК: ${TOTAL_ATTEMPTS}/${TOTAL_ATTEMPTS}`,
    'Enter — ещё три попытки · T — начать заново · M — меню',
  ]
}

/** Оверлей на весь экран, который появляется и исчезает по флагу. */
class Overlay {
  private root: HTMLDivElement
  private card: HTMLDivElement

  constructor(parent: HTMLElement) {
    this.root = document.createElement('div')
    this.root.setAttribute('style', BACKDROP)
    this.root.style.display = 'none'
    this.card = document.createElement('div')
    this.card.setAttribute('style', CARD)
    this.card.style.whiteSpace = 'pre-line'
    this.root.appendChild(this.card)
    parent.appendChild(this.root)
  }

  show(text: string): void {
    this.card.textContent = text
    this.root.style.display = 'flex'
  }

  hide(): void {
    this.root.style.display = 'none'
  }
}

export class PauseOverlay {
  private overlay: Overlay

  constructor(parent: HTMLElement = document.body) {
    this.overlay = new Overlay(parent)
  }

  update(paused: boolean): void {
    if (paused) this.overlay.show('ПАУЗА\nP — продолжить · M — меню')
    else this.overlay.hide()
  }
}

export class FinishOverlay {
  private overlay: Overlay

  constructor(parent: HTMLElement = document.body) {
    this.overlay = new Overlay(parent)
  }

  update(finished: boolean, bestMs: number | null): void {
    if (finished) this.overlay.show(finishLines(bestMs).join('\n'))
    else this.overlay.hide()
  }
}

import { TOTAL_LIGHTS } from '../timing/countdown'

/**
 * Стартовые огни: пять ламп в ряд, как на решётке Формулы-1.
 * Пока горят — газ заблокирован, гаснут разом на старте.
 */
const PANEL = `
position:fixed;left:50%;top:16%;transform:translateX(-50%);z-index:15;
display:flex;flex-direction:column;align-items:center;padding:16px 22px;border-radius:14px;
background:rgba(6,9,14,.72);border:1px solid rgba(255,255,255,.14);
backdrop-filter:blur(3px);pointer-events:none;
`

const LAMP_ON = 'background:#ff2118;box-shadow:0 0 22px 6px rgba(255,33,24,.55);'
const LAMP_OFF = 'background:#2a2f38;'

export class StartLights {
  private root: HTMLDivElement
  private lamps: HTMLDivElement[] = []
  private row: HTMLDivElement

  constructor(parent: HTMLElement = document.body) {
    this.root = document.createElement('div')
    this.root.setAttribute('style', PANEL)
    this.root.setAttribute('data-testid', 'start-lights')

    this.row = document.createElement('div')
    this.row.setAttribute('style', 'display:flex;gap:14px;')

    for (let i = 0; i < TOTAL_LIGHTS; i += 1) {
      const lamp = document.createElement('div')
      lamp.setAttribute('style', `width:34px;height:34px;border-radius:50%;${LAMP_OFF}`)
      this.lamps.push(lamp)
      this.row.appendChild(lamp)
    }

    // Подпись: без неё непонятно, почему газ не даёт хода.
    const caption = document.createElement('div')
    caption.textContent = 'НЕЙТРАЛЬ · ЖДЁМ СТАРТА'
    caption.setAttribute(
      'style',
      'margin-top:11px;font:600 11px/1 ui-monospace,SFMono-Regular,Menlo,monospace;' +
      'letter-spacing:1.6px;color:#c8d2de;text-align:center;',
    )

    this.root.append(this.row, caption)
    parent.appendChild(this.root)
  }

  update(lit: number, visible: boolean): void {
    this.root.style.display = visible ? 'flex' : 'none'
    this.lamps.forEach((lamp, i) => {
      lamp.setAttribute(
        'style',
        `width:34px;height:34px;border-radius:50%;${i < lit ? LAMP_ON : LAMP_OFF}`,
      )
    })
  }
}

import { TOTAL_LIGHTS } from '../timing/countdown'

/**
 * Стартовые огни: пять ламп в ряд, как на решётке Формулы-1.
 * Пока горят — газ заблокирован, гаснут разом на старте.
 */
const PANEL = `
position:fixed;left:50%;top:16%;transform:translateX(-50%);z-index:15;
display:flex;gap:14px;padding:16px 20px;border-radius:14px;
background:rgba(6,9,14,.72);border:1px solid rgba(255,255,255,.14);
backdrop-filter:blur(3px);pointer-events:none;
`

const LAMP_ON = 'background:#ff2118;box-shadow:0 0 22px 6px rgba(255,33,24,.55);'
const LAMP_OFF = 'background:#2a2f38;'

export class StartLights {
  private root: HTMLDivElement
  private lamps: HTMLDivElement[] = []

  constructor(parent: HTMLElement = document.body) {
    this.root = document.createElement('div')
    this.root.setAttribute('style', PANEL)
    this.root.setAttribute('data-testid', 'start-lights')
    for (let i = 0; i < TOTAL_LIGHTS; i += 1) {
      const lamp = document.createElement('div')
      lamp.setAttribute('style', `width:34px;height:34px;border-radius:50%;${LAMP_OFF}`)
      this.lamps.push(lamp)
      this.root.appendChild(lamp)
    }
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

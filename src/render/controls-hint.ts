const STYLE = `
position:fixed;left:16px;bottom:16px;z-index:10;pointer-events:none;
font:600 13px/1.7 ui-monospace,SFMono-Regular,Menlo,monospace;
color:#fff;text-shadow:0 1px 3px rgba(0,0,0,.9);
background:rgba(8,12,20,.5);padding:10px 14px;border-radius:9px;white-space:pre;
`

const KEYS = [
  'W / S      газ / тормоз',
  'A / D      руль',
  'Space      DRS',
  'C          камера',
  'P / Esc    пауза',
  'R          вернуться на трассу',
  'T          круг заново (тратит попытку)',
  'M          меню (на паузе или в конце)',
  'N          звук вкл/выкл',
  'H          скрыть подсказку',
]

const GAMEPAD = [
  '🎮 геймпад подключён',
  'Левый стик   руль',
  'RT / R2      газ',
  'LT / L2      тормоз',
  'A / крест    DRS',
  '',
]

/** Панель управления: без неё игрок не знает даже про возврат на трассу. */
export class ControlsHint {
  private root: HTMLDivElement
  private visible = true

  constructor(parent: HTMLElement = document.body, target: EventTarget = window) {
    this.root = document.createElement('div')
    this.root.setAttribute('style', STYLE)
    this.root.textContent = KEYS.join('\n')
    parent.appendChild(this.root)

    // Раскладка пада появляется в момент подключения: Gamepad API «видит»
    // пад только после первого нажатия любой его кнопки.
    target.addEventListener('gamepadconnected', () => this.render(true))
    target.addEventListener('gamepaddisconnected', () => {
      this.render(navigator.getGamepads().some((g) => g !== null))
    })
  }

  private render(withGamepad: boolean): void {
    this.root.textContent = (withGamepad ? [...GAMEPAD, ...KEYS] : KEYS).join('\n')
  }

  toggle(): void {
    this.visible = !this.visible
    this.root.style.display = this.visible ? 'block' : 'none'
  }
}

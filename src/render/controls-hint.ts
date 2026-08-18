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
  'P          пауза',
  'R          вернуться на трассу',
  'T          круг заново (тратит попытку)',
  'H          скрыть подсказку',
]

/** Панель управления: без неё игрок не знает даже про возврат на трассу. */
export class ControlsHint {
  private root: HTMLDivElement
  private visible = true

  constructor(parent: HTMLElement = document.body) {
    this.root = document.createElement('div')
    this.root.setAttribute('style', STYLE)
    this.root.textContent = KEYS.join('\n')
    parent.appendChild(this.root)
  }

  toggle(): void {
    this.visible = !this.visible
    this.root.style.display = this.visible ? 'block' : 'none'
  }
}

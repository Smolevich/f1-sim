import { sanitizeName } from '../storage/local'

const OVERLAY = `
position:fixed;inset:0;z-index:20;display:flex;
align-items:center;justify-content:center;
background:rgba(8,12,20,.86);backdrop-filter:blur(4px);
font:600 16px/1.6 ui-monospace,SFMono-Regular,Menlo,monospace;color:#fff;
`

const CARD = `
display:flex;flex-direction:column;gap:14px;
padding:28px 32px;border:1px solid rgba(255,255,255,.18);
border-radius:12px;background:rgba(0,0,0,.55);min-width:300px;
`

/** Оверлей ввода имени; резолвится, когда игрок подтвердил. */
export function askName(existing: string | null): Promise<string> {
  return new Promise((resolve) => {
    const overlay = document.createElement('div')
    overlay.setAttribute('style', OVERLAY)

    const card = document.createElement('div')
    card.setAttribute('style', CARD)

    const title = document.createElement('div')
    title.textContent = 'F1 SIM — МОНЦА'
    title.style.fontSize = '20px'

    const hint = document.createElement('div')
    hint.textContent = 'Имя для таблицы рекордов'
    hint.style.opacity = '.7'
    hint.style.fontSize = '13px'

    const input = document.createElement('input')
    input.value = existing ?? ''
    input.maxLength = 12
    input.placeholder = 'STAS'
    input.setAttribute(
      'style',
      'padding:10px 12px;font:inherit;color:#fff;background:rgba(255,255,255,.08);' +
      'border:1px solid rgba(255,255,255,.25);border-radius:8px;outline:none;',
    )

    const button = document.createElement('button')
    button.textContent = 'НА ТРАССУ'
    button.setAttribute(
      'style',
      'padding:10px 12px;font:inherit;cursor:pointer;color:#04121f;' +
      'background:#4ec9ff;border:0;border-radius:8px;',
    )

    const controls = document.createElement('div')
    controls.textContent = 'W газ · S тормоз · A/D руль · Space DRS · R сброс'
    controls.style.opacity = '.6'
    controls.style.fontSize = '12px'

    const submit = (): void => {
      const name = sanitizeName(input.value)
      overlay.remove()
      resolve(name)
    }

    button.addEventListener('click', submit)
    input.addEventListener('keydown', (e) => {
      if ((e as KeyboardEvent).key === 'Enter') submit()
    })

    card.append(title, hint, input, button, controls)
    overlay.appendChild(card)
    document.body.appendChild(overlay)
    input.focus()
  })
}

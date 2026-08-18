import { sanitizeName } from '../storage/local'
import { DEFAULT_TRACK_ID, TRACK_CATALOGUE, isKnownTrackId } from '../track/catalogue'
import { formatLapTime } from '../timing/format'
import { DEFAULT_LIVERY, LIVERIES, liveryById } from './liveries'

export type StartChoice = { name: string; trackId: string; liveryId: string }

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

/** Строка трассы в списке: длина в километрах и реальный рекорд круга. */
export function trackOptionLabel(id: string): string {
  const t = TRACK_CATALOGUE.find((e) => e.id === id)
  if (t === undefined) return id
  return `${t.name} · ${(t.lengthM / 1000).toFixed(3)} км · ${formatLapTime(t.recordMs)} ${t.recordDriver}`
}

/** Оверлей старта: имя и трасса; резолвится, когда игрок подтвердил. */
export function askStart(
  existing: string | null,
  existingTrack: string | null,
  existingLivery: string | null = null,
): Promise<StartChoice> {
  return new Promise((resolve) => {
    const overlay = document.createElement('div')
    overlay.setAttribute('style', OVERLAY)

    const card = document.createElement('div')
    card.setAttribute('style', CARD)

    const title = document.createElement('div')
    title.textContent = 'F1 SIM — КВАЛИФИКАЦИЯ'
    title.style.fontSize = '20px'

    const trackHint = document.createElement('div')
    trackHint.textContent = 'Трасса'
    trackHint.style.opacity = '.7'
    trackHint.style.fontSize = '13px'

    const select = document.createElement('select')
    select.setAttribute('data-testid', 'track-select')
    select.setAttribute(
      'style',
      'padding:10px 12px;font:inherit;color:#fff;background:rgba(255,255,255,.08);' +
      'border:1px solid rgba(255,255,255,.25);border-radius:8px;outline:none;',
    )
    for (const entry of TRACK_CATALOGUE) {
      const option = document.createElement('option')
      option.value = entry.id
      option.textContent = trackOptionLabel(entry.id)
      option.style.color = '#04121f'
      select.appendChild(option)
    }
    select.value = isKnownTrackId(existingTrack) ? existingTrack! : DEFAULT_TRACK_ID

    const teamHint = document.createElement('div')
    teamHint.textContent = 'Команда'
    teamHint.style.opacity = '.7'
    teamHint.style.fontSize = '13px'

    const teamSelect = document.createElement('select')
    teamSelect.setAttribute('data-testid', 'team-select')
    teamSelect.setAttribute(
      'style',
      'padding:10px 12px;font:inherit;color:#fff;background:rgba(255,255,255,.08);' +
      'border:1px solid rgba(255,255,255,.25);border-radius:8px;outline:none;',
    )
    for (const livery of LIVERIES) {
      const option = document.createElement('option')
      option.value = livery.id
      option.textContent = livery.name
      teamSelect.appendChild(option)
    }
    teamSelect.value = liveryById(existingLivery ?? DEFAULT_LIVERY.id).id

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
    controls.textContent = '3 попытки на лучший круг · W газ · S тормоз · A/D руль · Space DRS · P пауза'
    controls.style.opacity = '.6'
    controls.style.fontSize = '12px'

    const submit = (): void => {
      const name = sanitizeName(input.value)
      const trackId = isKnownTrackId(select.value) ? select.value : DEFAULT_TRACK_ID
      const liveryId = liveryById(teamSelect.value).id
      overlay.remove()
      resolve({ name, trackId, liveryId })
    }

    button.addEventListener('click', submit)
    input.addEventListener('keydown', (e) => {
      if ((e as KeyboardEvent).key === 'Enter') submit()
    })

    // Атрибуция обязательна по лицензии модели (CC-BY 4.0), см. docs/assets.md.
    const credit = document.createElement('div')
    credit.textContent = 'Модель болида: Blender458 · CC BY 4.0'
    credit.style.opacity = '.45'
    credit.style.fontSize = '11px'

    card.append(
      title, trackHint, select, teamHint, teamSelect,
      hint, input, button, controls, credit,
    )
    overlay.appendChild(card)
    document.body.appendChild(overlay)
    input.focus()
  })
}

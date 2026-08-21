import { sanitizeName } from '../storage/local'
import { DEFAULT_TRACK_ID, TRACK_CATALOGUE, isKnownTrackId } from '../track/catalogue'
import { formatLapTime } from '../timing/format'
import { DEFAULT_LIVERY, LIVERIES, liveryById } from './liveries'
import { fetchTop } from '../net/leaderboard'
import { buildBoard } from './board-view'

export type StartChoice = { name: string; trackId: string; liveryId: string }

// Прокрутка на оверлее, а не на карточке: при align-items:center высокая
// карточка обрезается с обоих краёв, и до кнопки старта не добраться.
const OVERLAY = `
position:fixed;inset:0;z-index:20;display:flex;
align-items:flex-start;justify-content:center;overflow-y:auto;
padding:24px 16px;box-sizing:border-box;
background:rgba(8,12,20,.86);backdrop-filter:blur(4px);
font:600 16px/1.6 ui-monospace,SFMono-Regular,Menlo,monospace;color:#fff;
`

// margin:auto центрирует карточку, пока она помещается, и прижимает к верху,
// когда нет: шесть трасс плюс восемь команд дают почти 1000 px, и на
// ноутбучных 720 px кнопка «НА ТРАССУ» уезжала за нижний край.
// Две колонки вместо одного длинного столбца: в один экран влезает всё, и
// ничего не приходится листать. На узком экране колонки складываются.
const CARD = `
display:grid;grid-template-columns:minmax(320px,1.15fr) minmax(240px,.85fr);
gap:10px 22px;align-items:start;
padding:20px 26px;border:1px solid rgba(255,255,255,.18);
border-radius:14px;background:rgba(0,0,0,.62);
margin:auto;max-width:min(94vw,900px);
`

const COLUMN = 'display:flex;flex-direction:column;gap:8px;min-width:0;'

const TITLE_STYLE = 'grid-column:1/-1;font-size:19px;letter-spacing:.5px;'

const FOOTER_STYLE = 'grid-column:1/-1;display:flex;flex-direction:column;gap:4px;'

/** Строка трассы в списке: длина в километрах и реальный рекорд круга. */
export function trackOptionLabel(id: string): string {
  const t = TRACK_CATALOGUE.find((e) => e.id === id)
  if (t === undefined) return id
  return `${t.name} · ${(t.lengthM / 1000).toFixed(3)} км · ${formatLapTime(t.recordMs)} ${t.recordDriver}`
}


type Option = { id: string; label: string; colour?: number }

/**
 * Список выбора кнопками, а не <select>.
 *
 * Нативный список на macOS открывается системным окном: стрелки в него не
 * доходят, и выбор клавиатурой не работал — игрок жал вниз, значение не
 * менялось, и стартовала прежняя трасса. Кнопки ведут себя одинаково всюду
 * и показывают все варианты сразу, без раскрытия.
 */
function optionList(
  options: readonly Option[], selected: string, testId: string,
  onChange?: (id: string) => void,
): { element: HTMLElement; value: () => string } {
  const list = document.createElement('div')
  list.setAttribute('data-testid', testId)
  list.setAttribute('style', 'display:flex;flex-direction:column;gap:3px;')

  let current = selected
  const buttons = new Map<string, HTMLButtonElement>()

  const paint = (): void => {
    for (const [id, button] of buttons) {
      const active = id === current
      button.setAttribute(
        'style',
        'padding:5px 10px;font:inherit;font-size:12px;text-align:left;cursor:pointer;' +
        'border-radius:7px;transition:background .12s;' +
        (active
          ? 'color:#04121f;background:#4ec9ff;border:1px solid #4ec9ff;'
          : 'color:#fff;background:rgba(255,255,255,.06);border:1px solid rgba(255,255,255,.18);'),
      )
    }
  }

  for (const option of options) {
    const button = document.createElement('button')
    button.type = 'button'
    if (option.colour === undefined) {
      button.textContent = option.label
    } else {
      // Кружок цвета команды: по названию не угадать, в чём поедешь.
      const dot = document.createElement('span')
      dot.setAttribute(
        'style',
        'display:inline-block;width:11px;height:11px;border-radius:50%;' +
        'margin-right:9px;vertical-align:-1px;' +
        `background:#${option.colour.toString(16).padStart(6, '0')};` +
        'border:1px solid rgba(0,0,0,.35);',
      )
      button.append(dot, document.createTextNode(option.label))
    }
    button.setAttribute('data-value', option.id)
    button.addEventListener('click', () => {
      current = option.id
      paint()
      onChange?.(option.id)
    })
    buttons.set(option.id, button)
    list.appendChild(button)
  }
  paint()

  return { element: list, value: () => current }
}

/**
 * Таблица рекордов выбранной трассы прямо в меню: до старта видно, что
 * побивать, и есть куда посмотреть после заезда, не запуская новый.
 */
function leaderboardPanel(playerName: string): {
  element: HTMLElement; load: (trackId: string) => void
} {
  const box = document.createElement('div')
  box.setAttribute('data-testid', 'menu-leaderboard')
  box.setAttribute(
    'style',
    'padding:10px 12px;border-radius:9px;' +
    'background:rgba(255,255,255,.045);border:1px solid rgba(255,255,255,.12);' +
    'min-height:96px;',
  )

  const caption = document.createElement('div')
  caption.textContent = 'ЛУЧШИЕ КРУГИ'
  caption.setAttribute(
    'style',
    'font-size:11px;letter-spacing:1.2px;color:#8ea0b4;margin-bottom:7px;',
  )

  let token = 0
  const load = (trackId: string): void => {
    // Счётчик отсекает ответ на прошлую трассу: игрок успевает перещёлкнуть
    // список, пока запрос в пути, и без него таблица показывает чужие круги.
    token += 1
    const mine = token

    const show = (body: HTMLElement): void => {
      box.replaceChildren(caption, body)
    }

    const loading = document.createElement('div')
    loading.textContent = 'загрузка…'
    loading.setAttribute('style', 'font-size:12px;color:#8ea0b4;padding:4px 2px;')
    show(loading)

    void fetchTop(trackId).then((entries) => {
      if (mine !== token) return
      show(buildBoard(entries.slice(0, 5), playerName, true))
    }).catch(() => {
      if (mine !== token) return
      const failed = document.createElement('div')
      failed.textContent = 'таблица недоступна'
      failed.setAttribute('style', 'font-size:12px;color:#8ea0b4;padding:4px 2px;')
      show(failed)
    })
  }

  return { element: box, load }
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
    title.setAttribute('style', TITLE_STYLE)

    const trackHint = document.createElement('div')
    trackHint.textContent = 'Трасса'
    trackHint.style.opacity = '.7'
    trackHint.style.fontSize = '13px'

    const board = leaderboardPanel(existing ?? '')
    const startTrack = isKnownTrackId(existingTrack) ? existingTrack! : DEFAULT_TRACK_ID
    const trackList = optionList(
      TRACK_CATALOGUE.map((entry) => ({ id: entry.id, label: trackOptionLabel(entry.id) })),
      startTrack,
      'track-select',
      (id) => board.load(id),
    )
    board.load(startTrack)

    const teamHint = document.createElement('div')
    teamHint.textContent = 'Команда'
    teamHint.style.opacity = '.7'
    teamHint.style.fontSize = '13px'

    const teamList = optionList(
      LIVERIES.map((livery) => ({ id: livery.id, label: livery.name, colour: livery.primary })),
      liveryById(existingLivery ?? DEFAULT_LIVERY.id).id,
      'team-select',
    )

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
      const trackId = isKnownTrackId(trackList.value()) ? trackList.value() : DEFAULT_TRACK_ID
      const liveryId = liveryById(teamList.value()).id
      overlay.remove()
      resolve({ name, trackId, liveryId })
    }

    button.addEventListener('click', submit)
    input.addEventListener('keydown', (e) => {
      if ((e as KeyboardEvent).key === 'Enter') submit()
    })

    // Атрибуция обязательна по лицензии модели (CC-BY 4.0), см. docs/assets.md.
    const credit = document.createElement('div')
    credit.textContent = 'Модель: 3dblenderlol · CC BY 4.0 · звук: Ears68 · CC0'
    credit.style.opacity = '.45'
    credit.style.fontSize = '11px'

    const left = document.createElement('div')
    left.setAttribute('style', COLUMN)
    left.append(trackHint, trackList.element, board.element)

    const right = document.createElement('div')
    right.setAttribute('style', COLUMN)
    right.append(teamHint, teamList.element, hint, input, button)

    const footer = document.createElement('div')
    footer.setAttribute('style', FOOTER_STYLE)
    footer.append(controls, credit)

    card.append(title, left, right, footer)
    overlay.appendChild(card)
    document.body.appendChild(overlay)
    input.focus()
  })
}

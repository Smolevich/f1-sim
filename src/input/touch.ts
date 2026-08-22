import type { CarInput } from '../physics/vehicle'
import { steerTowards } from './keyboard'

export type TouchControl = 'throttle' | 'brake' | 'drs'

/**
 * Скорость догоняния пальца рулём. Палец дрожит, сырое значение дёргает
 * машину; но и вялый руль на телефоне неуправляем — догоняем быстро.
 */
const STEER_FOLLOW_RATE = 10
const STEER_RELEASE_RATE = 8

/**
 * Управление с телефона: слева слайдер руля (палец тянет — руль поворачивается
 * пропорционально, как стик геймпада), справа педали газа и тормоза.
 * DOM-слой (buildTouchOverlay) переводит касания в setSteer/press.
 */
export class TouchInput {
  private pressed = new Set<TouchControl>()
  private steer = 0
  private steerTarget: number | null = null

  press(control: TouchControl): void {
    this.pressed.add(control)
  }

  release(control: TouchControl): void {
    this.pressed.delete(control)
  }

  /** Положение пальца на слайдере руля, -1..1. */
  setSteer(value: number): void {
    this.steerTarget = Math.max(-1, Math.min(1, value))
  }

  clearSteer(): void {
    this.steerTarget = null
  }

  read(dt: number): CarInput {
    const target = this.steerTarget ?? 0
    const rate = this.steerTarget === null ? STEER_RELEASE_RATE : STEER_FOLLOW_RATE
    this.steer = steerTowards(this.steer, target, dt, rate)

    return {
      throttle: this.pressed.has('throttle') ? 1 : 0,
      brake: this.pressed.has('brake') ? 1 : 0,
      steer: this.steer,
      gear: 0,
      drs: this.pressed.has('drs'),
    }
  }
}

const OVERLAY_STYLE = 'position:fixed;inset:0;pointer-events:none;z-index:5;' +
  'font-family:ui-monospace,monospace;user-select:none;-webkit-user-select:none'

const ROUND = 'position:absolute;pointer-events:auto;touch-action:none;' +
  'display:flex;align-items:center;justify-content:center;border-radius:50%;' +
  'background:rgba(20,24,30,.5);color:#fff;border:2px solid rgba(255,255,255,.4)'

const IDLE_BG = 'rgba(20,24,30,.5)'
const ACTIVE_BG = 'rgba(80,120,200,.6)'

/** Есть ли у устройства сенсорный экран — тогда и рисуем кнопки. */
export function isTouchDevice(): boolean {
  return window.matchMedia('(pointer: coarse)').matches || 'ontouchstart' in window
}

export function buildTouchOverlay(
  input: TouchInput,
  onRecover: () => void = () => {},
): HTMLElement {
  const overlay = document.createElement('div')
  overlay.setAttribute('style', OVERLAY_STYLE)

  overlay.appendChild(buildSteerSlider(input))

  overlay.appendChild(pedal(input, 'throttle', '▲',
    'right:4vw;bottom:5vh;width:24vmin;height:24vmin;font-size:30px'))
  overlay.appendChild(pedal(input, 'brake', '⏹',
    'right:26vw;bottom:5vh;width:20vmin;height:20vmin;font-size:26px'))
  overlay.appendChild(pedal(input, 'drs', 'DRS',
    'right:5vw;bottom:38vh;width:14vmin;height:14vmin;font-size:15px'))

  // Съехал и застрял — вернуться на трассу. Разовая команда, не педаль.
  const recover = document.createElement('div')
  recover.dataset.control = 'recover'
  recover.textContent = '↺'
  recover.setAttribute('style', `${ROUND};left:4vw;bottom:38vh;width:14vmin;height:14vmin;font-size:26px`)
  recover.addEventListener('pointerdown', (e) => {
    e.preventDefault()
    recover.style.background = ACTIVE_BG
    onRecover()
  })
  recover.addEventListener('pointerup', () => { recover.style.background = IDLE_BG })
  overlay.appendChild(recover)

  return overlay
}

/** Педаль: захват указателя, чтобы уползший палец не сбрасывал газ. */
function pedal(input: TouchInput, control: TouchControl, label: string, place: string): HTMLElement {
  const button = document.createElement('div')
  button.dataset.control = control
  button.textContent = label
  button.setAttribute('style', `${ROUND};${place}`)

  button.addEventListener('pointerdown', (e) => {
    e.preventDefault()
    // Захват держит pointerup за кнопкой, даже если палец уполз с неё.
    try { button.setPointerCapture(e.pointerId) } catch { /* синтетика без указателя */ }
    input.press(control)
    button.style.background = ACTIVE_BG
  })
  const release = (): void => {
    input.release(control)
    button.style.background = IDLE_BG
  }
  button.addEventListener('pointerup', release)
  button.addEventListener('pointercancel', release)
  return button
}

/** Слайдер руля: положение пальца по горизонтали — угол руля. */
function buildSteerSlider(input: TouchInput): HTMLElement {
  const slider = document.createElement('div')
  slider.dataset.control = 'steer'
  slider.setAttribute('style',
    'position:absolute;pointer-events:auto;touch-action:none;' +
    'left:4vw;bottom:5vh;width:44vw;height:18vmin;border-radius:12vmin;' +
    'background:rgba(20,24,30,.4);border:2px solid rgba(255,255,255,.35)')

  const knob = document.createElement('div')
  knob.setAttribute('style',
    'position:absolute;top:50%;left:50%;width:15vmin;height:15vmin;' +
    'transform:translate(-50%,-50%);border-radius:50%;' +
    'background:rgba(120,150,220,.75);border:2px solid rgba(255,255,255,.6);' +
    'pointer-events:none;transition:none')
  slider.appendChild(knob)

  // Полный поворот раньше края: до упора слайдера тянуться неудобно.
  const FULL_LOCK_AT = 0.8

  const move = (e: PointerEvent): void => {
    const rect = slider.getBoundingClientRect()
    const center = rect.left + rect.width / 2
    const half = (rect.width / 2) * FULL_LOCK_AT
    const value = Math.max(-1, Math.min(1, (e.clientX - center) / half))
    input.setSteer(value)
    knob.style.left = `${50 + value * FULL_LOCK_AT * 42}%`
  }
  const drop = (): void => {
    input.clearSteer()
    knob.style.left = '50%'
  }

  let activePointer: number | null = null
  slider.addEventListener('pointerdown', (e) => {
    e.preventDefault()
    activePointer = e.pointerId
    try { slider.setPointerCapture(e.pointerId) } catch { /* синтетика без указателя */ }
    move(e)
  })
  slider.addEventListener('pointermove', (e) => {
    if (e.pointerId === activePointer) move(e)
  })
  const up = (e: PointerEvent): void => {
    if (e.pointerId === activePointer) { activePointer = null; drop() }
  }
  slider.addEventListener('pointerup', up)
  slider.addEventListener('pointercancel', up)

  return slider
}

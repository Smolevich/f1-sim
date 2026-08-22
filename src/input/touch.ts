import type { CarInput } from '../physics/vehicle'
import { STEER_RATE, STEER_RETURN, steerTowards } from './keyboard'

export type TouchControl = 'left' | 'right' | 'throttle' | 'brake' | 'drs'

/**
 * Экранные кнопки для телефона. Логика — как у клавиатуры: кнопка даёт 0/1,
 * руль сглаживается теми же скоростями. DOM-слой (buildTouchOverlay) только
 * переводит касания в press/release.
 */
export class TouchInput {
  private pressed = new Set<TouchControl>()
  private steer = 0

  press(control: TouchControl): void {
    this.pressed.add(control)
  }

  release(control: TouchControl): void {
    this.pressed.delete(control)
  }

  read(dt: number): CarInput {
    const target = (this.pressed.has('right') ? 1 : 0) - (this.pressed.has('left') ? 1 : 0)
    const rate = target === 0 ? STEER_RETURN : STEER_RATE
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

const BUTTON_STYLE = 'position:absolute;pointer-events:auto;touch-action:none;' +
  'display:flex;align-items:center;justify-content:center;' +
  'border-radius:50%;background:rgba(20,24,30,.45);color:#fff;' +
  'border:2px solid rgba(255,255,255,.35);font-size:26px'

type ButtonSpec = {
  control: TouchControl
  label: string
  style: string
}

const BUTTONS: ButtonSpec[] = [
  { control: 'left', label: '◀', style: 'left:4vw;bottom:6vh;width:17vmin;height:17vmin' },
  { control: 'right', label: '▶', style: 'left:24vw;bottom:6vh;width:17vmin;height:17vmin' },
  { control: 'brake', label: '⏹', style: 'right:24vw;bottom:6vh;width:17vmin;height:17vmin' },
  { control: 'throttle', label: '▲', style: 'right:4vw;bottom:6vh;width:19vmin;height:19vmin' },
  { control: 'drs', label: 'DRS', style: 'right:6vw;bottom:32vh;width:13vmin;height:13vmin;font-size:16px' },
]

/** Есть ли у устройства сенсорный экран — тогда и рисуем кнопки. */
export function isTouchDevice(): boolean {
  return window.matchMedia('(pointer: coarse)').matches || 'ontouchstart' in window
}

export function buildTouchOverlay(input: TouchInput): HTMLElement {
  const overlay = document.createElement('div')
  overlay.setAttribute('style', OVERLAY_STYLE)

  for (const spec of BUTTONS) {
    const button = document.createElement('div')
    button.dataset.control = spec.control
    button.textContent = spec.label
    button.setAttribute('style', `${BUTTON_STYLE};${spec.style}`)

    const press = (e: Event): void => {
      e.preventDefault()
      input.press(spec.control)
      button.style.background = 'rgba(80,120,200,.55)'
    }
    const release = (e: Event): void => {
      e.preventDefault()
      input.release(spec.control)
      button.style.background = 'rgba(20,24,30,.45)'
    }
    button.addEventListener('pointerdown', press)
    button.addEventListener('pointerup', release)
    button.addEventListener('pointercancel', release)
    // Палец уполз с кнопки — команда снимается, иначе газ «залипает».
    button.addEventListener('pointerleave', release)
    overlay.appendChild(button)
  }

  return overlay
}

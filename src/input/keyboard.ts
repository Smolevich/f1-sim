import type { CarInput } from '../physics/vehicle'

const KEYS = {
  throttle: ['KeyW', 'ArrowUp'],
  brake: ['KeyS', 'ArrowDown'],
  left: ['KeyA', 'ArrowLeft'],
  right: ['KeyD', 'ArrowRight'],
  drs: ['Space'],
}

const HANDLED = new Set(Object.values(KEYS).flat())

/**
 * Сглаживание руля: клавиша даёт 0 или 1, а рулить ступенькой в симе невозможно —
 * машину срывает на каждом повороте. Ассист отключаемый.
 */
// 4.0 даёт полный поворот за 0.25 с и скорость колёс около 68 град/с — как у
// настоящего болида. Прежние 7.0 давали 120 град/с, вдвое быстрее реального,
// и машина дёргалась от каждого касания клавиши.
export const STEER_RATE = 4.0
// Возврат быстрее набора: отпустил клавишу — машина сразу распрямляется,
// иначе в связке поворотов руль остаётся вывернутым.
export const STEER_RETURN = 6.0

/** Плавное движение руля к цели без перескока. */
export function steerTowards(current: number, target: number, dt: number, rate: number): number {
  const step = rate * dt
  const delta = target - current
  if (Math.abs(delta) <= step) return target
  return current + Math.sign(delta) * step
}

export class KeyboardInput {
  private pressed = new Set<string>()
  private steer = 0
  smoothing = true
  /** Множитель скорости руля: игрок подстраивает под себя. */
  sensitivity = 1

  constructor(target: EventTarget = window) {
    target.addEventListener('keydown', (e) => {
      const code = (e as KeyboardEvent).code
      // Стрелки скроллят страницу, Space нажимает сфокусированный элемент —
      // и то и другое уводит управление из игры.
      if (HANDLED.has(code)) e.preventDefault()
      this.pressed.add(code)
    })
    target.addEventListener('keyup', (e) => {
      const code = (e as KeyboardEvent).code
      if (HANDLED.has(code)) e.preventDefault()
      this.pressed.delete(code)
    })
  }

  read(dt: number): CarInput {
    const left = KEYS.left.some((k) => this.pressed.has(k))
    const right = KEYS.right.some((k) => this.pressed.has(k))
    const target = (right ? 1 : 0) - (left ? 1 : 0)

    if (this.smoothing) {
      const rate = (target === 0 ? STEER_RETURN : STEER_RATE) * this.sensitivity
      this.steer = steerTowards(this.steer, target, dt, rate)
    } else {
      this.steer = target
    }

    return {
      throttle: KEYS.throttle.some((k) => this.pressed.has(k)) ? 1 : 0,
      brake: KEYS.brake.some((k) => this.pressed.has(k)) ? 1 : 0,
      steer: this.steer,
      gear: 0,
      drs: KEYS.drs.some((k) => this.pressed.has(k)),
    }
  }

  /** Набор включённых ассистов: уходит в leaderboard вместе со временем круга. */
  assists(): string[] {
    return this.smoothing ? ['steer-smoothing'] : []
  }
}

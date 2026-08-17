import type { CarInput } from '../physics/vehicle'

const KEYS = {
  throttle: ['KeyW', 'ArrowUp'],
  brake: ['KeyS', 'ArrowDown'],
  left: ['KeyA', 'ArrowLeft'],
  right: ['KeyD', 'ArrowRight'],
  drs: ['Space'],
}

/**
 * Сглаживание руля: клавиша даёт 0 или 1, а рулить ступенькой в симе невозможно —
 * машину срывает на каждом повороте. Ассист отключаемый.
 */
const STEER_RATE = 3.5
const STEER_RETURN = 5.0

export class KeyboardInput {
  private pressed = new Set<string>()
  private steer = 0
  smoothing = true

  constructor(target: EventTarget = window) {
    target.addEventListener('keydown', (e) => this.pressed.add((e as KeyboardEvent).code))
    target.addEventListener('keyup', (e) => this.pressed.delete((e as KeyboardEvent).code))
  }

  read(dt: number): CarInput {
    const left = KEYS.left.some((k) => this.pressed.has(k))
    const right = KEYS.right.some((k) => this.pressed.has(k))
    const target = (right ? 1 : 0) - (left ? 1 : 0)

    if (this.smoothing) {
      const rate = target === 0 ? STEER_RETURN : STEER_RATE
      this.steer += Math.sign(target - this.steer) * Math.min(rate * dt, Math.abs(target - this.steer))
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
}

import type { CarInput } from '../physics/vehicle'

/**
 * Геймпад через Gamepad API: работает во всех современных браузерах, пады
 * Xbox и PlayStation по USB и Bluetooth видны как «standard mapping».
 * Стик — аналоговый руль, курки — аналоговые газ и тормоз: точнее клавиатуры.
 */

/** Лёгкий увод стика от нуля — дрейф железа, не команда. */
const DEADZONE = 0.15

/** Индексы standard mapping: левый стик X, курки LT/RT, кнопка A. */
const AXIS_STEER = 0
const BUTTON_DRS = 0
const BUTTON_BRAKE = 6
const BUTTON_THROTTLE = 7

/** Чистый маппинг осей и кнопок в CarInput — тестируется без браузера. */
export function mapGamepad(axes: number[], buttons: number[]): CarInput {
  const raw = axes[AXIS_STEER] ?? 0
  const magnitude = Math.abs(raw)
  // Перемасштабирование после мёртвой зоны: руль растёт от нуля плавно,
  // а не скачком на величину зоны.
  const steer = magnitude <= DEADZONE
    ? 0
    : Math.sign(raw) * Math.min(1, (magnitude - DEADZONE) / (1 - DEADZONE))

  return {
    throttle: buttons[BUTTON_THROTTLE] ?? 0,
    brake: buttons[BUTTON_BRAKE] ?? 0,
    steer,
    gear: 0,
    drs: (buttons[BUTTON_DRS] ?? 0) > 0.5,
  }
}

/** Два источника управления сразу: берём более сильную команду каждой оси. */
export function mergeInputs(a: CarInput, b: CarInput): CarInput {
  return {
    throttle: Math.max(a.throttle, b.throttle),
    brake: Math.max(a.brake, b.brake),
    steer: Math.abs(a.steer) >= Math.abs(b.steer) ? a.steer : b.steer,
    gear: 0,
    drs: a.drs || b.drs,
  }
}

export class GamepadInput {
  read(): CarInput | null {
    // Каждый кадр напрямую: событий по осям браузер не шлёт, а событие
    // gamepadconnected легко упустить — оно гонится с загрузкой модуля.
    if (!('getGamepads' in navigator)) return null
    const pad = navigator.getGamepads().find((g) => g !== null)
    if (!pad) return null
    return mapGamepad([...pad.axes], pad.buttons.map((b) => b.value))
  }
}

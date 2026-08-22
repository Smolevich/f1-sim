import { expect, test } from 'vitest'
import { mapGamepad, mergeInputs } from './gamepad'

const idle = { throttle: 0, brake: 0, steer: 0, gear: 0, drs: false }

test('стик вправо — руль вправо, курки — газ и тормоз', () => {
  const input = mapGamepad([0.8, 0], [0, 0, 0, 0, 0, 0, 0.3, 0.9])
  expect(input.steer).toBeGreaterThan(0.7)
  expect(input.throttle).toBeCloseTo(0.9, 1)
  expect(input.brake).toBeCloseTo(0.3, 1)
})

test('мёртвая зона стика: лёгкий увод не рулит', () => {
  expect(mapGamepad([0.1, 0], [0, 0, 0, 0, 0, 0, 0, 0]).steer).toBe(0)
  expect(mapGamepad([-0.1, 0], [0, 0, 0, 0, 0, 0, 0, 0]).steer).toBe(0)
})

test('за мёртвой зоной руль растёт от нуля, без скачка', () => {
  const nearDeadzone = mapGamepad([0.16, 0], [0, 0, 0, 0, 0, 0, 0, 0]).steer
  expect(nearDeadzone).toBeGreaterThan(0)
  expect(nearDeadzone).toBeLessThan(0.05)
})

test('полный наклон стика — полный руль', () => {
  expect(mapGamepad([1, 0], [0, 0, 0, 0, 0, 0, 0, 0]).steer).toBeCloseTo(1)
  expect(mapGamepad([-1, 0], [0, 0, 0, 0, 0, 0, 0, 0]).steer).toBeCloseTo(-1)
})

test('кнопка A включает DRS', () => {
  expect(mapGamepad([0, 0], [1, 0, 0, 0, 0, 0, 0, 0]).drs).toBe(true)
  expect(mapGamepad([0, 0], [0, 0, 0, 0, 0, 0, 0, 0]).drs).toBe(false)
})

test('слияние: активный источник побеждает простаивающий', () => {
  const pad = { throttle: 0.7, brake: 0, steer: -0.5, gear: 0, drs: false }
  const merged = mergeInputs(idle, pad)
  expect(merged.throttle).toBe(0.7)
  expect(merged.steer).toBe(-0.5)
})

test('слияние: клавиатура работает, даже когда геймпад подключён и молчит', () => {
  const keyboard = { throttle: 1, brake: 0, steer: 0.3, gear: 0, drs: true }
  const merged = mergeInputs(keyboard, idle)
  expect(merged.throttle).toBe(1)
  expect(merged.steer).toBe(0.3)
  expect(merged.drs).toBe(true)
})

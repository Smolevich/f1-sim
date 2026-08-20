import { expect, test } from 'vitest'
import { advance, HOLD_MS, LIGHT_INTERVAL_MS, START, TOTAL_LIGHTS, totalMs } from './countdown'

const after = (ms: number) => advance(START, ms)

test('в начале огней нет и старт закрыт', () => {
  expect(START.lights).toBe(0)
  expect(START.released).toBe(false)
})

test('огни зажигаются по одному', () => {
  expect(after(LIGHT_INTERVAL_MS * 1.1).lights).toBe(1)
  expect(after(LIGHT_INTERVAL_MS * 3.1).lights).toBe(3)
})

test('больше пяти огней не зажигается', () => {
  expect(after(LIGHT_INTERVAL_MS * 20).lights).toBeLessThanOrEqual(TOTAL_LIGHTS)
})

test('старт открывается после паузы, а не сразу с пятым огнём', () => {
  const allLit = LIGHT_INTERVAL_MS * TOTAL_LIGHTS
  expect(after(allLit + HOLD_MS * 0.5).released).toBe(false)
  expect(after(allLit + HOLD_MS + 1).released).toBe(true)
})

test('на открытии старта огни гаснут', () => {
  expect(after(totalMs() + 10).lights).toBe(0)
})

test('отрицательный шаг времени не откручивает отсчёт назад', () => {
  const state = after(LIGHT_INTERVAL_MS * 2)
  expect(advance(state, -500).elapsedMs).toBe(state.elapsedMs)
})

test('отсчёт длится около шести секунд — как на решётке', () => {
  expect(totalMs()).toBeGreaterThan(4500)
  expect(totalMs()).toBeLessThan(7000)
})

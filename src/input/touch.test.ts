import { expect, test } from 'vitest'
import { TouchInput } from './touch'

test('нажатый газ даёт полный газ, отпущенный — ноль', () => {
  const touch = new TouchInput()
  touch.press('throttle')
  expect(touch.read(0.1).throttle).toBe(1)
  touch.release('throttle')
  expect(touch.read(0.1).throttle).toBe(0)
})

test('палец на слайдере — аналоговый руль, а не ступенька 0/1', () => {
  const touch = new TouchInput()
  touch.setSteer(0.4)
  // Пара кадров на сглаживание дрожи пальца.
  touch.read(0.1)
  const steer = touch.read(0.1).steer
  expect(steer).toBeGreaterThan(0.3)
  expect(steer).toBeLessThanOrEqual(0.4)
})

test('руль следует за пальцем в обе стороны без отпускания', () => {
  const touch = new TouchInput()
  touch.setSteer(0.8)
  touch.read(0.2); touch.read(0.2)
  touch.setSteer(-0.8)
  touch.read(0.2); touch.read(0.2); touch.read(0.2)
  expect(touch.read(0.2).steer).toBeLessThan(-0.5)
})

test('палец отпущен — руль возвращается к нулю', () => {
  const touch = new TouchInput()
  touch.setSteer(1)
  touch.read(0.3)
  touch.clearSteer()
  touch.read(0.3); touch.read(0.3)
  expect(touch.read(0.3).steer).toBe(0)
})

test('газ и тормоз одновременно — обе команды проходят, решает физика', () => {
  const touch = new TouchInput()
  touch.press('throttle')
  touch.press('brake')
  const input = touch.read(0.1)
  expect(input.throttle).toBe(1)
  expect(input.brake).toBe(1)
})

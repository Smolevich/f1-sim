import { expect, test } from 'vitest'
import { TouchInput } from './touch'

test('нажатый газ даёт полный газ, отпущенный — ноль', () => {
  const touch = new TouchInput()
  touch.press('throttle')
  expect(touch.read(0.1).throttle).toBe(1)
  touch.release('throttle')
  expect(touch.read(0.1).throttle).toBe(0)
})

test('руль набирается плавно, как с клавиатуры, а не ступенькой', () => {
  const touch = new TouchInput()
  touch.press('right')
  const early = touch.read(0.05).steer
  expect(early).toBeGreaterThan(0)
  expect(early).toBeLessThan(0.5)
  const later = touch.read(0.3).steer
  expect(later).toBeGreaterThan(early)
})

test('отпустил руль — возврат к нулю', () => {
  const touch = new TouchInput()
  touch.press('left')
  touch.read(0.3)
  touch.release('left')
  touch.read(0.3)
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

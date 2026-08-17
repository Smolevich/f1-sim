import { expect, test } from 'vitest'
import { noisePixels } from './textures'

test('шум держится вокруг базового цвета', () => {
  const px = noisePixels(64, [60, 60, 60], 20)
  let sum = 0
  for (let i = 0; i < px.length; i += 4) sum += px[i]
  const mean = sum / (px.length / 4)
  expect(mean).toBeGreaterThan(40)
  expect(mean).toBeLessThan(80)
})

test('шум не однотонный', () => {
  const px = noisePixels(64, [60, 60, 60], 20)
  const first = px[0]
  let different = 0
  for (let i = 0; i < px.length; i += 4) if (px[i] !== first) different++
  expect(different).toBeGreaterThan(100)
})

test('нулевой разброс даёт ровный цвет', () => {
  const px = noisePixels(16, [10, 20, 30], 0)
  expect(px[0]).toBe(10)
  expect(px[1]).toBe(20)
  expect(px[2]).toBe(30)
})

test('канал прозрачности всегда непрозрачный', () => {
  const px = noisePixels(16, [60, 60, 60], 20)
  for (let i = 3; i < px.length; i += 4) expect(px[i]).toBe(255)
})

test('размер пикселей соответствует стороне', () => {
  expect(noisePixels(32, [0, 0, 0], 5).length).toBe(32 * 32 * 4)
})

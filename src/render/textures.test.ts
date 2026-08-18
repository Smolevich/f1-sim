import { expect, test } from 'vitest'
import { fbm, noisePixels, patchPixels } from './textures'

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

test('шум fbm держится в единичном диапазоне', () => {
  for (let i = 0; i < 200; i++) {
    const v = fbm(i * 0.37, i * 0.91)
    expect(v).toBeGreaterThanOrEqual(0)
    expect(v).toBeLessThanOrEqual(1)
  }
})

test('fbm детерминированный: два вызова в одной точке совпадают', () => {
  expect(fbm(3.25, 7.5)).toBe(fbm(3.25, 7.5))
})

test('fbm плавный: соседние точки не прыгают на весь диапазон', () => {
  const a = fbm(2.0, 2.0)
  const b = fbm(2.01, 2.0)
  expect(Math.abs(a - b)).toBeLessThan(0.1)
})

test('карта пятен и светлее, и темнее середины — иначе земля ровный лист', () => {
  const px = patchPixels(64, 0.55)
  let min = 255, max = 0
  for (let i = 0; i < px.length; i += 4) {
    min = Math.min(min, px[i])
    max = Math.max(max, px[i])
  }
  expect(min).toBeLessThan(200)
  expect(max).toBeGreaterThan(255 - 55)
})

test('пятна серые: цветной оттенок перекрасил бы газон', () => {
  const px = patchPixels(32, 0.55)
  for (let i = 0; i < px.length; i += 4) {
    expect(px[i + 1]).toBe(px[i])
    expect(px[i + 2]).toBe(px[i])
  }
})

test('карта пятен стыкуется сама с собой: край повторяет начало', () => {
  const size = 64
  const px = patchPixels(size, 0.55)
  // Швы между повторами и есть то, из-за чего плоскость читается плиткой.
  for (let y = 0; y < size; y++) {
    const left = px[(y * size) * 4]
    const past = px[(y * size + size - 1) * 4]
    // Соседние по решётке значения различаются на один шаг шума, не на скачок.
    expect(Math.abs(left - past)).toBeLessThan(40)
  }
})

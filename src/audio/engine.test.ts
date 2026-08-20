import { expect, test } from 'vitest'
import { gainFor, highMix, rateFor } from './engine'

test('на записанных оборотах сэмпл играет без сдвига', () => {
  expect(rateFor(6700, 6700)).toBeCloseTo(1, 3)
})

test('выше записанных оборотов тон поднимается', () => {
  expect(rateFor(12000, 6700)).toBeGreaterThan(1)
})

test('скорость воспроизведения не выходит из рабочих границ', () => {
  // За 0.5…1.5 playbackRate разваливает тембр.
  for (const rpm of [0, 1000, 4000, 15000, 30000]) {
    const r = rateFor(rpm, 17500)
    expect(r).toBeGreaterThanOrEqual(0.5)
    expect(r).toBeLessThanOrEqual(1.5)
  }
})

test('на холостых играет нижний сэмпл', () => {
  expect(highMix(4000)).toBe(0)
})

test('на пределе играет верхний сэмпл', () => {
  expect(highMix(15000)).toBe(1)
})

test('между сэмплами идёт плавный переход, а не переключение', () => {
  const mid = highMix(9250)
  expect(mid).toBeGreaterThan(0)
  expect(mid).toBeLessThan(1)
})

test('смесь монотонно растёт с оборотами', () => {
  const points = [7000, 8500, 9250, 10000, 11000].map(highMix)
  for (let i = 1; i < points.length; i += 1) {
    expect(points[i]).toBeGreaterThanOrEqual(points[i - 1])
  }
})

test('газ поднимает громкость', () => {
  expect(gainFor(1, 9000)).toBeGreaterThan(gainFor(0, 9000))
})

test('громкость не превышает единицы', () => {
  expect(gainFor(1, 15000)).toBeLessThanOrEqual(1)
})

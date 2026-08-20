import { expect, test } from 'vitest'
import { blendFactor, lerpPosition, slerpOrientation } from './interpolate'

test('пустой остаток даёт начало шага', () => {
  expect(blendFactor(0, 1 / 120)).toBe(0)
})

test('полный остаток даёт конец шага', () => {
  expect(blendFactor(1 / 120, 1 / 120)).toBeCloseTo(1, 6)
})

test('остаток сверх шага не выходит за единицу', () => {
  // Иначе кадр экстраполирует вперёд и болид улетает за своё положение.
  expect(blendFactor(0.5, 1 / 120)).toBe(1)
})

test('нулевой шаг не даёт деления на ноль', () => {
  expect(blendFactor(0.01, 0)).toBe(1)
})

test('положение на середине шага — середина отрезка', () => {
  const p = lerpPosition({ x: 0, y: 0, z: 0 }, { x: 10, y: 2, z: -4 }, 0.5)
  expect(p.x).toBeCloseTo(5, 6)
  expect(p.y).toBeCloseTo(1, 6)
  expect(p.z).toBeCloseTo(-2, 6)
})

test('интерполяция убирает рывок: шаг делится на равные доли', () => {
  const a = { x: 0, y: 0, z: 0 }
  const b = { x: 1, y: 0, z: 0 }
  const quarter = lerpPosition(a, b, 0.25).x
  const half = lerpPosition(a, b, 0.5).x
  const three = lerpPosition(a, b, 0.75).x
  expect(half - quarter).toBeCloseTo(three - half, 6)
})

test('поворот интерполируется по кратчайшей дуге', () => {
  const from = { x: 0, y: 0, z: 0, w: 1 }
  // Поворот на 180° вокруг Y, заданный с обратным знаком.
  const to = { x: 0, y: -1, z: 0, w: 0 }
  const mid = slerpOrientation(from, to, 0.5)
  // Кратчайший путь идёт через +Y, а не через -Y.
  expect(mid.y).toBeLessThanOrEqual(0)
  expect(Math.hypot(mid.x, mid.y, mid.z, mid.w)).toBeCloseTo(1, 6)
})

test('совпадающие кватернионы не дают NaN', () => {
  const q = { x: 0, y: 0.3, z: 0, w: 0.9539392 }
  const mid = slerpOrientation(q, q, 0.5)
  expect(Number.isNaN(mid.x)).toBe(false)
  expect(Number.isNaN(mid.w)).toBe(false)
})

test('интерполированный кватернион остаётся единичным', () => {
  const from = { x: 0, y: 0, z: 0, w: 1 }
  const to = { x: 0.2588, y: 0, z: 0, w: 0.9659 }
  for (const t of [0, 0.3, 0.5, 0.8, 1]) {
    const q = slerpOrientation(from, to, t)
    expect(Math.hypot(q.x, q.y, q.z, q.w)).toBeCloseTo(1, 4)
  }
})

test('доля кадра растёт и без нового шага физики — картинка не замирает', () => {
  // Регрессия: интерполяция шла между началом и концом кадра, а шаг 1/120
  // против кадра 1/60 даёт то два шага, то ни одного. На кадрах без шага
  // болид замирал: из 166 кадров 39 стояли на месте, 28 прыгали вдвое.
  const step = 1 / 120
  const growing = [0, step * 0.25, step * 0.5, step * 0.75]
  const factors = growing.map((pending) => blendFactor(pending, step))
  for (let i = 1; i < factors.length; i += 1) {
    expect(factors[i]).toBeGreaterThan(factors[i - 1])
  }
})

test('положение между шагами делится равномерно', () => {
  const from = { x: 0, y: 0, z: 0 }
  const to = { x: 0.7, y: 0, z: 0 }
  const step = 1 / 120
  const shown = [0.2, 0.4, 0.6, 0.8].map((part) =>
    lerpPosition(from, to, blendFactor(step * part, step)).x)
  const gaps = shown.slice(1).map((v, i) => v - shown[i])
  for (const gap of gaps) expect(gap).toBeCloseTo(gaps[0], 6)
})

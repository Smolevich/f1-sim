import { expect, test } from 'vitest'
import { CORNERS, MODEL_HALF_TRACK, RENDER_HALF_TRACK_M, SCALE, wheelVolume } from './f1-model'
import { insideWheel } from './split-wheels'

test('масштаб приводит колёсную базу модели к физическим 3.6 м', () => {
  expect(3.03 * SCALE).toBeCloseTo(3.6, 3)
})

test('две передние стойки управляемые, две задние — нет', () => {
  expect(CORNERS.filter((c) => c.steered)).toHaveLength(2)
  expect(CORNERS.filter((c) => !c.steered)).toHaveLength(2)
})

test('ступицы стоят по нишам модели, а не по колее физики', () => {
  // 0.8 — физическая полуколея; модель уже, и ступица идёт по ней,
  // иначе колесо встаёт рядом с уже нарисованным в кузове.
  expect(RENDER_HALF_TRACK_M).toBeLessThan(0.8)
  expect(RENDER_HALF_TRACK_M).toBeGreaterThan(0.55)
})

test('цилиндр колеса накрывает тормозной диск целиком', () => {
  const front = CORNERS.find((c) => c.steered && c.x > 0)!
  const volume = wheelVolume(front)
  // Диск: центр (1.22, 0.33, 1.18), радиус 0.211.
  expect(insideWheel({ x: 1.22, y: 0.33 + 0.211, z: 1.18 }, volume)).toBe(true)
  expect(insideWheel({ x: 1.22, y: 0.33, z: 1.18 + 0.211 }, volume)).toBe(true)
})

test('цилиндр колеса доходит до асфальта, но не ниже', () => {
  const front = CORNERS.find((c) => c.steered && c.x > 0)!
  const volume = wheelVolume(front)
  // Ось колеса на 0.33, низ модели на -0.011: радиус до земли ровно 0.341.
  // Колесо обязано касаться асфальта, иначе низ покрышки останется в кузове.
  expect(insideWheel({ x: 1.22, y: 0.33 - 0.31, z: 1.18 }, volume)).toBe(true)
  expect(insideWheel({ x: 1.22, y: 0.33 - 0.35, z: 1.18 }, volume)).toBe(false)
})

test('цилиндр колеса не захватывает днище в стороне от арки', () => {
  const front = CORNERS.find((c) => c.steered && c.x > 0)!
  const volume = wheelVolume(front)
  // Днище тянется к осевой; на 0.35 внутрь от колеса его трогать нельзя.
  expect(insideWheel({ x: 1.22 - 0.35, y: 0.1, z: 1.18 }, volume)).toBe(false)
})

test('цилиндр колеса не дотягивается до осевой машины', () => {
  const front = CORNERS.find((c) => c.steered && c.x > 0)!
  const volume = wheelVolume(front)
  expect(insideWheel({ x: 0.645, y: 0.33, z: 1.18 }, volume)).toBe(false)
})

test('цилиндры четырёх колёс не пересекаются', () => {
  const volumes = CORNERS.map(wheelVolume)
  for (let i = 0; i < volumes.length; i += 1) {
    for (let k = i + 1; k < volumes.length; k += 1) {
      const a = volumes[i]
      const b = volumes[k]
      const apartX = Math.abs(a.x - b.x) > a.halfWidth + b.halfWidth
      const apartYZ = Math.hypot(a.y - b.y, a.z - b.z) > a.radius + b.radius
      expect(apartX || apartYZ).toBe(true)
    }
  }
})

test('передние цилиндры стоят на передней оси, задние — на задней', () => {
  const front = CORNERS.filter((c) => c.steered).map(wheelVolume)
  const rear = CORNERS.filter((c) => !c.steered).map(wheelVolume)
  for (const v of front) expect(v.z).toBeCloseTo(1.18, 3)
  for (const v of rear) expect(v.z).toBeCloseTo(-1.85, 3)
})

test('половина колеи меньше габарита модели — колесо в арке, а не снаружи', () => {
  expect(MODEL_HALF_TRACK).toBeCloseTo(0.545, 3)
})

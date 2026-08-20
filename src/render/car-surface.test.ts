import { expect, test } from 'vitest'
import {
  buildSurface, contourPoint, LENGTH_STEPS, RING_STEPS, sectionSpline, surfaceTriangles,
} from './car-surface'
import type { Keyframe } from './car-surface'

const KEYS: Keyframe[] = [
  { z: 2.5, halfWidth: 0.08, top: 0.28, bottom: 0.16 },
  { z: 1.2, halfWidth: 0.30, top: 0.44, bottom: 0.09 },
  { z: -0.2, halfWidth: 0.47, top: 0.66, bottom: 0.06 },
  { z: -1.6, halfWidth: 0.30, top: 0.46, bottom: 0.09 },
  { z: -2.5, halfWidth: 0.13, top: 0.36, bottom: 0.15 },
]

test('сетка достаточно плотная — модель не должна быть гранёной', () => {
  // Регрессия: прошлая модель дала 3470 треугольников на всю машину и
  // проигрывала готовой (49 000) именно фасеточными бортами.
  expect(surfaceTriangles(LENGTH_STEPS, RING_STEPS)).toBeGreaterThan(4000)
})

test('контур на нуле градусов даёт правый борт', () => {
  const p = contourPoint(0, 0.5, 0.6, 0.1)
  expect(p.x).toBeCloseTo(0.5, 6)
  expect(p.y).toBeCloseTo(0.35, 6)
})

test('контур сверху и снизу сходится к осевой', () => {
  const up = contourPoint(Math.PI / 2, 0.5, 0.6, 0.1)
  const down = contourPoint(-Math.PI / 2, 0.5, 0.6, 0.1)
  expect(Math.abs(up.x)).toBeLessThan(1e-6)
  expect(up.y).toBeCloseTo(0.6, 6)
  expect(down.y).toBeCloseTo(0.1, 6)
})

test('борт плоский, а не круглый — иначе кузов выходит трубой', () => {
  // На 30° от горизонтали суперэллипс держит ширину лучше окружности.
  const p = contourPoint(Math.PI / 6, 1, 1, -1)
  expect(p.x).toBeGreaterThan(Math.cos(Math.PI / 6))
})

test('сплайн проходит через опорные сечения', () => {
  const at = sectionSpline(KEYS)
  expect(at(0).z).toBeCloseTo(KEYS[0].z, 3)
  expect(at(1).z).toBeCloseTo(KEYS[KEYS.length - 1].z, 3)
})

test('сплайн даёт плавный переход, а не ступени', () => {
  const at = sectionSpline(KEYS)
  const widths = [0.1, 0.2, 0.3, 0.4].map((t) => at(t).halfWidth)
  const gaps = widths.slice(1).map((w, i) => w - widths[i])
  // Соседние приросты близки — значит кривая гладкая.
  for (const gap of gaps) expect(Math.abs(gap - gaps[0])).toBeLessThan(0.05)
})

test('полуширина не уходит в ноль или минус', () => {
  const at = sectionSpline(KEYS)
  for (let i = 0; i <= 20; i += 1) {
    expect(at(i / 20).halfWidth).toBeGreaterThan(0)
  }
})

test('оболочка строится и содержит нормали', () => {
  const g = buildSurface(KEYS, 16, 12)
  expect(g.getAttribute('position').count).toBe(surfaceTriangles(16, 12) * 3)
  expect(g.getAttribute('normal')).toBeDefined()
})

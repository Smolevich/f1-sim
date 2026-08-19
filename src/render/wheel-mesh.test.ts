import { expect, test } from 'vitest'
import { buildWheel, FRONT_WHEEL, REAR_WHEEL, rimRadius } from './wheel-mesh'

test('колёса построены по регламенту: диаметр 720 мм', () => {
  expect(FRONT_WHEEL.radius * 2).toBeCloseTo(0.72, 3)
  expect(REAR_WHEEL.radius * 2).toBeCloseTo(0.72, 3)
})

test('задняя покрышка шире передней', () => {
  expect(REAR_WHEEL.width).toBeGreaterThan(FRONT_WHEEL.width)
})

test('обод меньше покрышки — резина видна', () => {
  expect(rimRadius(FRONT_WHEEL)).toBeLessThan(FRONT_WHEEL.radius)
  expect(rimRadius(FRONT_WHEEL)).toBeGreaterThan(FRONT_WHEEL.radius * 0.5)
})

test('колесо собирается из покрышки, обода и спиц', () => {
  const wheel = buildWheel(FRONT_WHEEL)
  let meshes = 0
  wheel.traverse((n) => { if ((n as { isMesh?: boolean }).isMesh === true) meshes += 1 })
  // покрышка + два плеча + обод + пять спиц
  expect(meshes).toBe(9)
})

test('колесо симметрично относительно своей оси вращения', () => {
  const wheel = buildWheel(REAR_WHEEL)
  wheel.updateMatrixWorld(true)
  // ось X — ось вращения; геометрия не должна съезжать вбок
  const xs: number[] = []
  wheel.traverse((n) => { xs.push(n.position.x) })
  const sum = xs.reduce((a, b) => a + b, 0)
  expect(Math.abs(sum)).toBeLessThan(1e-9)
})

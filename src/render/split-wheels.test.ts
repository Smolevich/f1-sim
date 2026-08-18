import * as THREE from 'three'
import { expect, test } from 'vitest'
import { fractionInsideWheel, insideWheel, splitByWheel, triangleInsideWheel } from './split-wheels'
import type { WheelVolume } from './split-wheels'

const WHEEL: WheelVolume = { x: 1.22, y: 0.33, z: 1.18, halfWidth: 0.28, radius: 0.32 }

const v = (x: number, y: number, z: number) => new THREE.Vector3(x, y, z)

test('точка в центре колеса лежит внутри', () => {
  expect(insideWheel({ x: 1.22, y: 0.33, z: 1.18 }, WHEEL)).toBe(true)
})

test('точка на другом борту не лежит в колесе', () => {
  expect(insideWheel({ x: 0.07, y: 0.33, z: 1.18 }, WHEEL)).toBe(false)
})

test('точка на той же оси, но выше колеса, снаружи', () => {
  expect(insideWheel({ x: 1.22, y: 0.9, z: 1.18 }, WHEEL)).toBe(false)
})

test('треугольник целиком внутри уходит в колесо', () => {
  expect(triangleInsideWheel(
    v(1.22, 0.33, 1.18), v(1.25, 0.4, 1.2), v(1.2, 0.28, 1.15), WHEEL,
  )).toBe(true)
})

test('треугольник, задевший колесо одной вершиной, остаётся кузовом', () => {
  // Иначе в борту у арки появлялись бы дыры.
  expect(triangleInsideWheel(
    v(1.22, 0.33, 1.18), v(0.5, 0.33, 1.18), v(0.4, 0.3, 1.0), WHEEL,
  )).toBe(false)
})

test('геометрия делится на колесо и кузов', () => {
  const geometry = new THREE.BufferGeometry()
  geometry.setAttribute('position', new THREE.Float32BufferAttribute([
    // треугольник в колесе
    1.22, 0.33, 1.18, 1.25, 0.40, 1.20, 1.20, 0.28, 1.15,
    // треугольник в кузове
    0.10, 0.20, -1.0, 0.20, 0.25, -1.1, 0.15, 0.22, -0.9,
  ], 3))
  const { wheel, body } = splitByWheel(geometry, WHEEL)
  expect(wheel?.getAttribute('position').count).toBe(3)
  expect(body?.getAttribute('position').count).toBe(3)
})

test('геометрия без колеса не даёт колёсной половины', () => {
  const geometry = new THREE.BufferGeometry()
  geometry.setAttribute('position', new THREE.Float32BufferAttribute([
    0.10, 0.20, -1.0, 0.20, 0.25, -1.1, 0.15, 0.22, -0.9,
  ], 3))
  const { wheel, body } = splitByWheel(geometry, WHEEL)
  expect(wheel).toBeNull()
  expect(body).not.toBeNull()
})

test('деление сохраняет все треугольники — ничего не теряется', () => {
  const geometry = new THREE.BufferGeometry()
  geometry.setAttribute('position', new THREE.Float32BufferAttribute([
    1.22, 0.33, 1.18, 1.25, 0.40, 1.20, 1.20, 0.28, 1.15,
    0.10, 0.20, -1.0, 0.20, 0.25, -1.1, 0.15, 0.22, -0.9,
    1.19, 0.35, 1.16, 1.21, 0.31, 1.19, 1.23, 0.36, 1.14,
  ], 3))
  const { wheel, body } = splitByWheel(geometry, WHEEL)
  const total = (wheel?.getAttribute('position').count ?? 0)
    + (body?.getAttribute('position').count ?? 0)
  expect(total).toBe(9)
})

test('меш целиком внутри колеса даёт долю 1', () => {
  const geometry = new THREE.BufferGeometry()
  geometry.setAttribute('position', new THREE.Float32BufferAttribute([
    1.22, 0.33, 1.18, 1.25, 0.40, 1.20, 1.20, 0.28, 1.15,
  ], 3))
  expect(fractionInsideWheel(geometry, WHEEL)).toBe(1)
})

test('меш вне колеса даёт долю 0', () => {
  const geometry = new THREE.BufferGeometry()
  geometry.setAttribute('position', new THREE.Float32BufferAttribute([
    0.10, 0.20, -1.0, 0.20, 0.25, -1.1, 0.15, 0.22, -0.9,
  ], 3))
  expect(fractionInsideWheel(geometry, WHEEL)).toBe(0)
})

test('пустая геометрия не роняет расчёт доли', () => {
  expect(fractionInsideWheel(new THREE.BufferGeometry(), WHEEL)).toBe(0)
})

test('центрированная геометрия вращается на месте, а не по орбите', () => {
  // Регрессия: сдвиг вносился узлом-родителем, и вращающаяся ступица уносила
  // колесо по кругу вокруг центра машины вместо вращения вокруг своей оси.
  const geometry = new THREE.BufferGeometry()
  geometry.setAttribute('position', new THREE.Float32BufferAttribute([
    1.22, 0.63, 1.18, 1.22, 0.03, 1.18, 1.22, 0.33, 1.48,
  ], 3))
  geometry.computeBoundingBox()
  const centre = geometry.boundingBox!.getCenter(new THREE.Vector3())
  geometry.translate(-centre.x, -centre.y, -centre.z)

  const hub = new THREE.Group()
  hub.position.set(0.61, 0.36, 1.40)
  hub.add(new THREE.Mesh(geometry))

  const before = new THREE.Box3().setFromObject(hub).getCenter(new THREE.Vector3())
  hub.rotation.x = Math.PI / 3
  hub.updateMatrixWorld(true)
  const after = new THREE.Box3().setFromObject(hub).getCenter(new THREE.Vector3())

  expect(after.distanceTo(before)).toBeLessThan(1e-6)
})

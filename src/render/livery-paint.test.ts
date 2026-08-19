import * as THREE from 'three'
import { expect, test } from 'vitest'
import { buildPalette, paintVertices } from './livery-paint'

const palette = buildPalette(0xff8000, 0xf2f4f7)

function geometryOf(points: number[]): THREE.BufferGeometry {
  const g = new THREE.BufferGeometry()
  g.setAttribute('position', new THREE.Float32BufferAttribute(points, 3))
  return g
}

test('цвет пишется в каждую вершину', () => {
  const g = geometryOf([0.65, 0.4, 1.2, 0.65, 0.4, -0.5, 1.4, 0.4, -0.5])
  expect(paintVertices(g, palette)).toBe(3)
  expect(g.getAttribute('color').count).toBe(3)
})

test('нос и борт в одной геометрии получают разные цвета', () => {
  // Ровно то, чего нельзя добиться материалом на меш.
  const g = geometryOf([
    0.65, 0.44, 1.3,   // нос
    1.30, 0.40, -0.5,  // борт
    0.65, 0.14, -0.4,  // днище
  ])
  paintVertices(g, palette)
  const c = g.getAttribute('color')
  const at = (i: number) => [c.getX(i), c.getY(i), c.getZ(i)].map((v) => v.toFixed(2)).join(',')
  expect(at(0)).not.toBe(at(1))
  expect(at(1)).not.toBe(at(2))
})

test('акцентный цвет не заливает борт — он для узких накладок', () => {
  // Регрессия: с нулевым габаритом правило накладок срабатывало на каждой
  // вершине, и борт становился светло-серым.
  const g = geometryOf([1.30, 0.40, -0.5])
  paintVertices(g, palette)
  const c = g.getAttribute('color')
  const accent = new THREE.Color(0xf2f4f7)
  expect(c.getX(0)).not.toBeCloseTo(accent.r, 2)
})

test('нос красится в цвет команды', () => {
  const g = geometryOf([0.65, 0.44, 1.3])
  paintVertices(g, palette)
  const c = g.getAttribute('color')
  expect(c.getX(0)).toBeCloseTo(new THREE.Color(0xff8000).r, 3)
})

test('геометрия без вершин не роняет раскраску', () => {
  expect(paintVertices(new THREE.BufferGeometry(), palette)).toBe(0)
})

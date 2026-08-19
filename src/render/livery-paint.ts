import * as THREE from 'three'
import { zoneFor } from './paint'
import type { Zone } from './paint'

/**
 * Окраска по вершинам вместо материала на меш.
 *
 * Кузов модели — один меш на всю машину: нос, борта и днище в одной
 * геометрии. Материал можно назначить только целиком, поэтому либо весь
 * кузов оранжевый, либо весь чёрный — ни то, ни другое на болид не похоже.
 * Цвет пишется в атрибут вершин, и одна деталь несёт сразу несколько зон:
 * оранжевый нос переходит в тёмный борт там, где это и происходит у
 * настоящей машины.
 */
export type Palette = Record<Zone, THREE.Color>

export function buildPalette(livery: number, accent: number): Palette {
  return {
    livery: new THREE.Color(livery),
    accent: new THREE.Color(accent),
    carbon: new THREE.Color(0x24262b),
    wing: new THREE.Color(0x1a1c20),
    floor: new THREE.Color(0x121418),
  }
}

/**
 * Пишет цвет в каждую вершину по её собственному положению.
 * Возвращает число закрашенных вершин — по нему тесты видят, что работа шла.
 */
export function paintVertices(
  geometry: THREE.BufferGeometry, palette: Palette,
): number {
  const position = geometry.getAttribute('position')
  if (position === undefined) return 0

  const colours = new Float32Array(position.count * 3)
  const point = new THREE.Vector3()

  for (let i = 0; i < position.count; i += 1) {
    point.fromBufferAttribute(position, i)
    // Габарит вершины не имеет смысла, поэтому подаём заведомо большой:
    // правила «узкая накладка» и «полоса по осевой» отсекаются, и остаются
    // только те, что зависят от положения. С нулевым габаритом акцентный
    // цвет заливал весь борт светло-серым.
    const zone = zoneFor({
      x: point.x, y: point.y, z: point.z, height: 9, width: 9,
    })
    const colour = palette[zone]
    colours[i * 3] = colour.r
    colours[i * 3 + 1] = colour.g
    colours[i * 3 + 2] = colour.b
  }

  geometry.setAttribute('color', new THREE.BufferAttribute(colours, 3))
  return position.count
}

import * as THREE from 'three'
import { buildEdges } from '../track/geometry'
import type { Track } from '../track/schema'
import { makeGrassTexture } from './textures'

/**
 * Юбка рельефа: газон, который у полотна повторяет высоту трассы и плавно
 * спадает к плоской земле сцены. Без неё полотно с реальными высотами висит
 * в воздухе над плоскостью — на Спа на сотню метров.
 */

/** Кольца юбки: метры наружу от кромки полотна. */
export const SKIRT_RING_DISTANCES_M = [0, 25, 80, 180, 320]

/** Чуть ниже полотна у кромки и чуть выше плоскости земли (-0.3) на краю. */
const INNER_DROP_M = 0.12
const OUTER_Y = -0.25

/** Доля высоты трассы на расстоянии d от кромки: smoothstep от 1 до 0. */
export function skirtFalloff(distanceM: number): number {
  const outer = SKIRT_RING_DISTANCES_M[SKIRT_RING_DISTANCES_M.length - 1]
  const t = Math.min(1, Math.max(0, distanceM / outer))
  const s = 1 - t * t * (3 - 2 * t)
  return s
}

export function buildTerrainSkirt(track: Track): THREE.Mesh {
  const { left, right } = buildEdges(track)
  const cl = track.centerline
  const n = cl.length
  const rings = SKIRT_RING_DISTANCES_M
  const positions: number[] = []
  const uvs: number[] = []
  // Та же трава, что на плоской земле: один тайл на 50 м мира, чтобы юбка
  // не читалась заплаткой другого материала.
  const uvScale = 1 / 50

  // Отдельная юбка с каждой стороны полотна. Внутри кольца трассы юбки
  // с противоположных сторон перекрываются: внешние края разнесены по
  // высоте на пару сантиметров, чтобы одноцветные плоскости не мерцали.
  const sides: { edge: typeof left; outerY: number }[] = [
    { edge: left, outerY: OUTER_Y + 0.02 },
    { edge: right, outerY: OUTER_Y - 0.02 },
  ]

  for (const { edge, outerY } of sides) {
    // Вершины ярусов: [узел][кольцо]
    const tiers: { x: number; y: number; z: number }[][] = []
    for (let i = 0; i < n; i++) {
      const e = edge[i]
      const c = cl[i]
      const ox = e.x - c.x
      const oz = e.z - c.z
      const len = Math.hypot(ox, oz) || 1
      const nx = ox / len
      const nz = oz / len
      tiers.push(rings.map((d) => {
        const k = skirtFalloff(d)
        const y = k * (e.y - INNER_DROP_M) + (1 - k) * outerY
        return { x: e.x + nx * d, y, z: e.z + nz * d }
      }))
    }

    for (let i = 0; i < n; i++) {
      const a = tiers[i]
      const b = tiers[(i + 1) % n]
      for (let r = 0; r < rings.length - 1; r++) {
        for (const v of [a[r], b[r], a[r + 1], b[r], b[r + 1], a[r + 1]]) {
          positions.push(v.x, v.y, v.z)
          uvs.push(v.x * uvScale, v.z * uvScale)
        }
      }
    }
  }

  const geometry = new THREE.BufferGeometry()
  geometry.setAttribute('position', new THREE.Float32BufferAttribute(positions, 3))
  geometry.setAttribute('uv', new THREE.Float32BufferAttribute(uvs, 2))
  geometry.computeVertexNormals()

  const grass = makeGrassTexture()
  grass.repeat.set(1, 1)

  const mesh = new THREE.Mesh(geometry, new THREE.MeshStandardMaterial({
    map: grass,
    roughness: 1,
    metalness: 0,
    side: THREE.DoubleSide,
  }))
  mesh.receiveShadow = true
  return mesh
}

import * as THREE from 'three'
import type { Track } from '../track/schema'
import { makeGrassTexture } from './textures'

/**
 * Поле рельефа: газон, который у полотна повторяет высоту трассы и плавно
 * спадает к плоской земле сцены. Без него полотно с реальными высотами висит
 * в воздухе над плоскостью — на Спа на сотню метров.
 *
 * Высота в каждой точке берётся от БЛИЖАЙШЕГО участка осевой. Ранняя версия
 * тянула высоту каждой кромки вбок на сотни метров листом-юбкой, и у шикан
 * лист от высокого участка накрывал соседнее полотно травой.
 */

/** Радиус поля от кромки; дальше — плоская земля сцены. */
export const SKIRT_RING_DISTANCES_M = [0, 25, 80, 180, 320]

/** Чуть ниже полотна у кромки и чуть выше плоскости земли (-0.3) на краю. */
const INNER_DROP_M = 0.12
const OUTER_Y = -0.25

/** Шаг сетки поля: мельче — глаже кромка травы, но больше треугольников. */
const GRID_STEP_M = 20

/** Доля высоты трассы на расстоянии d от кромки: smoothstep от 1 до 0. */
export function skirtFalloff(distanceM: number): number {
  const outer = SKIRT_RING_DISTANCES_M[SKIRT_RING_DISTANCES_M.length - 1]
  const t = Math.min(1, Math.max(0, distanceM / outer))
  return 1 - t * t * (3 - 2 * t)
}

/**
 * Высота газона в точке (x, z): высота ближайшего участка трассы минус зазор,
 * со спадом к плоской земле по мере удаления от кромки.
 */
export function terrainHeight(track: Track, x: number, z: number): number {
  const cl = track.centerline
  const el = track.elevationsM
  const n = cl.length

  let bestDist = Infinity
  let elevation = 0
  for (let i = 0; i < n; i++) {
    const a = cl[i]
    const b = cl[(i + 1) % n]
    const dx = b.x - a.x
    const dz = b.z - a.z
    const lengthSq = dx * dx + dz * dz || 1
    const t = Math.max(0, Math.min(1, ((x - a.x) * dx + (z - a.z) * dz) / lengthSq))
    const dist = Math.hypot(x - (a.x + t * dx), z - (a.z + t * dz))
    if (dist < bestDist) {
      bestDist = dist
      if (el && el.length === n) elevation = el[i] + t * (el[(i + 1) % n] - el[i])
    }
  }

  const edgeDist = Math.max(0, bestDist - track.widthM / 2)
  const k = skirtFalloff(edgeDist)
  return k * (elevation - INNER_DROP_M) + (1 - k) * OUTER_Y
}

/** Вершины поля отдельно от материала: обход проверяется тестом без DOM. */
export function terrainPositions(track: Track): number[] {
  const cl = track.centerline
  const outer = SKIRT_RING_DISTANCES_M[SKIRT_RING_DISTANCES_M.length - 1]
  const margin = outer + track.widthM / 2 + GRID_STEP_M

  const xs = cl.map((p) => p.x)
  const zs = cl.map((p) => p.z)
  const minX = Math.min(...xs) - margin
  const maxX = Math.max(...xs) + margin
  const minZ = Math.min(...zs) - margin
  const maxZ = Math.max(...zs) + margin

  const nx = Math.ceil((maxX - minX) / GRID_STEP_M)
  const nz = Math.ceil((maxZ - minZ) / GRID_STEP_M)

  // Высоты в узлах сетки; клетки целиком на плоской земле не рисуем — их
  // закрывает плоскость сцены на -0.3.
  const heights: number[][] = []
  for (let ix = 0; ix <= nx; ix++) {
    heights.push([])
    for (let iz = 0; iz <= nz; iz++) {
      heights[ix].push(terrainHeight(track, minX + ix * GRID_STEP_M, minZ + iz * GRID_STEP_M))
    }
  }

  const positions: number[] = []
  const flatY = OUTER_Y + 0.001

  for (let ix = 0; ix < nx; ix++) {
    for (let iz = 0; iz < nz; iz++) {
      const corners = [
        heights[ix][iz], heights[ix + 1][iz], heights[ix][iz + 1], heights[ix + 1][iz + 1],
      ]
      if (corners.every((h) => h <= flatY)) continue

      const x0 = minX + ix * GRID_STEP_M
      const x1 = x0 + GRID_STEP_M
      const z0 = minZ + iz * GRID_STEP_M
      const z1 = z0 + GRID_STEP_M
      const v00 = { x: x0, y: heights[ix][iz], z: z0 }
      const v10 = { x: x1, y: heights[ix + 1][iz], z: z0 }
      const v01 = { x: x0, y: heights[ix][iz + 1], z: z1 }
      const v11 = { x: x1, y: heights[ix + 1][iz + 1], z: z1 }
      // Обход против часовой при взгляде сверху (+Y): нормали вверх, иначе
      // FrontSide отсекает поле и рядом с дорогой сквозит нижний уровень.
      for (const v of [v00, v01, v10, v10, v01, v11]) {
        positions.push(v.x, v.y, v.z)
      }
    }
  }
  return positions
}

export function buildTerrainField(track: Track): THREE.Mesh {
  const positions = terrainPositions(track)
  // Та же трава, что на плоской земле: один тайл на 50 м мира.
  const uvScale = 1 / 50
  const uvs: number[] = []
  for (let i = 0; i < positions.length; i += 3) {
    uvs.push(positions[i] * uvScale, positions[i + 2] * uvScale)
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
  }))
  mesh.receiveShadow = true
  return mesh
}

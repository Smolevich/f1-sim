import * as THREE from 'three'
import { elevationAt } from '../track/elevation'
import type { Track } from '../track/schema'
import { crownGeometry, hashRandom } from './scenery'

/**
 * Окружение из OpenStreetMap: настоящие трибуны, лес королевского парка и
 * старый скоростной овал вместо процедурной рассадки. Данные готовит
 * scripts/build-scenery.ts, координаты — в местной системе трассы.
 */

export type SceneryData = {
  /** Контуры трибун, [x, z] по вершинам. */
  grandstands: [number, number][][]
  /** Контуры лесных массивов. */
  forests: [number, number][][]
}

/** Чёт-нечёт по лучу: классика для контуров OSM без самопересечений. */
export function pointInPolygon(x: number, z: number, polygon: [number, number][]): boolean {
  let inside = false
  const n = polygon.length
  for (let i = 0, j = n - 1; i < n; j = i++) {
    const [xi, zi] = polygon[i]
    const [xj, zj] = polygon[j]
    if ((zi > z) !== (zj > z) && x < ((xj - xi) * (z - zi)) / (zj - zi) + xi) {
      inside = !inside
    }
  }
  return inside
}

/**
 * Рассадка деревьев по контуру леса: сетка с шагом spacing и детерминированным
 * дрожанием — регулярные ряды выдают процедурность с первого взгляда.
 */
export function forestSpots(
  polygon: [number, number][], spacingM: number,
): { x: number; z: number }[] {
  const xs = polygon.map((p) => p[0])
  const zs = polygon.map((p) => p[1])
  const minX = Math.min(...xs), maxX = Math.max(...xs)
  const minZ = Math.min(...zs), maxZ = Math.max(...zs)

  const spots: { x: number; z: number }[] = []
  let cell = 0
  for (let gx = minX; gx <= maxX; gx += spacingM) {
    for (let gz = minZ; gz <= maxZ; gz += spacingM) {
      cell++
      const x = gx + (hashRandom(cell * 3 + 1) - 0.5) * spacingM
      const z = gz + (hashRandom(cell * 3 + 2) - 0.5) * spacingM
      if (pointInPolygon(x, z, polygon)) spots.push({ x, z })
    }
  }
  return spots
}

/**
 * Отбор точек леса: не ближе margin к осевой (иначе деревья на полотне) и не
 * дальше пояса видимости — лес парка тянется на километры, а рисовать есть
 * смысл только то, что видно с трассы.
 */
export function filterForestSpots(
  spots: { x: number; z: number }[], track: Track, marginM: number, maxM = 700,
): { x: number; z: number }[] {
  const cl = track.centerline
  const n = cl.length
  return spots.filter((s) => {
    let best = Infinity
    for (let i = 0; i < n; i++) {
      const a = cl[i]
      const b = cl[(i + 1) % n]
      const dx = b.x - a.x
      const dz = b.z - a.z
      const lengthSq = dx * dx + dz * dz || 1
      const t = Math.max(0, Math.min(1, ((s.x - a.x) * dx + (s.z - a.z) * dz) / lengthSq))
      best = Math.min(best, Math.hypot(s.x - (a.x + t * dx), s.z - (a.z + t * dz)))
      if (best < marginM) return false
    }
    return best <= maxM
  })
}

const STAND_HEIGHT_M = 9
/** Плотнее живого леса нельзя: инстансы копеечные, но фреймтайм не резиновый. */
const FOREST_SPACING_M = 14
const FOREST_CAP = 2600

export function buildOsmScenery(scenery: SceneryData, track: Track): THREE.Group {
  const group = new THREE.Group()
  group.add(buildStands(scenery.grandstands, track))
  group.add(buildForest(scenery.forests, track))
  return group
}

function buildStands(polygons: [number, number][][], track: Track): THREE.Group {
  const group = new THREE.Group()
  // У ExtrudeGeometry материал 0 — крышки, материал 1 — стены: сверху крыша,
  // сбоку бетон. Крыша тёмная, чтобы с высоты камеры не читалась асфальтом.
  const materials = [
    new THREE.MeshStandardMaterial({ color: 0x8f2430, roughness: 0.8 }),
    new THREE.MeshStandardMaterial({ color: 0xd9d6cf, roughness: 0.9 }),
  ]

  for (const polygon of polygons) {
    if (polygon.length < 3) continue
    // Контур в плоскости Шейпа с зеркалом по z: поворот rotateX(-90°) вернёт
    // след на место. Зеркалить готовую геометрию нельзя — отрицательный
    // масштаб выворачивает обход вершин, и крыши отсекаются как изнанка.
    const shape = new THREE.Shape(polygon.map(([x, z]) => new THREE.Vector2(x, -z)))
    const geometry = new THREE.ExtrudeGeometry(shape, {
      depth: STAND_HEIGHT_M, bevelEnabled: false,
    })
    geometry.rotateX(-Math.PI / 2)

    const cx = polygon.reduce((s, p) => s + p[0], 0) / polygon.length
    const cz = polygon.reduce((s, p) => s + p[1], 0) / polygon.length
    const mesh = new THREE.Mesh(geometry, materials)
    mesh.position.y = elevationAt(track, cx, cz)
    mesh.castShadow = true
    group.add(mesh)
  }
  return group
}

function buildForest(polygons: [number, number][][], track: Track): THREE.Group {
  const group = new THREE.Group()
  const spots: { x: number; z: number }[] = []
  const margin = track.widthM / 2 + 12
  for (const polygon of polygons) {
    spots.push(...filterForestSpots(forestSpots(polygon, FOREST_SPACING_M), track, margin))
    if (spots.length > FOREST_CAP) break
  }
  const trees = spots.slice(0, FOREST_CAP)
  if (trees.length === 0) return group

  const trunkGeom = new THREE.CylinderGeometry(0.28, 0.85, 5.4, 5)
  const trunkMat = new THREE.MeshStandardMaterial({ color: 0x5a4632, roughness: 1 })
  const trunks = new THREE.InstancedMesh(trunkGeom, trunkMat, trees.length)
  const crowns = new THREE.InstancedMesh(
    crownGeometry(),
    new THREE.MeshStandardMaterial({ vertexColors: true, roughness: 1 }),
    trees.length,
  )

  const m = new THREE.Matrix4()
  const quat = new THREE.Quaternion()
  const euler = new THREE.Euler()
  const scaleVec = new THREE.Vector3()
  const pos = new THREE.Vector3()

  trees.forEach((p, i) => {
    const ground = elevationAt(track, p.x, p.z)
    const scale = 0.8 + hashRandom(i * 7 + 3) * 1.0
    euler.set(0, hashRandom(i * 17 + 4) * Math.PI * 2, 0)
    quat.setFromEuler(euler)

    scaleVec.set(scale, scale, scale)
    pos.set(p.x, ground + 2.7 * scale, p.z)
    m.compose(pos, quat, scaleVec)
    trunks.setMatrixAt(i, m)

    const width = 0.82 + hashRandom(i * 31 + 21) * 0.4
    scaleVec.set(scale * width, scale, scale * width)
    pos.set(p.x, ground, p.z)
    m.compose(pos, quat, scaleVec)
    crowns.setMatrixAt(i, m)
  })
  trunks.instanceMatrix.needsUpdate = true
  crowns.instanceMatrix.needsUpdate = true
  group.add(trunks, crowns)
  return group
}

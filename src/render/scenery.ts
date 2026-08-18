import * as THREE from 'three'
import type { Track, TrackPoint } from '../track/schema'

const GRANDSTAND_OFFSET_M = 48
const TREE_EXCLUSION_M = 60
const HILL_RING_M = 1600

/**
 * Детерминированный шум: картинка обязана быть одинаковой между запусками,
 * иначе призрак прошлого круга едет по другому пейзажу, а скриншоты не
 * сравниваются между сборками.
 */
function hashRandom(seed: number): number {
  const x = Math.sin(seed * 12.9898) * 43758.5453
  return x - Math.floor(x)
}

function curvature(track: Track, index: number): number {
  const cl = track.centerline
  const n = cl.length
  const prev = cl[(index - 1 + n) % n]
  const here = cl[index]
  const next = cl[(index + 1) % n]
  const inX = here.x - prev.x, inZ = here.z - prev.z
  const outX = next.x - here.x, outZ = next.z - here.z
  const inLen = Math.hypot(inX, inZ) || 1
  const outLen = Math.hypot(outX, outZ) || 1
  const dot = (inX / inLen) * (outX / outLen) + (inZ / inLen) * (outZ / outLen)
  return Math.acos(Math.max(-1, Math.min(1, dot)))
}

/** Трибуны ставятся на прямых: в поворотах их закрывали бы отбойники и поребрики. */
export function grandstandSlots(track: Track): { position: TrackPoint; headingRad: number }[] {
  const cl = track.centerline
  const n = cl.length
  const slots: { position: TrackPoint; headingRad: number }[] = []

  for (let i = 0; i < n; i += 6) {
    const straight = [0, 1, 2].every((k) => curvature(track, (i + k) % n) < 0.02)
    if (!straight) continue
    const here = cl[i]
    const next = cl[(i + 3) % n]
    const heading = Math.atan2(next.x - here.x, next.z - here.z)
    // Смещение по нормали влево от направления движения.
    slots.push({
      position: {
        x: here.x - Math.cos(heading) * GRANDSTAND_OFFSET_M,
        y: 0,
        z: here.z + Math.sin(heading) * GRANDSTAND_OFFSET_M,
      },
      headingRad: heading,
    })
    if (slots.length >= 14) break
  }
  return slots
}

/** Деревья по округе, но не ближе TREE_EXCLUSION_M к полотну. */
export function treeSlots(track: Track, count: number): TrackPoint[] {
  const xs = track.centerline.map((p) => p.x)
  const zs = track.centerline.map((p) => p.z)
  const minX = Math.min(...xs) - 400, maxX = Math.max(...xs) + 400
  const minZ = Math.min(...zs) - 400, maxZ = Math.max(...zs) + 400

  const trees: TrackPoint[] = []
  for (let i = 0; trees.length < count && i < count * 12; i++) {
    const x = minX + hashRandom(i * 2 + 1) * (maxX - minX)
    const z = minZ + hashRandom(i * 2 + 2) * (maxZ - minZ)
    let nearest = Infinity
    for (const c of track.centerline) {
      const d = Math.hypot(x - c.x, z - c.z)
      if (d < nearest) nearest = d
      if (nearest < TREE_EXCLUSION_M) break
    }
    if (nearest > TREE_EXCLUSION_M) trees.push({ x, y: 0, z })
  }
  return trees
}

export function buildGrandstands(track: Track): THREE.Group {
  const group = new THREE.Group()
  const slots = grandstandSlots(track)
  if (slots.length === 0) return group

  const concrete = new THREE.MeshStandardMaterial({ color: 0xb9bcc4, roughness: 0.9 })
  const seats = new THREE.MeshStandardMaterial({ color: 0x2f5fa8, roughness: 0.7 })
  const roof = new THREE.MeshStandardMaterial({ color: 0xe8e9ec, roughness: 0.5, metalness: 0.3 })

  for (const slot of slots) {
    const stand = new THREE.Group()
    // Наклонный ряд сидений: одна коробка под углом читается как трибуна
    // дешевле, чем настоящие ступени.
    const bank = new THREE.Mesh(new THREE.BoxGeometry(40, 9, 14), seats)
    bank.position.set(0, 4.5, 0)
    bank.rotation.x = -0.28
    stand.add(bank)
    const base = new THREE.Mesh(new THREE.BoxGeometry(42, 2, 16), concrete)
    base.position.set(0, 1, 0)
    stand.add(base)
    const cover = new THREE.Mesh(new THREE.BoxGeometry(42, 0.6, 10), roof)
    cover.position.set(0, 11, -3)
    stand.add(cover)
    for (const side of [-20, 20]) {
      const post = new THREE.Mesh(new THREE.BoxGeometry(0.8, 11, 0.8), concrete)
      post.position.set(side, 5.5, -7)
      stand.add(post)
    }
    stand.position.set(slot.position.x, 0, slot.position.z)
    stand.rotation.y = slot.headingRad
    group.add(stand)
  }
  return group
}

export function buildTrees(track: Track, count = 420): THREE.Group {
  const group = new THREE.Group()
  const slots = treeSlots(track, count)
  if (slots.length === 0) return group

  // InstancedMesh: сотни деревьев одним вызовом отрисовки вместо сотен.
  const trunkGeom = new THREE.CylinderGeometry(0.5, 0.7, 5, 6)
  const crownGeom = new THREE.ConeGeometry(3.4, 9, 7)
  const trunkMat = new THREE.MeshStandardMaterial({ color: 0x5a4632, roughness: 1 })
  const crownMat = new THREE.MeshStandardMaterial({ color: 0x2f6b34, roughness: 1 })

  const trunks = new THREE.InstancedMesh(trunkGeom, trunkMat, slots.length)
  const crowns = new THREE.InstancedMesh(crownGeom, crownMat, slots.length)
  const m = new THREE.Matrix4()

  slots.forEach((p, i) => {
    const scale = 0.7 + hashRandom(i * 7 + 3) * 0.9
    m.makeScale(scale, scale, scale)
    m.setPosition(p.x, 2.5 * scale, p.z)
    trunks.setMatrixAt(i, m)
    m.makeScale(scale, scale, scale)
    m.setPosition(p.x, (5 + 4.5) * scale, p.z)
    crowns.setMatrixAt(i, m)
  })
  trunks.instanceMatrix.needsUpdate = true
  crowns.instanceMatrix.needsUpdate = true
  group.add(trunks, crowns)
  return group
}

/** Холмы на горизонте: убирают ощущение, что мир кончается плоскостью. */
export function buildHills(track: Track): THREE.Group {
  const group = new THREE.Group()
  const xs = track.centerline.map((p) => p.x)
  const zs = track.centerline.map((p) => p.z)
  const cx = (Math.min(...xs) + Math.max(...xs)) / 2
  const cz = (Math.min(...zs) + Math.max(...zs)) / 2

  const material = new THREE.MeshStandardMaterial({ color: 0x4f6b46, roughness: 1 })
  const count = 26
  for (let i = 0; i < count; i++) {
    const angle = (i / count) * Math.PI * 2
    const radius = HILL_RING_M * (0.85 + hashRandom(i + 11) * 0.4)
    const height = 90 + hashRandom(i + 31) * 160
    const hill = new THREE.Mesh(new THREE.ConeGeometry(height * 2.4, height, 9), material)
    hill.position.set(cx + Math.cos(angle) * radius, height / 2 - 12, cz + Math.sin(angle) * radius)
    group.add(hill)
  }
  return group
}

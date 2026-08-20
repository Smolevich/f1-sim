import * as THREE from 'three'

/**
 * Признаки контакта с дорогой.
 *
 * Тень под машиной есть, но кроме неё ничего: ни пыли из-под колёс, ни следа
 * шин, ни дрожания на скорости. Глазу не за что зацепиться, и болид читается
 * как парящий над асфальтом. Здесь пыль за задними колёсами и полосы шин.
 */

const DUST_COUNT = 60
const TRAIL_COUNT = 120

/** Скорость, с которой пыль вообще заметна. */
const DUST_MIN_MS = 12

export type ContactEffects = {
  group: THREE.Group
  update: (
    position: { x: number; y: number; z: number },
    heading: number, speedMs: number, offTrack: boolean, dt: number,
  ) => void
}

/** Прозрачность пылинки по её возрасту: свежая ярче, старая исчезает. */
export function dustOpacity(ageSeconds: number, lifeSeconds: number): number {
  if (lifeSeconds <= 0) return 0
  const t = Math.max(0, Math.min(1, ageSeconds / lifeSeconds))
  return (1 - t) * 0.55
}

/** Размер пылинки растёт со временем — облако расходится. */
export function dustScale(ageSeconds: number, lifeSeconds: number): number {
  if (lifeSeconds <= 0) return 0
  const t = Math.max(0, Math.min(1, ageSeconds / lifeSeconds))
  return 0.25 + t * 1.6
}

export function buildContactEffects(): ContactEffects {
  const group = new THREE.Group()

  const dustGeom = new THREE.PlaneGeometry(1, 1)
  const dustMat = new THREE.MeshBasicMaterial({
    color: 0xbfae92, transparent: true, opacity: 0.4,
    depthWrite: false, side: THREE.DoubleSide,
  })
  const dust = new THREE.InstancedMesh(dustGeom, dustMat, DUST_COUNT)
  dust.instanceMatrix.setUsage(THREE.DynamicDrawUsage)
  dust.frustumCulled = false
  group.add(dust)

  const trailGeom = new THREE.PlaneGeometry(1, 1)
  const trailMat = new THREE.MeshBasicMaterial({
    color: 0x14161a, transparent: true, opacity: 0.30,
    depthWrite: false, side: THREE.DoubleSide,
  })
  const trail = new THREE.InstancedMesh(trailGeom, trailMat, TRAIL_COUNT)
  trail.instanceMatrix.setUsage(THREE.DynamicDrawUsage)
  trail.frustumCulled = false
  group.add(trail)

  type Puff = { x: number; y: number; z: number; age: number; life: number; live: boolean }
  const puffs: Puff[] = Array.from({ length: DUST_COUNT }, () =>
    ({ x: 0, y: 0, z: 0, age: 0, life: 0, live: false }))
  let nextPuff = 0

  const marks: { x: number; z: number; heading: number; live: boolean }[] =
    Array.from({ length: TRAIL_COUNT }, () => ({ x: 0, z: 0, heading: 0, live: false }))
  let nextMark = 0

  const matrix = new THREE.Matrix4()
  const quat = new THREE.Quaternion()
  const flat = new THREE.Euler(-Math.PI / 2, 0, 0)
  const scale = new THREE.Vector3()
  const pos = new THREE.Vector3()
  const hidden = new THREE.Matrix4().makeScale(0, 0, 0)

  let sinceMark = 0

  const update = (
    position: { x: number; y: number; z: number },
    heading: number, speedMs: number, offTrack: boolean, dt: number,
  ): void => {
    // Пыль — только за пределами асфальта: на трассе резина не поднимает грунт.
    if (offTrack && speedMs > DUST_MIN_MS) {
      const p = puffs[nextPuff]
      nextPuff = (nextPuff + 1) % DUST_COUNT
      p.x = position.x - Math.sin(heading) * 2.0 + (Math.random() - 0.5) * 1.2
      p.y = 0.12
      p.z = position.z - Math.cos(heading) * 2.0 + (Math.random() - 0.5) * 1.2
      p.age = 0
      p.life = 0.7 + Math.random() * 0.5
      p.live = true
    }

    for (const [i, p] of puffs.entries()) {
      if (!p.live) { dust.setMatrixAt(i, hidden); continue }
      p.age += dt
      if (p.age >= p.life) { p.live = false; dust.setMatrixAt(i, hidden); continue }
      p.y += dt * 0.9
      const s = dustScale(p.age, p.life)
      quat.setFromEuler(flat)
      scale.set(s, s, s)
      pos.set(p.x, p.y, p.z)
      matrix.compose(pos, quat, scale)
      dust.setMatrixAt(i, matrix)
    }
    dustMat.opacity = 0.5
    dust.instanceMatrix.needsUpdate = true

    // След шин: ставим отметки через равные промежутки пути.
    sinceMark += speedMs * dt
    if (speedMs > 4 && sinceMark > 1.2) {
      sinceMark = 0
      const m = marks[nextMark]
      nextMark = (nextMark + 1) % TRAIL_COUNT
      m.x = position.x
      m.z = position.z
      m.heading = heading
      m.live = true
    }

    for (const [i, m] of marks.entries()) {
      if (!m.live) { trail.setMatrixAt(i, hidden); continue }
      quat.setFromEuler(new THREE.Euler(-Math.PI / 2, m.heading, 0))
      scale.set(1.5, 1.4, 1)
      pos.set(m.x, 0.012, m.z)
      matrix.compose(pos, quat, scale)
      trail.setMatrixAt(i, matrix)
    }
    trail.instanceMatrix.needsUpdate = true
  }

  return { group, update }
}

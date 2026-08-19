import * as THREE from 'three'
import {
  AIRBOX, BODY_SECTIONS, COCKPIT, FLOOR_HALF_WIDTH, FLOOR_Y, FRONT_WING,
  HALO, REAR_WING, SIDEPOD,
} from './car-shape'

/**
 * Кузов болида, собранный из сечений.
 *
 * Модель строится кодом, а не грузится из файла: готовые модели либо шли без
 * колёс (CFD-геометрия), либо с запретом на использование. Здесь каждая
 * поверхность описана числами из car-shape и проверяется тестами.
 */

/** Оболочка по сечениям: каждое кольцо — прямоугольник со скруглением. */
function ringPoints(halfWidth: number, top: number, bottom: number, steps = 12): THREE.Vector2[] {
  const points: THREE.Vector2[] = []
  const cx = 0
  const cy = (top + bottom) / 2
  const rx = halfWidth
  const ry = (top - bottom) / 2
  // Суперэллипс: у болида борта плоские, а кромки скруглены — окружность
  // даёт трубу, прямоугольник даёт коробку.
  const n = 2.6
  for (let i = 0; i < steps; i += 1) {
    const a = (i / steps) * Math.PI * 2
    const c = Math.cos(a)
    const s = Math.sin(a)
    points.push(new THREE.Vector2(
      cx + rx * Math.sign(c) * Math.abs(c) ** (2 / n),
      cy + ry * Math.sign(s) * Math.abs(s) ** (2 / n),
    ))
  }
  return points
}

/** Продольная оболочка монокока: кольца сечений, сшитые треугольниками. */
export function buildShell(): THREE.BufferGeometry {
  const steps = 12
  const rings = BODY_SECTIONS.map((s) => ({
    z: s.z,
    pts: ringPoints(s.halfWidth, s.top, s.bottom, steps),
  }))

  const positions: number[] = []
  const push = (p: THREE.Vector2, z: number): void => { positions.push(p.x, p.y, z) }

  for (let i = 0; i < rings.length - 1; i += 1) {
    const a = rings[i]
    const b = rings[i + 1]
    for (let k = 0; k < steps; k += 1) {
      const k2 = (k + 1) % steps
      push(a.pts[k], a.z); push(b.pts[k], b.z); push(b.pts[k2], b.z)
      push(a.pts[k], a.z); push(b.pts[k2], b.z); push(a.pts[k2], a.z)
    }
  }

  // Заглушки на носу и корме, иначе оболочка просвечивает насквозь.
  for (const [ring, dir] of [[rings[0], 1], [rings[rings.length - 1], -1]] as const) {
    const cy = ring.pts.reduce((s, p) => s + p.y, 0) / ring.pts.length
    for (let k = 0; k < steps; k += 1) {
      const k2 = (k + 1) % steps
      const first = dir > 0 ? ring.pts[k] : ring.pts[k2]
      const second = dir > 0 ? ring.pts[k2] : ring.pts[k]
      positions.push(0, cy, ring.z)
      push(first, ring.z)
      push(second, ring.z)
    }
  }

  const geometry = new THREE.BufferGeometry()
  geometry.setAttribute('position', new THREE.Float32BufferAttribute(positions, 3))
  geometry.computeVertexNormals()
  return geometry
}

/** Плоское днище с приподнятыми краями. */
export function buildFloor(): THREE.BufferGeometry {
  const front = BODY_SECTIONS[2].z
  const rear = BODY_SECTIONS[BODY_SECTIONS.length - 2].z
  const w = FLOOR_HALF_WIDTH
  const y = FLOOR_Y
  const positions = [
    -w, y, front, w, y, front, w, y, rear,
    -w, y, front, w, y, rear, -w, y, rear,
  ]
  const geometry = new THREE.BufferGeometry()
  geometry.setAttribute('position', new THREE.Float32BufferAttribute(positions, 3))
  geometry.computeVertexNormals()
  return geometry
}

/** Понтон: коробка со скошенным верхом и вырезом заборника. */
export function buildSidepod(side: 1 | -1): THREE.BufferGeometry {
  const { frontZ, rearZ, halfWidth, top, bottom } = SIDEPOD
  const inner = 0.3
  const outer = halfWidth
  const box = new THREE.BoxGeometry(outer - inner, top - bottom, frontZ - rearZ)
  box.translate(
    side * (inner + (outer - inner) / 2),
    bottom + (top - bottom) / 2,
    (frontZ + rearZ) / 2,
  )
  // Понтон сужается кверху и к корме: у болида это обтекаемое тело, а не
  // параллелепипед. Без сужения силуэт сбоку становится кирпичом.
  const pos = box.getAttribute('position')
  const midZ = (frontZ + rearZ) / 2
  for (let i = 0; i < pos.count; i += 1) {
    const y = pos.getY(i)
    const z = pos.getZ(i)
    if (y > bottom + (top - bottom) * 0.5) {
      pos.setX(i, pos.getX(i) * 0.62)
    }
    if (z < midZ) {
      // Хвост понтона поджимается к осевой — воздух уходит к диффузору.
      pos.setX(i, pos.getX(i) * 0.70)
      pos.setY(i, y * 0.88)
    }
  }
  box.computeVertexNormals()
  return box
}

/** Многоэлементное антикрыло: плоскости с нарастающим углом атаки. */
export function buildWing(
  z: number, halfWidth: number, chord: number, elements: number, baseY: number,
): THREE.BufferGeometry[] {
  const parts: THREE.BufferGeometry[] = []
  for (let i = 0; i < elements; i += 1) {
    const t = i / Math.max(1, elements - 1)
    const plane = new THREE.BoxGeometry(halfWidth * 2, 0.022, chord / elements)
    plane.rotateX(-0.16 - t * 0.30)
    plane.translate(0, baseY + t * 0.075, z - t * (chord / elements) * 0.85)
    parts.push(plane)
  }
  return parts
}

/** Боковая пластина антикрыла. */
export function buildEndplate(
  z: number, halfWidth: number, chord: number, baseY: number, height: number, side: 1 | -1,
): THREE.BufferGeometry {
  const plate = new THREE.BoxGeometry(0.022, height, chord)
  plate.translate(side * halfWidth, baseY + height / 2, z)
  return plate
}

/** Halo: дуга над кокпитом плюс центральная стойка. */
export function buildHalo(): THREE.BufferGeometry[] {
  const ring = new THREE.TorusGeometry(HALO.radius, HALO.tubeRadius, 8, 20, Math.PI)
  ring.rotateY(Math.PI / 2)
  ring.rotateZ(Math.PI / 2)
  ring.translate(0, HALO.height, HALO.centreZ)

  const pillar = new THREE.CylinderGeometry(HALO.tubeRadius, HALO.tubeRadius, 0.3, 8)
  pillar.rotateX(0.35)
  pillar.translate(0, HALO.height - 0.13, HALO.pillarZ)

  return [ring, pillar]
}

/** Воздухозаборник над головой пилота. */
export function buildAirbox(): THREE.BufferGeometry {
  const box = new THREE.BoxGeometry(AIRBOX.halfWidth * 2, AIRBOX.top - AIRBOX.bottom, 0.55)
  box.translate(0, (AIRBOX.top + AIRBOX.bottom) / 2, AIRBOX.z)
  const pos = box.getAttribute('position')
  // Заборник сужается кверху и назад — иначе это просто кирпич на кузове.
  for (let i = 0; i < pos.count; i += 1) {
    if (pos.getY(i) > AIRBOX.bottom + 0.1) pos.setX(i, pos.getX(i) * 0.6)
    if (pos.getZ(i) < AIRBOX.z) pos.setY(i, pos.getY(i) * 0.94)
  }
  box.computeVertexNormals()
  return box
}

/** Обод кокпита — тёмный проём вокруг пилота. */
export function buildCockpitRim(): THREE.BufferGeometry {
  const rim = new THREE.TorusGeometry(COCKPIT.halfWidth, 0.03, 6, 16)
  rim.rotateX(Math.PI / 2)
  rim.scale(1, 1, 1.6)
  rim.translate(0, COCKPIT.rimY, COCKPIT.z)
  return rim
}

/** Пилоны носа: две стойки от антикрыла к монококу. */
export function buildNosePylons(): THREE.BufferGeometry[] {
  return ([-1, 1] as const).map((side) => {
    const pylon = new THREE.BoxGeometry(0.035, 0.20, 0.42)
    pylon.rotateX(-0.5)
    pylon.translate(side * 0.14, 0.20, FRONT_WING.z - 0.30)
    return pylon
  })
}

/** Заднее антикрыло целиком: основной профиль, закрылок и пластины. */
export function buildRearWing(): THREE.BufferGeometry[] {
  const main = new THREE.BoxGeometry(REAR_WING.halfWidth * 2, 0.028, REAR_WING.chord)
  main.rotateX(-0.22)
  main.translate(0, REAR_WING.mainY, REAR_WING.z)

  const flap = new THREE.BoxGeometry(REAR_WING.halfWidth * 2, 0.024, REAR_WING.chord * 0.55)
  flap.rotateX(-0.5)
  flap.translate(0, REAR_WING.flapY, REAR_WING.z - 0.08)

  const plates = ([-1, 1] as const).map((side) =>
    buildEndplate(REAR_WING.z, REAR_WING.halfWidth, REAR_WING.chord * 1.5,
      REAR_WING.mainY - 0.28, REAR_WING.endplateHeight + 0.2, side))

  return [main, flap, ...plates]
}

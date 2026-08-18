import * as THREE from 'three'
import { buildEdges } from '../track/geometry'
import type { Track, TrackPoint } from '../track/schema'

/** Угол, с которого узел считается поворотом, требующим торможения. */
const CORNER_CURVATURE = 0.07
/** На сколько метров до поворота ставится первый маркер. */
const MARKER_DISTANCES_M = [150, 100, 50]
const LIFT_M = 0.04

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

/**
 * Узлы, где начинается поворот: первый узел серии с высокой кривизной.
 * Внутренние узлы серии отбрасываются, иначе на одну шикану ставится
 * десяток комплектов маркеров.
 */
export function cornerEntries(track: Track): number[] {
  const n = track.centerline.length
  const entries: number[] = []
  let inCorner = false
  for (let i = 0; i < n; i++) {
    const sharp = curvature(track, i) >= CORNER_CURVATURE
    if (sharp && !inCorner) entries.push(i)
    inCorner = sharp
  }
  return entries
}

/** Отступает назад по осевой на заданное число метров. */
export function stepBack(track: Track, from: number, meters: number): number {
  const cl = track.centerline
  const n = cl.length
  let travelled = 0
  let i = from
  while (travelled < meters) {
    const prev = (i - 1 + n) % n
    travelled += Math.hypot(cl[i].x - cl[prev].x, cl[i].z - cl[prev].z)
    i = prev
    if (i === from) break
  }
  return i
}

/**
 * Щиты-маркеры за 150/100/50 м до поворота — то, по чему в реальности
 * отсчитывают точку торможения. Без них трасса заучивается вслепую.
 */
export function buildBrakingMarkers(track: Track): THREE.Group {
  const group = new THREE.Group()
  const { left } = buildEdges(track)
  const cl = track.centerline
  const n = cl.length

  const board = new THREE.MeshStandardMaterial({ color: 0xf5f5f5, roughness: 0.6 })
  const post = new THREE.MeshStandardMaterial({ color: 0x2a2a2e, roughness: 0.8 })
  const colours = [0x1f8b3a, 0xd9a520, 0xc8102e]

  cornerEntries(track).forEach((entry) => {
    MARKER_DISTANCES_M.forEach((distance, k) => {
      const at = stepBack(track, entry, distance)
      const here = cl[at]
      const next = cl[(at + 1) % n]
      const heading = Math.atan2(next.x - here.x, next.z - here.z)
      // Ставим за левым краем, на 3 м от полотна: видно, но не мешает.
      const edge = left[at]
      const outX = edge.x - here.x, outZ = edge.z - here.z
      const outLen = Math.hypot(outX, outZ) || 1
      const x = edge.x + (outX / outLen) * 3
      const z = edge.z + (outZ / outLen) * 3

      const stand = new THREE.Group()
      const panel = new THREE.Mesh(new THREE.BoxGeometry(2.4, 1.6, 0.14), board)
      panel.position.y = 2.2
      const stripe = new THREE.Mesh(
        new THREE.BoxGeometry(2.0, 0.9, 0.18),
        new THREE.MeshStandardMaterial({ color: colours[k], roughness: 0.6 }),
      )
      stripe.position.set(0, 2.2, 0.03)
      const leg = new THREE.Mesh(new THREE.BoxGeometry(0.16, 1.6, 0.16), post)
      leg.position.y = 0.8
      stand.add(panel, stripe, leg)
      stand.position.set(x, 0, z)
      stand.rotation.y = heading
      group.add(stand)
    })
  })

  return group
}

/**
 * Цветная полоса по осевой: зелёная там, где можно держать газ, красная перед
 * поворотами. Тот же приём, что «линия торможения» в гоночных играх, только
 * рисуется по кривизне трассы, а не по телеметрии круга.
 */
export function buildRacingLine(track: Track): THREE.Mesh {
  const cl = track.centerline
  const n = cl.length
  const positions: number[] = []
  const colours: number[] = []
  const entries = new Set<number>()
  for (const entry of cornerEntries(track)) {
    for (const d of [180, 150, 120, 90, 60, 30, 0]) entries.add(stepBack(track, entry, d))
  }

  const width = 1.1
  for (let i = 0; i < n; i++) {
    const j = (i + 1) % n
    const a = cl[i], b = cl[j]
    const dx = b.x - a.x, dz = b.z - a.z
    const len = Math.hypot(dx, dz) || 1
    const nx = -dz / len * width, nz = dx / len * width

    const braking = entries.has(i) || curvature(track, i) >= CORNER_CURVATURE
    const c: [number, number, number] = braking ? [1.0, 0.1, 0.1] : [0.1, 0.95, 0.2]

    // Линия смещена от осевой: по центру её полностью закрывает болид,
    // и подсказка не видна именно тогда, когда нужна.
    const shift = 3.0
    const ox = -dz / len * shift, oz = dx / len * shift
    const quad: TrackPoint[] = [
      { x: a.x + ox + nx, y: a.y, z: a.z + oz + nz },
      { x: a.x + ox - nx, y: a.y, z: a.z + oz - nz },
      { x: b.x + ox + nx, y: b.y, z: b.z + oz + nz },
      { x: b.x + ox - nx, y: b.y, z: b.z + oz - nz },
    ]
    const order = [0, 1, 2, 1, 3, 2]
    for (const o of order) {
      positions.push(quad[o].x, quad[o].y + LIFT_M, quad[o].z)
      colours.push(c[0], c[1], c[2])
    }
  }

  const geometry = new THREE.BufferGeometry()
  geometry.setAttribute('position', new THREE.Float32BufferAttribute(positions, 3))
  geometry.setAttribute('color', new THREE.Float32BufferAttribute(colours, 3))
  geometry.computeVertexNormals()
    // DoubleSide обязателен: намотка вершин на левом и правом краю зеркальна,
  // и при FrontSide половина полосы отсекается backface culling — ровно та
  // же ловушка, что съела правуюбелую линию разметки.
  return new THREE.Mesh(geometry, new THREE.MeshBasicMaterial({
    vertexColors: true,
    side: THREE.DoubleSide,
    depthWrite: false,
  }))
}

import * as THREE from 'three'
import { buildEdges } from '../track/geometry'
import type { Track, TrackPoint } from '../track/schema'
import { makeAsphaltTexture } from './textures'

/** Один повтор текстуры асфальта на столько метров пути. */
const ASPHALT_TILE_M = 8
const LINE_WIDTH_M = 0.15
/** Приподнимаем разметку над полотном, иначе она тонет в нём при z-fight. */
const OVERLAY_LIFT_M = 0.02

/**
 * UV полотна: поперёк трассы 0..1, вдоль — пройденные метры, делённые на шаг
 * тайла. Считать вдоль по номеру сегмента нельзя: узлы OSM стоят неравномерно
 * (на Монце от 2 до 190 м), и текстура растянулась бы на прямых и сжалась в
 * шиканах.
 */
export function trackUvs(track: Track): number[] {
  const cl = track.centerline
  const n = cl.length
  const uvs: number[] = []
  let travelled = 0

  for (let i = 0; i < n; i++) {
    const j = (i + 1) % n
    const segment = distance(cl[i], cl[j])
    const v0 = travelled / ASPHALT_TILE_M
    const v1 = (travelled + segment) / ASPHALT_TILE_M
    // Порядок вершин повторяет buildTrackMesh: l0 r0 l1, r0 r1 l1
    uvs.push(0, v0, 1, v0, 0, v1)
    uvs.push(1, v0, 1, v1, 0, v1)
    travelled += segment
  }

  return uvs
}

export function buildTrackMesh(track: Track): THREE.Mesh {
  const { left, right } = buildEdges(track)
  const positions: number[] = []
  const n = track.centerline.length

  for (let i = 0; i < n; i++) {
    const j = (i + 1) % n
    const l0 = left[i], r0 = right[i], l1 = left[j], r1 = right[j]
    positions.push(l0.x, l0.y, l0.z, r0.x, r0.y, r0.z, l1.x, l1.y, l1.z)
    positions.push(r0.x, r0.y, r0.z, r1.x, r1.y, r1.z, l1.x, l1.y, l1.z)
  }

  const geometry = new THREE.BufferGeometry()
  geometry.setAttribute('position', new THREE.Float32BufferAttribute(positions, 3))
  geometry.setAttribute('uv', new THREE.Float32BufferAttribute(trackUvs(track), 2))
  geometry.computeVertexNormals()

  const mesh = new THREE.Mesh(geometry, new THREE.MeshStandardMaterial({
    map: makeAsphaltTexture(),
    roughness: 0.95,
    metalness: 0,
    side: THREE.DoubleSide,
  }))
  mesh.receiveShadow = true
  return mesh
}

/** Белая линия по обоим краям полотна — то, что глаз читает как «трасса». */
export function buildTrackLines(track: Track): THREE.Mesh {
  const { left, right } = buildEdges(track)
  const cl = track.centerline
  const n = cl.length
  const positions: number[] = []

  for (const edge of [left, right]) {
    for (let i = 0; i < n; i++) {
      const j = (i + 1) % n
      const inward0 = toward(edge[i], cl[i], LINE_WIDTH_M)
      const inward1 = toward(edge[j], cl[j], LINE_WIDTH_M)
      quad(positions, edge[i], inward0, edge[j], inward1, OVERLAY_LIFT_M)
    }
  }

  const geometry = new THREE.BufferGeometry()
  geometry.setAttribute('position', new THREE.Float32BufferAttribute(positions, 3))
  geometry.computeVertexNormals()
  // DoubleSide обязателен: у левой и правой лент обход вершин зеркальный, и при
  // FrontSide правая линия смотрит нормалью вниз и отсекается целиком.
  return new THREE.Mesh(geometry, new THREE.MeshBasicMaterial({
    color: 0xf5f5f5, side: THREE.DoubleSide,
  }))
}

/** Шашечная стартовая линия поперёк полотна на нулевом узле. */
export function buildStartLine(track: Track): THREE.Mesh {
  const { left, right } = buildEdges(track)
  const positions: number[] = []
  const squares = 12
  const depth = 1.2

  for (let k = 0; k < squares; k += 2) {
    const a = lerp(left[0], right[0], k / squares)
    const b = lerp(left[0], right[0], (k + 1) / squares)
    const forward = unit(track.centerline[0], track.centerline[1])
    const a2 = { x: a.x + forward.x * depth, y: a.y, z: a.z + forward.z * depth }
    const b2 = { x: b.x + forward.x * depth, y: b.y, z: b.z + forward.z * depth }
    quad(positions, a, b, a2, b2, OVERLAY_LIFT_M)
  }

  const geometry = new THREE.BufferGeometry()
  geometry.setAttribute('position', new THREE.Float32BufferAttribute(positions, 3))
  geometry.computeVertexNormals()
  return new THREE.Mesh(geometry, new THREE.MeshBasicMaterial({
    color: 0xffffff, side: THREE.DoubleSide,
  }))
}

function distance(a: TrackPoint, b: TrackPoint): number {
  return Math.hypot(b.x - a.x, b.y - a.y, b.z - a.z)
}

function toward(from: TrackPoint, to: TrackPoint, meters: number): TrackPoint {
  const d = Math.hypot(to.x - from.x, to.z - from.z) || 1
  return {
    x: from.x + ((to.x - from.x) / d) * meters,
    y: from.y,
    z: from.z + ((to.z - from.z) / d) * meters,
  }
}

function lerp(a: TrackPoint, b: TrackPoint, k: number): TrackPoint {
  return { x: a.x + (b.x - a.x) * k, y: a.y, z: a.z + (b.z - a.z) * k }
}

function unit(a: TrackPoint, b: TrackPoint): TrackPoint {
  const d = Math.hypot(b.x - a.x, b.z - a.z) || 1
  return { x: (b.x - a.x) / d, y: 0, z: (b.z - a.z) / d }
}

function quad(
  out: number[], a: TrackPoint, b: TrackPoint, c: TrackPoint, d: TrackPoint, lift: number,
): void {
  out.push(a.x, a.y + lift, a.z, b.x, b.y + lift, b.z, c.x, c.y + lift, c.z)
  out.push(b.x, b.y + lift, b.z, d.x, d.y + lift, d.z, c.x, c.y + lift, c.z)
}

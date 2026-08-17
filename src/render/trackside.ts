import * as THREE from 'three'
import { buildEdges } from '../track/geometry'
import type { Track, TrackPoint } from '../track/schema'
import { makeKerbTexture } from './textures'

/** Порог кривизны, с которого узел считается поворотом. */
const KERB_CURVATURE = 0.06
const KERB_WIDTH_M = 1.2
const KERB_LIFT_M = 0.03
const BARRIER_HEIGHT_M = 1.4
const BARRIER_OFFSET_M = 2.5
/** Один повтор красно-белой пары на столько метров поребрика. */
const KERB_STRIPE_M = 2

/**
 * Сколько красно-белых пар укладывается в сегмент такой длины. Округление вверх,
 * а не к ближайшему: Math.round на сегменте короче полутора полос давал одну пару
 * на несколько метров, и поребрик читался сплошной лентой вместо чередования.
 */
export function stripeSpan(segmentLengthM: number): number {
  return Math.max(1, Math.ceil(segmentLengthM / KERB_STRIPE_M))
}

/**
 * Кривизна в узле — угол между направлением входа и выхода. Меряется по
 * нормированным направлениям, потому что соседние сегменты OSM различаются по
 * длине на два порядка, и разность сырых векторов дала бы кривизну прямой.
 */
export function curvatureAt(track: Track, index: number): number {
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

export function kerbNodes(track: Track): number[] {
  const nodes: number[] = []
  for (let i = 0; i < track.centerline.length; i++) {
    if (curvatureAt(track, i) >= KERB_CURVATURE) nodes.push(i)
  }
  return nodes
}

/** Поребрики по обеим сторонам в поворотах. */
export function buildKerbs(track: Track): THREE.Mesh {
  const { left, right } = buildEdges(track)
  const cl = track.centerline
  const n = cl.length
  const positions: number[] = []
  const uvs: number[] = []
  const nodes = new Set(kerbNodes(track))

  for (let i = 0; i < n; i++) {
    if (!nodes.has(i)) continue
    const j = (i + 1) % n
    // Длина сегмента задаёт число полос: при фиксированном UV полосы растянулись
    // бы на длинных сегментах и слиплись на коротких (шаг узлов от 2 до 190 м).
    const span = stripeSpan(Math.hypot(cl[j].x - cl[i].x, cl[j].z - cl[i].z))
    for (const edge of [left, right]) {
      const outward0 = away(edge[i], cl[i], KERB_WIDTH_M)
      const outward1 = away(edge[j], cl[j], KERB_WIDTH_M)
      pushQuad(positions, edge[i], outward0, edge[j], outward1, KERB_LIFT_M)
      // Полосы поперёк движения: повтор по длине, один по ширине.
      uvs.push(0, 0, 1, 0, 0, span, 1, 0, 1, span, 0, span)
    }
  }

  const geometry = new THREE.BufferGeometry()
  geometry.setAttribute('position', new THREE.Float32BufferAttribute(positions, 3))
  geometry.setAttribute('uv', new THREE.Float32BufferAttribute(uvs, 2))
  geometry.computeVertexNormals()

  const texture = makeKerbTexture()
  texture.repeat.set(1, 1)
  const mesh = new THREE.Mesh(geometry, new THREE.MeshStandardMaterial({
    map: texture, roughness: 0.8, side: THREE.DoubleSide,
  }))
  mesh.receiveShadow = true
  return mesh
}

/** Отбойники: вертикальная стенка на отдалении от полотна. */
export function buildBarriers(track: Track): THREE.Mesh {
  const { left, right } = buildEdges(track)
  const cl = track.centerline
  const n = cl.length
  const positions: number[] = []

  for (const edge of [left, right]) {
    for (let i = 0; i < n; i++) {
      const j = (i + 1) % n
      const base0 = away(edge[i], cl[i], BARRIER_OFFSET_M)
      const base1 = away(edge[j], cl[j], BARRIER_OFFSET_M)
      const top0 = { ...base0, y: base0.y + BARRIER_HEIGHT_M }
      const top1 = { ...base1, y: base1.y + BARRIER_HEIGHT_M }
      pushQuad(positions, base0, top0, base1, top1, 0)
    }
  }

  const geometry = new THREE.BufferGeometry()
  geometry.setAttribute('position', new THREE.Float32BufferAttribute(positions, 3))
  geometry.computeVertexNormals()
  // Стенка вертикальна, её нормаль горизонтальна, а весь направленный свет идёт
  // сверху — без подсветки отбойник уходит в тень и читается серой полосой на
  // траве. emissive поднимает его, не трогая освещение сцены.
  return new THREE.Mesh(geometry, new THREE.MeshStandardMaterial({
    color: 0xdddde2, roughness: 0.6, metalness: 0.3, side: THREE.DoubleSide,
    emissive: 0x9a9aa6, emissiveIntensity: 0.45,
  }))
}

function away(from: TrackPoint, centre: TrackPoint, meters: number): TrackPoint {
  const dx = from.x - centre.x, dz = from.z - centre.z
  const d = Math.hypot(dx, dz) || 1
  return { x: from.x + (dx / d) * meters, y: from.y, z: from.z + (dz / d) * meters }
}

function pushQuad(
  out: number[], a: TrackPoint, b: TrackPoint, c: TrackPoint, d: TrackPoint, lift: number,
): void {
  out.push(a.x, a.y + lift, a.z, b.x, b.y + lift, b.z, c.x, c.y + lift, c.z)
  out.push(b.x, b.y + lift, b.z, d.x, d.y + lift, d.z, c.x, c.y + lift, c.z)
}

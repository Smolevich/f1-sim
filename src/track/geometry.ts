import type { Track, TrackPoint } from './schema'

export type TrackEdges = {
  left: TrackPoint[]
  right: TrackPoint[]
}

/** Края полотна: отступ на полширины по нормали к направлению движения. */
export function buildEdges(track: Track): TrackEdges {
  const half = track.widthM / 2
  const left: TrackPoint[] = []
  const right: TrackPoint[] = []

  const n = track.centerline.length
  for (let i = 0; i < n; i++) {
    const c = track.centerline[i]
    const prev = track.centerline[(i - 1 + n) % n]
    const next = track.centerline[(i + 1) % n]

    // Направления входа и выхода нормируются по отдельности: в OSM длина
    // соседних сегментов различается на два порядка (74 м на прямой против
    // 2 м в шикане), и центральная разность по сырым векторам разворачивает
    // нормаль на стыке, схлопывая полотно в бабочку.
    const inX = c.x - prev.x
    const inZ = c.z - prev.z
    const outX = next.x - c.x
    const outZ = next.z - c.z
    const inLen = Math.hypot(inX, inZ) || 1
    const outLen = Math.hypot(outX, outZ) || 1

    const dx = inX / inLen + outX / outLen
    const dz = inZ / inLen + outZ / outLen
    const len = Math.hypot(dx, dz) || 1
    const nx = -dz / len
    const nz = dx / len

    left.push({ x: c.x + nx * half, y: c.y, z: c.z + nz * half })
    right.push({ x: c.x - nx * half, y: c.y, z: c.z - nz * half })
  }

  return { left, right }
}

/** Стартовая позиция и курс: первая точка осевой, нос — вдоль неё вперёд. */
export function startPose(track: Track): { position: TrackPoint; headingRad: number } {
  const a = track.centerline[0]
  const b = track.centerline[1 % track.centerline.length]
  return {
    position: { x: a.x, y: a.y, z: a.z },
    // Продольная ось болида — +Z, поэтому курс отсчитывается от +Z к +X:
    // отсюда порядок аргументов atan2(dx, dz), а не привычный atan2(dz, dx).
    headingRad: Math.atan2(b.x - a.x, b.z - a.z),
  }
}

/**
 * Пройденная дистанция от точки старта до узла index, метры.
 *
 * Замыкающий сегмент n-1 → 0 не учитывается, поэтому сумма по всем узлам
 * короче `centerlineLength` на длину этого сегмента (на Монце — 96.6 м).
 * Индекс не заворачивается: за пределами [0, n-1] значение упирается в
 * границу, а не считается по модулю.
 */
export function distanceAlong(track: Track, index: number): number {
  let total = 0
  for (let i = 0; i < index; i++) {
    const a = track.centerline[i]
    const b = track.centerline[i + 1]
    if (!b) break
    total += Math.hypot(b.x - a.x, b.y - a.y, b.z - a.z)
  }
  return total
}

/**
 * Точка на полотне, если расстояние до ближайшего сегмента осевой не больше
 * полширины. Это же правило ловит срезки: ушёл дальше — круг не засчитан.
 */
export function isOnTrack(track: Track, point: TrackPoint): boolean {
  const half = track.widthM / 2
  const n = track.centerline.length
  let best = Infinity
  for (let i = 0; i < n; i++) {
    const a = track.centerline[i]
    const b = track.centerline[(i + 1) % n]
    best = Math.min(best, distanceToSegment(point, a, b))
    if (best <= half) return true
  }
  return best <= half
}

function distanceToSegment(p: TrackPoint, a: TrackPoint, b: TrackPoint): number {
  const dx = b.x - a.x
  const dz = b.z - a.z
  const lengthSq = dx * dx + dz * dz
  if (lengthSq === 0) return Math.hypot(p.x - a.x, p.z - a.z)
  const t = Math.max(0, Math.min(1, ((p.x - a.x) * dx + (p.z - a.z) * dz) / lengthSq))
  return Math.hypot(p.x - (a.x + t * dx), p.z - (a.z + t * dz))
}

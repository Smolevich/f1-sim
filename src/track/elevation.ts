import type { Track, TrackPoint } from './schema'

/** Высоты от самой низкой точки: игре нужен рельеф, а не метры над морем. */
export function relativeElevations(raw: number[]): number[] {
  if (raw.length === 0) return []
  const base = Math.min(...raw)
  return raw.map((v) => v - base)
}

/**
 * Круговое скользящее среднее по замкнутому контуру: SRTM с шагом сетки 90 м
 * даёт ступеньки между соседними узлами осевой, стоящими в 20 м друг от друга.
 */
export function smoothElevations(values: number[], window: number): number[] {
  const n = values.length
  return values.map((_, i) => {
    let sum = 0
    for (let k = -window; k <= window; k++) sum += values[(i + k + n) % n]
    return sum / (2 * window + 1)
  })
}

/** Копия трека с высотами, вшитыми в y осевой, — для рендера. Физике не давать. */
export function withElevations(track: Track): Track {
  const el = track.elevationsM
  if (!el || el.length !== track.centerline.length) return track
  return {
    ...track,
    centerline: track.centerline.map((p, i) => ({ ...p, y: el[i] })),
  }
}

/**
 * Высота рельефа в произвольной точке (x, z): проекция на ближайший сегмент
 * осевой, высота интерполируется между его концами. Используется, чтобы
 * поднять болид, призрака и камеру на визуальный рельеф.
 */
export function elevationAt(track: Track, x: number, z: number): number {
  const el = track.elevationsM
  const cl = track.centerline
  if (!el || el.length !== cl.length) return 0

  let bestDist = Infinity
  let best = 0
  const n = cl.length
  for (let i = 0; i < n; i++) {
    const a = cl[i]
    const b = cl[(i + 1) % n]
    const dx = b.x - a.x
    const dz = b.z - a.z
    const lengthSq = dx * dx + dz * dz || 1
    const t = Math.max(0, Math.min(1, ((x - a.x) * dx + (z - a.z) * dz) / lengthSq))
    const px = a.x + t * dx
    const pz = a.z + t * dz
    const dist = Math.hypot(x - px, z - pz)
    if (dist < bestDist) {
      bestDist = dist
      best = el[i] + t * (el[(i + 1) % n] - el[i])
    }
  }
  return best
}

export type { TrackPoint }

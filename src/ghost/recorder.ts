import type { TrackPoint } from '../track/schema'

export type GhostFrame = {
  tMs: number
  x: number
  y: number
  z: number
  qy: number
  qw: number
}

export type GhostLap = {
  timeMs: number
  frames: GhostFrame[]
}

/** 20 Гц: круг Монцы укладывается в ~50 КБ, а движение на глаз остаётся плавным. */
export const GHOST_HZ = 20

const INTERVAL_MS = 1000 / GHOST_HZ

type Quaternion = { x: number; y: number; z: number; w: number }

export class GhostRecorder {
  private frames: GhostFrame[] = []
  private nextAtMs = 0

  record(tMs: number, position: TrackPoint, orientation: Quaternion): void {
    if (this.frames.length > 0 && tMs < this.nextAtMs) return
    this.frames.push({
      tMs,
      x: position.x,
      y: position.y,
      z: position.z,
      // Рыскание — единственная нужная ось: болид не переворачивается, а
      // полный кватернион удвоил бы вес записи.
      qy: orientation.y,
      qw: orientation.w,
    })
    this.nextAtMs = tMs + INTERVAL_MS
  }

  finish(timeMs: number): GhostLap {
    return { timeMs, frames: this.frames.slice() }
  }

  reset(): void {
    this.frames = []
    this.nextAtMs = 0
  }
}

/** Линейная интерполяция между соседними кадрами; за пределами — крайний кадр. */
export function sampleGhost(lap: GhostLap, tMs: number): GhostFrame | null {
  const f = lap.frames
  if (f.length === 0) return null
  if (tMs <= f[0].tMs) return f[0]
  if (tMs >= f[f.length - 1].tMs) return f[f.length - 1]

  let lo = 0
  let hi = f.length - 1
  while (hi - lo > 1) {
    const mid = (lo + hi) >> 1
    if (f[mid].tMs <= tMs) lo = mid
    else hi = mid
  }

  const a = f[lo]
  const b = f[hi]
  const span = b.tMs - a.tMs
  const k = span > 0 ? (tMs - a.tMs) / span : 0
  return {
    tMs,
    x: a.x + (b.x - a.x) * k,
    y: a.y + (b.y - a.y) * k,
    z: a.z + (b.z - a.z) * k,
    qy: a.qy + (b.qy - a.qy) * k,
    qw: a.qw + (b.qw - a.qw) * k,
  }
}

export function serializeGhost(lap: GhostLap): string {
  return JSON.stringify({
    t: lap.timeMs,
    f: lap.frames.map((x) => [
      Math.round(x.tMs),
      round(x.x), round(x.y), round(x.z),
      round(x.qy), round(x.qw),
    ]),
  })
}

export function parseGhost(raw: string): GhostLap | null {
  try {
    const data = JSON.parse(raw) as { t?: number; f?: number[][] }
    if (typeof data.t !== 'number' || !Array.isArray(data.f)) return null
    return {
      timeMs: data.t,
      frames: data.f.map(([tMs, x, y, z, qy, qw]) => ({ tMs, x, y, z, qy, qw })),
    }
  } catch {
    return null
  }
}

/** Три знака после запятой — миллиметры; дальше точность в записи бессмысленна. */
function round(value: number): number {
  return Math.round(value * 1000) / 1000
}

import type { Track, TrackPoint } from '../track/schema'

export type SectorIndex = 0 | 1 | 2

export type LapState = {
  startedAtMs: number | null
  sectorEntryMs: [number, number, number]
  lastSector: SectorIndex | null
  valid: boolean
}

export type LapResult = {
  timeMs: number
  sectors: [number, number, number]
  valid: boolean
}

export function createLapState(): LapState {
  return { startedAtMs: null, sectorEntryMs: [0, 0, 0], lastSector: null, valid: true }
}

/** Доля круга 0..1 по ближайшему узлу осевой линии. */
export function progressFraction(track: Track, point: TrackPoint): number {
  const n = track.centerline.length
  let bestIndex = 0
  let bestDistance = Infinity
  for (let i = 0; i < n; i++) {
    const c = track.centerline[i]
    const d = (point.x - c.x) ** 2 + (point.z - c.z) ** 2
    if (d < bestDistance) {
      bestDistance = d
      bestIndex = i
    }
  }
  return bestIndex / n
}

export function sectorFor(track: Track, fraction: number): SectorIndex {
  const [s1, s2] = track.sectorSplits
  if (fraction < s1) return 0
  if (fraction < s2) return 1
  return 2
}

/**
 * Круг замыкается при переходе из третьего сектора в первый. Валидность теряется
 * при любом выезде за границы полотна: восстановить её внутри круга нельзя,
 * иначе срезку можно «отмыть», доехав остаток чисто.
 */
export function updateLap(
  state: LapState,
  track: Track,
  point: TrackPoint,
  nowMs: number,
  onTrack: boolean,
): { state: LapState; completed: LapResult | null } {
  const fraction = progressFraction(track, point)
  const sector = sectorFor(track, fraction)
  const next: LapState = { ...state, sectorEntryMs: [...state.sectorEntryMs] }

  if (!onTrack) next.valid = false

  if (next.lastSector === null) {
    next.lastSector = sector
    next.startedAtMs = nowMs
    next.sectorEntryMs = [nowMs, nowMs, nowMs]
    return { state: next, completed: null }
  }

  if (sector === next.lastSector) return { state: next, completed: null }

  const crossedLine = next.lastSector === 2 && sector === 0
  if (!crossedLine) {
    next.sectorEntryMs[sector] = nowMs
    // Секторы обязаны идти по порядку: прыжок через сектор означает разворот
    // или езду напрямик, и такой круг не засчитывается.
    if (sector !== next.lastSector + 1) next.valid = false
    next.lastSector = sector
    return { state: next, completed: null }
  }

  const startedAtMs = next.startedAtMs ?? nowMs
  const completed: LapResult = {
    timeMs: nowMs - startedAtMs,
    sectors: [
      next.sectorEntryMs[1] - next.sectorEntryMs[0],
      next.sectorEntryMs[2] - next.sectorEntryMs[1],
      nowMs - next.sectorEntryMs[2],
    ],
    valid: next.valid && next.sectorEntryMs[2] > next.sectorEntryMs[1],
  }

  return {
    state: {
      startedAtMs: nowMs,
      sectorEntryMs: [nowMs, nowMs, nowMs],
      lastSector: 0,
      valid: true,
    },
    completed,
  }
}

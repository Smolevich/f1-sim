import { parseGhost, serializeGhost, type GhostLap } from '../ghost/recorder'

export type PersonalBest = {
  timeMs: number
  sectors: [number, number, number]
}

const NAME_KEY = 'f1sim.name'
const TRACK_KEY = 'f1sim.track'
const MAX_NAME = 12

export function sanitizeName(raw: string): string {
  const cleaned = raw.replace(/[<>"'&\\]/g, '').trim().slice(0, MAX_NAME)
  return cleaned.length > 0 ? cleaned : 'ANON'
}

export function loadName(): string | null {
  return read(NAME_KEY)
}

export function saveName(name: string): void {
  write(NAME_KEY, sanitizeName(name))
}

export function loadTrackId(): string | null {
  return read(TRACK_KEY)
}

export function saveTrackId(trackId: string): void {
  write(TRACK_KEY, trackId)
}

export function loadBest(trackId: string): PersonalBest | null {
  const raw = read(`f1sim.best.${trackId}`)
  if (raw === null) return null
  try {
    const parsed = JSON.parse(raw) as PersonalBest
    return typeof parsed.timeMs === 'number' ? parsed : null
  } catch {
    return null
  }
}

export function saveBest(trackId: string, best: PersonalBest): void {
  write(`f1sim.best.${trackId}`, JSON.stringify(best))
}

export function loadGhost(trackId: string): GhostLap | null {
  const raw = read(`f1sim.ghost.${trackId}`)
  return raw === null ? null : parseGhost(raw)
}

export function saveGhost(trackId: string, lap: GhostLap): void {
  write(`f1sim.ghost.${trackId}`, serializeGhost(lap))
}

/**
 * Хранилище может быть недоступно: приватный режим, переполненная квота,
 * запрет сторонних данных. Игра из-за этого падать не должна.
 */
function read(key: string): string | null {
  try {
    return localStorage.getItem(key)
  } catch {
    return null
  }
}

function write(key: string, value: string): void {
  try {
    localStorage.setItem(key, value)
  } catch {
    // Рекорд не сохранится, но заезд продолжается.
  }
}

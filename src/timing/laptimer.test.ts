import { readFileSync } from 'node:fs'
import { expect, test } from 'vitest'
import {
  createLapState, progressFraction, sectorFor, updateLap,
} from './laptimer'
import { centerlineLength, type Track, type TrackPoint } from '../track/schema'

const ring = (radius = 100): Track => ({
  meta: {
    id: 'ring', name: 'Ring', country: 'XX',
    officialLengthM: 2 * Math.PI * radius,
    realRecord: { timeMs: 60_000, driver: 'Nobody', year: 2020 },
  },
  centerline: Array.from({ length: 64 }, (_, i) => {
    const a = (i / 64) * Math.PI * 2
    return { x: Math.cos(a) * radius, y: 0, z: Math.sin(a) * radius }
  }),
  widthM: 12,
  sectorSplits: [0.33, 0.66],
})

const at = (track: Track, fraction: number): TrackPoint => {
  const i = Math.floor(fraction * track.centerline.length) % track.centerline.length
  return track.centerline[i]
}

test('доля круга растёт от старта к концу', () => {
  const t = ring()
  expect(progressFraction(t, at(t, 0.5))).toBeGreaterThan(progressFraction(t, at(t, 0.1)))
})

test('доля круга лежит в пределах нуля и единицы', () => {
  const t = ring()
  for (const f of [0, 0.25, 0.5, 0.75, 0.99]) {
    const p = progressFraction(t, at(t, f))
    expect(p).toBeGreaterThanOrEqual(0)
    expect(p).toBeLessThanOrEqual(1)
  }
})

test('секторы делятся по sectorSplits', () => {
  const t = ring()
  expect(sectorFor(t, 0.1)).toBe(0)
  expect(sectorFor(t, 0.5)).toBe(1)
  expect(sectorFor(t, 0.9)).toBe(2)
})

test('круг замыкается и отдаёт время', () => {
  const t = ring()
  let s = createLapState()
  let completed = null
  // проезд по кругу: 0.1 -> 0.5 -> 0.9 -> 0.05 (пересечение линии)
  for (const [f, ms] of [[0.1, 0], [0.5, 30_000], [0.9, 60_000], [0.05, 90_000]] as const) {
    const r = updateLap(s, t, at(t, f), ms, true)
    s = r.state
    if (r.completed) completed = r.completed
  }
  expect(completed).not.toBeNull()
  expect(completed!.timeMs).toBeGreaterThan(0)
})

test('сумма секторов сходится со временем круга', () => {
  const t = ring()
  let s = createLapState()
  let completed = null
  for (const [f, ms] of [[0.1, 0], [0.5, 30_000], [0.9, 60_000], [0.05, 90_000]] as const) {
    const r = updateLap(s, t, at(t, f), ms, true)
    s = r.state
    if (r.completed) completed = r.completed
  }
  const sum = completed!.sectors.reduce((a, b) => a + b, 0)
  expect(Math.abs(sum - completed!.timeMs)).toBeLessThanOrEqual(1)
})

test('срезка делает круг невалидным', () => {
  const t = ring()
  let s = createLapState()
  let completed = null
  for (const [f, ms, on] of [
    [0.1, 0, true], [0.5, 30_000, false], [0.9, 60_000, true], [0.05, 90_000, true],
  ] as const) {
    const r = updateLap(s, t, at(t, f), ms, on)
    s = r.state
    if (r.completed) completed = r.completed
  }
  expect(completed!.valid).toBe(false)
})

test('срезка не отмывается чистым остатком круга', () => {
  const t = ring()
  let s = createLapState()
  let completed = null
  // выезд в первом секторе, дальше всё чисто
  for (const [f, ms, on] of [
    [0.1, 0, false], [0.5, 30_000, true], [0.9, 60_000, true], [0.05, 90_000, true],
  ] as const) {
    const r = updateLap(s, t, at(t, f), ms, on)
    s = r.state
    if (r.completed) completed = r.completed
  }
  expect(completed!.valid).toBe(false)
})

test('чистый круг остаётся валидным', () => {
  const t = ring()
  let s = createLapState()
  let completed = null
  for (const [f, ms] of [[0.1, 0], [0.5, 30_000], [0.9, 60_000], [0.05, 90_000]] as const) {
    const r = updateLap(s, t, at(t, f), ms, true)
    s = r.state
    if (r.completed) completed = r.completed
  }
  expect(completed!.valid).toBe(true)
})

test('пропущенный сектор не даёт засчитать круг', () => {
  const t = ring()
  let s = createLapState()
  let completed = null
  // 0.1 -> 0.9 -> 0.05: второй сектор не пройден
  for (const [f, ms] of [[0.1, 0], [0.9, 60_000], [0.05, 90_000]] as const) {
    const r = updateLap(s, t, at(t, f), ms, true)
    s = r.state
    if (r.completed) completed = r.completed
  }
  expect(completed === null || completed.valid === false).toBe(true)
})

test('доля круга считается по длине, а не по номеру узла', () => {
  const real: Track = JSON.parse(readFileSync('public/tracks/monza.json', 'utf8'))
  const n = real.centerline.length

  // Для каждого узла доля должна совпадать с накопленной длиной до него.
  const total = centerlineLength(real.centerline)
  let cumulative = 0
  for (let i = 1; i < n; i++) {
    const a = real.centerline[i - 1]
    const b = real.centerline[i]
    cumulative += Math.hypot(b.x - a.x, b.y - a.y, b.z - a.z)
    if (i % 50 !== 0) continue
    const expected = cumulative / total
    expect(progressFraction(real, real.centerline[i])).toBeCloseTo(expected, 3)
  }
})

test('на неравномерных узлах доля по длине расходится с долей по индексу', () => {
  const real: Track = JSON.parse(readFileSync('public/tracks/monza.json', 'utf8'))
  const i = 50
  const byIndex = i / real.centerline.length
  expect(Math.abs(progressFraction(real, real.centerline[i]) - byIndex)).toBeGreaterThan(0.05)
})

import { readFileSync } from 'node:fs'
import { expect, test } from 'vitest'
import { buildEdges, distanceAlong, isOnTrack } from './geometry'
import type { Track } from './schema'

const ring = (radius: number, points: number, widthM = 12): Track => ({
  meta: {
    id: 'ring', name: 'Ring', country: 'XX',
    officialLengthM: 2 * Math.PI * radius,
    realRecord: { timeMs: 60_000, driver: 'Nobody', year: 2020 },
  },
  centerline: Array.from({ length: points }, (_, i) => {
    const a = (i / points) * Math.PI * 2
    return { x: Math.cos(a) * radius, y: 0, z: Math.sin(a) * radius }
  }),
  widthM,
  sectorSplits: [0.33, 0.66],
})

test('края идут по обе стороны от осевой', () => {
  const track = ring(100, 64)
  const { left, right } = buildEdges(track)
  expect(left).toHaveLength(track.centerline.length)
  expect(right).toHaveLength(track.centerline.length)

  const c = track.centerline[0]
  const dLeft = Math.hypot(left[0].x - c.x, left[0].z - c.z)
  const dRight = Math.hypot(right[0].x - c.x, right[0].z - c.z)
  expect(dLeft).toBeCloseTo(track.widthM / 2, 1)
  expect(dRight).toBeCloseTo(track.widthM / 2, 1)
})

test('края лежат по разные стороны от осевой', () => {
  const track = ring(100, 64)
  const { left, right } = buildEdges(track)
  const outer = Math.hypot(left[0].x, left[0].z)
  const inner = Math.hypot(right[0].x, right[0].z)
  expect(Math.abs(outer - inner)).toBeCloseTo(track.widthM, 1)
})

test('дистанция вдоль трассы растёт от старта', () => {
  const track = ring(100, 64)
  expect(distanceAlong(track, 10)).toBeGreaterThan(distanceAlong(track, 0))
})

test('точка на осевой считается на трассе', () => {
  const track = ring(100, 64)
  expect(isOnTrack(track, track.centerline[5])).toBe(true)
})

test('точка далеко за краем не на трассе', () => {
  const track = ring(100, 64)
  expect(isOnTrack(track, { x: 200, y: 0, z: 0 })).toBe(false)
})

test('точка чуть внутри края ещё на трассе, чуть снаружи — уже нет', () => {
  const track = ring(100, 64)
  expect(isOnTrack(track, { x: 100 + 5, y: 0, z: 0 })).toBe(true)
  expect(isOnTrack(track, { x: 100 + 7, y: 0, z: 0 })).toBe(false)
})

test('кромки не заворачиваются назад на стыке длинного и короткого сегментов', () => {
  const track: Track = JSON.parse(readFileSync('public/tracks/monza.json', 'utf8'))
  const { left, right } = buildEdges(track)
  const c = track.centerline
  const n = c.length

  for (let i = 0; i < n; i++) {
    const j = (i + 1) % n
    const dx = c[j].x - c[i].x
    const dz = c[j].z - c[i].z
    const segLen = Math.hypot(dx, dz) || 1
    for (const edge of [left, right]) {
      const advance = ((edge[j].x - edge[i].x) * dx + (edge[j].z - edge[i].z) * dz) / segLen
      expect(advance).toBeGreaterThan(0)
    }
  }
})

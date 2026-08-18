import { expect, test } from 'vitest'
import { readFileSync } from 'node:fs'
import { grandstandSlots, treeSlots } from './scenery'
import type { Track } from '../track/schema'

const track: Track = JSON.parse(readFileSync('public/tracks/monza.json', 'utf8'))

test('трибуны ставятся на прямых и в разумном количестве', () => {
  const slots = grandstandSlots(track)
  expect(slots.length).toBeGreaterThan(0)
  expect(slots.length).toBeLessThanOrEqual(14)
})

test('деревья не стоят на трассе', () => {
  const trees = treeSlots(track, 200)
  for (const t of trees) {
    let nearest = Infinity
    for (const c of track.centerline) nearest = Math.min(nearest, Math.hypot(t.x - c.x, t.z - c.z))
    expect(nearest).toBeGreaterThan(track.widthM)
  }
})

test('деревья разбросаны по округе, а не кучей', () => {
  const trees = treeSlots(track, 200)
  const xs = trees.map((t) => t.x)
  expect(Math.max(...xs) - Math.min(...xs)).toBeGreaterThan(500)
})

test('расстановка детерминированная: два вызова дают одно и то же', () => {
  const a = treeSlots(track, 50)
  const b = treeSlots(track, 50)
  expect(a[10].x).toBe(b[10].x)
})

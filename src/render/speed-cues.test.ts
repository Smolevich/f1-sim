import { expect, test } from 'vitest'
import { readFileSync } from 'node:fs'
import { averageSpacing, normalAt, rowSlots } from './speed-cues'
import type { Track } from '../track/schema'

const track: Track = JSON.parse(readFileSync('public/tracks/monza.json', 'utf8'))

test('средний шаг осевой Монцы около 20 м', () => {
  const s = averageSpacing(track)
  expect(s).toBeGreaterThan(5)
  expect(s).toBeLessThan(40)
})

test('нормаль перпендикулярна направлению движения', () => {
  const cl = track.centerline
  const { nx, nz } = normalAt(track, 0)
  const dx = cl[1].x - cl[0].x
  const dz = cl[1].z - cl[0].z
  const len = Math.hypot(dx, dz)
  // Скалярное произведение направления и нормали должно быть нулевым.
  expect(Math.abs((dx / len) * nx + (dz / len) * nz)).toBeLessThan(1e-6)
})

test('столбики стоят у самой кромки, а не в 20 м от неё', () => {
  // Регрессия: ближайший объект сцены был в 21 м от края трассы, и на
  // 300 км/ч смещался лишь на 18°/с — скорость не читалась.
  const half = track.widthM / 2
  const slots = rowSlots(track, 25, half + 1.4)
  const distances = slots.map((s) => {
    let near = Infinity
    for (const c of track.centerline) {
      const d = Math.hypot(s.x - c.x, s.z - c.z)
      if (d < near) near = d
    }
    return near
  })
  expect(Math.min(...distances)).toBeLessThan(half + 3)
})

test('столбики не стоят на полотне', () => {
  const half = track.widthM / 2
  const slots = rowSlots(track, 25, half + 1.4)
  const distances = slots.map((s) => {
    let near = Infinity
    for (const c of track.centerline) {
      const d = Math.hypot(s.x - c.x, s.z - c.z)
      if (d < near) near = d
    }
    return near
  })
  expect(Math.min(...distances)).toBeGreaterThan(half * 0.7)
})

test('штрихи разметки идут плотнее столбиков', () => {
  const posts = rowSlots(track, 25, 7)
  const dashes = rowSlots(track, 9, 5.5)
  expect(dashes.length).toBeGreaterThan(posts.length)
})

test('ряд обходит трассу целиком', () => {
  const slots = rowSlots(track, 25, 7.4)
  // При длине 5793 м и шаге 25 м столбиков должно быть заметно больше сотни.
  expect(slots.length).toBeGreaterThan(100)
})

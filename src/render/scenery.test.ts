import { expect, test } from 'vitest'
import { readFileSync } from 'node:fs'
import { beltSlots, grandstandSlots, HILL_INNER_M, ridgeHeight, treeSlots } from './scenery'
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

test('гряда неровная: высота гуляет по углу, а не держит один уровень', () => {
  const heights: number[] = []
  for (let i = 0; i < 360; i++) heights.push(ridgeHeight((i / 360) * Math.PI * 2, 0.5))
  expect(Math.max(...heights) - Math.min(...heights)).toBeGreaterThan(60)
})

test('гряда замкнута: высота на 0 и на 2*PI совпадает', () => {
  // Разрыв на стыке кольца читается как вертикальная стена на горизонте.
  expect(ridgeHeight(0, 0.5)).toBeCloseTo(ridgeHeight(Math.PI * 2, 0.5), 6)
})

test('внутренний край гряды лежит на земле, а не обрывается стеной', () => {
  expect(ridgeHeight(1.2, 0)).toBeCloseTo(0, 6)
})

test('гряда выше трибун: иначе горизонт закрыт постройками', () => {
  let peak = 0
  for (let i = 0; i < 360; i++) peak = Math.max(peak, ridgeHeight((i / 360) * Math.PI * 2, 0.5))
  expect(peak).toBeGreaterThan(120)
})

test('гряда начинается за деревьями, а не на трассе', () => {
  // Гряда с радиусом меньше трассы вырастала зелёным клином поперёк кадра.
  const xs = track.centerline.map((p) => p.x)
  const zs = track.centerline.map((p) => p.z)
  const cx = (Math.min(...xs) + Math.max(...xs)) / 2
  const cz = (Math.min(...zs) + Math.max(...zs)) / 2
  let farthest = 0
  for (const p of track.centerline) {
    farthest = Math.max(farthest, Math.hypot(p.x - cx, p.z - cz))
  }
  const treeReach = farthest + 400
  expect(HILL_INNER_M).toBeGreaterThan(treeReach)
})

test('лесополоса прилегает к трассе, а не стоит вдалеке', () => {
  const belt = beltSlots(track)
  expect(belt.length).toBeGreaterThan(200)

  const distances = belt.map((slot) => {
    let nearest = Infinity
    for (const c of track.centerline) {
      const d = Math.hypot(slot.x - c.x, slot.z - c.z)
      if (d < nearest) nearest = d
    }
    return nearest
  })

  // Ближний ряд виден с трассы, а не теряется на горизонте.
  expect(Math.min(...distances)).toBeLessThan(60)

  // Деревья стоят за отбойниками (9 м от края полотна) с запасом на крону:
  // вылетевший болид должен попадать в зону вылета, а не в лес.
  const halfWidth = track.widthM / 2
  const barrier = halfWidth + 9
  const crownReach = 7
  expect(Math.min(...distances)).toBeGreaterThan(barrier + crownReach)
})

test('лесополоса идёт по обе стороны трассы', () => {
  const belt = beltSlots(track)
  const start = track.centerline[0]
  const next = track.centerline[1]
  const heading = Math.atan2(next.x - start.x, next.z - start.z)
  const nx = Math.cos(heading)
  const nz = -Math.sin(heading)

  // Берём деревья рядом со стартом и смотрим знак проекции на нормаль.
  const near = belt.filter((s) => Math.hypot(s.x - start.x, s.z - start.z) < 90)
  const sides = near.map((s) => Math.sign((s.x - start.x) * nx + (s.z - start.z) * nz))
  expect(sides).toContain(1)
  expect(sides).toContain(-1)
})

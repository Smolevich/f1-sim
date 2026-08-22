import { expect, test } from 'vitest'
import type { Track } from './schema'
import {
  elevationAt, relativeElevations, smoothElevations, withElevations,
} from './elevation'

/** Квадратная трасса 4×100 м: хватает, чтобы проверить привязку высот к узлам. */
function squareTrack(elevationsM?: number[]): Track {
  return {
    meta: {
      id: 'test', name: 'Test', country: 'XX',
      officialLengthM: 400,
      realRecord: { timeMs: 60_000, driver: 'Test', year: 2026 },
    },
    centerline: [
      { x: 0, y: 0, z: 0 },
      { x: 100, y: 0, z: 0 },
      { x: 100, y: 0, z: 100 },
      { x: 0, y: 0, z: 100 },
    ],
    widthM: 10,
    sectorSplits: [0.3, 0.6],
    ...(elevationsM ? { elevationsM } : {}),
  }
}

test('высоты пересчитываются относительно самой низкой точки', () => {
  expect(relativeElevations([183, 190, 185])).toEqual([0, 7, 2])
})

test('сглаживание убирает ступеньку SRTM, не трогая ровный участок', () => {
  const stepped = [5, 5, 5, 5, 11, 11, 11, 11]
  const smoothed = smoothElevations(stepped, 1)
  const maxJump = (v: number[]) =>
    Math.max(...v.map((_, i) => Math.abs(v[(i + 1) % v.length] - v[i])))
  expect(maxJump(smoothed)).toBeLessThan(maxJump(stepped))
  expect(smoothElevations([7, 7, 7, 7], 1)).toEqual([7, 7, 7, 7])
})

test('withElevations вшивает высоты в y осевой для рендера', () => {
  const visual = withElevations(squareTrack([0, 4, 8, 2]))
  expect(visual.centerline.map((p) => p.y)).toEqual([0, 4, 8, 2])
})

test('withElevations не трогает исходный трек — физика остаётся плоской', () => {
  const track = squareTrack([0, 4, 8, 2])
  withElevations(track)
  expect(track.centerline.every((p) => p.y === 0)).toBe(true)
})

test('трек без высот остаётся плоским и после withElevations', () => {
  const visual = withElevations(squareTrack())
  expect(visual.centerline.every((p) => p.y === 0)).toBe(true)
})

test('elevationAt в узле осевой отдаёт высоту этого узла', () => {
  const track = squareTrack([0, 4, 8, 2])
  expect(elevationAt(track, 100, 0)).toBeCloseTo(4)
})

test('elevationAt между узлами интерполирует', () => {
  const track = squareTrack([0, 4, 8, 2])
  expect(elevationAt(track, 50, 0)).toBeCloseTo(2)
})

test('elevationAt без данных высот — ноль', () => {
  expect(elevationAt(squareTrack(), 50, 0)).toBe(0)
})

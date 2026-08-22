import { expect, test } from 'vitest'
import { filterForestSpots, forestSpots, pointInPolygon, ribbonPositions } from './osm-scenery'

const square: [number, number][] = [[0, 0], [100, 0], [100, 100], [0, 100]]

test('точка внутри полигона распознаётся', () => {
  expect(pointInPolygon(50, 50, square)).toBe(true)
})

test('точка снаружи полигона распознаётся', () => {
  expect(pointInPolygon(150, 50, square)).toBe(false)
  expect(pointInPolygon(-1, 50, square)).toBe(false)
})

test('лес рассаживается только внутри полигона', () => {
  const spots = forestSpots(square, 15)
  expect(spots.length).toBeGreaterThan(10)
  for (const s of spots) {
    expect(pointInPolygon(s.x, s.z, square)).toBe(true)
  }
})

test('рассадка детерминирована — при перезагрузке лес не прыгает', () => {
  expect(forestSpots(square, 15)).toEqual(forestSpots(square, 15))
})

test('лента овала имеет ширину и следует линии', () => {
  const line = [{ x: 0, y: 0, z: 0 }, { x: 100, y: 0, z: 0 }]
  const positions = ribbonPositions(line, 10)
  // Два треугольника на сегмент, 3 вершины, 3 координаты.
  expect(positions.length).toBe(18)
  const zs = positions.filter((_, i) => i % 3 === 2)
  expect(Math.max(...zs) - Math.min(...zs)).toBeCloseTo(10)
})

test('деревья леса не сажаются на полотно и обочину', () => {
  const track = {
    meta: {
      id: 't', name: 'T', country: 'XX', officialLengthM: 400,
      realRecord: { timeMs: 1, driver: 'X', year: 2026 },
    },
    centerline: [
      { x: 0, y: 0, z: 50 }, { x: 100, y: 0, z: 50 },
      { x: 100, y: 0, z: 60 }, { x: 0, y: 0, z: 60 },
    ],
    widthM: 10,
    sectorSplits: [0.3, 0.6] as [number, number],
  }
  // Полигон леса пересекает трассу насквозь.
  const spots = filterForestSpots(forestSpots(square, 8), track, 12)
  expect(spots.length).toBeGreaterThan(0)
  for (const s of spots) {
    for (const c of track.centerline) {
      expect(Math.hypot(s.x - c.x, s.z - c.z)).toBeGreaterThan(12)
    }
  }
})

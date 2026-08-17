import { expect, test } from 'vitest'
import { centerlineLength, validateTrack, type Track } from './schema'

const square = (side: number): Track => ({
  meta: {
    id: 'test', name: 'Test', country: 'XX', officialLengthM: side * 4,
    realRecord: { timeMs: 60_000, driver: 'Nobody', year: 2020 },
  },
  centerline: [
    { x: 0, y: 0, z: 0 },
    { x: side, y: 0, z: 0 },
    { x: side, y: 0, z: side },
    { x: 0, y: 0, z: side },
  ],
  widthM: 12,
  sectorSplits: [0.33, 0.66],
})

test('длина осевой считается по замкнутому контуру', () => {
  expect(centerlineLength(square(100).centerline)).toBeCloseTo(400, 6)
})

test('длина учитывает перепад высот', () => {
  const flat = [{ x: 0, y: 0, z: 0 }, { x: 3, y: 0, z: 0 }]
  const hilly = [{ x: 0, y: 0, z: 0 }, { x: 3, y: 4, z: 0 }]
  expect(centerlineLength(hilly)).toBeGreaterThan(centerlineLength(flat))
})

test('валидная трасса не даёт проблем', () => {
  expect(validateTrack(square(100))).toEqual([])
})

test('расхождение длины больше 2% — это проблема', () => {
  const track = square(100)
  track.meta.officialLengthM = 1000
  expect(validateTrack(track)).toContainEqual(expect.stringContaining('длина'))
})

test('слишком короткая осевая — это проблема', () => {
  const track = square(100)
  track.centerline = [{ x: 0, y: 0, z: 0 }, { x: 1, y: 0, z: 0 }]
  expect(validateTrack(track).length).toBeGreaterThan(0)
})

test('сектора вне диапазона — это проблема', () => {
  const track = square(100)
  track.sectorSplits = [0.9, 0.2]
  expect(validateTrack(track)).toContainEqual(expect.stringContaining('сектор'))
})

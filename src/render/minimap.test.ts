import { expect, test } from 'vitest'
import { readFileSync } from 'node:fs'
import { projectTrack } from './minimap'
import type { Track } from '../track/schema'

const track: Track = JSON.parse(readFileSync('public/tracks/monza.json', 'utf8'))

test('проекция даёт точку на каждый узел', () => {
  expect(projectTrack(track, 200).points.length).toBe(track.centerline.length)
})

test('все точки помещаются в заданный размер', () => {
  const { points } = projectTrack(track, 200)
  for (const [x, y] of points) {
    expect(x).toBeGreaterThanOrEqual(0)
    expect(x).toBeLessThanOrEqual(200)
    expect(y).toBeGreaterThanOrEqual(0)
    expect(y).toBeLessThanOrEqual(200)
  }
})

test('пропорции трассы сохраняются', () => {
  const { points } = projectTrack(track, 200)
  const xs = points.map((p) => p[0])
  const ys = points.map((p) => p[1])
  const w = Math.max(...xs) - Math.min(...xs)
  const h = Math.max(...ys) - Math.min(...ys)
  // Монца вытянута: 1257 x 2171 м, значит по высоте карта заполнена сильнее
  expect(h).toBeGreaterThan(w)
})

test('карта заполняет отведённое место хотя бы наполовину', () => {
  const { points } = projectTrack(track, 200)
  const ys = points.map((p) => p[1])
  expect(Math.max(...ys) - Math.min(...ys)).toBeGreaterThan(100)
})

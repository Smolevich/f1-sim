import { expect, test } from 'vitest'
import { readFileSync } from 'node:fs'
import { trackUvs } from './track-mesh'
import type { Track } from '../track/schema'

const track: Track = JSON.parse(readFileSync('public/tracks/monza.json', 'utf8'))

test('UV есть на каждую вершину полотна', () => {
  const uvs = trackUvs(track)
  // 6 вершин на сегмент, 2 числа на вершину
  expect(uvs.length).toBe(track.centerline.length * 6 * 2)
})

test('координата поперёк трассы лежит в пределах нуля и единицы', () => {
  const uvs = trackUvs(track)
  for (let i = 0; i < uvs.length; i += 2) {
    expect(uvs[i]).toBeGreaterThanOrEqual(0)
    expect(uvs[i]).toBeLessThanOrEqual(1)
  }
})

test('координата вдоль трассы растёт с длиной, а не с номером узла', () => {
  const uvs = trackUvs(track)
  // v первой вершины первого сегмента против v первой вершины сотого
  const first = uvs[1]
  const hundredth = uvs[100 * 6 * 2 + 1]
  expect(hundredth).toBeGreaterThan(first)
})

test('масштаб вдоль трассы соответствует метрам, а не сегментам', () => {
  const uvs = trackUvs(track)
  const last = uvs[(track.centerline.length - 1) * 6 * 2 + 1]
  // 5792 м при повторе раз в 8 м -> около 724
  expect(last).toBeGreaterThan(500)
  expect(last).toBeLessThan(1000)
})

import { readFileSync } from 'node:fs'
import { expect, test } from 'vitest'
import { centerlineLength, validateTrack, type Track } from './schema'

const TRACKS = ['monza', 'spa', 'monaco', 'silverstone', 'suzuka', 'interlagos']

const load = (id: string): Track =>
  JSON.parse(readFileSync(`public/tracks/${id}.json`, 'utf8')) as Track

for (const id of TRACKS) {
  test(`трасса ${id} валидна и совпадает с официальной длиной`, () => {
    const track = load(id)
    expect(validateTrack(track)).toEqual([])
    const measured = centerlineLength(track.centerline)
    const deviation = Math.abs(measured - track.meta.officialLengthM) / track.meta.officialLengthM
    expect(deviation).toBeLessThan(0.02)
  })
}

test('у каждой трассы свой рекорд и название', () => {
  const seen = new Set<string>()
  for (const id of TRACKS) {
    const t = load(id)
    expect(t.meta.name.length).toBeGreaterThan(3)
    expect(t.meta.realRecord.timeMs).toBeGreaterThan(60_000)
    expect(seen.has(t.meta.name)).toBe(false)
    seen.add(t.meta.name)
  }
})

test('id в файле совпадает с именем файла — иначе рекорды уедут не на ту трассу', () => {
  for (const id of TRACKS) {
    expect(load(id).meta.id).toBe(id)
  }
})

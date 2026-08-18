import { expect, test } from 'vitest'
import { readFileSync } from 'node:fs'
import { DEFAULT_TRACK_ID, TRACK_CATALOGUE, isKnownTrackId } from './catalogue'
import type { Track } from './schema'

test('в каталоге шесть трасс', () => {
  expect(TRACK_CATALOGUE).toHaveLength(6)
})

test('идентификаторы уникальны', () => {
  const ids = TRACK_CATALOGUE.map((t) => t.id)
  expect(new Set(ids).size).toBe(ids.length)
})

test('у каждой трассы есть рекорд и длина', () => {
  for (const t of TRACK_CATALOGUE) {
    expect(t.recordMs).toBeGreaterThan(60_000)
    expect(t.lengthM).toBeGreaterThan(3000)
  }
})

test('Монако короче Спа', () => {
  const monaco = TRACK_CATALOGUE.find((t) => t.id === 'monaco')!
  const spa = TRACK_CATALOGUE.find((t) => t.id === 'spa')!
  expect(monaco.lengthM).toBeLessThan(spa.lengthM)
})

test('каталог совпадает с файлами трасс — меню не соврёт про длину и рекорд', () => {
  for (const entry of TRACK_CATALOGUE) {
    const track: Track = JSON.parse(readFileSync(`public/tracks/${entry.id}.json`, 'utf8'))
    expect(track.meta.name).toBe(entry.name)
    expect(track.meta.officialLengthM).toBe(entry.lengthM)
    expect(track.meta.realRecord.timeMs).toBe(entry.recordMs)
    expect(track.meta.realRecord.driver).toBe(entry.recordDriver)
  }
})

test('трасса по умолчанию есть в каталоге', () => {
  expect(TRACK_CATALOGUE.some((t) => t.id === DEFAULT_TRACK_ID)).toBe(true)
})

test('мусорный id из localStorage не проходит — иначе игра грузит несуществующий файл', () => {
  expect(isKnownTrackId('spa')).toBe(true)
  expect(isKnownTrackId('../../etc/passwd')).toBe(false)
  expect(isKnownTrackId(null)).toBe(false)
})

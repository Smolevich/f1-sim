import { expect, test } from 'vitest'
import {
  GhostRecorder, GHOST_HZ, parseGhost, sampleGhost, serializeGhost,
} from './recorder'

const q = { x: 0, y: 0, z: 0, w: 1 }

test('запись идёт с частотой GHOST_HZ, а не каждый вызов', () => {
  const r = new GhostRecorder()
  // 1 секунда с шагом 1/120 -> должно остаться примерно GHOST_HZ кадров
  for (let i = 0; i < 120; i++) r.record((i / 120) * 1000, { x: i, y: 0, z: 0 }, q)
  const lap = r.finish(1000)
  expect(lap.frames.length).toBeGreaterThanOrEqual(GHOST_HZ - 2)
  expect(lap.frames.length).toBeLessThanOrEqual(GHOST_HZ + 2)
})

test('воспроизведённый круг совпадает по времени с записанным', () => {
  const r = new GhostRecorder()
  for (let i = 0; i <= 100; i++) r.record(i * 50, { x: i, y: 0, z: 0 }, q)
  const lap = r.finish(5000)
  expect(lap.timeMs).toBe(5000)
})

test('выборка между кадрами интерполируется', () => {
  const r = new GhostRecorder()
  r.record(0, { x: 0, y: 0, z: 0 }, q)
  r.record(1000, { x: 100, y: 0, z: 0 }, q)
  const lap = r.finish(1000)
  const mid = sampleGhost(lap, 500)
  expect(mid).not.toBeNull()
  expect(mid!.x).toBeGreaterThan(0)
  expect(mid!.x).toBeLessThan(100)
})

test('выборка до первого кадра и после последнего не падает', () => {
  const r = new GhostRecorder()
  r.record(0, { x: 0, y: 0, z: 0 }, q)
  r.record(1000, { x: 100, y: 0, z: 0 }, q)
  const lap = r.finish(1000)
  expect(sampleGhost(lap, -100)).not.toBeNull()
  expect(sampleGhost(lap, 99_999)).not.toBeNull()
})

test('пустой призрак не даёт выборки', () => {
  expect(sampleGhost({ timeMs: 0, frames: [] }, 0)).toBeNull()
})

test('сериализация и разбор возвращают тот же круг', () => {
  const r = new GhostRecorder()
  for (let i = 0; i <= 20; i++) r.record(i * 100, { x: i, y: 1, z: -i }, q)
  const lap = r.finish(2000)
  const back = parseGhost(serializeGhost(lap))
  expect(back).not.toBeNull()
  expect(back!.timeMs).toBe(lap.timeMs)
  expect(back!.frames.length).toBe(lap.frames.length)
})

test('битая строка не роняет разбор', () => {
  expect(parseGhost('не json')).toBeNull()
  expect(parseGhost('{}')).toBeNull()
})

test('сброс очищает запись', () => {
  const r = new GhostRecorder()
  r.record(0, { x: 0, y: 0, z: 0 }, q)
  r.reset()
  expect(r.finish(0).frames).toHaveLength(0)
})

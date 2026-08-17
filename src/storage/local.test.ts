import { beforeEach, expect, test } from 'vitest'
import {
  loadBest, loadGhost, loadName, sanitizeName, saveBest, saveGhost, saveName,
} from './local'

// jsdom не нужен: подменяем минимальный localStorage
beforeEach(() => {
  const store = new Map<string, string>()
  globalThis.localStorage = {
    getItem: (k: string) => store.get(k) ?? null,
    setItem: (k: string, v: string) => void store.set(k, v),
    removeItem: (k: string) => void store.delete(k),
    clear: () => store.clear(),
    key: () => null,
    length: 0,
  } as Storage
})

test('имя сохраняется и читается', () => {
  saveName('STAS')
  expect(loadName()).toBe('STAS')
})

test('имени нет — возвращается null', () => {
  expect(loadName()).toBeNull()
})

test('имя обрезается по длине', () => {
  expect(sanitizeName('ОЧЕНЬДЛИННОЕИМЯИГРОКА').length).toBeLessThanOrEqual(12)
})

test('из имени вырезаются угловые скобки и кавычки', () => {
  expect(sanitizeName('<script>')).not.toContain('<')
  expect(sanitizeName('a"b')).not.toContain('"')
})

test('пустое имя после чистки становится ANON', () => {
  expect(sanitizeName('   ')).toBe('ANON')
})

test('личный рекорд сохраняется на трассу', () => {
  saveBest('monza', { timeMs: 82_140, sectors: [27_000, 28_000, 27_140] })
  expect(loadBest('monza')!.timeMs).toBe(82_140)
  expect(loadBest('spa')).toBeNull()
})

test('призрак сохраняется и читается', () => {
  saveGhost('monza', { timeMs: 82_140, frames: [{ tMs: 0, x: 1, y: 2, z: 3, qy: 0, qw: 1 }] })
  const back = loadGhost('monza')
  expect(back!.timeMs).toBe(82_140)
  expect(back!.frames).toHaveLength(1)
})

test('битые данные в хранилище не роняют чтение', () => {
  localStorage.setItem('f1sim.best.monza', 'не json')
  expect(loadBest('monza')).toBeNull()
})

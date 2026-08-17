import { afterEach, expect, test, vi } from 'vitest'
import { fetchTop, submitLap } from './leaderboard'

const lap = {
  track: 'monza', name: 'STAS', timeMs: 82_140,
  sectors: [27_000, 28_000, 27_140] as [number, number, number],
  assists: [],
}

afterEach(() => { vi.restoreAllMocks() })

test('отправка круга уходит POST на /api/leaderboard', async () => {
  const spy = vi.fn().mockResolvedValue({ ok: true, json: async () => ({ accepted: true }) })
  vi.stubGlobal('fetch', spy)
  await submitLap(lap)
  expect(spy).toHaveBeenCalledOnce()
  const [url, init] = spy.mock.calls[0]
  expect(String(url)).toContain('/api/leaderboard')
  expect(init.method).toBe('POST')
})

test('сеть недоступна — отправка возвращает false, а не бросает', async () => {
  vi.stubGlobal('fetch', vi.fn().mockRejectedValue(new Error('offline')))
  await expect(submitLap(lap)).resolves.toBe(false)
})

test('сервер отклонил круг — возвращается false', async () => {
  vi.stubGlobal('fetch', vi.fn().mockResolvedValue({
    ok: true, json: async () => ({ accepted: false, reason: 'слишком быстро' }),
  }))
  await expect(submitLap(lap)).resolves.toBe(false)
})

test('топ читается с указанием трассы в запросе', async () => {
  const spy = vi.fn().mockResolvedValue({
    ok: true, json: async () => ({ entries: [{ name: 'STAS', time_ms: 82_140, assists: [] }] }),
  })
  vi.stubGlobal('fetch', spy)
  const top = await fetchTop('monza')
  expect(String(spy.mock.calls[0][0])).toContain('track=monza')
  expect(top[0].timeMs).toBe(82_140)
})

test('сеть недоступна — топ пустой, без исключения', async () => {
  vi.stubGlobal('fetch', vi.fn().mockRejectedValue(new Error('offline')))
  await expect(fetchTop('monza')).resolves.toEqual([])
})

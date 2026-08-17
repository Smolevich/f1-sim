export type LapSubmission = {
  track: string
  name: string
  timeMs: number
  sectors: [number, number, number]
  assists: string[]
}

export type LeaderboardEntry = {
  name: string
  timeMs: number
  assists: string[]
}

const BASE = '/api/leaderboard'

/**
 * Отправка результата. Недоступный leaderboard не должен мешать заезду, поэтому
 * любая ошибка сети или отказ сервера — это false, а не исключение.
 */
export async function submitLap(lap: LapSubmission): Promise<boolean> {
  try {
    const res = await fetch(BASE, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        track: lap.track,
        name: lap.name,
        time_ms: Math.round(lap.timeMs),
        sectors: lap.sectors.map((s) => Math.round(s)),
        assists: lap.assists,
      }),
    })
    if (!res.ok) return false
    const data = await res.json() as { accepted?: boolean }
    return data.accepted === true
  } catch {
    return false
  }
}

export async function fetchTop(trackId: string): Promise<LeaderboardEntry[]> {
  try {
    const res = await fetch(`${BASE}?track=${encodeURIComponent(trackId)}`)
    if (!res.ok) return []
    const data = await res.json() as {
      entries?: { name: string; time_ms: number; assists: string[] }[]
    }
    return (data.entries ?? []).map((e) => ({
      name: e.name,
      timeMs: e.time_ms,
      assists: e.assists ?? [],
    }))
  } catch {
    return []
  }
}

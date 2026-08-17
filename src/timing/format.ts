export function formatLapTime(ms: number): string {
  const total = Math.max(0, Math.round(ms))
  const minutes = Math.floor(total / 60_000)
  const seconds = Math.floor((total % 60_000) / 1000)
  const millis = total % 1000
  return `${minutes}:${String(seconds).padStart(2, '0')}.${String(millis).padStart(3, '0')}`
}

export function formatDelta(ms: number): string {
  const sign = ms < 0 ? '-' : '+'
  const abs = Math.abs(Math.round(ms))
  const seconds = Math.floor(abs / 1000)
  const millis = abs % 1000
  return `${sign}${seconds}.${String(millis).padStart(3, '0')}`
}

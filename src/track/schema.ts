export type TrackPoint = { x: number; y: number; z: number }

export type TrackMeta = {
  id: string
  name: string
  country: string
  officialLengthM: number
  realRecord: { timeMs: number; driver: string; year: number }
}

export type Track = {
  meta: TrackMeta
  centerline: TrackPoint[]
  widthM: number
  sectorSplits: [number, number]
}

const MIN_POINTS = 4
const LENGTH_TOLERANCE = 0.02

/** Длина замкнутой осевой линии в метрах, с учётом перепада высот. */
export function centerlineLength(points: TrackPoint[]): number {
  if (points.length < 2) return 0
  let total = 0
  for (let i = 0; i < points.length; i++) {
    const a = points[i]
    const b = points[(i + 1) % points.length]
    total += Math.hypot(b.x - a.x, b.y - a.y, b.z - a.z)
  }
  return total
}

/**
 * Проверки, которые ловят криво собранную трассу до того, как она попадёт в игру:
 * расхождение с официальной длиной означает, что OSM-путь взят не тот или
 * проекция координат неверна.
 */
export function validateTrack(track: Track): string[] {
  const problems: string[] = []

  if (track.centerline.length < MIN_POINTS) {
    problems.push(`осевая слишком короткая: ${track.centerline.length} точек`)
  }

  const measured = centerlineLength(track.centerline)
  const official = track.meta.officialLengthM
  if (official > 0) {
    const deviation = Math.abs(measured - official) / official
    if (deviation > LENGTH_TOLERANCE) {
      problems.push(
        `длина ${measured.toFixed(0)} м расходится с официальной ${official} м ` +
        `на ${(deviation * 100).toFixed(1)}%`,
      )
    }
  }

  const [s1, s2] = track.sectorSplits
  if (!(s1 > 0 && s1 < s2 && s2 < 1)) {
    problems.push(`сектора должны идти по возрастанию внутри (0,1): ${s1}, ${s2}`)
  }

  if (track.widthM <= 0) problems.push(`ширина должна быть положительной: ${track.widthM}`)

  return problems
}

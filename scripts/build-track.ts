import { mkdirSync, writeFileSync } from 'node:fs'
import { centerlineLength, validateTrack, type Track, type TrackPoint } from '../src/track/schema'

const OVERPASS = 'https://overpass-api.de/api/interpreter'

type Circuit = {
  id: string
  name: string
  country: string
  osmRelationId: number
  /** Участки отношения, которые не входят в боевой круг: пит-лейн, старое кольцо. */
  excludeWayNames: string[]
  officialLengthM: number
  widthM: number
  sectorSplits: [number, number]
  realRecord: { timeMs: number; driver: string; year: number }
}

const CIRCUITS: Record<string, Circuit> = {
  monza: {
    id: 'monza',
    name: 'Autodromo Nazionale di Monza',
    country: 'IT',
    osmRelationId: 284565,
    excludeWayNames: ['Pit Lane'],
    officialLengthM: 5793,
    widthM: 12,
    sectorSplits: [0.33, 0.62],
    realRecord: { timeMs: 81_046, driver: 'Rubens Barrichello', year: 2004 },
  },
}

type LatLon = { lat: number; lon: number }
type OsmWay = { id: number; tags?: Record<string, string>; geometry: LatLon[] }

/**
 * Осевая линия трассы из OSM. Отношение — это набор отдельных участков
 * («Curva Biassono», «Lesmo 1», …), лежащих в произвольном порядке и
 * произвольном направлении, поэтому узлы нельзя просто ссыпать в один массив:
 * получится каша. Участки сшиваются голова-к-хвосту в замкнутый контур.
 */
async function fetchCenterline(relationId: number, excludeNames: string[]): Promise<LatLon[]> {
  const query = `[out:json][timeout:90];rel(${relationId});way(r);out geom;`
  // Без User-Agent Apache перед Overpass отвечает 406 — Node fetch его не шлёт по умолчанию.
  const res = await fetch(OVERPASS, {
    method: 'POST',
    headers: { 'User-Agent': 'f1-sim-build-track/1.0' },
    body: query,
  })
  if (!res.ok) throw new Error(`Overpass ответил ${res.status}`)
  const data = await res.json() as { elements: OsmWay[] }

  const pool = data.elements
    .filter((w): w is OsmWay => Array.isArray(w.geometry) && w.geometry.length > 1)
    .filter((w) => !excludeNames.includes(w.tags?.name ?? ''))
    .map((w) => ({ name: w.tags?.name ?? String(w.id), geometry: w.geometry.slice() }))

  if (pool.length === 0) throw new Error(`в отношении ${relationId} нет участков с геометрией`)

  const first = pool.shift()!
  let path = first.geometry.slice()

  while (pool.length > 0) {
    const tail = nodeKey(path[path.length - 1])

    const forward = pool.findIndex((w) => nodeKey(w.geometry[0]) === tail)
    if (forward >= 0) {
      path = path.concat(pool[forward].geometry.slice(1))
      pool.splice(forward, 1)
      continue
    }

    const backward = pool.findIndex((w) => nodeKey(w.geometry[w.geometry.length - 1]) === tail)
    if (backward >= 0) {
      path = path.concat(pool[backward].geometry.slice().reverse().slice(1))
      pool.splice(backward, 1)
      continue
    }

    throw new Error(
      `осевая рвётся: не пристыковано ${pool.length} участков (${pool.map((w) => w.name).join(', ')})`,
    )
  }

  // Замыкающая точка совпадает со стартовой — в кольце она лишняя.
  if (path.length > 1 && nodeKey(path[0]) === nodeKey(path[path.length - 1])) path.pop()

  return path
}

/** Координаты в OSM точны до ~1e-7 градуса; по этой строке узлы и сшиваются. */
function nodeKey(p: LatLon): string {
  return `${p.lat.toFixed(7)},${p.lon.toFixed(7)}`
}

/**
 * Локальная проекция в метры относительно центра трассы. Для куска в несколько
 * километров плоской аппроксимации достаточно, UTM тут избыточен.
 */
function toMeters(points: { lat: number; lon: number }[]): TrackPoint[] {
  const lat0 = points.reduce((s, p) => s + p.lat, 0) / points.length
  const lon0 = points.reduce((s, p) => s + p.lon, 0) / points.length
  const mPerDegLat = 111_320
  const mPerDegLon = 111_320 * Math.cos((lat0 * Math.PI) / 180)
  return points.map((p) => ({
    x: (p.lon - lon0) * mPerDegLon,
    y: 0,
    z: (p.lat - lat0) * mPerDegLat,
  }))
}

/** Скользящее среднее: убирает дрожание OSM-узлов, не сдвигая линию. */
function smooth(points: TrackPoint[], window: number): TrackPoint[] {
  return points.map((_, i) => {
    let x = 0, y = 0, z = 0
    for (let k = -window; k <= window; k++) {
      const p = points[(i + k + points.length) % points.length]
      x += p.x; y += p.y; z += p.z
    }
    const n = window * 2 + 1
    return { x: x / n, y: y / n, z: z / n }
  })
}

async function main(): Promise<void> {
  const id = process.argv[2]
  const circuit = CIRCUITS[id]
  if (!circuit) throw new Error(`неизвестная трасса: ${id}. Есть: ${Object.keys(CIRCUITS).join(', ')}`)

  const raw = await fetchCenterline(circuit.osmRelationId, circuit.excludeWayNames)
  const centerline = smooth(toMeters(raw), 2)

  const track: Track = {
    meta: {
      id: circuit.id,
      name: circuit.name,
      country: circuit.country,
      officialLengthM: circuit.officialLengthM,
      realRecord: circuit.realRecord,
    },
    centerline,
    widthM: circuit.widthM,
    sectorSplits: circuit.sectorSplits,
  }

  const problems = validateTrack(track)
  console.log(`точек: ${centerline.length}, длина: ${centerlineLength(centerline).toFixed(0)} м`)
  if (problems.length > 0) {
    console.error('проблемы:', problems)
    process.exit(1)
  }

  // public/, а не tracks/: игра забирает трассу по /tracks/<id>.json в рантайме,
  // а Vite отдаёт как статику только содержимое public/.
  mkdirSync('public/tracks', { recursive: true })
  writeFileSync(`public/tracks/${circuit.id}.json`, JSON.stringify(track))
  console.log(`записано public/tracks/${circuit.id}.json`)
}

main()

import { mkdirSync, writeFileSync } from 'node:fs'
import { centerlineLength, validateTrack, type Track, type TrackPoint } from '../src/track/schema'
import { relativeElevations, smoothElevations } from '../src/track/elevation'
import { stitchLoop } from '../src/track/stitch'

const OVERPASS = 'https://overpass-api.de/api/interpreter'

/**
 * Источник осевой в OSM. Часть трасс размечена отношением `type=circuit`
 * (Монца, Спа, Монако, Интерлагос), часть — только россыпью ways без
 * родительского отношения (Сильверстоун, Сузука): там боевой круг задан
 * явным списком id, найденным перебором замкнутых контуров нужной длины.
 */
type OsmSource =
  | { kind: 'relation'; relationId: number }
  | { kind: 'ways'; wayIds: number[] }

type Circuit = {
  id: string
  name: string
  country: string
  source: OsmSource
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
    source: { kind: 'relation', relationId: 284565 },
    excludeWayNames: ['Pit Lane'],
    officialLengthM: 5793,
    widthM: 12,
    sectorSplits: [0.33, 0.62],
    realRecord: { timeMs: 81_046, driver: 'Rubens Barrichello', year: 2004 },
  },
  spa: {
    id: 'spa',
    name: 'Circuit de Spa-Francorchamps',
    country: 'BE',
    source: { kind: 'relation', relationId: 284560 },
    excludeWayNames: ['Pit Lane'],
    officialLengthM: 7004,
    widthM: 12,
    sectorSplits: [0.31, 0.64],
    realRecord: { timeMs: 106_286, driver: 'Valtteri Bottas', year: 2018 },
  },
  monaco: {
    id: 'monaco',
    name: 'Circuit de Monaco',
    country: 'MC',
    source: { kind: 'relation', relationId: 148194 },
    // Выезд с пит-лейна отдельными ways, в кольцо не входят.
    excludeWayNames: ['Voie des stands', 'Sortie des stands'],
    officialLengthM: 3337,
    widthM: 9,
    sectorSplits: [0.34, 0.66],
    realRecord: { timeMs: 72_909, driver: 'Lewis Hamilton', year: 2021 },
  },
  silverstone: {
    id: 'silverstone',
    name: 'Silverstone Circuit',
    country: 'GB',
    // Отношения нет: в рамке лежат ещё Stowe и National, поэтому боевой круг
    // задан списком — Copse, Maggotts, Becketts, Hangar, Stowe, Club, Abbey…
    source: {
      kind: 'ways',
      wayIds: [
        3571477, 169730585, 169730587, 169733768, 169730586, 430075118, 169733766,
        169733769, 169733770, 169848880, 169848884, 169848881, 55224168, 55224167,
        169854842, 169800226, 169800223, 169800225, 169848882, 169800224, 169800222,
        169618242, 169618240, 169618241, 169618245, 169609611, 169730588,
      ],
    },
    excludeWayNames: [],
    officialLengthM: 5891,
    widthM: 12,
    sectorSplits: [0.31, 0.62],
    realRecord: { timeMs: 87_097, driver: 'Max Verstappen', year: 2020 },
  },
  suzuka: {
    id: 'suzuka',
    name: 'Suzuka International Racing Course',
    country: 'JP',
    // Восьмёрка с путепроводом и картодром в той же рамке: отношения нет,
    // круг перечислен явно от эсок до финишной прямой.
    source: {
      kind: 'ways',
      wayIds: [
        183391628, 183391634, 183391629, 183391633, 183391631, 183391632, 183391630,
        183391642, 411295349, 183391641, 183391656, 183391664, 183391655, 183391662,
        183391658, 183391646, 183391659, 183391651, 411295347, 183391649, 183391647,
        411295351, 183391648, 411295348, 175231434, 183391652, 183391660, 411289989,
        183391637, 183391639, 183391638, 183391640, 183391661, 183391665, 183391643,
        183391645, 183391644, 183391657, 183391636, 183391635,
      ],
    },
    excludeWayNames: [],
    officialLengthM: 5807,
    widthM: 12,
    sectorSplits: [0.33, 0.66],
    realRecord: { timeMs: 90_983, driver: 'Lewis Hamilton', year: 2019 },
  },
  interlagos: {
    id: 'interlagos',
    name: 'Autódromo José Carlos Pace',
    country: 'BR',
    source: { kind: 'relation', relationId: 6781071 },
    excludeWayNames: ['Pit Lane'],
    officialLengthM: 4309,
    widthM: 12,
    sectorSplits: [0.33, 0.65],
    realRecord: { timeMs: 70_540, driver: 'Max Verstappen', year: 2018 },
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
async function fetchCenterline(
  source: OsmSource, excludeNames: string[], officialLengthM: number,
): Promise<LatLon[]> {
  const query = source.kind === 'relation'
    ? `[out:json][timeout:90];rel(${source.relationId});way(r);out geom;`
    : `[out:json][timeout:90];way(id:${source.wayIds.join(',')});out geom;`
  // Без User-Agent Apache перед Overpass отвечает 406 — Node fetch его не шлёт по умолчанию.
  const res = await fetch(OVERPASS, {
    method: 'POST',
    headers: { 'User-Agent': 'f1-sim-build-track/1.0' },
    body: query,
  })
  if (!res.ok) throw new Error(`Overpass ответил ${res.status}`)
  // При перегрузке Overpass отдаёт HTML-страницу с ошибкой вместо JSON.
  const body = await res.text()
  if (body.trimStart().startsWith('<')) {
    throw new Error('Overpass вернул HTML вместо JSON — перегружен, повторить через 30 с')
  }
  const data = JSON.parse(body) as { elements: OsmWay[] }

  const pool = data.elements
    .filter((w): w is OsmWay => Array.isArray(w.geometry) && w.geometry.length > 1)
    .filter((w) => !excludeNames.includes(w.tags?.name ?? ''))
    .map((w) => ({ name: w.tags?.name ?? String(w.id), geometry: w.geometry.slice() }))

  const label = source.kind === 'relation' ? `отношении ${source.relationId}` : 'списке ways'
  if (pool.length === 0) throw new Error(`в ${label} нет участков с геометрией`)

  return stitchLoop(pool, officialLengthM)
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

/**
 * Реальные высоты трассы из SRTM (данные радарной съёмки шаттла — те же, что
 * под рельефом Google Earth). Без них трасса плоская: Монца лежит на 183-194 м,
 * и её подъёмы с спусками просто не видны.
 *
 * API берёт до 100 точек за запрос, поэтому идём пакетами. Между пакетами
 * пауза: сервис публичный и просит не частить.
 */
const ELEVATION_API = 'https://api.opentopodata.org/v1/srtm90m'
const ELEVATION_BATCH = 90

async function fetchElevations(points: LatLon[]): Promise<number[]> {
  const out: number[] = []
  for (let i = 0; i < points.length; i += ELEVATION_BATCH) {
    const batch = points.slice(i, i + ELEVATION_BATCH)
    const locations = batch.map((p) => `${p.lat.toFixed(6)},${p.lon.toFixed(6)}`).join('|')
    const res = await fetch(`${ELEVATION_API}?locations=${locations}`, {
      headers: { 'User-Agent': 'f1-sim track builder' },
    })
    if (!res.ok) throw new Error(`высоты: сервис ответил ${res.status}`)
    const data = await res.json() as { results?: { elevation: number | null }[] }
    for (const r of data.results ?? []) out.push(r.elevation ?? 0)
    if (i + ELEVATION_BATCH < points.length) {
      await new Promise((resolve) => setTimeout(resolve, 1100))
    }
  }
  return out
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

  const raw = await fetchCenterline(circuit.source, circuit.excludeWayNames, circuit.officialLengthM)
  const centerline = smooth(toMeters(raw), 2)

  console.log('высоты: запрашиваю рельеф по', raw.length, 'точкам…')
  const elevationsM = relativeElevations(smoothElevations(await fetchElevations(raw), 3))
  console.log(`перепад высот: ${Math.max(...elevationsM).toFixed(1)} м`)

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
    elevationsM,
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

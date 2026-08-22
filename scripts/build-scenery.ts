import { writeFileSync } from 'node:fs'
import type { TrackPoint } from '../src/track/schema'
import {
  CIRCUITS, fetchCenterline, originOf, toMeters, type LatLon,
} from './build-track'

/**
 * Окружение трассы из OSM: трибуны и лес. Пишет
 * public/tracks/<id>-scenery.json в местной системе координат трассы —
 * той же, в которой собрана осевая (общий origin по fetchCenterline).
 */

const OVERPASS = 'https://overpass-api.de/api/interpreter'

/** Дальше этого от осевой ничего не берём: с трассы всё равно не видно. */
const STANDS_MAX_M = 500
const FOREST_MAX_M = 800
/** Узлы чаще этого прореживаются: контуру леса сантиметровая точность не нужна. */
const THIN_STEP_M = 10

type OsmWay = { id: number; tags?: Record<string, string>; geometry: LatLon[] }

async function fetchScenery(bbox: string): Promise<OsmWay[]> {
  const query = `[out:json][timeout:120];
(
  way["building"="grandstand"](${bbox});
  way["natural"="wood"](${bbox});
  way["landuse"="forest"](${bbox});
);
out geom qt;`
  const res = await fetch(OVERPASS, {
    method: 'POST',
    headers: { 'User-Agent': 'f1-sim-build-scenery/1.0' },
    body: query,
  })
  if (!res.ok) throw new Error(`Overpass ответил ${res.status}`)
  const body = await res.text()
  if (body.trimStart().startsWith('<')) {
    throw new Error('Overpass вернул HTML вместо JSON — перегружен, повторить через 30 с')
  }
  const data = JSON.parse(body) as { elements: OsmWay[] }
  return data.elements.filter((w) => Array.isArray(w.geometry) && w.geometry.length > 1)
}

function thin(points: TrackPoint[], stepM: number): TrackPoint[] {
  const out: TrackPoint[] = [points[0]]
  for (const p of points.slice(1)) {
    const last = out[out.length - 1]
    if (Math.hypot(p.x - last.x, p.z - last.z) >= stepM) out.push(p)
  }
  return out
}

function distanceToCenterline(x: number, z: number, cl: TrackPoint[]): number {
  let best = Infinity
  for (let i = 0; i < cl.length; i++) {
    const a = cl[i]
    const b = cl[(i + 1) % cl.length]
    const dx = b.x - a.x
    const dz = b.z - a.z
    const lengthSq = dx * dx + dz * dz || 1
    const t = Math.max(0, Math.min(1, ((x - a.x) * dx + (z - a.z) * dz) / lengthSq))
    best = Math.min(best, Math.hypot(x - (a.x + t * dx), z - (a.z + t * dz)))
  }
  return best
}

async function main(): Promise<void> {
  const id = process.argv[2]
  const circuit = CIRCUITS[id]
  if (!circuit) throw new Error(`неизвестная трасса: ${id}. Есть: ${Object.keys(CIRCUITS).join(', ')}`)

  const raw = await fetchCenterline(circuit.source, circuit.excludeWayNames, circuit.officialLengthM)
  const origin = originOf(raw)
  const centerline = toMeters(raw, origin)

  const pad = 0.01 // ~1 км: пояс вокруг трассы
  const lats = raw.map((p) => p.lat)
  const lons = raw.map((p) => p.lon)
  const bbox = [
    Math.min(...lats) - pad, Math.min(...lons) - pad,
    Math.max(...lats) + pad, Math.max(...lons) + pad,
  ].map((v) => v.toFixed(5)).join(',')

  console.log('окружение: запрашиваю Overpass…')
  const ways = await fetchScenery(bbox)
  console.log(`получено участков: ${ways.length}`)

  const grandstands: [number, number][][] = []
  const forests: [number, number][][] = []

  for (const w of ways) {
    const tags = w.tags ?? {}
    const local = thin(toMeters(w.geometry, origin), THIN_STEP_M)
    if (local.length < 2) continue

    if (tags.building === 'grandstand') {
      const cx = local.reduce((s, p) => s + p.x, 0) / local.length
      const cz = local.reduce((s, p) => s + p.z, 0) / local.length
      if (distanceToCenterline(cx, cz, centerline) <= STANDS_MAX_M) {
        grandstands.push(local.map((p) => [round(p.x), round(p.z)]))
      }
    } else if (tags.natural === 'wood' || tags.landuse === 'forest') {
      if (local.some((p) => distanceToCenterline(p.x, p.z, centerline) <= FOREST_MAX_M)) {
        forests.push(local.map((p) => [round(p.x), round(p.z)]))
      }
    }
  }

  console.log(`трибун: ${grandstands.length}, лесов: ${forests.length}`)
  const path = `public/tracks/${circuit.id}-scenery.json`
  writeFileSync(path, JSON.stringify({ grandstands, forests }))
  console.log(`записано ${path}`)
}

function round(v: number): number {
  return Math.round(v * 10) / 10
}

main()

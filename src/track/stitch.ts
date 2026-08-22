export type LatLon = { lat: number; lon: number }
export type StitchWay = { name: string; geometry: LatLon[] }

const LENGTH_TOLERANCE = 0.05
/** Разрывы в данных OSM до этой длины перекрываются прямым отрезком. */
const BRIDGE_MAX_M = 30
/** Мостов на круг — не больше двух: длиннее цепочка склеек — это уже не трасса. */
const BRIDGE_LIMIT = 2

/**
 * Сшивает участки OSM в замкнутый контур длиной около официальной.
 *
 * Жадная сшивка голова-к-хвосту здесь не работает: в отношениях OSM рядом с
 * боевым кругом лежат пит-лейн и его выезды, на развилках первый попавшийся
 * участок уводит в тупик. Поэтому поиск с возвратом: на развилке пробуются все
 * ветки, лишние участки разрешено не использовать, а замыкание засчитывается
 * только при совпадении длины с официальной — иначе за трассу можно принять
 * малый паразитный контур из двух параллельных проезжих частей.
 */
export function stitchLoop(
  ways: StitchWay[],
  officialLengthM: number,
  tolerance = LENGTH_TOLERANCE,
): LatLon[] {
  const usable = splitAtJunctions(ways.filter((w) => w.geometry.length > 1))
  if (usable.length === 0) throw new Error('нет участков с геометрией')

  const minLength = officialLengthM * (1 - tolerance)
  const maxLength = officialLengthM * (1 + tolerance)
  const lengths = usable.map((w) => wayLengthM(w.geometry))

  const used = new Array<boolean>(usable.length).fill(false)

  function extend(
    path: LatLon[], startKey: string, lengthSoFar: number, bridgesLeft: number,
  ): LatLon[] | null {
    const tip = path[path.length - 1]
    const tailKey = nodeKey(tip)
    if (tailKey === startKey && path.length > 2) {
      if (lengthSoFar >= minLength && lengthSoFar <= maxLength) return path.slice(0, -1)
      return null
    }
    if (lengthSoFar > maxLength) return null

    for (let i = 0; i < usable.length; i++) {
      if (used[i]) continue
      const g = usable[i].geometry
      let tail: LatLon[] | null = null
      if (nodeKey(g[0]) === tailKey) tail = g.slice(1)
      else if (nodeKey(g[g.length - 1]) === tailKey) tail = g.slice(0, -1).reverse()
      if (tail === null) continue

      used[i] = true
      const found = extend(path.concat(tail), startKey, lengthSoFar + lengths[i], bridgesLeft)
      if (found !== null) return found
      used[i] = false
    }

    if (bridgesLeft === 0) return null
    // Прямого продолжения нет — ищем конец другого участка в паре десятков
    // метров: данные OSM рвутся, и без моста кольцо не собрать.
    for (let i = 0; i < usable.length; i++) {
      if (used[i]) continue
      const g = usable[i].geometry
      for (const forward of [g, g.slice().reverse()]) {
        const gap = distanceM(tip, forward[0])
        if (gap > BRIDGE_MAX_M) continue
        used[i] = true
        const found = extend(
          path.concat(forward), startKey,
          lengthSoFar + gap + lengths[i], bridgesLeft - 1,
        )
        if (found !== null) return found
        used[i] = false
      }
    }
    return null
  }

  for (let seed = 0; seed < usable.length; seed++) {
    const g = usable[seed].geometry
    used.fill(false)
    used[seed] = true
    const found = extend(g.slice(), nodeKey(g[0]), lengths[seed], BRIDGE_LIMIT)
    if (found !== null) return found
  }

  throw new Error(
    `осевая не замкнулась в контур ${officialLengthM} м ± ${tolerance * 100}% ` +
    `из ${usable.length} участков (${usable.map((w) => w.name).join(', ')})`,
  )
}

/**
 * Режет участки в точках, куда примыкают концы других участков: в OSM улица
 * часто размечена одним way сквозь перекрёсток, и без разреза кольцо через
 * такой перекрёсток не сшить — конец соседа упирается в середину way.
 */
function splitAtJunctions(ways: StitchWay[]): StitchWay[] {
  const endpoints = new Set<string>()
  for (const w of ways) {
    endpoints.add(nodeKey(w.geometry[0]))
    endpoints.add(nodeKey(w.geometry[w.geometry.length - 1]))
  }

  const out: StitchWay[] = []
  for (const w of ways) {
    let from = 0
    for (let i = 1; i < w.geometry.length - 1; i++) {
      if (endpoints.has(nodeKey(w.geometry[i]))) {
        out.push({ name: w.name, geometry: w.geometry.slice(from, i + 1) })
        from = i
      }
    }
    out.push(from === 0 ? w : { name: w.name, geometry: w.geometry.slice(from) })
  }
  return out
}

/** Координаты в OSM точны до ~1e-7 градуса; по этой строке узлы и сшиваются. */
function nodeKey(p: LatLon): string {
  return `${p.lat.toFixed(7)},${p.lon.toFixed(7)}`
}

function distanceM(a: LatLon, b: LatLon): number {
  const mPerDegLon = 111_320 * Math.cos((a.lat * Math.PI) / 180)
  return Math.hypot((b.lat - a.lat) * 111_320, (b.lon - a.lon) * mPerDegLon)
}

function wayLengthM(points: LatLon[]): number {
  let total = 0
  for (let i = 1; i < points.length; i++) {
    total += distanceM(points[i - 1], points[i])
  }
  return total
}

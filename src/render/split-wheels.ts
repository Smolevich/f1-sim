import * as THREE from 'three'

/** Цилиндр колеса в координатах модели: ось вдоль X, профиль в плоскости YZ. */
export type WheelVolume = {
  x: number
  y: number
  z: number
  halfWidth: number
  radius: number
}

export function insideWheel(
  point: { x: number; y: number; z: number },
  volume: WheelVolume,
): boolean {
  if (Math.abs(point.x - volume.x) > volume.halfWidth) return false
  return Math.hypot(point.y - volume.y, point.z - volume.z) <= volume.radius
}

/**
 * Треугольник уходит в колесо, только если внутри цилиндра все три вершины.
 * По одной вершине резались бы и края кузова, касающиеся арки, и в борту
 * оставались бы дыры.
 */
export function triangleInsideWheel(
  a: THREE.Vector3, b: THREE.Vector3, c: THREE.Vector3, volume: WheelVolume,
): boolean {
  return insideWheel(a, volume) && insideWheel(b, volume) && insideWheel(c, volume)
}

type SplitResult = {
  wheel: THREE.BufferGeometry | null
  body: THREE.BufferGeometry | null
}

/**
 * Делит геометрию на часть внутри цилиндра колеса и всё остальное.
 * Возвращает null для пустой половины, чтобы не плодить меши без треугольников.
 */
export function splitByWheel(
  geometry: THREE.BufferGeometry, volume: WheelVolume,
): SplitResult {
  const nonIndexed = geometry.index === null ? geometry : geometry.toNonIndexed()
  const position = nonIndexed.getAttribute('position')
  const normal = nonIndexed.getAttribute('normal')

  const wheelPos: number[] = []
  const wheelNorm: number[] = []
  const bodyPos: number[] = []
  const bodyNorm: number[] = []

  const a = new THREE.Vector3()
  const b = new THREE.Vector3()
  const c = new THREE.Vector3()

  for (let i = 0; i < position.count; i += 3) {
    a.fromBufferAttribute(position, i)
    b.fromBufferAttribute(position, i + 1)
    c.fromBufferAttribute(position, i + 2)
    const target = triangleInsideWheel(a, b, c, volume) ? wheelPos : bodyPos
    const targetNorm = target === wheelPos ? wheelNorm : bodyNorm
    for (let k = 0; k < 3; k += 1) {
      target.push(position.getX(i + k), position.getY(i + k), position.getZ(i + k))
      if (normal !== undefined) {
        targetNorm.push(normal.getX(i + k), normal.getY(i + k), normal.getZ(i + k))
      }
    }
  }

  const build = (pos: number[], norm: number[]): THREE.BufferGeometry | null => {
    if (pos.length === 0) return null
    const out = new THREE.BufferGeometry()
    out.setAttribute('position', new THREE.Float32BufferAttribute(pos, 3))
    if (norm.length === pos.length) {
      out.setAttribute('normal', new THREE.Float32BufferAttribute(norm, 3))
    } else {
      out.computeVertexNormals()
    }
    return out
  }

  return { wheel: build(wheelPos, wheelNorm), body: build(bodyPos, bodyNorm) }
}

/**
 * Доля вершин геометрии, попавших в цилиндр. Меши, целиком лежащие в колесе
 * (обод, суппорт, рычаги), отдаются ступице как есть: резать их по
 * треугольникам незачем, а по краю реза у них оставались бы обрезки.
 */
export function fractionInsideWheel(
  geometry: THREE.BufferGeometry, volume: WheelVolume,
): number {
  const position = geometry.getAttribute('position')
  if (position === undefined || position.count === 0) return 0
  let inside = 0
  const point = new THREE.Vector3()
  for (let i = 0; i < position.count; i += 1) {
    point.fromBufferAttribute(position, i)
    if (insideWheel(point, volume)) inside += 1
  }
  return inside / position.count
}

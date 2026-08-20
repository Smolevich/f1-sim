import * as THREE from 'three'

/**
 * Гладкие поверхности болида.
 *
 * Прошлая попытка дала 3470 треугольников: 12 сечений по 12 точек с плоскими
 * гранями между ними. Борта выходили фасеточными, свет скакал по плоскостям,
 * и модель проигрывала готовой (49 000 треугольников).
 *
 * Здесь сечения задаются опорными точками, а между ними геометрия строится
 * по сплайну — и вдоль машины, и по контуру сечения. Плотность задаётся
 * числами, поэтому гладкость можно поднимать, не переписывая обводы.
 */

/** Опорное сечение: полуширина и вертикальные границы на своей позиции Z. */
export type Keyframe = { z: number; halfWidth: number; top: number; bottom: number }

/** Шагов вдоль машины и точек по контуру: 64 x 40 даёт около 5000 треугольников. */
export const LENGTH_STEPS = 64
export const RING_STEPS = 40

/**
 * Контур сечения: суперэллипс. Показатель 2 даёт эллипс, больше — форму,
 * приближающуюся к прямоугольнику со скруглёнными кромками. У болида борта
 * плоские, а верх и низ закруглены, поэтому 2.8.
 */
const CONTOUR_EXPONENT = 2.8

export function contourPoint(
  angle: number, halfWidth: number, top: number, bottom: number,
): { y: number; x: number } {
  const cy = (top + bottom) / 2
  const ry = (top - bottom) / 2
  const c = Math.cos(angle)
  const s = Math.sin(angle)
  const p = 2 / CONTOUR_EXPONENT
  return {
    x: halfWidth * Math.sign(c) * Math.abs(c) ** p,
    y: cy + ry * Math.sign(s) * Math.abs(s) ** p,
  }
}

/**
 * Сплайн по опорным сечениям: возвращает функцию, дающую сечение на любом Z.
 * Catmull-Rom — интерполяция проходит через сами опорные точки, поэтому
 * заданные обводы не «уплывают».
 */
export function sectionSpline(keys: readonly Keyframe[]): (t: number) => Keyframe {
  const zs = new THREE.CatmullRomCurve3(keys.map((k) => new THREE.Vector3(k.z, 0, 0)))
  const widths = new THREE.CatmullRomCurve3(keys.map((k) => new THREE.Vector3(k.halfWidth, 0, 0)))
  const tops = new THREE.CatmullRomCurve3(keys.map((k) => new THREE.Vector3(k.top, 0, 0)))
  const bottoms = new THREE.CatmullRomCurve3(keys.map((k) => new THREE.Vector3(k.bottom, 0, 0)))

  return (t: number) => {
    const clamped = Math.max(0, Math.min(1, t))
    return {
      z: zs.getPoint(clamped).x,
      halfWidth: Math.max(0.004, widths.getPoint(clamped).x),
      top: tops.getPoint(clamped).x,
      bottom: bottoms.getPoint(clamped).x,
    }
  }
}

/**
 * Оболочка по сплайну. Нормали считаются по смежным треугольникам, поэтому
 * поверхность выходит гладкой без ручной сшивки.
 */
export function buildSurface(
  keys: readonly Keyframe[], lengthSteps = LENGTH_STEPS, ringSteps = RING_STEPS,
): THREE.BufferGeometry {
  const at = sectionSpline(keys)
  const rings: { z: number; pts: { x: number; y: number }[] }[] = []

  for (let i = 0; i <= lengthSteps; i += 1) {
    const section = at(i / lengthSteps)
    const pts: { x: number; y: number }[] = []
    for (let k = 0; k < ringSteps; k += 1) {
      const angle = (k / ringSteps) * Math.PI * 2
      pts.push(contourPoint(angle, section.halfWidth, section.top, section.bottom))
    }
    rings.push({ z: section.z, pts })
  }

  const positions: number[] = []
  const put = (p: { x: number; y: number }, z: number): void => {
    positions.push(p.x, p.y, z)
  }

  for (let i = 0; i < rings.length - 1; i += 1) {
    const a = rings[i]
    const b = rings[i + 1]
    for (let k = 0; k < ringSteps; k += 1) {
      const n = (k + 1) % ringSteps
      put(a.pts[k], a.z); put(b.pts[k], b.z); put(b.pts[n], b.z)
      put(a.pts[k], a.z); put(b.pts[n], b.z); put(a.pts[n], a.z)
    }
  }

  // Носовая и кормовая заглушки веером от центра.
  for (const [ring, outward] of [[rings[0], 1], [rings[rings.length - 1], -1]] as const) {
    const cy = ring.pts.reduce((s, p) => s + p.y, 0) / ring.pts.length
    for (let k = 0; k < ringSteps; k += 1) {
      const n = (k + 1) % ringSteps
      const first = outward > 0 ? ring.pts[k] : ring.pts[n]
      const second = outward > 0 ? ring.pts[n] : ring.pts[k]
      positions.push(0, cy, ring.z)
      put(first, ring.z)
      put(second, ring.z)
    }
  }

  const geometry = new THREE.BufferGeometry()
  geometry.setAttribute('position', new THREE.Float32BufferAttribute(positions, 3))
  geometry.computeVertexNormals()
  return geometry
}

/** Число треугольников оболочки — по нему тесты проверяют плотность сетки. */
export function surfaceTriangles(lengthSteps: number, ringSteps: number): number {
  return lengthSteps * ringSteps * 2 + ringSteps * 2
}

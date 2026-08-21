import * as THREE from 'three'
import type { Track } from '../track/schema'

/**
 * Ориентиры скорости вдоль полотна.
 *
 * Ближайший объект сцены стоял в 21 м от края трассы: на 300 км/ч он смещается
 * всего на 18°/с, и глазу не за что зацепиться — отсюда ощущение, что болид
 * парит, а не едет. Скорость читается по объектам в 1-3 метрах: они проходят
 * мимо десятками в секунду, и мозг наконец получает шкалу.
 *
 * Ставятся столбики за кромкой и штрихи разметки по обочине.
 */

/** Столбик стоит сразу за кромкой асфальта. */
const POST_OFFSET_M = 1.4
/** Шаг между столбиками: 14 м даёт 6 столбиков в секунду на 300 км/ч. */
const POST_STEP_M = 14
const POST_HEIGHT_M = 0.62
const POST_WIDTH_M = 0.09

/**
 * Штрихи разметки. Шаг 6 м — 14 штрихов в секунду на 300 км/ч: именно такая
 * частота и читается как скорость. Ряд по осевой проходит прямо под болидом.
 */
const DASH_STEP_M = 6
const DASH_LENGTH_M = 2.6

/** Средний шаг точек осевой: трассы приходят с разной плотностью. */
export function averageSpacing(track: Track): number {
  const cl = track.centerline
  if (cl.length < 2) return 1
  let total = 0
  for (let i = 0; i < cl.length; i += 1) {
    const a = cl[i]
    const b = cl[(i + 1) % cl.length]
    total += Math.hypot(b.x - a.x, b.z - a.z)
  }
  return total / cl.length
}

/** Нормаль к направлению движения в точке i. */
export function normalAt(track: Track, index: number): { nx: number; nz: number } {
  const cl = track.centerline
  const here = cl[index % cl.length]
  const next = cl[(index + 1) % cl.length]
  const heading = Math.atan2(next.x - here.x, next.z - here.z)
  return { nx: Math.cos(heading), nz: -Math.sin(heading) }
}

export type Marker = { x: number; z: number; heading: number }

/**
 * Точки для ряда объектов вдоль трассы на заданном отступе от осевой.
 * Отступ отрицательный для левой стороны.
 *
 * Шаг задаётся в метрах пути и выдерживается интерполяцией между точками
 * осевой: у Монцы они идут через 20 м, и ряд по самим точкам не может быть
 * плотнее — а разметке нужен шаг 9 м, иначе она не мелькает.
 */
export function rowSlots(track: Track, stepM: number, offsetM: number): Marker[] {
  const cl = track.centerline
  const slots: Marker[] = []
  const step = Math.max(0.5, stepM)
  let carry = 0

  for (let i = 0; i < cl.length; i += 1) {
    const here = cl[i]
    const next = cl[(i + 1) % cl.length]
    const dx = next.x - here.x
    const dz = next.z - here.z
    const segment = Math.hypot(dx, dz)
    if (segment < 1e-6) continue

    const heading = Math.atan2(dx, dz)
    const { nx, nz } = normalAt(track, i)

    // Идём по сегменту с нужным шагом, продолжая счёт с прошлого сегмента.
    for (let t = carry; t < segment; t += step) {
      const f = t / segment
      slots.push({
        x: here.x + dx * f + nx * offsetM,
        z: here.z + dz * f + nz * offsetM,
        heading,
      })
    }
    carry = (carry - segment) % step
    if (carry < 0) carry += step
  }
  return slots
}

function instanced(
  geometry: THREE.BufferGeometry, material: THREE.Material, slots: Marker[], y: number,
): THREE.InstancedMesh {
  const mesh = new THREE.InstancedMesh(geometry, material, slots.length)
  const matrix = new THREE.Matrix4()
  const quat = new THREE.Quaternion()
  const euler = new THREE.Euler()
  const pos = new THREE.Vector3()
  const one = new THREE.Vector3(1, 1, 1)
  slots.forEach((s, i) => {
    euler.set(0, s.heading, 0)
    quat.setFromEuler(euler)
    pos.set(s.x, y, s.z)
    matrix.compose(pos, quat, one)
    mesh.setMatrixAt(i, matrix)
  })
  mesh.instanceMatrix.needsUpdate = true
  return mesh
}

/**
 * Столбики и штрихи по обеим сторонам полотна.
 * Всё через InstancedMesh: объектов тысячи, вызовов отрисовки — единицы.
 */
export function buildSpeedCues(track: Track): THREE.Group {
  const group = new THREE.Group()
  const half = track.widthM / 2

  const postGeom = new THREE.BoxGeometry(POST_WIDTH_M, POST_HEIGHT_M, POST_WIDTH_M)
  const postMat = new THREE.MeshStandardMaterial({ color: 0xf2f4f7, roughness: 0.7 })
  const capMat = new THREE.MeshStandardMaterial({ color: 0xd8232a, roughness: 0.6 })
  const capGeom = new THREE.BoxGeometry(POST_WIDTH_M * 1.05, POST_HEIGHT_M * 0.22, POST_WIDTH_M * 1.05)

  const dashGeom = new THREE.PlaneGeometry(0.14, DASH_LENGTH_M)
  dashGeom.rotateX(-Math.PI / 2)
  const dashMat = new THREE.MeshStandardMaterial({
    color: 0xe8ecf2, roughness: 0.85,
    // Разметка лежит на асфальте: polygonOffset не даёт ей мерцать сквозь него.
    polygonOffset: true, polygonOffsetFactor: -2, polygonOffsetUnits: -2,
  })

  for (const side of [-1, 1] as const) {
    const posts = rowSlots(track, POST_STEP_M, side * (half + POST_OFFSET_M))
    group.add(instanced(postGeom, postMat, posts, POST_HEIGHT_M / 2))
    group.add(instanced(capGeom, capMat, posts, POST_HEIGHT_M * 0.89))

    const dashes = rowSlots(track, DASH_STEP_M, side * (half - 0.35))
    group.add(instanced(dashGeom, dashMat, dashes, 0.02))
  }

  // Осевая разметка: проходит под самим болидом, ближе неё ничего нет.
  const centre = rowSlots(track, DASH_STEP_M * 1.6, 0)
  const centreGeom = new THREE.PlaneGeometry(0.12, DASH_LENGTH_M * 1.3)
  centreGeom.rotateX(-Math.PI / 2)
  group.add(instanced(centreGeom, dashMat, centre, 0.02))

  return group
}

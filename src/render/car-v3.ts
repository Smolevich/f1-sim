import * as THREE from 'three'
import { buildSurface } from './car-surface'
import type { Keyframe } from './car-surface'
import { buildWheel, FRONT_WHEEL, REAR_WHEEL } from './wheel-mesh'
import type { CarParts } from './car'

/**
 * Болид на гладких поверхностях.
 *
 * Каждый узел — своя оболочка по сплайну, а не коробка: монокок, понтоны,
 * нос, крышка двигателя. Плоские детали (антикрылья, пластины) остаются
 * коробками — они и в жизни плоские.
 */

const HALF_TRACK = 0.79
const FRONT_AXLE = 1.8
const REAR_AXLE = -1.8
const WHEEL_R = 0.36

/** Монокок: от кончика носа до кормы. */
const MONOCOQUE: Keyframe[] = [
  { z: 2.62, halfWidth: 0.045, top: 0.26, bottom: 0.19 },
  { z: 2.30, halfWidth: 0.075, top: 0.29, bottom: 0.17 },
  { z: 1.85, halfWidth: 0.135, top: 0.33, bottom: 0.13 },
  { z: 1.35, halfWidth: 0.215, top: 0.40, bottom: 0.10 },
  { z: 0.85, halfWidth: 0.285, top: 0.50, bottom: 0.08 },
  { z: 0.35, halfWidth: 0.325, top: 0.60, bottom: 0.07 },
  { z: -0.10, halfWidth: 0.335, top: 0.66, bottom: 0.07 },
  { z: -0.60, halfWidth: 0.315, top: 0.62, bottom: 0.07 },
  { z: -1.15, halfWidth: 0.265, top: 0.54, bottom: 0.08 },
  { z: -1.70, halfWidth: 0.195, top: 0.46, bottom: 0.10 },
  { z: -2.20, halfWidth: 0.135, top: 0.40, bottom: 0.13 },
  { z: -2.55, halfWidth: 0.085, top: 0.36, bottom: 0.16 },
]

/**
 * Понтон: обтекаемое тело по борту. Верх на уровне борта монокока, низ у
 * днища — иначе понтон висит отдельным батоном ниже кузова.
 */
function sidepodKeys(): Keyframe[] {
  const c = (z: number, halfWidth: number, top: number, bottom: number): Keyframe =>
    ({ z, halfWidth, top, bottom })
  return [
    c(1.05, 0.06, 0.40, 0.12),
    c(0.85, 0.20, 0.52, 0.09),
    c(0.40, 0.24, 0.55, 0.08),
    c(-0.15, 0.23, 0.53, 0.08),
    c(-0.70, 0.17, 0.45, 0.09),
    c(-1.20, 0.09, 0.34, 0.11),
    c(-1.50, 0.03, 0.28, 0.13),
  ]
}

/** Крышка двигателя с воздухозаборником над кокпитом. */
const ENGINE_COVER: Keyframe[] = [
  { z: 0.30, halfWidth: 0.10, top: 0.72, bottom: 0.56 },
  { z: 0.05, halfWidth: 0.15, top: 0.92, bottom: 0.58 },
  { z: -0.35, halfWidth: 0.16, top: 0.88, bottom: 0.56 },
  { z: -0.95, halfWidth: 0.13, top: 0.74, bottom: 0.52 },
  { z: -1.55, halfWidth: 0.09, top: 0.60, bottom: 0.46 },
  { z: -2.05, halfWidth: 0.05, top: 0.52, bottom: 0.44 },
]

export function buildCarV3(livery: number, accent: number): CarParts {
  const group = new THREE.Group()

  const body = new THREE.MeshStandardMaterial({
    color: livery, metalness: 0.4, roughness: 0.32,
  })
  const carbon = new THREE.MeshStandardMaterial({
    color: 0x1d1f24, metalness: 0.35, roughness: 0.48,
  })
  const dark = new THREE.MeshStandardMaterial({
    color: 0x101216, metalness: 0.2, roughness: 0.72,
  })
  const trim = new THREE.MeshStandardMaterial({
    color: accent, metalness: 0.48, roughness: 0.3,
  })

  const add = (g: THREE.BufferGeometry, m: THREE.Material): void => {
    const mesh = new THREE.Mesh(g, m)
    mesh.castShadow = true
    group.add(mesh)
  }

  add(buildSurface(MONOCOQUE), body)
  add(buildSurface(ENGINE_COVER, 40, 28), body)

  // Понтон прирастает к борту монокока: смещение равно полуширине кузова в
  // этой зоне минус перекрытие, чтобы поверхности сливались.
  for (const side of [-1, 1] as const) {
    const pod = buildSurface(sidepodKeys(), 44, 28)
    pod.translate(side * 0.30, 0, 0)
    add(pod, body)
  }

  // Днище: плоская пластина, у болида она и есть плоская.
  const floor = new THREE.BoxGeometry(1.28, 0.03, 3.5)
  floor.translate(0, 0.055, -0.25)
  add(floor, dark)

  // Переднее антикрыло: четыре элемента с нарастающим углом.
  for (let i = 0; i < 4; i += 1) {
    const t = i / 3
    const el = new THREE.BoxGeometry(1.86, 0.020, 0.15)
    el.rotateX(-0.14 - t * 0.30)
    el.translate(0, 0.12 + t * 0.07, 2.52 - t * 0.13)
    add(el, carbon)
  }
  for (const side of [-1, 1] as const) {
    const plate = new THREE.BoxGeometry(0.022, 0.34, 0.56)
    plate.translate(side * 0.94, 0.26, 2.44)
    add(plate, trim)
  }

  // Пилоны носа.
  for (const side of [-1, 1] as const) {
    const pylon = new THREE.BoxGeometry(0.032, 0.18, 0.40)
    pylon.rotateX(-0.5)
    pylon.translate(side * 0.11, 0.20, 2.30)
    add(pylon, carbon)
  }

  // Заднее антикрыло с закрылком и пластинами.
  const main = new THREE.BoxGeometry(1.04, 0.026, 0.34)
  main.rotateX(-0.22)
  main.translate(0, 0.82, -2.42)
  add(main, carbon)
  const flap = new THREE.BoxGeometry(1.04, 0.022, 0.19)
  flap.rotateX(-0.52)
  flap.translate(0, 0.95, -2.50)
  add(flap, carbon)
  for (const side of [-1, 1] as const) {
    const plate = new THREE.BoxGeometry(0.024, 0.46, 0.60)
    plate.translate(side * 0.52, 0.76, -2.44)
    add(plate, trim)
  }
  // Стойки крыла.
  for (const side of [-1, 1] as const) {
    const strut = new THREE.BoxGeometry(0.03, 0.32, 0.10)
    strut.translate(side * 0.14, 0.64, -2.40)
    add(strut, carbon)
  }

  // Диффузор.
  const diffuser = new THREE.BoxGeometry(1.04, 0.22, 0.60)
  diffuser.rotateX(0.32)
  diffuser.translate(0, 0.17, -2.10)
  add(diffuser, dark)

  // Halo.
  const halo = new THREE.TorusGeometry(0.40, 0.030, 10, 28, Math.PI)
  halo.rotateY(Math.PI / 2)
  halo.rotateZ(Math.PI / 2)
  halo.translate(0, 0.72, 0.42)
  add(halo, carbon)
  const haloPillar = new THREE.CylinderGeometry(0.030, 0.030, 0.26, 10)
  haloPillar.rotateX(0.32)
  haloPillar.translate(0, 0.62, 0.84)
  add(haloPillar, carbon)

  // Обод кокпита.
  const rim = new THREE.TorusGeometry(0.24, 0.028, 8, 22)
  rim.rotateX(Math.PI / 2)
  rim.scale(1, 1, 1.5)
  rim.translate(0, 0.66, 0.50)
  add(rim, carbon)

  // Зеркала.
  for (const side of [-1, 1] as const) {
    const stalk = new THREE.BoxGeometry(0.14, 0.020, 0.028)
    stalk.translate(side * 0.34, 0.58, 0.58)
    add(stalk, carbon)
    const glass = new THREE.BoxGeometry(0.04, 0.07, 0.09)
    glass.translate(side * 0.42, 0.60, 0.58)
    add(glass, carbon)
  }

  // Обтекатели колёс регламента 2022.
  for (const [z, width] of [[FRONT_AXLE, 0.34], [REAR_AXLE, 0.44]] as const) {
    for (const side of [-1, 1] as const) {
      const arc = new THREE.TorusGeometry(WHEEL_R * 1.08, 0.026, 8, 18, Math.PI * 0.6)
      arc.rotateY(Math.PI / 2)
      arc.rotateZ(Math.PI * 0.20)
      arc.translate(side * HALF_TRACK, WHEEL_R, z)
      add(arc, body)
      const fin = new THREE.BoxGeometry(width, 0.026, 0.18)
      fin.translate(side * HALF_TRACK, WHEEL_R * 1.94, z - 0.05)
      add(fin, body)
    }
  }

  // Выхлоп.
  const pipe = new THREE.CylinderGeometry(0.042, 0.052, 0.20, 12)
  pipe.rotateX(Math.PI / 2)
  pipe.translate(0, 0.50, -2.52)
  add(pipe, carbon)

  const wheels: THREE.Object3D[] = []
  const steered: THREE.Object3D[] = []
  for (const corner of [
    { x: -1, z: FRONT_AXLE, steered: true },
    { x: 1, z: FRONT_AXLE, steered: true },
    { x: -1, z: REAR_AXLE, steered: false },
    { x: 1, z: REAR_AXLE, steered: false },
  ] as const) {
    const hub = new THREE.Group()
    hub.position.set(corner.x * HALF_TRACK, WHEEL_R, corner.z)
    const wheel = buildWheel(corner.steered ? FRONT_WHEEL : REAR_WHEEL)
    wheel.traverse((n) => { n.castShadow = true })
    hub.add(wheel)
    group.add(hub)
    // Вращение и руль на разных узлах, иначе колесо ходит восьмёркой.
    wheels.push(wheel)
    if (corner.steered) steered.push(hub)
  }

  return { group, wheels, steered }
}

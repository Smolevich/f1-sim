import * as THREE from 'three'
import { GLTFLoader } from 'three/examples/jsm/loaders/GLTFLoader.js'
import type { CarParts } from './car'
import { buildWheel, FRONT_WHEEL, REAR_WHEEL } from './wheel-mesh'

const MODEL_URL = '/models/f1-car.glb'

/**
 * Замеры исходной модели в её собственных единицах (см. docs/assets.md).
 * Машина лежит вдоль Z носом на +Z, ось симметрии на X = 0.645, днище на Y = -0.011.
 */
const MODEL_AXIS_X = 0.645
const MODEL_FLOOR_Y = -0.011
const MODEL_FRONT_AXLE_Z = 1.18
const MODEL_REAR_AXLE_Z = -1.85
const MODEL_WHEELBASE = MODEL_FRONT_AXLE_Z - MODEL_REAR_AXLE_Z
const MODEL_AXLE_Y = 0.33
export const MODEL_HALF_TRACK = (1.19 - 0.10) / 2

/**
 * Масштаб берётся по колёсной базе, а не по длине: физика ставит колёса на
 * ±1.8 м, и подгонка по длине (5.63 м) развела бы их на 3.83 м. Длина при
 * этом выходит 5.30 м вместо 5.63 — в пределах разброса реальных машин.
 */
const PHYSICS_WHEELBASE_M = 3.6
export const SCALE = PHYSICS_WHEELBASE_M / MODEL_WHEELBASE

/**
 * Ширина ужимается отдельно: масштаб по базе растягивает и поперечник, и
 * модель выходит 2.12 м против регламентных 2.00.
 */
export const BODY_WIDTH_SQUEEZE = 2.0 / 2.117

/** Полуколея рендера: колёса стоят в нишах самой модели. */
export const RENDER_HALF_TRACK_M = MODEL_HALF_TRACK * SCALE * BODY_WIDTH_SQUEEZE

/**
 * Полые кольца на месте колёс.
 *
 * Покрышек в этой геометрии нет — она из CFD-расчёта, резину снимали для
 * продувки. На месте колёс остались только тормозные диски (плоские, 2 см
 * толщиной) и незамкнутые обтекатели, которые без покрышки внутри читаются
 * как два разъехавшихся обода. Их прячем, а колёса строим сами.
 */
// Диск 0.02 толщиной, обтекатель 0.204 — оба тоньше построенной покрышки
// (0.305 спереди), поэтому порог берётся по её ширине.
const HOLLOW_RING_MAX_THICKNESS = 0.25
const HOLLOW_RING_MIN_DIAMETER = 0.38

export type Corner = { x: number; z: number; steered: boolean }

export const CORNERS: readonly Corner[] = [
  { x: -1, z: MODEL_FRONT_AXLE_Z, steered: true },
  { x: 1, z: MODEL_FRONT_AXLE_Z, steered: true },
  { x: -1, z: MODEL_REAR_AXLE_Z, steered: false },
  { x: 1, z: MODEL_REAR_AXLE_Z, steered: false },
]

/** Ось колеса в координатах модели. */
export function wheelAxle(corner: Corner): { x: number; y: number; z: number } {
  return {
    x: MODEL_AXIS_X + corner.x * MODEL_HALF_TRACK,
    y: MODEL_AXLE_Y,
    z: corner.z,
  }
}

/**
 * Плоский диск или незамкнутое кольцо на месте колеса: тонкое по оси машины
 * и крупное в профиле. Деталей кузова такой формы у болида нет.
 */
export function isHollowWheelRing(size: THREE.Vector3, centre: THREE.Vector3): boolean {
  if (size.x > HOLLOW_RING_MAX_THICKNESS) return false
  const diameter = (size.y + size.z) / 2
  if (diameter < HOLLOW_RING_MIN_DIAMETER) return false
  const round = Math.abs(size.y - size.z) / Math.max(size.y, size.z) < 0.35
  const offAxis = Math.abs(centre.x - MODEL_AXIS_X) > 0.3
  return round && offAxis
}

export type LoadedCar = CarParts & { bodyMaterials: THREE.MeshStandardMaterial[] }

/**
 * Грузит кузов болида и надевает на него построенные колёса.
 *
 * Кузов идёт из модели как есть: резать его не нужно и вредно — колёс в этой
 * геометрии нет, а попытка вырезать их цилиндрами уносила куски бортов.
 */
export async function loadF1Model(colour: number): Promise<LoadedCar> {
  const gltf = await new GLTFLoader().loadAsync(MODEL_URL)
  const source = gltf.scene
  source.updateMatrixWorld(true)

  const group = new THREE.Group()
  const wheels: THREE.Object3D[] = []
  const steered: THREE.Object3D[] = []

  const bodyMaterial = new THREE.MeshStandardMaterial({
    color: colour, metalness: 0.5, roughness: 0.35,
  })
  const bodyMaterials = [bodyMaterial]

  const size = new THREE.Vector3()
  const centre = new THREE.Vector3()
  source.traverse((node) => {
    const mesh = node as THREE.Mesh
    if (mesh.isMesh !== true) return
    mesh.geometry.computeBoundingBox()
    const box = mesh.geometry.boundingBox
    if (box !== null) {
      box.getSize(size)
      box.getCenter(centre)
      if (isHollowWheelRing(size, centre)) {
        mesh.visible = false
        return
      }
    }
    mesh.material = bodyMaterial
    mesh.castShadow = true
  })

  // Кузов: осевая на ноль, днище на ноль, ширина ужата, затем общий масштаб.
  source.position.set(-MODEL_AXIS_X, -MODEL_FLOOR_Y, 0)
  const bodyScaled = new THREE.Group()
  bodyScaled.scale.set(SCALE * BODY_WIDTH_SQUEEZE, SCALE, SCALE)
  bodyScaled.add(source)
  group.add(bodyScaled)

  for (const corner of CORNERS) {
    const hub = new THREE.Group()
    hub.position.set(
      corner.x * RENDER_HALF_TRACK_M,
      MODEL_AXLE_Y * SCALE,
      corner.z * SCALE,
    )
    const wheel = buildWheel(corner.steered ? FRONT_WHEEL : REAR_WHEEL)
    wheel.traverse((n) => { n.castShadow = true })
    hub.add(wheel)
    group.add(hub)
    wheels.push(hub)
    if (corner.steered) steered.push(hub)
  }

  return { group, wheels, steered, bodyMaterials }
}

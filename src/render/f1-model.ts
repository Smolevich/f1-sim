import * as THREE from 'three'
import { GLTFLoader } from 'three/examples/jsm/loaders/GLTFLoader.js'
import type { CarParts } from './car'
import { fractionInsideWheel, splitByWheel } from './split-wheels'
import type { WheelVolume } from './split-wheels'

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
 * ±1.8 м, и подгонка по длине (5.63 м) развела бы их на 3.83 м — колесо
 * рендера висело бы в 11 см от точки, где его держит подвеска. Длина при этом
 * выходит 5.30 м вместо 5.63; на глаз это в пределах разброса реальных машин,
 * а разъехавшиеся колёса читаются сразу.
 */
const PHYSICS_WHEELBASE_M = 3.6
export const SCALE = PHYSICS_WHEELBASE_M / MODEL_WHEELBASE

/**
 * Ширина ужимается отдельно: масштаб по базе растягивает и поперечник, и
 * модель выходит 2.12 м против регламентных 2.00.
 */
export const BODY_WIDTH_SQUEEZE = 2.0 / 2.117

/** Полуколея рендера: ступицы стоят по нишам самой модели, куда вписаны колёса. */
export const RENDER_HALF_TRACK_M = MODEL_HALF_TRACK * SCALE * BODY_WIDTH_SQUEEZE

/**
 * Цилиндр, по которому колесо вырезается из кузова.
 *
 * Радиус 0.34 — ровно расстояние от оси (Y = 0.33) до асфальта (Y = -0.011):
 * колесо обязано доставать до земли, иначе низ покрышки останется в кузове.
 *
 * По ширине колесо идёт от 1.15 до 1.52 при оси на 1.22, то есть цилиндр
 * смещён наружу. Внутрь его расширять нельзя: на радиусе колеса, но ближе к
 * осевой (x = 0.75..0.95) уже начинается кузов, и он ушёл бы в колесо.
 */
const WHEEL_CUT_RADIUS = 0.34
const WHEEL_CUT_INNER = 0.07
const WHEEL_CUT_OUTER = 0.30

/**
 * Обод и суппорт лежат отдельными мешами целиком в колесе, но выходят за
 * режущий цилиндр. Их проверяют этим, заведомо широким объёмом и отдают
 * ступице как есть: резать их незачем, а по краю реза оставались бы обрезки.
 *
 * Порог высокий (0.95) намеренно: рычаги подвески идут от монокока к колесу
 * и попадают в объём на две трети. При пороге 0.65 они уезжали во вращающееся
 * колесо целиком, растягивая его на полметра поперёк машины.
 */
const WHOLE_MESH_RADIUS = 0.55
const WHOLE_MESH_HALF_WIDTH = 0.35
const WHOLE_MESH_THRESHOLD = 0.95

export type Corner = { x: number; z: number; steered: boolean }

export const CORNERS: readonly Corner[] = [
  { x: -1, z: MODEL_FRONT_AXLE_Z, steered: true },
  { x: 1, z: MODEL_FRONT_AXLE_Z, steered: true },
  { x: -1, z: MODEL_REAR_AXLE_Z, steered: false },
  { x: 1, z: MODEL_REAR_AXLE_Z, steered: false },
]

/**
 * Цилиндр колеса в координатах модели. Он несимметричен относительно оси
 * колеса, поэтому центр сдвигается наружу, а halfWidth берётся по большей
 * из половин.
 */
export function wheelVolume(corner: Corner): WheelVolume {
  const axle = MODEL_AXIS_X + corner.x * MODEL_HALF_TRACK
  const shift = corner.x * (WHEEL_CUT_OUTER - WHEEL_CUT_INNER) / 2
  return {
    x: axle + shift,
    y: MODEL_AXLE_Y,
    z: corner.z,
    halfWidth: (WHEEL_CUT_OUTER + WHEEL_CUT_INNER) / 2,
    radius: WHEEL_CUT_RADIUS,
  }
}

/** Заведомо широкий объём: им проверяют, не принадлежит ли меш колесу целиком. */
export function wholeMeshVolume(corner: Corner): WheelVolume {
  return {
    x: MODEL_AXIS_X + corner.x * MODEL_HALF_TRACK,
    y: MODEL_AXLE_Y,
    z: corner.z,
    halfWidth: WHOLE_MESH_HALF_WIDTH,
    radius: WHOLE_MESH_RADIUS,
  }
}

/** Ось колеса в координатах модели: центр вращения, а не центр режущего цилиндра. */
export function wheelAxle(corner: Corner): { x: number; y: number; z: number } {
  return {
    x: MODEL_AXIS_X + corner.x * MODEL_HALF_TRACK,
    y: MODEL_AXLE_Y,
    z: corner.z,
  }
}

export type LoadedCar = CarParts & { bodyMaterials: THREE.MeshStandardMaterial[] }

/**
 * Грузит модель болида и разбирает её на кузов и четыре колеса.
 *
 * Колёса у этой геометрии вылеплены заодно с кузовом — отдельных мешей нет,
 * резина сидит внутри общего меша вместе с бортом. Поэтому каждый меш режется
 * по треугольникам: попавшие в цилиндр колеса уходят в свою ступицу, остальные
 * остаются кузовом. Отбор по bounding box здесь не работает — общий меш
 * покрывает всю машину и целиком уехал бы в одно колесо.
 */
export async function loadF1Model(colour: number): Promise<LoadedCar> {
  const gltf = await new GLTFLoader().loadAsync(MODEL_URL)

  const group = new THREE.Group()
  const wheels: THREE.Object3D[] = []
  const steered: THREE.Object3D[] = []
  const bodyMaterials: THREE.MeshStandardMaterial[] = []

  const bodyMaterial = new THREE.MeshStandardMaterial({
    color: colour, metalness: 0.5, roughness: 0.35,
  })
  bodyMaterials.push(bodyMaterial)

  // Резина: тёмная и матовая, чтобы колесо не блестело как кузов.
  const tyreMaterial = new THREE.MeshStandardMaterial({
    color: 0x1a1c22, metalness: 0.05, roughness: 0.92,
  })

  const volumes = CORNERS.map(wheelVolume)
  const wholeVolumes = CORNERS.map(wholeMeshVolume)

  const hubs = CORNERS.map((corner, index) => {
    const hub = new THREE.Group()
    hub.position.set(
      corner.x * RENDER_HALF_TRACK_M,
      MODEL_AXLE_Y * SCALE,
      corner.z * SCALE,
    )
    group.add(hub)
    wheels.push(hub)
    if (corner.steered) steered.push(hub)
    void index
    return hub
  })

  const meshes: THREE.Mesh[] = []
  gltf.scene.traverse((node) => {
    if ((node as THREE.Mesh).isMesh) meshes.push(node as THREE.Mesh)
  })

  const bodyGeometries: THREE.BufferGeometry[] = []
  const wheelGeometries: THREE.BufferGeometry[][] = CORNERS.map(() => [])

  for (const mesh of meshes) {
    const geometry = mesh.geometry.clone()
    geometry.applyMatrix4(mesh.matrixWorld)

    // Меш целиком в колесе уходит в ступицу без разреза.
    const whole = wholeVolumes.findIndex(
      (volume) => fractionInsideWheel(geometry, volume) >= WHOLE_MESH_THRESHOLD,
    )
    if (whole >= 0) {
      wheelGeometries[whole].push(geometry)
      continue
    }

    let remaining: THREE.BufferGeometry | null = geometry
    volumes.forEach((volume, index) => {
      if (remaining === null) return
      const { wheel, body } = splitByWheel(remaining, volume)
      if (wheel !== null) wheelGeometries[index].push(wheel)
      remaining = body
    })

    if (remaining !== null) bodyGeometries.push(remaining)
  }

  // Кузов: осевая на ноль, днище на ноль, ширина ужата, затем общий масштаб.
  const body = new THREE.Group()
  for (const geometry of bodyGeometries) {
    const mesh = new THREE.Mesh(geometry, bodyMaterial)
    mesh.castShadow = true
    body.add(mesh)
  }
  body.position.set(-MODEL_AXIS_X, -MODEL_FLOOR_Y, 0)
  const bodyScaled = new THREE.Group()
  bodyScaled.scale.set(SCALE * BODY_WIDTH_SQUEEZE, SCALE, SCALE)
  bodyScaled.add(body)
  group.add(bodyScaled)

  // Колёса: вершины заданы в координатах модели, поэтому внутри ступицы
  // сдвигаются на ОСЬ колеса — не на центр режущего цилиндра, который смещён
  // наружу и увёл бы колесо через всю машину на противоположный борт.
  wheelGeometries.forEach((geometries, index) => {
    const axle = wheelAxle(CORNERS[index])
    // Колесо центрируется по фактическому центру своих вершин, а не по
    // расчётной оси: ступица вращается вокруг нуля, и любое остаточное
    // смещение уносит колесо по орбите вместо вращения на месте.
    // Ось берётся по Y и Z (центр круга), по X — середина ширины колеса.
    const centre = new THREE.Box3()
    for (const geometry of geometries) {
      geometry.computeBoundingBox()
      if (geometry.boundingBox !== null) centre.union(geometry.boundingBox)
    }
    const pivot = centre.getCenter(new THREE.Vector3())
    void axle

    const holder = new THREE.Group()
    holder.scale.set(SCALE * BODY_WIDTH_SQUEEZE, SCALE, SCALE)
    for (const geometry of geometries) {
      geometry.translate(-pivot.x, -pivot.y, -pivot.z)
      const mesh = new THREE.Mesh(geometry, tyreMaterial)
      mesh.castShadow = true
      holder.add(mesh)
    }
    hubs[index].add(holder)
  })

  return { group, wheels, steered, bodyMaterials }
}

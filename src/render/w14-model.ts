import * as THREE from 'three'
import { DRACOLoader } from 'three/examples/jsm/loaders/DRACOLoader.js'
import { GLTFLoader } from 'three/examples/jsm/loaders/GLTFLoader.js'
import type { CarParts } from './car'

const MODEL_URL = `${import.meta.env.BASE_URL}models/w14.glb`
const DRACO_PATH = `${import.meta.env.BASE_URL}draco/`

/**
 * Загрузка модели болида W14 (CC-BY-4.0, автор 3dblenderlol).
 *
 * 232 тыс. треугольников против 16.5 тыс. у собственной геометрии: панели,
 * зазоры, покрышки с протектором, проработанные антикрылья. Колёса лежат
 * отдельными узлами (FL/FR/rear left/rear right), поэтому вращаются.
 */

/** Имена узлов колёс в модели. */
const FRONT_LEFT = 'FL_6'
const FRONT_RIGHT = 'FR_74'
// Подчёркивания, а не пробелы: three.js заменяет пробелы в именах узлов
// при загрузке, и поиск по исходному 'rear left_18' ничего не находит.
const REAR_LEFT = 'rear_left_18'
const REAR_RIGHT = 'rear_right_77'

/**
 * Материалы со спонсорскими логотипами и марками.
 *
 * Репозиторий публичный, а это чужие товарные знаки: сама модель под CC-BY,
 * но нанесённые на неё эмблемы Mercedes, Petronas и спонсоров лицензией
 * модели не покрываются. Меши с этими материалами скрываем.
 */
const BRANDED = [
  'Mercedes-Logo', 'petronas_logo', 'petronas_png', 'amg_logo', 'INEOS',
  'iwc_sponsor', 'teamviewer', 'crowdstrike', 'akkodis', 'amd_png',
  'stynium', 'sndg_bw', '44_lewis', 'pirelli',
]

export function isBrandedMaterial(name: string): boolean {
  const lower = name.toLowerCase()
  return BRANDED.some((b) => lower.includes(b.toLowerCase()))
}

/**
 * Замеры модели: колёса стоят на этих позициях в её собственных единицах.
 * Колея 1.454, база 3.140, оси на высоте 0.318.
 */
const MODEL_HALF_TRACK = (0.746 + 0.708) / 2
const MODEL_FRONT_Z = 2.423
const MODEL_REAR_Z = -0.720
const MODEL_WHEELBASE = MODEL_FRONT_Z - MODEL_REAR_Z
const MODEL_AXLE_Y = 0.318

/**
 * Кузовная панель опознаётся по ширине в мировых координатах.
 *
 * Объём считать нельзя: локальная геометрия модели в своих единицах, там
 * объёмы в сотни тысяч, и любой порог проходит всё. Ширина же после
 * масштабирования — метры, и разделение чёткое: монокок и понтоны шире
 * метра, а колесо 0.36 м, диски и карбон ещё меньше.
 */
export const BODY_MIN_WIDTH_M = 1.0

/** Колесо в мире 0.36 м шириной — заведомо ниже порога. */
export const WHEEL_WIDTH_M = 0.36

/** Физика ставит колёса на базу 3.6 м — по ней и масштабируем. */
const PHYSICS_WHEELBASE_M = 3.6

export const SCALE = PHYSICS_WHEELBASE_M / MODEL_WHEELBASE

/** Центр колёсной базы в координатах модели: сдвигаем его в ноль. */
export const MODEL_CENTRE_Z = (MODEL_FRONT_Z + MODEL_REAR_Z) / 2

export function scaledHalfTrack(): number {
  return MODEL_HALF_TRACK * SCALE
}

/**
 * Ставит модель так, чтобы центр колёсной базы был в нуле, а колёса стояли на
 * земле. Нос модели смотрит на +Z — как и ждёт физика.
 */
export function bodyOffset(): { x: number; y: number; z: number } {
  return { x: 0, y: -MODEL_AXLE_Y, z: -MODEL_CENTRE_Z }
}

export async function loadW14(livery: number, accent: number): Promise<CarParts> {
  const draco = new DRACOLoader()
  draco.setDecoderPath(DRACO_PATH)
  const loader = new GLTFLoader()
  loader.setDRACOLoader(draco)

  const gltf = await loader.loadAsync(MODEL_URL)
  const source = gltf.scene
  source.updateMatrixWorld(true)

  // Спонсорские наклейки прячем до того, как что-то перекрашивать.
  source.traverse((node) => {
    const mesh = node as THREE.Mesh
    if (mesh.isMesh !== true) return
    const material = mesh.material as THREE.Material | THREE.Material[]
    const names = Array.isArray(material)
      ? material.map((m) => m.name)
      : [material.name]
    if (names.some((n) => typeof n === 'string' && isBrandedMaterial(n))) {
      mesh.visible = false
    }
  })

  const wheels: THREE.Object3D[] = []
  const steered: THREE.Object3D[] = []

  // Колёса остаются в иерархии кузова: вынимать их и пересобирать ступицы
  // значит вручную повторять все трансформации родителей — при первой же
  // попытке колёса слиплись в центре, а болид ушёл под землю на 1.18 м.
  //
  // Вместо этого каждое колесо оборачивается в узел, вставленный на его же
  // место: узел вращается, геометрия внутри центрируется на оси колеса.
  for (const [name, isFront] of [
    [FRONT_LEFT, true], [FRONT_RIGHT, true],
    [REAR_LEFT, false], [REAR_RIGHT, false],
  ] as const) {
    const node = source.getObjectByName(name)
    if (node === undefined) continue
    const parent = node.parent
    if (parent === null) continue

    // Ось колеса в системе родителя: вокруг неё и вращаем.
    const pivot = node.position.clone()

    const spin = new THREE.Group()
    spin.position.copy(pivot)
    node.position.set(0, 0, 0)
    parent.add(spin)
    spin.add(node)

    wheels.push(spin)
    if (isFront) steered.push(spin)
  }

  // Перекраска в цвет команды.
  //
  // Отбор по светлоте не годится: родная ливрея W14 чёрная, и 29 мешей из 63
  // имеют цвет 000000 — фильтр по яркости их не берёт, машина остаётся чёрной.
  // Панели опознаются по объёму: монокок и понтоны — крупные тела, а карбон,
  // резина и мелкие детали заметно меньше.
  const body = new THREE.MeshPhysicalMaterial({
    color: livery, metalness: 0.1, roughness: 0.3,
    clearcoat: 1, clearcoatRoughness: 0.06, envMapIntensity: 0.9,
  })
  const trim = new THREE.MeshPhysicalMaterial({
    color: accent, metalness: 0.15, roughness: 0.3,
    clearcoat: 1, clearcoatRoughness: 0.08, envMapIntensity: 0.9,
  })

  void trim
  const size = new THREE.Vector3()
  const worldBox = new THREE.Box3()
  source.updateMatrixWorld(true)
  source.traverse((node) => {
    const mesh = node as THREE.Mesh
    if (mesh.isMesh !== true || mesh.visible === false) return
    mesh.castShadow = true
    worldBox.setFromObject(mesh)
    worldBox.getSize(size)
    if (size.x >= BODY_MIN_WIDTH_M) mesh.material = body
  })

  // Ставим модель так, чтобы центр колёсной базы был в нуле, а колёса
  // касались земли. Масштаб приводит базу к физическим 3.6 м.
  const inner = new THREE.Group()
  const offset = bodyOffset()
  source.position.set(offset.x, offset.y, offset.z)
  inner.add(source)

  const group = new THREE.Group()
  group.scale.setScalar(SCALE)
  group.add(inner)

  // Точная посадка на асфальт по фактическому низу колёс: расчётная высота
  // оси в модели даёт промах, потому что покрышка не идеальный цилиндр.
  group.updateMatrixWorld(true)
  const wheelBox = new THREE.Box3()
  for (const wheel of wheels) wheelBox.expandByObject(wheel)
  if (wheelBox.isEmpty() === false) {
    inner.position.y -= wheelBox.min.y / SCALE
  }

  return { group, wheels, steered }
}

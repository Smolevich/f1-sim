import * as THREE from 'three'
import { DRACOLoader } from 'three/examples/jsm/loaders/DRACOLoader.js'
import { GLTFLoader } from 'three/examples/jsm/loaders/GLTFLoader.js'
import type { CarParts } from './car'

/**
 * Целевая колёсная база рендера. Физика считает по 3.6 м (формульная база), но
 * кузов chassis-draco.glb — дорожный: растянутый до 3.6 м между осями, он
 * выходит 6.3 м в длину и 2.9 м в ширину, то есть глотает колёса целиком и
 * скребёт порогами асфальт. Поэтому кузов подгоняется под свою же геометрию,
 * а колёса рендера ставятся по его аркам, а не по точкам физики: расхождение
 * в 0.8 м между осью физики и видимым колесом на глаз не читается, а болид
 * размером с автобус — читается сразу.
 */
const RENDER_WHEELBASE_M = 2.8
// Колея рендера шире физической (1.62): кузов модели 2.19 м в ширину, и на
// физической колее колёса оказываются внутри него и невидимы. 1.85 ставит их
// в арки, откуда они выступают наружу.
const RENDER_TRACK_WIDTH_M = 1.85

/**
 * Колёсная база исходной модели в её собственных единицах: провалы в геометрии
 * Undercarriage (вырезы под арки) центрированы на Z = -1.35 и +1.45.
 */
const MODEL_WHEELBASE_M = 2.8

/** Радиус колеса в модели wheel-draco.glb: покрышка занимает ±0.331 по Y. */
// Замерено по glb: меш колеса 0.43 в поперечнике, то есть радиус 0.215.
// Прежние 0.331 давали масштаб в полтора раза меньше нужного, и колёса
// прятались внутри арок.
const MODEL_WHEEL_RADIUS_M = 0.215

/** Радиус колеса в рендере: под арки дорожного кузова, а не формульные 0.36 м. */
const RENDER_WHEEL_RADIUS_M = 0.36

const CHASSIS_URL = '/models/chassis-draco.glb'
const WHEEL_URL = '/models/wheel-draco.glb'
const DRACO_PATH = '/draco/'

/**
 * Приборка кузова: узлы дашборда ("meter", "pointer-*") уезжают по X до +5.8,
 * то есть далеко за габарит машины. В кокпите их не видно, а bounding box и
 * тени они раздувают на пять метров в сторону, поэтому вырезаем.
 */
const DASHBOARD_NODES = ['meter', 'pointer-left', 'pointer-right']

export function scaleForWheelbase(modelM: number, targetM: number): number {
  return modelM > 0 ? targetM / modelM : 1
}

/** Масштаб для приведения модели к целевой базе; возвращает применённое значение. */
export function fitToWheelbase(group: THREE.Group, wheelbaseM: number): number {
  const scale = scaleForWheelbase(MODEL_WHEELBASE_M, wheelbaseM)
  group.scale.setScalar(scale)
  return scale
}

function makeLoader(): GLTFLoader {
  const draco = new DRACOLoader()
  // Декодер лежит в public/draco: модели сжаты KHR_draco_mesh_compression и без
  // него GLTFLoader падает на «no DRACOLoader instance provided».
  draco.setDecoderPath(DRACO_PATH)
  const loader = new GLTFLoader()
  loader.setDRACOLoader(draco)
  return loader
}

function loadScene(loader: GLTFLoader, url: string): Promise<THREE.Group> {
  return new Promise((resolve, reject) => {
    loader.load(url, (gltf) => resolve(gltf.scene), undefined, reject)
  })
}

/**
 * Перекраска кузова: в модели ливрея сидит в материале BodyPaint, и без замены
 * все болиды — и призрак тоже — остаются оранжевыми.
 */
function paintBody(root: THREE.Object3D, color: number): void {
  root.traverse((node) => {
    if (!(node instanceof THREE.Mesh)) return
    const material = node.material as THREE.MeshStandardMaterial
    if (material.name === 'BodyPaint') {
      const painted = material.clone()
      painted.color = new THREE.Color(color)
      painted.metalness = 0.55
      painted.roughness = 0.3
      node.material = painted
    }
  })
}

function stripDashboard(root: THREE.Object3D): void {
  for (const name of DASHBOARD_NODES) {
    const node = root.getObjectByName(name)
    node?.removeFromParent()
  }
}

function buildWheelPivots(wheelScene: THREE.Group): {
  pivots: THREE.Group[]
  wheels: THREE.Object3D[]
  steered: THREE.Object3D[]
} {
  const pivots: THREE.Group[] = []
  const wheels: THREE.Object3D[] = []
  const steered: THREE.Object3D[] = []

  const wheelScale = RENDER_WHEEL_RADIUS_M / MODEL_WHEEL_RADIUS_M

  // Арки кузова несимметричны относительно нуля: передняя на +1.45, задняя на
  // -1.35 в единицах модели, поэтому центр базы смещён вперёд.
  const front = 1.45
  const rear = -1.35

  for (const [x, z, isFront] of [
    [-RENDER_TRACK_WIDTH_M / 2, front, true],
    [RENDER_TRACK_WIDTH_M / 2, front, true],
    [-RENDER_TRACK_WIDTH_M / 2, rear, false],
    [RENDER_TRACK_WIDTH_M / 2, rear, false],
  ] as const) {
    // Пивот рулит, вложенное колесо крутится: одна и та же группа не может
    // держать оба вращения — поворот руля затирал бы фазу качения.
    const pivot = new THREE.Group()
    pivot.position.set(x, RENDER_WHEEL_RADIUS_M, z)

    const wheel = new THREE.Group()
    const model = wheelScene.clone(true)
    model.scale.setScalar(wheelScale)
    // Обод модели смотрит в одну сторону: правые колёса зеркалим по X, иначе
    // с одного борта диск оказывается вывернут наизнанку.
    if (x > 0) model.rotation.y = Math.PI
    wheel.add(model)

    pivot.add(wheel)
    pivots.push(pivot)
    wheels.push(wheel)
    if (isFront) steered.push(pivot)
  }

  return { pivots, wheels, steered }
}

/**
 * Реальная модель вместо набора примитивов. Возвращает те же `CarParts`, что и
 * `buildCarParts`, поэтому `spinWheels` и призрак работают без изменений.
 */
export async function loadCarModel(color = 0x1e3a8a): Promise<CarParts> {
  const loader = makeLoader()
  const [chassisScene, wheelScene] = await Promise.all([
    loadScene(loader, CHASSIS_URL),
    loadScene(loader, WHEEL_URL),
  ])

  const group = new THREE.Group()

  const body = new THREE.Group()
  body.add(chassisScene)
  stripDashboard(body)
  paintBody(body, color)
  fitToWheelbase(body, RENDER_WHEELBASE_M)

  // Дно кузова уходит в минус по Y, а начало координат болида физика держит на
  // уровне асфальта. Без подъёма машина проваливается под трассу; клиренс берём
  // небольшой, чтобы колёса всё же выступали из арок.
  // Клиренс меряется от нижней точки кузова: слишком высоко — машина висит над
  // асфальтом на пустоте, слишком низко — колёса тонут в арках по оси.
  // Модель не центрирована в своих координатах: её габарит по X идёт от -1.09
  // до 5.82, то есть кузов смещён на несколько метров вбок от нуля. Колёса же
  // ставятся вокруг нуля, поэтому без центрирования они оказываются внутри
  // кузова и не видны. Центрируем по горизонтали, высоту оставляем на совести
  // клиренса ниже.
  // В chassis-модели уже есть узел Wheel — одно колесо, вкомпонованное в кузов.
  // Свои четыре колеса мы ставим отдельно, чтобы они рулили и вращались,
  // поэтому встроенное убираем: иначе оно торчит внутри и путается с нашими.
  const builtInWheel = body.getObjectByName('Wheel')
  if (builtInWheel) builtInWheel.removeFromParent()

  const raw = new THREE.Box3().setFromObject(body)
  const centre = raw.getCenter(new THREE.Vector3())
  body.position.x -= centre.x
  body.position.z -= centre.z

  const bounds = new THREE.Box3().setFromObject(body)
  // 0.26 м, а не 0.09: при малом клиренсе дно кузова оказывается ниже центра
  // колеса (0.36 м) и полностью его накрывает — на экране машина едет на брюхе.
  // На этой высоте арки закрывают верх колеса, а нижняя половина видна.
  const clearance = 0.14
  body.position.y = clearance - bounds.min.y
  group.add(body)

  const { pivots, wheels, steered } = buildWheelPivots(wheelScene)
  for (const pivot of pivots) group.add(pivot)

  group.traverse((node) => { if (node instanceof THREE.Mesh) node.castShadow = true })
  return { group, wheels, steered }
}

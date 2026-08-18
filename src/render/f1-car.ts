import * as THREE from 'three'
import { mergeGeometries } from 'three/examples/jsm/utils/BufferGeometryUtils.js'

/**
 * Болид строится по техническому регламенту F1 2022–2025, а не на глаз:
 * длина 5.63 м, ширина 2.00, высота 0.95, колёсная база 3.60, шина 720 мм
 * в диаметре, передняя 270 мм и задняя 405 мм в ширину, переднее крыло 1800 мм,
 * заднее 1230 мм. Отношение длины к высоте 5.9:1 — именно оно делает силуэт
 * узнаваемым; у дорожной машины оно около 3.5:1, и никакая детализация этого
 * не компенсирует.
 */
const LENGTH_M = 5.63
const WIDTH_M = 2.0
const WHEELBASE_M = 3.6
const TYRE_DIAMETER_M = 0.72
const TYRE_RADIUS_M = TYRE_DIAMETER_M / 2
const FRONT_TYRE_WIDTH_M = 0.27
const REAR_TYRE_WIDTH_M = 0.405
const FRONT_WING_WIDTH_M = 1.8
const REAR_WING_WIDTH_M = 1.23
/** Колея по осям: габарит минус ширина шины, чтобы колёса не торчали за 2 м. */
const FRONT_TRACK_M = WIDTH_M - FRONT_TYRE_WIDTH_M
const REAR_TRACK_M = WIDTH_M - REAR_TYRE_WIDTH_M

/**
 * Сегментов по кругу монокока. 32 против прежних 18: на 18 блик ломался гранями
 * и корпус читался как обточенный шестигранник.
 */
const TUB_SEGMENTS = 32
/** Монокок стоит на этой высоте, ливрея и заборники считаются от неё же. */
const TUB_BASE_Y = 0.28

/** Ливрея придуманная: репо публичный, чужие цвета и логотипы в него не кладём. */
const STRIPE_COLOUR = 0xeef1f6
const ACCENT_COLOUR = 0xff5a1f
const CAR_NUMBER = '7'

export type F1Parts = {
  group: THREE.Group
  wheels: THREE.Object3D[]
  steered: THREE.Object3D[]
}

/**
 * Профиль монокока: узкий нос, расширение к кокпиту, сужение к корме. Лате
 * крутит его вокруг вертикали, поэтому x — радиус, y — положение вдоль машины.
 * Хвост доведён до 0.05: раньше корпус обрывался на радиусе 0.12 плоским срезом,
 * и корму приходилось закрывать отдельной трубой моторного отсека.
 */
const TUB_PROFILE: readonly [number, number][] = [
  [0.02, 2.55],
  [0.055, 2.34],
  [0.09, 2.1],
  [0.13, 1.75],
  [0.18, 1.3],
  [0.235, 0.85],
  [0.275, 0.4],
  [0.3, -0.05],
  [0.3, -0.45],
  [0.285, -0.9],
  [0.25, -1.35],
  [0.2, -1.78],
  [0.14, -2.15],
  [0.075, -2.42],
  [0.05, -2.5],
]

/**
 * Днище узкое, а верх широкий: у настоящего болида борт уходит внутрь к плоскому
 * дну. Одинаковый радиус сверху и снизу даёт трубу — именно она и читается как
 * «майнкрафт», поэтому нижние вершины поджимаются по X и подтягиваются по Y.
 */
function taperTowardsFloor(geometry: THREE.BufferGeometry): void {
  const position = geometry.getAttribute('position') as THREE.BufferAttribute
  for (let i = 0; i < position.count; i++) {
    const y = position.getY(i)
    if (y >= 0) continue
    const depth = Math.min(1, -y / 0.22)
    position.setX(i, position.getX(i) * (1 - 0.5 * depth))
    position.setY(i, y * (1 - 0.35 * depth))
  }
  position.needsUpdate = true
  geometry.computeVertexNormals()
}

function tubProfilePoints(): THREE.Vector2[] {
  return TUB_PROFILE.map(([x, y]) => new THREE.Vector2(x, y))
}

function buildTub(material: THREE.Material): THREE.Mesh {
  const geometry = new THREE.LatheGeometry(tubProfilePoints(), TUB_SEGMENTS)
  geometry.rotateX(-Math.PI / 2)
  geometry.scale(1, 0.75, 1)
  taperTowardsFloor(geometry)
  const mesh = new THREE.Mesh(geometry, material)
  mesh.position.y = TUB_BASE_Y
  return mesh
}

/**
 * Полоса ливреи как узкий сектор того же тела вращения, что и монокок: только
 * так лента ложится точно по борту. Отдельным мешем, а не текстурой — UV лате
 * тянутся вдоль оси вращения, и полоса по ним встаёт кольцами поперёк машины.
 */
function liveryStripe(
  material: THREE.Material, centreAngle: number, arc: number, lift: number,
): THREE.Mesh {
  const points = tubProfilePoints().map((p) => new THREE.Vector2(p.x * lift, p.y))
  const geometry = new THREE.LatheGeometry(points, 2, centreAngle - arc / 2, arc)
  geometry.rotateX(-Math.PI / 2)
  geometry.scale(1, 0.75, 1)
  const mesh = new THREE.Mesh(geometry, material)
  mesh.position.y = TUB_BASE_Y
  return mesh
}

function wingElement(
  width: number, chord: number, thickness: number, material: THREE.Material,
): THREE.Mesh {
  const shape = new THREE.Shape()
  shape.moveTo(-chord / 2, 0)
  shape.quadraticCurveTo(0, thickness, chord / 2, 0)
  shape.quadraticCurveTo(0, -thickness * 0.35, -chord / 2, 0)
  const geometry = new THREE.ExtrudeGeometry(shape, {
    depth: width, bevelEnabled: false, curveSegments: 5,
  })
  geometry.translate(0, 0, -width / 2)
  geometry.rotateY(Math.PI / 2)
  return new THREE.Mesh(geometry, material)
}

/**
 * Понтон: низкий клин с подрезом снизу, а не толстый цилиндр в уровень с
 * кокпитом. Профиль рисуется сбоку (длина по X, высота по Y) и выдавливается
 * в ширину, поэтому поворот вокруг Y укладывает его вдоль машины.
 */
function sidepod(material: THREE.Material, width: number): THREE.Mesh {
  const shape = new THREE.Shape()
  shape.moveTo(1.0, 0.02)
  shape.quadraticCurveTo(1.12, 0.28, 0.86, 0.44)
  shape.lineTo(-0.2, 0.36)
  shape.quadraticCurveTo(-0.85, 0.28, -1.2, 0.12)
  shape.quadraticCurveTo(-0.6, 0.06, 0.2, 0.1)
  shape.quadraticCurveTo(0.7, 0.1, 1.0, 0.02)
  shape.closePath()
  // Скос по ширине: хвост понтона сходит на нет, а не упирается стеной в колесо.
  const geometry = new THREE.ExtrudeGeometry(shape, {
    depth: width, bevelEnabled: false, curveSegments: 8,
  })
  geometry.translate(0, 0, -width / 2)
  geometry.rotateY(-Math.PI / 2)
  const position = geometry.getAttribute('position') as THREE.BufferAttribute
  for (let i = 0; i < position.count; i++) {
    const z = position.getZ(i)
    if (z >= 0) continue
    const taper = Math.min(1, -z / 1.2)
    position.setX(i, position.getX(i) * (1 - 0.62 * taper))
  }
  position.needsUpdate = true
  geometry.computeVertexNormals()
  return new THREE.Mesh(geometry, material)
}

/**
 * Барджборд: вертикальная пластина с изгибом перед понтоном. Именно её отсутствие
 * оставляло между передним колесом и понтоном пустой провал.
 */
function bargeboard(material: THREE.Material): THREE.Mesh {
  const shape = new THREE.Shape()
  shape.moveTo(0, 0)
  shape.lineTo(0.6, 0.05)
  shape.quadraticCurveTo(0.52, 0.34, 0.18, 0.4)
  shape.lineTo(0, 0.26)
  shape.closePath()
  const geometry = new THREE.ExtrudeGeometry(shape, { depth: 0.02, bevelEnabled: false })
  geometry.rotateY(-Math.PI / 2)
  return new THREE.Mesh(geometry, material)
}

/** Воздуховод тормоза: полукольцо-заборник вокруг диска внутри колёсной арки. */
function brakeDuct(radius: number, width: number, material: THREE.Material): THREE.Group {
  const group = new THREE.Group()
  const scoop = new THREE.Mesh(
    new THREE.CylinderGeometry(
      radius, radius * 0.9, width, 10, 1, true, Math.PI * 0.2, Math.PI * 1.1,
    ),
    material,
  )
  scoop.rotation.z = Math.PI / 2
  group.add(scoop)
  const face = new THREE.Mesh(
    new THREE.RingGeometry(radius * 0.45, radius, 10, 1, Math.PI * 0.2, Math.PI * 1.1),
    material,
  )
  face.rotation.y = -Math.PI / 2
  face.position.x = width / 2
  group.add(face)
  return group
}

/**
 * Цифра семисегментного вида из плоскостей: шрифт и текстура для номера не нужны,
 * а плоские сегменты читаются с любой камеры и не зависят от загрузки шрифта.
 * Сегменты: 0 верх, 1 верх-право, 2 низ-право, 3 низ, 4 низ-лево, 5 верх-лево, 6 середина.
 */
const DIGIT_SEGMENTS: Record<string, readonly number[]> = {
  '0': [0, 1, 2, 3, 4, 5],
  '1': [1, 2],
  '2': [0, 1, 6, 4, 3],
  '3': [0, 1, 6, 2, 3],
  '4': [5, 1, 6, 2],
  '5': [0, 5, 6, 2, 3],
  '6': [0, 5, 4, 3, 2, 6],
  '7': [0, 1, 2],
  '8': [0, 1, 2, 3, 4, 5, 6],
  '9': [0, 1, 2, 3, 5, 6],
}

function digitMesh(digit: string, height: number, material: THREE.Material): THREE.Group {
  const group = new THREE.Group()
  const thickness = height * 0.16
  const width = height * 0.56
  const half = height / 2
  // [x, y, длина, высота] сегмента в системе цифры.
  const bars: readonly [number, number, number, number][] = [
    [0, half, width, thickness],
    [width / 2, half / 2, thickness, half],
    [width / 2, -half / 2, thickness, half],
    [0, -half, width, thickness],
    [-width / 2, -half / 2, thickness, half],
    [-width / 2, half / 2, thickness, half],
    [0, 0, width, thickness],
  ]
  for (const index of DIGIT_SEGMENTS[digit] ?? DIGIT_SEGMENTS['8']) {
    const [x, y, w, h] = bars[index]
    const bar = new THREE.Mesh(new THREE.PlaneGeometry(w, h), material)
    bar.position.set(x, y, 0)
    group.add(bar)
  }
  return group
}

/** Номер строкой цифр, центрированной по нулю. */
function numberPlate(text: string, height: number, material: THREE.Material): THREE.Group {
  const group = new THREE.Group()
  const pitch = height * 0.7
  const start = -((text.length - 1) * pitch) / 2
  for (let i = 0; i < text.length; i++) {
    const digit = digitMesh(text[i], height, material)
    digit.position.x = start + i * pitch
    group.add(digit)
  }
  return group
}

/**
 * Схлопывает неподвижные детали кузова в один меш на материал. Детализация
 * подняла число мешей с 51 до 118, и каждый — отдельный вызов отрисовки:
 * на софтверном рендере это давало +45 % ко времени кадра. Геометрия и вид
 * не меняются, меняется только число вызовов — с сотни до шести.
 *
 * Колёса и их пивоты не трогаются: они вращаются собственными матрицами,
 * и слияние стёрло бы и руление, и качение.
 */
function mergeStaticBody(group: THREE.Group, keep: ReadonlySet<THREE.Object3D>): void {
  const byMaterial = new Map<THREE.Material, THREE.BufferGeometry[]>()
  const removed: THREE.Object3D[] = []

  for (const child of group.children) {
    if (keep.has(child)) continue
    child.updateMatrix()
    for (const node of collectMeshes(child)) {
      // toNonIndexed обязателен: ExtrudeGeometry приходит без индекса, примитивы —
      // с ним, и слияние на такой смеси молча возвращает null. Лишние атрибуты
      // ломают его так же, а UV у собранных примитивов всё равно не используются.
      const source = node.mesh.geometry
      const geometry = (source.getIndex() === null ? source.clone() : source.toNonIndexed())
      geometry.applyMatrix4(node.matrix)
      for (const name of Object.keys(geometry.attributes)) {
        if (name !== 'position' && name !== 'normal') geometry.deleteAttribute(name)
      }
      const material = node.mesh.material as THREE.Material
      const bucket = byMaterial.get(material)
      if (bucket === undefined) byMaterial.set(material, [geometry])
      else bucket.push(geometry)
    }
    removed.push(child)
  }

  for (const child of removed) group.remove(child)
  for (const [material, geometries] of byMaterial) {
    const merged = mergeGeometries(geometries, false)
    if (merged === null) continue
    group.add(new THREE.Mesh(merged, material))
  }
}

/** Меши поддерева вместе с их матрицей относительно родителя группы болида. */
function collectMeshes(
  root: THREE.Object3D, parent = new THREE.Matrix4(),
): { mesh: THREE.Mesh; matrix: THREE.Matrix4 }[] {
  root.updateMatrix()
  const matrix = new THREE.Matrix4().multiplyMatrices(parent, root.matrix)
  const found: { mesh: THREE.Mesh; matrix: THREE.Matrix4 }[] = []
  if (root instanceof THREE.Mesh) found.push({ mesh: root, matrix })
  for (const child of root.children) found.push(...collectMeshes(child, matrix))
  return found
}

export function buildF1Car(colour = 0x1a4fa0): F1Parts {
  const group = new THREE.Group()
  const body = new THREE.MeshStandardMaterial({ color: colour, metalness: 0.45, roughness: 0.35 })
  const dark = new THREE.MeshStandardMaterial({ color: 0x14151a, metalness: 0.3, roughness: 0.55 })
  const rubber = new THREE.MeshStandardMaterial({ color: 0x111114, roughness: 0.95 })
  // metalness 0.35, а не 0.9: без карты окружения металл нечего отражать и обод
  // уходил в чёрное, отчего колесо читалось сплошным блином без спиц.
  const rim = new THREE.MeshStandardMaterial({ color: 0xb9bec8, metalness: 0.35, roughness: 0.3 })
  const stripe = new THREE.MeshStandardMaterial({
    color: STRIPE_COLOUR, metalness: 0.25, roughness: 0.4, side: THREE.DoubleSide,
  })
  const accent = new THREE.MeshStandardMaterial({
    color: ACCENT_COLOUR, metalness: 0.3, roughness: 0.4, side: THREE.DoubleSide,
  })
  const digits = new THREE.MeshStandardMaterial({
    color: STRIPE_COLOUR, roughness: 0.5, side: THREE.DoubleSide,
  })

  group.add(buildTub(body))

  // Ливрея: две полосы по каждому борту вдоль всего монокока плюс осевая сверху.
  // Приподняты на 1.5 % радиуса, иначе z-fighting с бортом даёт мерцание.
  for (const side of [-1, 1]) {
    const flank = side * Math.PI / 2
    group.add(liveryStripe(stripe, flank - 0.42, 0.16, 1.015))
    group.add(liveryStripe(stripe, flank + 0.5, 0.09, 1.015))
  }
  group.add(liveryStripe(accent, 0, 0.13, 1.015))

  // Носовой конус: тонкий и приподнятый, переходит в пилоны переднего крыла.
  const nose = new THREE.Mesh(new THREE.CylinderGeometry(0.055, 0.135, 1.5, 14), body)
  nose.rotation.x = Math.PI / 2
  nose.position.set(0, 0.32, 2.35)
  group.add(nose)
  // Контрастный кончик носа — вся ливрея на одном цвете читается как заготовка.
  const noseCap = new THREE.Mesh(new THREE.CylinderGeometry(0.055, 0.08, 0.42, 14), accent)
  noseCap.rotation.x = Math.PI / 2
  noseCap.position.set(0, 0.32, 2.89)
  group.add(noseCap)
  const noseTip = new THREE.Mesh(new THREE.SphereGeometry(0.055, 12, 8), accent)
  noseTip.position.set(0, 0.32, 3.05)
  group.add(noseTip)
  // Пилоны от носа к крылу: раньше крыло висело в воздухе отдельно от машины.
  for (const side of [-1, 1]) {
    const pylon = new THREE.Mesh(new THREE.BoxGeometry(0.035, 0.26, 0.28), dark)
    pylon.position.set(side * 0.075, 0.2, 2.82)
    pylon.rotation.x = 0.2
    group.add(pylon)
  }

  // Номер на носу: по цифре на каждый борт носового конуса.
  for (const side of [-1, 1]) {
    const plate = numberPlate(CAR_NUMBER, 0.15, digits)
    plate.position.set(side * 0.115, 0.35, 2.2)
    plate.rotation.y = side * Math.PI / 2
    group.add(plate)
  }

  // Переднее крыло: четыре элемента нарастающего угла, как в регламенте.
  for (let i = 0; i < 4; i++) {
    // Хорда шире прежней: на 0.3 м элементы читались как чёрный частокол, из
    // которого спереди не видно ни одной плоскости.
    const element = wingElement(
      FRONT_WING_WIDTH_M - i * 0.05, 0.4 - i * 0.05, 0.045, i === 3 ? accent : body,
    )
    element.position.set(0, 0.09 + i * 0.075, 2.88 - i * 0.15)
    element.rotation.x = -0.16 * (i + 1)
    group.add(element)
  }
  for (const side of [-1, 1]) {
    // Пластина ниже и короче прежней: плита 0.4 x 0.72 закрывала собой весь
    // передний угол болида и первой бросалась в глаза с любой камеры.
    const endplate = new THREE.Mesh(new THREE.BoxGeometry(0.03, 0.3, 0.6), dark)
    endplate.position.set(side * FRONT_WING_WIDTH_M / 2, 0.18, 2.7)
    group.add(endplate)
    for (const offset of [0.34, 0.56]) {
      const strake = new THREE.Mesh(new THREE.BoxGeometry(0.018, 0.16, 0.42), dark)
      strake.position.set(side * offset, 0.19, 2.72)
      group.add(strake)
    }
    const endplateStripe = new THREE.Mesh(new THREE.PlaneGeometry(0.5, 0.07), stripe)
    endplateStripe.position.set(side * (FRONT_WING_WIDTH_M / 2 + 0.016), 0.26, 2.7)
    endplateStripe.rotation.y = side * Math.PI / 2
    group.add(endplateStripe)
    // Загиб верхней кромки внутрь — характерный «флик» на торцевой пластине.
    const flick = new THREE.Mesh(new THREE.BoxGeometry(0.16, 0.02, 0.3), accent)
    flick.position.set(side * (FRONT_WING_WIDTH_M / 2 - 0.08), 0.4, 2.6)
    flick.rotation.z = side * 0.2
    group.add(flick)
  }

  // Понтоны: низкий клин по борту, воздухозаборник в лицевой грани.
  for (const side of [-1, 1]) {
    const pod = sidepod(body, 0.5)
    pod.position.set(side * 0.55, 0.08, -0.35)
    group.add(pod)
    // Устье заборника утоплено в грань понтона, а не висит кубиком рядом.
    const inlet = new THREE.Mesh(new THREE.BoxGeometry(0.34, 0.2, 0.1), dark)
    inlet.position.set(side * 0.56, 0.29, 0.63)
    group.add(inlet)
    const lip = new THREE.Mesh(new THREE.BoxGeometry(0.38, 0.05, 0.16), body)
    lip.position.set(side * 0.56, 0.42, 0.62)
    group.add(lip)
    // Полоса ливреи по борту понтона: наклонена вслед за сужением хвоста,
    // иначе висит в воздухе там, где борт уже ушёл внутрь.
    const podStripe = new THREE.Mesh(new THREE.PlaneGeometry(1.25, 0.06), stripe)
    podStripe.position.set(side * 0.79, 0.3, -0.05)
    podStripe.rotation.y = side * (Math.PI / 2 - 0.14)
    group.add(podStripe)

    // Барджборд перед понтоном, между передним колесом и заборником.
    const board = bargeboard(dark)
    board.position.set(side * 0.7, 0.07, 0.78)
    board.rotation.y = side * 0.14
    group.add(board)

    // Отбойник пола вдоль борта: связывает барджборд с понтоном одной линией.
    const floorEdge = new THREE.Mesh(new THREE.BoxGeometry(0.03, 0.12, 2.2), dark)
    floorEdge.position.set(side * 0.76, 0.08, -0.5)
    group.add(floorEdge)
  }

  // Плоское дно: снизу болид просвечивал как рама из несвязанных тел.
  const floor = new THREE.Mesh(new THREE.BoxGeometry(1.5, 0.035, 3.6), dark)
  floor.position.set(0, 0.05, -0.45)
  group.add(floor)

  // Айрбокс и крышка двигателя — одно тело вращения от устья заборника до
  // хвоста: приставленная бочка отдельным мешем оставляла щель за шлемом и
  // читалась как навешанная деталь.
  const coverProfile: THREE.Vector2[] = [
    new THREE.Vector2(0.005, 0.62),
    new THREE.Vector2(0.115, 0.6),
    new THREE.Vector2(0.155, 0.5),
    new THREE.Vector2(0.185, 0.3),
    new THREE.Vector2(0.2, 0.0),
    new THREE.Vector2(0.195, -0.4),
    new THREE.Vector2(0.175, -0.85),
    new THREE.Vector2(0.14, -1.3),
    new THREE.Vector2(0.09, -1.7),
    new THREE.Vector2(0.04, -1.95),
  ]
  const coverGeometry = new THREE.LatheGeometry(coverProfile, 18)
  coverGeometry.rotateX(-Math.PI / 2)
  coverGeometry.scale(1, 0.85, 1)
  const cover = new THREE.Mesh(coverGeometry, body)
  cover.position.set(0, 0.52, -0.42)
  group.add(cover)
  // Тёмное устье заборника: без него нос крышки выглядит залитым цветом кузова.
  const airboxMouth = new THREE.Mesh(new THREE.SphereGeometry(0.1, 12, 8), dark)
  airboxMouth.scale.set(1, 0.8, 0.7)
  airboxMouth.position.set(0, 0.65, 0.14)
  group.add(airboxMouth)

  // Акулий плавник стоит на крышке двигателя, а не в воздухе над ней.
  const fin = new THREE.Mesh(new THREE.BoxGeometry(0.026, 0.22, 1.35), body)
  fin.position.set(0, 0.6, -1.3)
  group.add(fin)
  const finStripe = new THREE.Mesh(new THREE.PlaneGeometry(1.0, 0.08), accent)
  finStripe.position.set(0.015, 0.62, -1.3)
  finStripe.rotation.y = Math.PI / 2
  group.add(finStripe)

  // Выхлоп и задний фонарь: без них корма — просто закруглённый конец трубы.
  const exhaust = new THREE.Mesh(new THREE.CylinderGeometry(0.05, 0.055, 0.18, 10, 1, true), dark)
  exhaust.rotation.x = Math.PI / 2
  exhaust.position.set(0, 0.48, -2.12)
  group.add(exhaust)
  const rainLight = new THREE.Mesh(new THREE.BoxGeometry(0.09, 0.05, 0.02), accent)
  rainLight.position.set(0, 0.35, -2.65)
  group.add(rainLight)

  // Заднее крыло: два элемента на пилонах, уже переднего и заметно выше.
  for (let i = 0; i < 2; i++) {
    const element = wingElement(REAR_WING_WIDTH_M, 0.34 - i * 0.08, 0.04, i === 0 ? body : dark)
    element.position.set(0, 0.95 + i * 0.14, -2.55 - i * 0.05)
    element.rotation.x = 0.2 + i * 0.22
    group.add(element)
  }
  for (const side of [-1, 1]) {
    const endplate = new THREE.Mesh(new THREE.BoxGeometry(0.03, 0.52, 0.6), dark)
    endplate.position.set(side * REAR_WING_WIDTH_M / 2, 1.02, -2.57)
    group.add(endplate)
    // Пилон дотянут до крышки двигателя: короткий обрывался в воздухе и крыло
    // висело за кормой само по себе.
    const pylon = new THREE.Mesh(new THREE.BoxGeometry(0.035, 0.62, 0.12), dark)
    pylon.position.set(side * 0.13, 0.63, -2.42)
    pylon.rotation.x = -0.22
    group.add(pylon)
  }

  // Задняя защитная структура: корма заканчивалась остриём конуса, а на болиде
  // за коробкой передач стоит балка с фонарём.
  const crashStructure = new THREE.Mesh(new THREE.BoxGeometry(0.16, 0.13, 0.6), dark)
  crashStructure.position.set(0, 0.35, -2.35)
  group.add(crashStructure)

  // Номер на заднем крыле: на торцевых пластинах, а не плашмя на элементе —
  // сверху его не видит ни одна из игровых камер.
  for (const side of [-1, 1]) {
    const plate = numberPlate(CAR_NUMBER, 0.26, digits)
    plate.position.set(side * (REAR_WING_WIDTH_M / 2 + 0.018), 1.06, -2.57)
    plate.rotation.y = side * Math.PI / 2
    group.add(plate)
  }

  // Диффузор.
  const diffuser = new THREE.Mesh(new THREE.BoxGeometry(0.9, 0.1, 0.4), dark)
  diffuser.position.set(0, 0.1, -2.25)
  diffuser.rotation.x = -0.3
  group.add(diffuser)

  // Halo: замкнутое кольцо вокруг кокпита с наклоном вперёд-вниз. Половина тора
  // в горизонтальной плоскости тонула в кузове и от дуги не оставалось следа.
  const halo = new THREE.Mesh(new THREE.TorusGeometry(0.36, 0.03, 6, 24), dark)
  halo.scale.set(1, 1.25, 1)
  // Наклон всего 0.12 рад: на 0.3 кольцо вставало торчком и читалось как руль,
  // приделанный к капоту.
  halo.rotation.x = -Math.PI / 2 + 0.12
  halo.position.set(0, 0.6, 0.26)
  group.add(halo)
  // Центральная стойка перед пилотом: без неё кольцо висит ни на чём.
  const haloStrut = new THREE.Mesh(new THREE.CylinderGeometry(0.026, 0.026, 0.2, 8), dark)
  haloStrut.position.set(0, 0.56, 0.63)
  haloStrut.rotation.x = 0.35
  group.add(haloStrut)
  // Боковые опоры кольца к бортам монокока.
  for (const side of [-1, 1]) {
    const post = new THREE.Mesh(new THREE.CylinderGeometry(0.022, 0.022, 0.16, 6), dark)
    post.position.set(side * 0.3, 0.55, 0.24)
    group.add(post)
  }
  const helmet = new THREE.Mesh(new THREE.SphereGeometry(0.15, 14, 10), dark)
  helmet.position.set(0, 0.62, 0.16)
  group.add(helmet)
  // Козырёк: сектор сферы чуть большего радиуса, развёрнутый вперёд по Z.
  // Без него шлем — просто чёрный шар, и в кокпите не видно, где перёд.
  const visor = new THREE.Mesh(
    new THREE.SphereGeometry(0.153, 14, 6, -1.0, 2.0, 1.05, 0.6), accent,
  )
  visor.rotation.y = Math.PI / 2
  visor.position.set(0, 0.62, 0.16)
  group.add(visor)
  const headrest = new THREE.Mesh(new THREE.BoxGeometry(0.42, 0.13, 0.18), dark)
  headrest.position.set(0, 0.6, -0.06)
  group.add(headrest)
  // Проём кокпита: тёмная вставка перед шлемом. Без неё пилот торчит из
  // сплошного кузова, будто приклеен сверху.
  const cockpitOpening = new THREE.Mesh(new THREE.CircleGeometry(0.21, 12), dark)
  cockpitOpening.scale.set(1, 1.5, 1)
  cockpitOpening.rotation.x = -Math.PI / 2
  cockpitOpening.position.set(0, 0.505, 0.33)
  group.add(cockpitOpening)

  // Зеркала на дугах: у болида они вынесены далеко в стороны от кокпита.
  for (const side of [-1, 1]) {
    const stalk = new THREE.Mesh(new THREE.CylinderGeometry(0.009, 0.009, 0.22, 6), dark)
    stalk.rotation.z = Math.PI / 2
    stalk.position.set(side * 0.37, 0.5, 0.52)
    group.add(stalk)
    const housing = new THREE.Mesh(new THREE.BoxGeometry(0.1, 0.075, 0.05), body)
    housing.position.set(side * 0.49, 0.51, 0.52)
    housing.rotation.y = side * 0.28
    group.add(housing)
    const glass = new THREE.Mesh(new THREE.PlaneGeometry(0.085, 0.055), rim)
    glass.position.set(side * 0.492, 0.51, 0.547)
    glass.rotation.y = side * 0.28 + Math.PI
    group.add(glass)
  }

  const wheels: THREE.Object3D[] = []
  const steered: THREE.Object3D[] = []

  for (const [x, z, isFront, tyreWidth] of [
    [-FRONT_TRACK_M / 2, WHEELBASE_M / 2, true, FRONT_TYRE_WIDTH_M],
    [FRONT_TRACK_M / 2, WHEELBASE_M / 2, true, FRONT_TYRE_WIDTH_M],
    [-REAR_TRACK_M / 2, -WHEELBASE_M / 2, false, REAR_TYRE_WIDTH_M],
    [REAR_TRACK_M / 2, -WHEELBASE_M / 2, false, REAR_TYRE_WIDTH_M],
  ] as const) {
    // Пивот рулит, вложенное колесо крутится: одна группа не удержит оба
    // вращения — поворот руля затирал бы фазу качения.
    const pivot = new THREE.Group()
    pivot.position.set(x, TYRE_RADIUS_M, z)

    // Воздуховод висит на пивоте, а не на колесе: он поворачивается вместе с
    // колесом, но не вращается — на болиде он привинчен к подвеске.
    const duct = brakeDuct(TYRE_RADIUS_M * 0.72, tyreWidth * 0.55, dark)
    duct.position.x = -Math.sign(x) * tyreWidth * 0.2
    pivot.add(duct)

    const wheel = new THREE.Group()
    const tyre = new THREE.Mesh(
      new THREE.CylinderGeometry(TYRE_RADIUS_M, TYRE_RADIUS_M, tyreWidth, 24),
      rubber,
    )
    tyre.rotation.z = Math.PI / 2
    // Диск чуть уже покрышки, спицы поверх него выступают наружу: заподлицо их
    // не видно, а без видимых спиц колесо — тело вращения и его качение невидимо.
    const disc = new THREE.Mesh(
      new THREE.CylinderGeometry(TYRE_RADIUS_M * 0.6, TYRE_RADIUS_M * 0.6, tyreWidth * 0.98, 18),
      rim,
    )
    disc.rotation.z = Math.PI / 2

    // Спицы: сплошной диск — тело вращения, и вращение колеса не видно вовсе.
    for (let s = 0; s < 5; s++) {
      const spoke = new THREE.Mesh(new THREE.BoxGeometry(tyreWidth * 1.08, 0.07, TYRE_RADIUS_M * 1.24), dark)
      spoke.rotation.x = (s / 5) * Math.PI
      wheel.add(spoke)
    }
    // Маркер на плече покрышки: по нему видно и вращение, и фазу заноса.
    const marker = new THREE.Mesh(
      new THREE.BoxGeometry(tyreWidth * 1.005, 0.014, TYRE_RADIUS_M * 1.995), accent,
    )
    wheel.add(marker)
    wheel.add(tyre, disc)
    pivot.add(wheel)
    group.add(pivot)
    wheels.push(wheel)
    if (isFront) steered.push(pivot)
  }

  mergeStaticBody(group, new Set(steered.concat(wheels.map((w) => w.parent as THREE.Object3D))))
  group.traverse((node) => { if (node instanceof THREE.Mesh) node.castShadow = true })
  void LENGTH_M
  return { group, wheels, steered }
}

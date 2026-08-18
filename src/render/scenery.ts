import * as THREE from 'three'
import type { Track, TrackPoint } from '../track/schema'
import { makeGrassTexture } from './textures'

const GRANDSTAND_OFFSET_M = 48
const TREE_EXCLUSION_M = 60

/**
 * Детерминированный шум: картинка обязана быть одинаковой между запусками,
 * иначе призрак прошлого круга едет по другому пейзажу, а скриншоты не
 * сравниваются между сборками.
 */
function hashRandom(seed: number): number {
  const x = Math.sin(seed * 12.9898) * 43758.5453
  return x - Math.floor(x)
}

function curvature(track: Track, index: number): number {
  const cl = track.centerline
  const n = cl.length
  const prev = cl[(index - 1 + n) % n]
  const here = cl[index]
  const next = cl[(index + 1) % n]
  const inX = here.x - prev.x, inZ = here.z - prev.z
  const outX = next.x - here.x, outZ = next.z - here.z
  const inLen = Math.hypot(inX, inZ) || 1
  const outLen = Math.hypot(outX, outZ) || 1
  const dot = (inX / inLen) * (outX / outLen) + (inZ / inLen) * (outZ / outLen)
  return Math.acos(Math.max(-1, Math.min(1, dot)))
}

/** Трибуны ставятся на прямых: в поворотах их закрывали бы отбойники и поребрики. */
export function grandstandSlots(track: Track): { position: TrackPoint; headingRad: number }[] {
  const cl = track.centerline
  const n = cl.length
  const slots: { position: TrackPoint; headingRad: number }[] = []

  for (let i = 0; i < n; i += 6) {
    const straight = [0, 1, 2].every((k) => curvature(track, (i + k) % n) < 0.02)
    if (!straight) continue
    const here = cl[i]
    const next = cl[(i + 3) % n]
    const heading = Math.atan2(next.x - here.x, next.z - here.z)
    // Смещение по нормали влево от направления движения.
    slots.push({
      position: {
        x: here.x - Math.cos(heading) * GRANDSTAND_OFFSET_M,
        y: 0,
        z: here.z + Math.sin(heading) * GRANDSTAND_OFFSET_M,
      },
      headingRad: heading,
    })
    if (slots.length >= 14) break
  }
  return slots
}

/** Деревья по округе, но не ближе TREE_EXCLUSION_M к полотну. */
export function treeSlots(track: Track, count: number): TrackPoint[] {
  const xs = track.centerline.map((p) => p.x)
  const zs = track.centerline.map((p) => p.z)
  const minX = Math.min(...xs) - 400, maxX = Math.max(...xs) + 400
  const minZ = Math.min(...zs) - 400, maxZ = Math.max(...zs) + 400

  const trees: TrackPoint[] = []
  for (let i = 0; trees.length < count && i < count * 12; i++) {
    const x = minX + hashRandom(i * 2 + 1) * (maxX - minX)
    const z = minZ + hashRandom(i * 2 + 2) * (maxZ - minZ)
    let nearest = Infinity
    for (const c of track.centerline) {
      const d = Math.hypot(x - c.x, z - c.z)
      if (d < nearest) nearest = d
      if (nearest < TREE_EXCLUSION_M) break
    }
    if (nearest > TREE_EXCLUSION_M) trees.push({ x, y: 0, z })
  }
  return trees
}

/** Ступени трибуны: шесть рядов, каждый выше и дальше предыдущего. */
const SEAT_ROWS = 6
const STAND_WIDTH_M = 40
const ROW_DEPTH_M = 2.4
const ROW_RISE_M = 1.5
/** Секции сидений: болельщики сидят цветными пятнами, а не ровным синим. */
const SEAT_COLORS = [0x2f5fa8, 0xc8102e, 0xe8e4d8]
const SEAT_SECTIONS = 5

export function buildGrandstands(track: Track): THREE.Group {
  const group = new THREE.Group()
  const slots = grandstandSlots(track)
  if (slots.length === 0) return group

  const concrete = new THREE.MeshStandardMaterial({ color: 0xb9bcc4, roughness: 0.9 })
  const roofMat = new THREE.MeshStandardMaterial({
    color: 0xe8e9ec, roughness: 0.45, metalness: 0.35, side: THREE.DoubleSide,
  })
  const trussMat = new THREE.MeshStandardMaterial({
    color: 0x9aa0a8, roughness: 0.5, metalness: 0.6,
  })

  // Все трибуны одинаковой геометрии — значит одна InstancedMesh на ступень,
  // а не Group на каждую: слотов до 14, ступеней 6, секций 5.
  const seatGeom = new THREE.BoxGeometry(STAND_WIDTH_M / SEAT_SECTIONS, ROW_RISE_M, ROW_DEPTH_M)
  const seatCount = slots.length * SEAT_ROWS * SEAT_SECTIONS
  const seats = new THREE.InstancedMesh(
    seatGeom,
    new THREE.MeshStandardMaterial({ color: 0xffffff, roughness: 0.75 }),
    seatCount,
  )

  const m = new THREE.Matrix4()
  const color = new THREE.Color()
  let seatIndex = 0

  slots.forEach((slot, s) => {
    const stand = new THREE.Group()
    const base = new THREE.Mesh(new THREE.BoxGeometry(STAND_WIDTH_M + 2, 2, SEAT_ROWS * ROW_DEPTH_M + 3), concrete)
    base.position.set(0, 1, 0)
    stand.add(base)

    const topY = 2 + SEAT_ROWS * ROW_RISE_M
    // Задняя стенка закрывает ступени с обратной стороны: без неё трибуна с
    // тыла — набор парящих коробок.
    const back = new THREE.Mesh(new THREE.BoxGeometry(STAND_WIDTH_M + 2, topY, 0.8), concrete)
    back.position.set(0, topY / 2, -(SEAT_ROWS * ROW_DEPTH_M) / 2 - 1)
    stand.add(back)
    for (const side of [-1, 1]) {
      // Боковины — треугольный профиль ступеней, срезанный по диагонали.
      const flankShape = new THREE.Shape()
      flankShape.moveTo(-(SEAT_ROWS * ROW_DEPTH_M) / 2, 0)
      flankShape.lineTo((SEAT_ROWS * ROW_DEPTH_M) / 2, 0)
      flankShape.lineTo(-(SEAT_ROWS * ROW_DEPTH_M) / 2, SEAT_ROWS * ROW_RISE_M)
      flankShape.closePath()
      const flank = new THREE.Mesh(new THREE.ShapeGeometry(flankShape), concrete)
      flank.rotation.y = Math.PI / 2
      flank.position.set((side * (STAND_WIDTH_M + 2)) / 2, 2, 0)
      stand.add(flank)
    }

    // Козырёк на ферме: наклонная плита плюс решётка тонких стоек и раскосов
    // вместо плиты, висящей в воздухе на двух столбах.
    const roofY = topY + 5.5
    const roof = new THREE.Mesh(new THREE.PlaneGeometry(STAND_WIDTH_M + 4, 13), roofMat)
    roof.rotation.x = -Math.PI / 2 + 0.16
    roof.position.set(0, roofY, -1)
    stand.add(roof)
    const columnGeom = new THREE.BoxGeometry(0.5, roofY, 0.5)
    const braceGeom = new THREE.BoxGeometry(0.3, 0.3, 8.2)
    for (let c = 0; c <= 4; c++) {
      const x = -STAND_WIDTH_M / 2 + (c * STAND_WIDTH_M) / 4
      const column = new THREE.Mesh(columnGeom, trussMat)
      column.position.set(x, roofY / 2, -(SEAT_ROWS * ROW_DEPTH_M) / 2 - 1)
      stand.add(column)
      const brace = new THREE.Mesh(braceGeom, trussMat)
      brace.position.set(x, roofY - 2.2, 2)
      brace.rotation.x = 0.28
      stand.add(brace)
    }
    const beamGeom = new THREE.BoxGeometry(STAND_WIDTH_M + 4, 0.45, 0.45)
    for (const z of [-(SEAT_ROWS * ROW_DEPTH_M) / 2 - 1, 4]) {
      const beam = new THREE.Mesh(beamGeom, trussMat)
      beam.position.set(0, roofY - (z > 0 ? 1.4 : 0.3), z)
      stand.add(beam)
    }

    stand.position.set(slot.position.x, 0, slot.position.z)
    stand.rotation.y = slot.headingRad
    group.add(stand)

    for (let row = 0; row < SEAT_ROWS; row++) {
      for (let section = 0; section < SEAT_SECTIONS; section++) {
        // Ступени считаются в системе трибуны и переносятся её матрицей:
        // одна InstancedMesh на все слоты не может быть ребёнком Group каждого.
        const local = new THREE.Vector3(
          -STAND_WIDTH_M / 2 + (section + 0.5) * (STAND_WIDTH_M / SEAT_SECTIONS),
          2 + (row + 0.5) * ROW_RISE_M,
          (SEAT_ROWS * ROW_DEPTH_M) / 2 - (row + 0.5) * ROW_DEPTH_M,
        )
        m.makeRotationY(slot.headingRad)
        local.applyMatrix4(m)
        m.setPosition(
          slot.position.x + local.x,
          local.y,
          slot.position.z + local.z,
        )
        seats.setMatrixAt(seatIndex, m)
        const pick = Math.floor(hashRandom(s * 97 + row * 11 + section * 3 + 7) * SEAT_COLORS.length)
        color.set(SEAT_COLORS[Math.min(pick, SEAT_COLORS.length - 1)])
        seats.setColorAt(seatIndex, color)
        seatIndex++
      }
    }
  })

  seats.count = seatIndex
  seats.instanceMatrix.needsUpdate = true
  if (seats.instanceColor !== null) seats.instanceColor.needsUpdate = true
  group.add(seats)
  return group
}

/** Ярусы кроны: радиус, низ и верх по высоте, доля светлого в цвете листвы. */
const CROWN_TIERS: { radius: number; bottom: number; top: number; tint: number }[] = [
  { radius: 3.2, bottom: 4.5, top: 7.2, tint: 0.0 },
  { radius: 2.3, bottom: 7.2, top: 9.2, tint: 0.5 },
  { radius: 1.4, bottom: 9.2, top: 10.8, tint: 1.0 },
]

const TREE_TILT_RAD = 0.07
/** Граней в конусе яруса. Шесть: силуэт даёт ярусность, а не гладкость конуса. */
const CROWN_SIDES = 6

const LOW_FOLIAGE = 0x24552c
const HIGH_FOLIAGE = 0x62a044

/**
 * Все три яруса в одной геометрии с цветом в вершинах. Три отдельных
 * InstancedMesh стоили 13 мс на кадр: рощу в 420 деревьев рисовало три полных
 * прохода вместо одного, и каждый заливал те же пиксели заново.
 */
function crownGeometry(): THREE.BufferGeometry {
  const positions: number[] = []
  const colors: number[] = []
  const low = new THREE.Color(LOW_FOLIAGE)
  const high = new THREE.Color(HIGH_FOLIAGE)
  const shade = new THREE.Color()

  for (const tier of CROWN_TIERS) {
    shade.copy(low).lerp(high, tier.tint)
    // Верхушка яруса светлее его же основания: свет падает сверху, и ровно
    // закрашенный конус — это и есть «майнкрафтовское» дерево.
    const apex = shade.clone().multiplyScalar(1.18)
    for (let i = 0; i < CROWN_SIDES; i++) {
      const a0 = (i / CROWN_SIDES) * Math.PI * 2
      const a1 = ((i + 1) / CROWN_SIDES) * Math.PI * 2
      positions.push(
        Math.cos(a0) * tier.radius, tier.bottom, Math.sin(a0) * tier.radius,
        Math.cos(a1) * tier.radius, tier.bottom, Math.sin(a1) * tier.radius,
        0, tier.top, 0,
      )
      colors.push(
        shade.r, shade.g, shade.b,
        shade.r, shade.g, shade.b,
        apex.r, apex.g, apex.b,
      )
      // Донце только у нижнего яруса: у верхних его закрывает ярус ниже, а
      // заливку под кроной оно тратит на каждом из 420 деревьев.
      if (tier === CROWN_TIERS[0]) {
        positions.push(
          Math.cos(a1) * tier.radius, tier.bottom, Math.sin(a1) * tier.radius,
          Math.cos(a0) * tier.radius, tier.bottom, Math.sin(a0) * tier.radius,
          0, tier.bottom, 0,
        )
        const dark = shade.clone().multiplyScalar(0.7)
        colors.push(dark.r, dark.g, dark.b, dark.r, dark.g, dark.b, dark.r, dark.g, dark.b)
      }
    }
  }

  const geometry = new THREE.BufferGeometry()
  geometry.setAttribute('position', new THREE.Float32BufferAttribute(positions, 3))
  geometry.setAttribute('color', new THREE.Float32BufferAttribute(colors, 3))
  geometry.computeVertexNormals()
  return geometry
}

export function buildTrees(track: Track, count = 420): THREE.Group {
  const group = new THREE.Group()
  const slots = treeSlots(track, count)
  if (slots.length === 0) return group

  // InstancedMesh: сотни деревьев одним вызовом отрисовки вместо сотен.
  const trunkGeom = new THREE.CylinderGeometry(0.28, 0.85, 5.4, 5)
  const trunkMat = new THREE.MeshStandardMaterial({ color: 0x5a4632, roughness: 1 })
  const trunks = new THREE.InstancedMesh(trunkGeom, trunkMat, slots.length)

  const crowns = new THREE.InstancedMesh(
    crownGeometry(),
    new THREE.MeshStandardMaterial({ vertexColors: true, roughness: 1 }),
    slots.length,
  )

  const m = new THREE.Matrix4()
  const euler = new THREE.Euler()
  const quat = new THREE.Quaternion()
  const scaleVec = new THREE.Vector3()
  const pos = new THREE.Vector3()

  slots.forEach((p, i) => {
    const scale = 0.7 + hashRandom(i * 7 + 3) * 0.9
    // Наклон до 4°: ровная вертикаль всех 420 стволов и есть то, что читается
    // как расставленные примитивы.
    const tiltX = (hashRandom(i * 13 + 5) - 0.5) * 2 * TREE_TILT_RAD
    const tiltZ = (hashRandom(i * 13 + 9) - 0.5) * 2 * TREE_TILT_RAD
    const spin = hashRandom(i * 17 + 4) * Math.PI * 2
    euler.set(tiltX, spin, tiltZ)
    quat.setFromEuler(euler)

    scaleVec.set(scale, scale, scale)
    pos.set(p.x, 2.7 * scale, p.z)
    m.compose(pos, quat, scaleVec)
    trunks.setMatrixAt(i, m)

    // Крона шире или уже роста: одинаковые пропорции у всех 420 выдают копии.
    const width = 0.82 + hashRandom(i * 31 + 21) * 0.4
    scaleVec.set(scale * width, scale, scale * width)
    pos.set(p.x, 0, p.z)
    m.compose(pos, quat, scaleVec)
    crowns.setMatrixAt(i, m)
  })

  trunks.instanceMatrix.needsUpdate = true
  crowns.instanceMatrix.needsUpdate = true
  group.add(trunks, crowns)
  return group
}

/**
 * Гряда на горизонте: кольцо из PlaneGeometry, поднятое шумом по вершинам.
 * Конусы с любого ракурса читались как треугольники, а неровный хребет — как
 * рельеф. Кольцо, а не плоскость: центр всё равно скрыт трассой и деревьями,
 * а вершин уходит в разы меньше.
 */
const HILL_SEGMENTS = 180
const HILL_BANDS = 6
/**
 * Внутренний край за деревьями: полотно Монцы уходит на 1217 м от центра, роща
 * ещё на 400 м дальше, и гряда с меньшим радиусом вырастала прямо на трассе
 * зелёным клином поперёк кадра.
 */
export const HILL_INNER_M = 1900
const HILL_OUTER_M = 3600

/**
 * Сумма трёх волн по углу: одна частота даёт правильную синусоиду, не рельеф.
 * Частоты целые — иначе функция не периодична на 2*PI и на стыке кольца
 * получается обрыв в десятки метров, то есть стена на горизонте.
 */
export function ridgeHeight(angle: number, bandFrac: number): number {
  const wave =
    Math.sin(angle * 3 + 0.7) * 0.55 +
    Math.sin(angle * 7 + 2.1) * 0.28 +
    Math.sin(angle * 18 + 4.4) * 0.12
  // Внутренний край прижат к земле, иначе гряда обрывается стеной перед трассой.
  const profile = Math.sin(Math.min(1, bandFrac) * Math.PI * 0.85)
  return (150 + wave * 130) * profile
}

export function buildHills(track: Track): THREE.Group {
  const group = new THREE.Group()
  const xs = track.centerline.map((p) => p.x)
  const zs = track.centerline.map((p) => p.z)
  const cx = (Math.min(...xs) + Math.max(...xs)) / 2
  const cz = (Math.min(...zs) + Math.max(...zs)) / 2

  const positions = new Float32Array((HILL_SEGMENTS + 1) * (HILL_BANDS + 1) * 3)
  const uvs = new Float32Array((HILL_SEGMENTS + 1) * (HILL_BANDS + 1) * 2)
  const indices: number[] = []
  const rowWidth = HILL_SEGMENTS + 1

  for (let band = 0; band <= HILL_BANDS; band++) {
    const bandFrac = band / HILL_BANDS
    const radius = HILL_INNER_M + bandFrac * (HILL_OUTER_M - HILL_INNER_M)
    for (let seg = 0; seg <= HILL_SEGMENTS; seg++) {
      // Последний сегмент повторяет первый по углу: кольцо должно замкнуться без шва.
      const wrapped = seg % HILL_SEGMENTS
      const angle = (wrapped / HILL_SEGMENTS) * Math.PI * 2
      // Дрожание тоже по завёрнутому индексу: с сырым seg последняя вершина
      // получала свой сдвиг и кольцо расходилось на стыке.
      const jitter = 1 + (hashRandom(wrapped * 3 + band * 131 + 17) - 0.5) * 0.12
      const i = band * rowWidth + seg
      positions[i * 3] = cx + Math.cos(angle) * radius * jitter
      positions[i * 3 + 1] = ridgeHeight(angle, bandFrac) * jitter - 12
      positions[i * 3 + 2] = cz + Math.sin(angle) * radius * jitter
      uvs[i * 2] = seg / HILL_SEGMENTS
      uvs[i * 2 + 1] = bandFrac
    }
  }
  for (let band = 0; band < HILL_BANDS; band++) {
    for (let seg = 0; seg < HILL_SEGMENTS; seg++) {
      const a = band * rowWidth + seg
      const b = a + 1
      const c = a + rowWidth
      const d = c + 1
      indices.push(a, c, b, b, c, d)
    }
  }

  const geometry = new THREE.BufferGeometry()
  geometry.setAttribute('position', new THREE.BufferAttribute(positions, 3))
  geometry.setAttribute('uv', new THREE.BufferAttribute(uvs, 2))
  geometry.setIndex(indices)
  geometry.computeVertexNormals()

  // Трава крупным повтором: без текстуры хребет — ровно закрашенный силуэт,
  // а мелкий повтор на двух километрах вырождается в муар.
  const grass = makeGrassTexture()
  grass.repeat.set(24, 3)
  const material = new THREE.MeshStandardMaterial({
    map: grass, color: 0x8fa07e, roughness: 1, side: THREE.DoubleSide,
  })
  const ridge = new THREE.Mesh(geometry, material)
  ridge.frustumCulled = false
  group.add(ridge)
  return group
}

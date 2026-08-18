import * as THREE from 'three'

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

export type F1Parts = {
  group: THREE.Group
  wheels: THREE.Object3D[]
  steered: THREE.Object3D[]
}

/** Профиль монокока: узкий нос, расширение к кокпиту, сужение к корме. */
function buildTub(material: THREE.Material): THREE.Mesh {
  const profile: THREE.Vector2[] = [
    new THREE.Vector2(0.02, 2.55),
    new THREE.Vector2(0.09, 2.1),
    new THREE.Vector2(0.16, 1.4),
    new THREE.Vector2(0.26, 0.55),
    new THREE.Vector2(0.3, -0.1),
    new THREE.Vector2(0.28, -0.9),
    new THREE.Vector2(0.2, -1.7),
    new THREE.Vector2(0.12, -2.4),
  ]
  // Лофт по профилю: радиус меняется вдоль оси Z, поэтому корпус получается
  // цельным телом, а не набором состыкованных коробок.
  const points: THREE.Vector2[] = profile.map((p) => new THREE.Vector2(p.x, p.y))
  const geometry = new THREE.LatheGeometry(points, 18)
  geometry.rotateX(-Math.PI / 2)
  geometry.scale(1, 0.75, 1)
  const mesh = new THREE.Mesh(geometry, material)
  mesh.position.y = 0.28
  return mesh
}

function wingElement(
  width: number, chord: number, thickness: number, material: THREE.Material,
): THREE.Mesh {
  const shape = new THREE.Shape()
  shape.moveTo(-chord / 2, 0)
  shape.quadraticCurveTo(0, thickness, chord / 2, 0)
  shape.quadraticCurveTo(0, -thickness * 0.35, -chord / 2, 0)
  const geometry = new THREE.ExtrudeGeometry(shape, { depth: width, bevelEnabled: false })
  geometry.translate(0, 0, -width / 2)
  geometry.rotateY(Math.PI / 2)
  return new THREE.Mesh(geometry, material)
}

export function buildF1Car(colour = 0x1a4fa0): F1Parts {
  const group = new THREE.Group()
  const body = new THREE.MeshStandardMaterial({ color: colour, metalness: 0.45, roughness: 0.35 })
  const dark = new THREE.MeshStandardMaterial({ color: 0x14151a, metalness: 0.3, roughness: 0.55 })
  const rubber = new THREE.MeshStandardMaterial({ color: 0x111114, roughness: 0.95 })
  const rim = new THREE.MeshStandardMaterial({ color: 0xc9ccd4, metalness: 0.9, roughness: 0.22 })

  group.add(buildTub(body))

  // Носовой конус: тонкий и приподнятый, переходит в пилоны переднего крыла.
  const nose = new THREE.Mesh(new THREE.CylinderGeometry(0.05, 0.13, 1.5, 12), body)
  nose.rotation.x = Math.PI / 2
  nose.position.set(0, 0.32, 2.35)
  group.add(nose)

  // Переднее крыло: четыре элемента нарастающего угла, как в регламенте.
  for (let i = 0; i < 4; i++) {
    const element = wingElement(FRONT_WING_WIDTH_M - i * 0.06, 0.3 - i * 0.03, 0.035, i === 0 ? body : dark)
    element.position.set(0, 0.1 + i * 0.07, 2.72 - i * 0.09)
    element.rotation.x = -0.14 * (i + 1)
    group.add(element)
  }
  for (const side of [-1, 1]) {
    const endplate = new THREE.Mesh(new THREE.BoxGeometry(0.03, 0.36, 0.62), dark)
    endplate.position.set(side * FRONT_WING_WIDTH_M / 2, 0.2, 2.62)
    group.add(endplate)
  }

  // Понтоны с боковыми воздухозаборниками, сужающиеся к корме.
  for (const side of [-1, 1]) {
    const pod = new THREE.Mesh(new THREE.CylinderGeometry(0.3, 0.13, 2.0, 10), body)
    pod.rotation.x = Math.PI / 2
    pod.scale.set(1, 0.62, 1)
    pod.position.set(side * 0.56, 0.32, -0.5)
    group.add(pod)
    const inlet = new THREE.Mesh(new THREE.BoxGeometry(0.06, 0.26, 0.34), dark)
    inlet.position.set(side * 0.72, 0.34, 0.42)
    group.add(inlet)
  }

  // Воздухозаборник над головой пилота и акулий плавник к заднему крылу.
  const airbox = new THREE.Mesh(new THREE.ConeGeometry(0.19, 0.5, 8), body)
  airbox.rotation.x = Math.PI / 2
  airbox.position.set(0, 0.72, -0.42)
  group.add(airbox)
  const fin = new THREE.Mesh(new THREE.BoxGeometry(0.03, 0.26, 1.5), body)
  fin.position.set(0, 0.6, -1.35)
  group.add(fin)

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
    const pylon = new THREE.Mesh(new THREE.BoxGeometry(0.04, 0.34, 0.14), dark)
    pylon.position.set(side * 0.14, 0.72, -2.5)
    group.add(pylon)
  }

  // Диффузор.
  const diffuser = new THREE.Mesh(new THREE.BoxGeometry(0.9, 0.1, 0.4), dark)
  diffuser.position.set(0, 0.1, -2.25)
  diffuser.rotation.x = -0.3
  group.add(diffuser)

  // Halo и шлем — без них кокпит читается как дыра.
  const halo = new THREE.Mesh(new THREE.TorusGeometry(0.3, 0.035, 8, 20, Math.PI), dark)
  halo.position.set(0, 0.66, 0.34)
  halo.rotation.x = -Math.PI / 2
  group.add(halo)
  const helmet = new THREE.Mesh(new THREE.SphereGeometry(0.15, 14, 12), dark)
  helmet.position.set(0, 0.62, 0.16)
  group.add(helmet)

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

    const wheel = new THREE.Group()
    const tyre = new THREE.Mesh(
      new THREE.CylinderGeometry(TYRE_RADIUS_M, TYRE_RADIUS_M, tyreWidth, 26),
      rubber,
    )
    tyre.rotation.z = Math.PI / 2
    const disc = new THREE.Mesh(
      new THREE.CylinderGeometry(TYRE_RADIUS_M * 0.64, TYRE_RADIUS_M * 0.64, tyreWidth * 1.02, 18),
      rim,
    )
    disc.rotation.z = Math.PI / 2
    // Спицы: сплошной диск — тело вращения, и вращение колеса не видно вовсе.
    for (let s = 0; s < 5; s++) {
      const spoke = new THREE.Mesh(new THREE.BoxGeometry(tyreWidth * 1.04, 0.05, TYRE_RADIUS_M * 1.15), rim)
      spoke.rotation.x = (s / 5) * Math.PI
      wheel.add(spoke)
    }
    wheel.add(tyre, disc)
    pivot.add(wheel)
    group.add(pivot)
    wheels.push(wheel)
    if (isFront) steered.push(pivot)
  }

  group.traverse((node) => { if (node instanceof THREE.Mesh) node.castShadow = true })
  void LENGTH_M
  return { group, wheels, steered }
}

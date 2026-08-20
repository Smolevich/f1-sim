import * as THREE from 'three'
import { WHEEL_RADIUS_M } from '../physics/drivetrain'
import { steerLimitForSpeed } from '../physics/vehicle'

const WHEEL_WIDTH_M = 0.38
/** Максимальный угол поворота колёс в рендере, совпадает с MAX_STEER_RAD физики. */
const MAX_STEER_RAD = 0.3
/** Колёсная база — та же, что в физике: предел руля считается через неё. */
const WHEELBASE_M = 3.6

export type CarParts = {
  group: THREE.Group
  wheels: THREE.Object3D[]
  steered: THREE.Object3D[]
}

export function wheelSpinDelta(speedMs: number, dt: number): number {
  return speedMs <= 0 ? 0 : (speedMs / WHEEL_RADIUS_M) * dt
}

/**
 * Знак обратен физическому: в three.js положительный rotation.y вращает против
 * часовой стрелки, а rotateY в vehicle.ts — по часовой. Без инверсии колёса
 * визуально поворачивают в сторону, противоположную рулю.
 */
export function steerAngleFor(steer: number, speedMs = 0): number {
  // Тот же предел по скорости, что в физике: она на 350 км/ч даёт 0.9°, а
  // рендер крутил полные 17.2° — в 20 раз больше. Колёса выворачивались
  // так, как на такой скорости невозможно, и картинка врала про физику.
  const limit = steerLimitForSpeed(speedMs, WHEELBASE_M, MAX_STEER_RAD)
  return -Math.max(-1, Math.min(1, steer)) * limit
}

export function spinWheels(parts: CarParts, speedMs: number, steer: number, dt: number): void {
  const delta = wheelSpinDelta(speedMs, dt)
  for (const wheel of parts.wheels) wheel.rotation.x -= delta
  const angle = steerAngleFor(steer, speedMs)
  for (const pivot of parts.steered) pivot.rotation.y = angle
}

export function buildCarParts(color = 0x1e3a8a): CarParts {
  const group = new THREE.Group()
  const body = new THREE.MeshStandardMaterial({ color, metalness: 0.6, roughness: 0.35 })
  const dark = new THREE.MeshStandardMaterial({ color: 0x15161a, metalness: 0.4, roughness: 0.5 })
  const rubber = new THREE.MeshStandardMaterial({ color: 0x0d0d0f, roughness: 0.9 })
  const rim = new THREE.MeshStandardMaterial({ color: 0xb8b8c0, metalness: 0.9, roughness: 0.25 })

  // Силуэт собирается из скруглённых форм, а не из коробок: у настоящего болида
  // нет ни одной прямоугольной поверхности, и именно углы читаются как «майнкрафт».
  // Капсулы и лате-формы дают тот же вес геометрии, но узнаваемый профиль.
  const tub = new THREE.Mesh(new THREE.CapsuleGeometry(0.36, 2.5, 6, 16), body)
  tub.rotation.x = Math.PI / 2
  tub.scale.set(1, 1, 0.62)
  tub.position.set(0, 0.44, -0.15)
  group.add(tub)

  // Моторный отсек сужается к корме: конус вместо коробки.
  const engineCover = new THREE.Mesh(new THREE.CylinderGeometry(0.34, 0.17, 1.9, 12), body)
  engineCover.rotation.x = Math.PI / 2
  engineCover.position.set(0, 0.55, -1.5)
  group.add(engineCover)

  // Воздухозаборник над головой пилота — характерная «горбушка» F1.
  const airbox = new THREE.Mesh(new THREE.SphereGeometry(0.26, 12, 10), body)
  airbox.scale.set(0.8, 1.05, 1.25)
  airbox.position.set(0, 0.86, -0.5)
  group.add(airbox)

  // Акулий плавник: профиль рисуется в XY, поэтому длина по X, высота по Y,
  // а поворот на -90° вокруг Y укладывает его вдоль машины. Без поворота
  // экструзия уходит поперёк и плавник встаёт стеной через всю сцену.
  const finShape = new THREE.Shape()
  finShape.moveTo(0, 0)
  finShape.lineTo(1.6, 0)
  finShape.lineTo(1.6, 0.1)
  finShape.quadraticCurveTo(0.7, 0.3, 0, 0.24)
  finShape.closePath()
  const fin = new THREE.Mesh(
    new THREE.ExtrudeGeometry(finShape, { depth: 0.035, bevelEnabled: false }),
    body,
  )
  fin.rotation.y = -Math.PI / 2
  fin.position.set(0.018, 0.6, -0.75)
  group.add(fin)

  for (const side of [-1, 1]) {
    // Понтон: капсула со скосом наружу, а не параллелепипед.
    const pod = new THREE.Mesh(new THREE.CapsuleGeometry(0.24, 1.15, 4, 12), body)
    pod.rotation.x = Math.PI / 2
    pod.scale.set(1, 1, 0.78)
    pod.position.set(side * 0.63, 0.4, -0.65)
    group.add(pod)
    // Боковой воздухозаборник.
    const inlet = new THREE.Mesh(new THREE.CylinderGeometry(0.19, 0.19, 0.12, 12), dark)
    inlet.rotation.z = Math.PI / 2
    inlet.position.set(side * 0.7, 0.44, 0.05)
    group.add(inlet)
  }

  // Тонкий приподнятый нос: конус с малым радиусом, как в современном регламенте.
  const nose = new THREE.Mesh(new THREE.CylinderGeometry(0.06, 0.2, 2.1, 10), body)
  nose.rotation.x = Math.PI / 2
  nose.position.set(0, 0.34, 2.0)
  group.add(nose)

  // Переднее крыло: три плоскости с изгибом вместо одной коробки.
  for (const [i, w, y, z, thick] of [[0, 2.0, 0.10, 2.62, 0.045], [1, 1.9, 0.20, 2.5, 0.035], [2, 1.75, 0.28, 2.38, 0.03]] as const) {
    const flap = new THREE.Mesh(new THREE.BoxGeometry(w, thick, 0.34), i === 0 ? body : dark)
    flap.position.set(0, y, z)
    flap.rotation.x = -0.12 * (i + 1)
    group.add(flap)
  }
  for (const side of [-1, 1]) {
    const plate = new THREE.Mesh(new THREE.BoxGeometry(0.04, 0.34, 0.72), dark)
    plate.position.set(side * 1.0, 0.21, 2.5)
    group.add(plate)
  }

  // Заднее крыло на двух пилонах, выше и уже переднего.
  const rearWing = new THREE.Mesh(new THREE.BoxGeometry(1.55, 0.05, 0.5), body)
  rearWing.position.set(0, 1.02, -2.62)
  rearWing.rotation.x = 0.14
  group.add(rearWing)
  const rearFlap = new THREE.Mesh(new THREE.BoxGeometry(1.5, 0.04, 0.26), dark)
  rearFlap.position.set(0, 1.16, -2.72)
  rearFlap.rotation.x = 0.3
  group.add(rearFlap)
  for (const side of [-1, 1]) {
    const endplate = new THREE.Mesh(new THREE.BoxGeometry(0.04, 0.5, 0.66), dark)
    endplate.position.set(side * 0.78, 0.92, -2.62)
    group.add(endplate)
    const pylon = new THREE.Mesh(new THREE.BoxGeometry(0.05, 0.36, 0.16), dark)
    pylon.position.set(side * 0.16, 0.82, -2.6)
    group.add(pylon)
  }

  // Диффузор со скосом.
  const diffuser = new THREE.Mesh(new THREE.CylinderGeometry(0.3, 0.42, 0.6, 8, 1, false, 0, Math.PI), dark)
  diffuser.rotation.x = -Math.PI / 2
  diffuser.rotation.z = Math.PI
  diffuser.scale.set(1.7, 1, 0.55)
  diffuser.position.set(0, 0.2, -2.5)
  group.add(diffuser)

  // Halo и шлем.
  const halo = new THREE.Mesh(new THREE.TorusGeometry(0.35, 0.04, 8, 22, Math.PI), dark)
  halo.position.set(0, 0.76, 0.3)
  halo.rotation.x = -Math.PI / 2
  group.add(halo)
  const helmet = new THREE.Mesh(new THREE.SphereGeometry(0.16, 14, 12), dark)
  helmet.position.set(0, 0.71, 0.12)
  group.add(helmet)

  // Колесо в собственном пивоте: пивот поворачивается рулём, колесо крутится
  // вокруг своей оси — без разделения одно движение затирало бы другое.
  const wheels: THREE.Object3D[] = []
  const steered: THREE.Object3D[] = []
  const tyreGeometry = new THREE.CylinderGeometry(WHEEL_RADIUS_M, WHEEL_RADIUS_M, WHEEL_WIDTH_M, 24)
  const rimGeometry = new THREE.CylinderGeometry(
    WHEEL_RADIUS_M * 0.62, WHEEL_RADIUS_M * 0.62, WHEEL_WIDTH_M * 1.02, 16,
  )
  // Спица — брусок по диаметру диска. Ось колеса лежит вдоль X (покрышка
  // повёрнута на z=π/2), поэтому плоскость диска — это YZ, и длина спицы идёт
  // по Z, а толщина по X чуть шире покрышки, чтобы спица не тонула в резине.
  const spokeGeometry = new THREE.BoxGeometry(
    WHEEL_WIDTH_M * 1.04, 0.045, WHEEL_RADIUS_M * 1.2,
  )

  for (const [x, z, isFront] of [
    [-0.86, 1.75, true], [0.86, 1.75, true], [-0.86, -1.75, false], [0.86, -1.75, false],
  ] as const) {
    const pivot = new THREE.Group()
    pivot.position.set(x, WHEEL_RADIUS_M, z)
    const wheel = new THREE.Group()
    const tyre = new THREE.Mesh(tyreGeometry, rubber)
    tyre.rotation.z = Math.PI / 2
    const disc = new THREE.Mesh(rimGeometry, rim)
    disc.rotation.z = Math.PI / 2
    wheel.add(tyre, disc)

    // Без спиц вращение не видно: и покрышка, и диск — тела вращения, их поворот
    // вокруг собственной оси не меняет ни одного пикселя.
    for (let i = 0; i < 5; i++) {
      const spoke = new THREE.Mesh(spokeGeometry, rim)
      spoke.rotation.x = (i * Math.PI) / 5
      wheel.add(spoke)
    }
    pivot.add(wheel)
    group.add(pivot)
    wheels.push(wheel)
    if (isFront) steered.push(pivot)
  }

  group.traverse((node) => { if (node instanceof THREE.Mesh) node.castShadow = true })
  return { group, wheels, steered }
}

/** Болид собирается кодом: пропорции по регламенту, ливрея своя. */
export function buildCar(color = 0x1e3a8a): THREE.Group {
  return buildCarParts(color).group
}

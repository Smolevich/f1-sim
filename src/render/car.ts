import * as THREE from 'three'
import { WHEEL_RADIUS_M } from '../physics/drivetrain'

const WIDTH_M = 2.0
const WHEEL_WIDTH_M = 0.38
/** Максимальный угол поворота колёс в рендере, совпадает с MAX_STEER_RAD физики. */
const MAX_STEER_RAD = 0.3

export type CarParts = {
  group: THREE.Group
  wheels: THREE.Object3D[]
  steered: THREE.Object3D[]
}

export function wheelSpinDelta(speedMs: number, dt: number): number {
  return speedMs <= 0 ? 0 : (speedMs / WHEEL_RADIUS_M) * dt
}

export function steerAngleFor(steer: number): number {
  return Math.max(-1, Math.min(1, steer)) * MAX_STEER_RAD
}

export function spinWheels(parts: CarParts, speedMs: number, steer: number, dt: number): void {
  const delta = wheelSpinDelta(speedMs, dt)
  for (const wheel of parts.wheels) wheel.rotation.x -= delta
  const angle = steerAngleFor(steer)
  for (const pivot of parts.steered) pivot.rotation.y = angle
}

export function buildCarParts(color = 0x1e3a8a): CarParts {
  const group = new THREE.Group()
  const body = new THREE.MeshStandardMaterial({ color, metalness: 0.6, roughness: 0.35 })
  const dark = new THREE.MeshStandardMaterial({ color: 0x15161a, metalness: 0.4, roughness: 0.5 })
  const rubber = new THREE.MeshStandardMaterial({ color: 0x0d0d0f, roughness: 0.9 })
  const rim = new THREE.MeshStandardMaterial({ color: 0xb8b8c0, metalness: 0.9, roughness: 0.25 })

  // Монокок: узкий нос, широкие понтоны, сужение к корме — силуэт F1 читается
  // в основном по этому профилю, а не по деталям.
  const tub = new THREE.Mesh(new THREE.BoxGeometry(0.85, 0.32, 2.6), body)
  tub.position.set(0, 0.42, -0.1)
  group.add(tub)

  const engineCover = new THREE.Mesh(new THREE.BoxGeometry(0.7, 0.42, 1.9), body)
  engineCover.position.set(0, 0.55, -1.3)
  group.add(engineCover)

  const airbox = new THREE.Mesh(new THREE.BoxGeometry(0.34, 0.3, 0.5), body)
  airbox.position.set(0, 0.86, -0.55)
  group.add(airbox)

  for (const side of [-1, 1]) {
    const pod = new THREE.Mesh(new THREE.BoxGeometry(0.42, 0.34, 1.7), body)
    pod.position.set(side * 0.62, 0.4, -0.5)
    group.add(pod)
  }

  const nose = new THREE.Mesh(new THREE.ConeGeometry(0.2, 1.9, 10), body)
  nose.rotation.x = Math.PI / 2
  nose.position.set(0, 0.36, 1.9)
  group.add(nose)

  const frontWing = new THREE.Mesh(new THREE.BoxGeometry(WIDTH_M, 0.07, 0.75), body)
  frontWing.position.set(0, 0.14, 2.55)
  group.add(frontWing)

  const frontFlap = new THREE.Mesh(new THREE.BoxGeometry(WIDTH_M * 0.95, 0.05, 0.3), dark)
  frontFlap.position.set(0, 0.26, 2.45)
  group.add(frontFlap)

  const rearWing = new THREE.Mesh(new THREE.BoxGeometry(WIDTH_M * 0.8, 0.05, 0.62), body)
  rearWing.position.set(0, 0.98, -2.5)
  group.add(rearWing)

  for (const side of [-1, 1]) {
    const endplate = new THREE.Mesh(new THREE.BoxGeometry(0.05, 0.45, 0.62), dark)
    endplate.position.set(side * WIDTH_M * 0.4, 0.82, -2.5)
    group.add(endplate)
  }

  const diffuser = new THREE.Mesh(new THREE.BoxGeometry(1.1, 0.22, 0.5), dark)
  diffuser.position.set(0, 0.22, -2.35)
  group.add(diffuser)

  const halo = new THREE.Mesh(new THREE.TorusGeometry(0.36, 0.045, 8, 20, Math.PI), dark)
  halo.position.set(0, 0.78, 0.35)
  halo.rotation.x = -Math.PI / 2
  group.add(halo)

  const helmet = new THREE.Mesh(new THREE.SphereGeometry(0.17, 12, 10), dark)
  helmet.position.set(0, 0.72, 0.15)
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

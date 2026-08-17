import * as THREE from 'three'
import { WHEEL_RADIUS_M } from '../physics/drivetrain'

const LENGTH_M = 5.6
const WIDTH_M = 2.0
// Радиус колеса — из физики, чтобы меш и симуляция не разъехались.
const WHEEL_WIDTH_M = 0.38

/** Болид собирается кодом: пропорции по регламенту, ливрея своя. */
export function buildCar(color = 0x1e3a8a): THREE.Group {
  const car = new THREE.Group()
  const body = new THREE.MeshStandardMaterial({ color, metalness: 0.5, roughness: 0.4 })
  const rubber = new THREE.MeshStandardMaterial({ color: 0x111111 })

  const chassis = new THREE.Mesh(new THREE.BoxGeometry(0.9, 0.35, LENGTH_M * 0.6), body)
  chassis.position.y = 0.4
  car.add(chassis)

  const nose = new THREE.Mesh(new THREE.ConeGeometry(0.28, 1.8, 8), body)
  nose.rotation.x = Math.PI / 2
  nose.position.set(0, 0.35, LENGTH_M / 2 - 0.6)
  car.add(nose)

  const rearWing = new THREE.Mesh(new THREE.BoxGeometry(WIDTH_M * 0.85, 0.32, 0.5), body)
  rearWing.position.set(0, 0.95, -LENGTH_M / 2 + 0.3)
  car.add(rearWing)

  const frontWing = new THREE.Mesh(new THREE.BoxGeometry(WIDTH_M, 0.1, 0.6), body)
  frontWing.position.set(0, 0.15, LENGTH_M / 2 - 0.1)
  car.add(frontWing)

  const halo = new THREE.Mesh(new THREE.TorusGeometry(0.4, 0.05, 8, 24, Math.PI), body)
  halo.position.set(0, 0.75, 0.3)
  halo.rotation.x = -Math.PI / 2
  car.add(halo)

  const wheelGeometry = new THREE.CylinderGeometry(WHEEL_RADIUS_M, WHEEL_RADIUS_M, WHEEL_WIDTH_M, 20)
  for (const [x, z] of [[-0.8, 1.8], [0.8, 1.8], [-0.8, -1.8], [0.8, -1.8]]) {
    const wheel = new THREE.Mesh(wheelGeometry, rubber)
    wheel.rotation.z = Math.PI / 2
    wheel.position.set(x, WHEEL_RADIUS_M, z)
    car.add(wheel)
  }

  return car
}

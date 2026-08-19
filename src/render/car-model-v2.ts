import * as THREE from 'three'
import {
  buildAirbox, buildCockpitRim, buildEndplate, buildFloor, buildHalo,
  buildNosePylons, buildRearWing, buildShell, buildSidepod, buildWing,
} from './car-build'
import { FRONT_WING, FRONT_AXLE_Z, HALF_TRACK_M, REAR_AXLE_Z, WHEEL_RADIUS_M } from './car-shape'
import { buildWheel, FRONT_WHEEL, REAR_WHEEL } from './wheel-mesh'
import type { CarParts } from './car'

/**
 * Болид, собранный из собственной геометрии.
 *
 * Части красятся по назначению, а не одним цветом: кузов и нос несут цвет
 * команды, антикрылья и halo — карбон, днище тёмное. Так болид читается как
 * ливрея конкретной команды, а не как литая игрушка.
 */
export function buildCarV2(livery: number, accent: number): CarParts {
  const group = new THREE.Group()

  const body = new THREE.MeshStandardMaterial({
    color: livery, metalness: 0.42, roughness: 0.34,
  })
  const carbon = new THREE.MeshStandardMaterial({
    color: 0x1c1e23, metalness: 0.35, roughness: 0.5,
  })
  const dark = new THREE.MeshStandardMaterial({
    color: 0x101216, metalness: 0.25, roughness: 0.7,
  })
  const trim = new THREE.MeshStandardMaterial({
    color: accent, metalness: 0.5, roughness: 0.3,
  })

  const add = (geometry: THREE.BufferGeometry, material: THREE.Material): void => {
    const mesh = new THREE.Mesh(geometry, material)
    mesh.castShadow = true
    group.add(mesh)
  }

  add(buildShell(), body)
  add(buildFloor(), dark)
  add(buildSidepod(1), body)
  add(buildSidepod(-1), body)
  add(buildAirbox(), body)
  add(buildCockpitRim(), carbon)

  for (const g of buildWing(
    FRONT_WING.z, FRONT_WING.halfWidth, FRONT_WING.chord,
    FRONT_WING.elements, FRONT_WING.baseY,
  )) add(g, carbon)

  for (const side of [-1, 1] as const) {
    add(buildEndplate(
      FRONT_WING.z, FRONT_WING.halfWidth, FRONT_WING.chord,
      FRONT_WING.baseY, FRONT_WING.endplateHeight, side,
    ), trim)
  }

  for (const g of buildNosePylons()) add(g, carbon)
  for (const g of buildHalo()) add(g, carbon)
  for (const [i, g] of buildRearWing().entries()) add(g, i >= 2 ? trim : carbon)

  const wheels: THREE.Object3D[] = []
  const steered: THREE.Object3D[] = []
  for (const corner of [
    { x: -1, z: FRONT_AXLE_Z, steered: true },
    { x: 1, z: FRONT_AXLE_Z, steered: true },
    { x: -1, z: REAR_AXLE_Z, steered: false },
    { x: 1, z: REAR_AXLE_Z, steered: false },
  ] as const) {
    const hub = new THREE.Group()
    hub.position.set(corner.x * HALF_TRACK_M, WHEEL_RADIUS_M, corner.z)
    const wheel = buildWheel(corner.steered ? FRONT_WHEEL : REAR_WHEEL)
    wheel.traverse((n) => { n.castShadow = true })
    hub.add(wheel)
    group.add(hub)
    // Вращение и руль на разных узлах: на одном углы Эйлера перемножаются
    // и колесо ходит восьмёркой.
    wheels.push(wheel)
    if (corner.steered) steered.push(hub)
  }

  return { group, wheels, steered }
}

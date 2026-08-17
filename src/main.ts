import RAPIER from '@dimforge/rapier3d-compat'
import * as THREE from 'three'
import { KeyboardInput } from './input/keyboard'
import { Vehicle } from './physics/vehicle'
import { FIXED_STEP, stepsFor, type Accumulator } from './physics/world'
import { buildCar } from './render/car'
import { createScene } from './render/scene'
import { buildTrackMesh } from './render/track-mesh'
import type { Track } from './track/schema'

const CAMERA_HEIGHT_M = 8
const CAMERA_DISTANCE_M = 18

async function main(): Promise<void> {
  await RAPIER.init()

  const canvas = document.createElement('canvas')
  document.body.style.margin = '0'
  document.body.appendChild(canvas)

  const { scene, camera, renderer } = createScene(canvas)

  const track: Track = await fetch('/tracks/monza.json').then((r) => r.json())
  scene.add(buildTrackMesh(track))

  const carMesh = buildCar()
  scene.add(carMesh)

  const vehicle = new Vehicle()
  const input = new KeyboardInput()
  let acc: Accumulator = { pending: 0 }
  let last = performance.now()

  const frame = (now: number): void => {
    const frameSeconds = Math.min(0.25, (now - last) / 1000)
    last = now

    const result = stepsFor(acc, frameSeconds)
    acc = result.acc
    for (let i = 0; i < result.steps; i++) {
      vehicle.step(input.read(FIXED_STEP), FIXED_STEP)
    }

    const t = vehicle.telemetry()
    const q = vehicle.orientation()
    carMesh.position.set(t.position.x, t.position.y, t.position.z)
    carMesh.quaternion.set(q.x, q.y, q.z, q.w)

    // Камера висит позади машины по её собственному направлению, иначе на
    // повороте она остаётся смотреть вдоль мировой оси и трасса уезжает вбок.
    const behind = new THREE.Vector3(0, 0, -CAMERA_DISTANCE_M).applyQuaternion(carMesh.quaternion)
    camera.position.set(
      t.position.x + behind.x,
      t.position.y + CAMERA_HEIGHT_M,
      t.position.z + behind.z,
    )
    camera.lookAt(new THREE.Vector3(t.position.x, t.position.y, t.position.z))

    renderer.render(scene, camera)
    requestAnimationFrame(frame)
  }

  requestAnimationFrame(frame)
}

main()

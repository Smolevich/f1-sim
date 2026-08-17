import RAPIER from '@dimforge/rapier3d-compat'
import * as THREE from 'three'
import { GhostRecorder, sampleGhost, type GhostLap } from './ghost/recorder'
import { KeyboardInput } from './input/keyboard'
import { submitLap } from './net/leaderboard'
import { Vehicle } from './physics/vehicle'
import { FIXED_STEP, stepsFor, type Accumulator } from './physics/world'
import { buildCar } from './render/car'
import { buildGhostCar } from './render/ghost-car'
import { Hud } from './render/hud'
import { askName } from './render/menu'
import { createScene } from './render/scene'
import { buildTrackMesh } from './render/track-mesh'
import {
  loadBest, loadGhost, loadName, saveBest, saveGhost, saveName,
} from './storage/local'
import {
  createLapState, progressFraction, sectorFor, updateLap, type LapState,
} from './timing/laptimer'
import { isOnTrack, startPose } from './track/geometry'
import type { Track } from './track/schema'

const CAMERA_HEIGHT_M = 7
const CAMERA_BACK_M = 17

async function main(): Promise<void> {
  await RAPIER.init()

  const canvas = document.createElement('canvas')
  document.body.style.margin = '0'
  document.body.style.overflow = 'hidden'
  document.body.appendChild(canvas)

  const { scene, camera, renderer } = createScene(canvas)
  const track: Track = await fetch('/tracks/monza.json').then((r) => r.json())
  scene.add(buildTrackMesh(track))

  const carMesh = buildCar()
  scene.add(carMesh)
  const ghostMesh = buildGhostCar()
  ghostMesh.visible = false
  scene.add(ghostMesh)

  const name = await askName(loadName())
  saveName(name)

  const hud = new Hud()
  const input = new KeyboardInput()
  const recorder = new GhostRecorder()

  let vehicle = new Vehicle(undefined, startPose(track))
  let lap: LapState = createLapState()
  let best = loadBest(track.meta.id)
  let ghost: GhostLap | null = loadGhost(track.meta.id)
  // Часы сессии монотонны: updateLap хранит начало круга в этой же шкале и
  // вычитает его сам, поэтому обнулять её на финише нельзя — время круга уйдёт
  // в минус. Время текущего круга считается как sessionMs - lap.startedAtMs.
  let sessionMs = 0
  let acc: Accumulator = { pending: 0 }
  let last = performance.now()

  const reset = (): void => {
    vehicle = new Vehicle(undefined, startPose(track))
    lap = createLapState()
    recorder.reset()
  }

  window.addEventListener('keydown', (e) => {
    if (e.code === 'KeyR') reset()
  })

  const frame = (now: number): void => {
    const frameSeconds = Math.min(0.25, (now - last) / 1000)
    last = now

    const result = stepsFor(acc, frameSeconds)
    acc = result.acc

    let drs = false
    for (let i = 0; i < result.steps; i++) {
      const controls = input.read(FIXED_STEP)
      drs = controls.drs
      vehicle.step(controls, FIXED_STEP)
      sessionMs += FIXED_STEP * 1000

      const telemetry = vehicle.telemetry()
      const onTrack = isOnTrack(track, telemetry.position)
      const lapMs = sessionMs - (lap.startedAtMs ?? sessionMs)
      recorder.record(lapMs, telemetry.position, vehicle.orientation())

      const step = updateLap(lap, track, telemetry.position, sessionMs, onTrack)
      lap = step.state

      if (step.completed !== null) {
        const done = step.completed
        if (done.valid && (best === null || done.timeMs < best.timeMs)) {
          best = { timeMs: done.timeMs, sectors: done.sectors }
          saveBest(track.meta.id, best)
          const recorded = recorder.finish(done.timeMs)
          saveGhost(track.meta.id, recorded)
          ghost = recorded
        }
        if (done.valid) {
          void submitLap({
            track: track.meta.id,
            name,
            timeMs: done.timeMs,
            sectors: done.sectors,
            assists: input.assists(),
          })
        }
        recorder.reset()
      }
    }

    const telemetry = vehicle.telemetry()
    const orientation = vehicle.orientation()
    carMesh.position.set(telemetry.position.x, telemetry.position.y, telemetry.position.z)
    carMesh.quaternion.set(orientation.x, orientation.y, orientation.z, orientation.w)

    const lapMs = sessionMs - (lap.startedAtMs ?? sessionMs)

    if (ghost !== null) {
      const f = sampleGhost(ghost, lapMs)
      if (f !== null) {
        ghostMesh.visible = true
        ghostMesh.position.set(f.x, f.y, f.z)
        // Призрак хранит только рыскание: болид не переворачивается.
        ghostMesh.quaternion.set(0, f.qy, 0, f.qw)
      }
    }

    const heading = Math.atan2(
      2 * (orientation.w * orientation.y + orientation.x * orientation.z),
      1 - 2 * (orientation.y * orientation.y + orientation.z * orientation.z),
    )
    camera.position.set(
      telemetry.position.x - Math.sin(heading) * CAMERA_BACK_M,
      telemetry.position.y + CAMERA_HEIGHT_M,
      telemetry.position.z - Math.cos(heading) * CAMERA_BACK_M,
    )
    camera.lookAt(new THREE.Vector3(
      telemetry.position.x, telemetry.position.y + 1, telemetry.position.z,
    ))

    const fraction = progressFraction(track, telemetry.position)
    const tyres = vehicle.tyreStates()
    hud.update({
      speedKmh: telemetry.speedMs * 3.6,
      gear: telemetry.gear,
      rpm: telemetry.rpm,
      drs,
      currentMs: lapMs,
      bestMs: best?.timeMs ?? null,
      // Грубая оценка «где я должен быть»: доля круга от личного лучшего.
      // Посекторная дельта появится вместе с личными лучшими секторами.
      deltaMs: best !== null ? lapMs - best.timeMs * fraction : null,
      sector: sectorFor(track, fraction),
      sectorBest: [false, false, false],
      valid: lap.valid,
      tyreTempC: tyres.reduce((s, t) => s + t.tempC, 0) / tyres.length,
    })

    renderer.render(scene, camera)
    requestAnimationFrame(frame)
  }

  requestAnimationFrame(frame)
}

void main()

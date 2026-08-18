import RAPIER from '@dimforge/rapier3d-compat'
import { GhostRecorder, sampleGhost, type GhostLap } from './ghost/recorder'
import { KeyboardInput } from './input/keyboard'
import { submitLap } from './net/leaderboard'
import { Vehicle } from './physics/vehicle'
import { FIXED_STEP, stepsFor, type Accumulator } from './physics/world'
import { buildBrakingMarkers, buildRacingLine } from './render/braking'
import { ControlsHint } from './render/controls-hint'
import { spinWheels } from './render/car'
import { buildF1Car } from './render/f1-car'
import { buildGrandstands, buildHills, buildTrees } from './render/scenery'
import { cameraPose, nextMode, type CameraMode } from './render/cameras'
import { buildGhostCar } from './render/ghost-car'
import { Hud } from './render/hud'
import { LeaderboardPanel } from './render/leaderboard-panel'
import { Minimap } from './render/minimap'
import { askName } from './render/menu'
import { FinishOverlay, PauseOverlay } from './render/overlays'
import { createScene } from './render/scene'
import { buildStartLine, buildTrackLines, buildTrackMesh } from './render/track-mesh'
import { buildBarriers, buildKerbs } from './render/trackside'
import {
  loadBest, loadGhost, loadName, saveBest, saveGhost, saveName,
} from './storage/local'
import {
  completeAttempt, continueBeyond, createSession, spendAttempt, togglePause,
  type SessionState,
} from './session/session'
import {
  createLapState, progressFraction, sectorFor, updateLap, type LapState,
} from './timing/laptimer'
import { recoveryPose } from './track/recovery'
import { isOnTrack, startPose } from './track/geometry'
import type { Track } from './track/schema'

async function main(): Promise<void> {
  await RAPIER.init()

  const canvas = document.createElement('canvas')
  document.body.style.margin = '0'
  document.body.style.overflow = 'hidden'
  document.body.appendChild(canvas)

  const { scene, camera, renderer, sun } = createScene(canvas)
  const track: Track = await fetch('/tracks/monza.json').then((r) => r.json())
  scene.add(buildTrackMesh(track))
  scene.add(buildTrackLines(track))
  scene.add(buildStartLine(track))
  scene.add(buildKerbs(track))
  scene.add(buildBarriers(track))
  scene.add(buildRacingLine(track))
  scene.add(buildBrakingMarkers(track))
  scene.add(buildGrandstands(track))
  scene.add(buildTrees(track))
  scene.add(buildHills(track))

  const carParts = buildF1Car()
  const carMesh = carParts.group
  scene.add(carMesh)
  // Призрак — копия того меша, что реально доехал до сцены, чтобы силуэты совпадали.
  const ghostMesh = buildGhostCar(carMesh)
  ghostMesh.visible = false
  scene.add(ghostMesh)

  const name = await askName(loadName())
  saveName(name)

  const hud = new Hud()
  const board = new LeaderboardPanel(name)
  void board.refresh(track.meta.id)
  const input = new KeyboardInput()
  const minimap = new Minimap(track)
  const recorder = new GhostRecorder()

  const makeVehicle = (): Vehicle => new Vehicle(undefined, startPose(track), track)

  let vehicle = makeVehicle()
  let lap: LapState = createLapState()
  let best = loadBest(track.meta.id)
  let ghost: GhostLap | null = loadGhost(track.meta.id)
  // Часы сессии монотонны: updateLap хранит начало круга в этой же шкале и
  // вычитает его сам, поэтому обнулять её на финише нельзя — время круга уйдёт
  // в минус. Время текущего круга считается как sessionMs - lap.startedAtMs.
  let sessionMs = 0
  let acc: Accumulator = { pending: 0 }
  let last = performance.now()
  let session: SessionState = createSession()
  const pauseOverlay = new PauseOverlay()
  const finishOverlay = new FinishOverlay()

  const restartLap = (): void => {
    vehicle = makeVehicle()
    lap = createLapState()
    recorder.reset()
  }

  let cameraMode: CameraMode = 'chase'
  const hint = new ControlsHint()

  // Возврат на месте, а не на старте: упереться в отбойник можно на любом метре,
  // и отправлять игрока в начало круга за это — значит заканчивать ему заезд.
  const recover = (): void => {
    const pose = recoveryPose(track, vehicle.telemetry().position)
    vehicle = new Vehicle(undefined, pose, track)
  }

  window.addEventListener('keydown', (e) => {
    if (e.code === 'KeyT') {
      // Сброс по T тратит попытку: иначе три круга обходятся бесконечным
      // рестартом за метр до финиша. После финиша T начинает заезд заново,
      // а не тратит попытку, которой уже нет.
      session = session.finished ? createSession() : spendAttempt(session)
      restartLap()
      return
    }
    if (e.code === 'Enter' && session.finished) {
      session = continueBeyond(session)
      restartLap()
      return
    }
    if (e.code === 'KeyP' && !session.finished) session = togglePause(session)
    if (session.paused || session.finished) return
    if (e.code === 'KeyR') recover()
    if (e.code === 'KeyH') hint.toggle()
    if (e.code === 'KeyC') cameraMode = nextMode(cameraMode)
  })

  const frame = (now: number): void => {
    const frameSeconds = Math.min(0.25, (now - last) / 1000)
    last = now

    // На паузе и на финише физика не шагает и sessionMs не растёт, но кадр
    // рисуется: замерший канвас читается как зависание. Накопитель тоже
    // сбрасывается, иначе после снятия паузы игра догоняет простой рывком.
    const halted = session.paused || session.finished
    if (halted) acc = { pending: 0 }
    const result = halted ? { acc, steps: 0 } : stepsFor(acc, frameSeconds)
    acc = result.acc

    let drs = false
    let lastSteer = 0
    for (let i = 0; i < result.steps; i++) {
      const controls = input.read(FIXED_STEP)
      drs = controls.drs
      lastSteer = controls.steer
      vehicle.step(controls, FIXED_STEP)
      sessionMs += FIXED_STEP * 1000

      const telemetry = vehicle.telemetry()
      const onTrack = isOnTrack(track, telemetry.position)
      // На газоне держит хуже, чем на асфальте: вылет должен стоить времени,
      // иначе выгоднее резать повороты напрямик.
      if (!onTrack) vehicle.applyOffTrackDrag(FIXED_STEP)

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
        session = completeAttempt(session, done)
        if (done.valid) {
          void submitLap({
            track: track.meta.id,
            name,
            timeMs: done.timeMs,
            sectors: done.sectors,
            assists: input.assists(),
          }).then(() => board.refresh(track.meta.id))
        }
        recorder.reset()
        if (session.finished) break
      }
    }

    const telemetry = vehicle.telemetry()
    const orientation = vehicle.orientation()
    carMesh.position.set(telemetry.position.x, telemetry.position.y, telemetry.position.z)
    carMesh.quaternion.set(orientation.x, orientation.y, orientation.z, orientation.w)
    spinWheels(carParts, telemetry.speedMs, lastSteer, frameSeconds)

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
    const pose = cameraPose(cameraMode, telemetry.position, heading, telemetry.speedMs)
    camera.position.set(pose.eye.x, pose.eye.y, pose.eye.z)
    camera.lookAt(pose.look.x, pose.look.y, pose.look.z)
    if (Math.abs(camera.fov - pose.fov) > 0.1) {
      camera.fov = pose.fov
      camera.updateProjectionMatrix()
    }

    // Карта теней покрывает только окрестность болида, поэтому её источник
    // едет следом — иначе тень пропадает через сотню метров от старта.
    sun.target.position.set(telemetry.position.x, 0, telemetry.position.z)
    sun.position.set(telemetry.position.x + 300, 500, telemetry.position.z + 200)
    // Болид не рисуем из кокпита: изнутри виден только затылок собственного шлема.
    carMesh.visible = cameraMode !== 'cockpit'

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
      attemptsLeft: session.attemptsLeft,
    })
    minimap.update(telemetry.position, heading)
    pauseOverlay.update(session.paused)
    finishOverlay.update(session.finished, session.bestMs ?? best?.timeMs ?? null)

    renderer.render(scene, camera)
    requestAnimationFrame(frame)
  }

  requestAnimationFrame(frame)
}

void main()

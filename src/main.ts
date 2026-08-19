import RAPIER from '@dimforge/rapier3d-compat'
import { GhostRecorder, sampleGhost, type GhostLap } from './ghost/recorder'
import { KeyboardInput } from './input/keyboard'
import { submitLap } from './net/leaderboard'
import { Vehicle } from './physics/vehicle'
import { FIXED_STEP, stepsFor, type Accumulator } from './physics/world'
import { blendFactor, lerpPosition, slerpOrientation } from './render/interpolate'
import {
  LEVEL, lateralG, longitudinalG, settle, targetAttitude,
} from './render/body-attitude'
import { buildBrakingMarkers, buildRacingLine } from './render/braking'
import { ControlsHint } from './render/controls-hint'
import { spinWheels } from './render/car'
import { buildF1Car } from './render/f1-car'
import { loadF1Model } from './render/f1-model'
import { liveryById } from './render/liveries'
import { buildGrandstands, buildHills, buildTrees } from './render/scenery'
import {
  cameraPose, compensateLag, nextMode, SMOOTH_RATE, smoothTowards,
  type CameraMode, type Vec3,
} from './render/cameras'
import { buildGhostCar } from './render/ghost-car'
import { Hud } from './render/hud'
import { LeaderboardPanel } from './render/leaderboard-panel'
import { Minimap } from './render/minimap'
import { askStart } from './render/menu'
import { FinishOverlay, PauseOverlay } from './render/overlays'
import { createScene } from './render/scene'
import { buildStartLine, buildTrackLines, buildTrackMesh } from './render/track-mesh'
import { buildBarriers, buildKerbs } from './render/trackside'
import {
  loadBest, loadGhost, loadLiveryId, loadName, loadTrackId,
  saveBest, saveGhost, saveLiveryId, saveName, saveTrackId,
} from './storage/local'
import {
  completeAttempt, continueBeyond, createSession, spendAttempt, togglePause,
  type SessionState,
} from './session/session'
import {
  createLapState, OFF_TRACK_TOLERANCE, progressFraction, sectorFor, updateLap,
  type LapState,
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

  const { scene, camera, renderer, sun, sky } = createScene(canvas)

  // Трасса выбирается до сборки сцены: геометрия, отбойники и миникарта
  // строятся из неё, а перестраивать всё это на лету незачем.
  const { name, trackId, liveryId } = await askStart(loadName(), loadTrackId(), loadLiveryId())
  saveName(name)
  saveTrackId(trackId)
  saveLiveryId(liveryId)
  const livery = liveryById(liveryId)

  const track: Track = await fetch(`/tracks/${trackId}.json`).then((r) => r.json())
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

  // Готовая модель: 49 тыс. треугольников против 3.5 тыс. у собственной —
  // на своей поверхности выходят гранёными, а кромки острыми. Если glb не
  // отдался, остаётся процедурная машина: пустая сцена ломает игру.
  const carParts = await loadF1Model(livery.primary, livery.accent).catch((err: unknown) => {
    console.warn('модель болида не загрузилась, беру процедурную', err)
    return buildF1Car(livery.primary)
  })
  const carMesh = carParts.group
  scene.add(carMesh)
  // Призрак — копия того меша, что реально доехал до сцены, чтобы силуэты совпадали.
  const ghostMesh = buildGhostCar(carMesh)
  ghostMesh.visible = false
  scene.add(ghostMesh)

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

  // Позиция камеры и точка взгляда живут между кадрами: сглаживание тянет их к
  // цели, а не ставит жёстко, иначе камере передаётся каждый рывок подвески.
  // Отладочный хук для замеров плавности: тесты и скрипты подписываются на
  // покадровые значения, не влезая в игровой цикл.
  const probe = (window as unknown as {
    __probe?: (t: unknown, c: unknown) => void
  }).__probe ?? null
  const probe2 = (window as unknown as {
    __probe2?: (q: unknown, v: number, st: number) => void
  }).__probe2 ?? null

  // Визуальный наклон кузова: физика идёт по рельсам (размах тангажа 0.52°),
  // и без клевков на торможении болид выглядит парящим над дорогой.
  let attitude = LEVEL
  let previousSpeedMs = 0

  let cameraEye: Vec3 | null = null
  let cameraLook: Vec3 | null = null

  const restartLap = (): void => {
    vehicle = makeVehicle()
    lap = createLapState()
    recorder.reset()
    cameraEye = null
    cameraLook = null
  }

  let cameraMode: CameraMode = 'chase'
  const hint = new ControlsHint()

  // Возврат на месте, а не на старте: упереться в отбойник можно на любом метре,
  // и отправлять игрока в начало круга за это — значит заканчивать ему заезд.
  const recover = (): void => {
    const pose = recoveryPose(track, vehicle.telemetry().position)
    vehicle = new Vehicle(undefined, pose, track)
    cameraEye = null
    cameraLook = null
  }

  window.addEventListener('keydown', (e) => {
    if (e.code === 'KeyM' && (session.finished || session.paused)) {
      // Возврат в меню перезагрузкой: сцена, физика и трасса строятся один
      // раз при старте, и разбирать их вручную рискованнее, чем начать с
      // чистого листа — выбор игрока уже сохранён в localStorage.
      window.location.reload()
      return
    }
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
    if ((e.code === 'KeyP' || e.code === 'Escape') && !session.finished) {
      // Без preventDefault браузер по Escape выходит из полноэкранного режима
      // вместо того, чтобы поставить игру на паузу.
      e.preventDefault()
      session = togglePause(session)
    }
    if (session.paused || session.finished) return
    if (e.code === 'KeyR') recover()
    if (e.code === 'KeyH') hint.toggle()
    if (e.code === 'KeyC') {
      cameraMode = nextMode(cameraMode)
      cameraEye = null
      cameraLook = null
    }
  })

  const frame = (now: number): void => {
    const frameSeconds = Math.min(0.25, (now - last) / 1000)
    last = now

    // На паузе и на финише физика не шагает и sessionMs не растёт, но кадр
    // рисуется: замерший канвас читается как зависание. Накопитель тоже
    // сбрасывается, иначе после снятия паузы игра догоняет простой рывком.
    const halted = session.paused || session.finished
    if (halted) acc = { pending: 0 }

    // Состояние до шагов — вторая точка для интерполяции кадра.
    const before = {
      position: { ...vehicle.telemetry().position },
      orientation: { ...vehicle.orientation() },
    }
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

    // Кадр рисует положение между предыдущим и текущим шагом физики: без
    // этого движение дёргается на 0.28 м в среднем и до метра в пике, потому
    // что на кадр приходится то один шаг, то два.
    const blend = result.steps === 0 ? 1 : blendFactor(acc.pending, FIXED_STEP)
    const shown = lerpPosition(before.position, telemetry.position, blend)
    const shownRot = slerpOrientation(before.orientation, orientation, blend)

    if (probe !== null) probe({ ...telemetry, position: shown }, camera.position)

    carMesh.position.set(shown.x, shown.y, shown.z)
    carMesh.quaternion.set(shownRot.x, shownRot.y, shownRot.z, shownRot.w)

    const longG = longitudinalG(telemetry.speedMs, previousSpeedMs, frameSeconds)
    previousSpeedMs = telemetry.speedMs
    attitude = settle(
      attitude,
      targetAttitude(longG, lateralG(telemetry.speedMs, lastSteer, 3.6)),
      frameSeconds,
    )
    // Наклон домножается на курсовой кватернион, поэтому крен идёт вокруг
    // продольной оси машины, а не мировой.
    carMesh.rotateX(attitude.pitch)
    carMesh.rotateZ(attitude.roll)
    if (probe2 !== null) probe2(carMesh.quaternion, telemetry.speedMs, lastSteer)
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
    const pose = cameraPose(cameraMode, shown, heading, telemetry.speedMs)
    const rate = SMOOTH_RATE[cameraMode]
    // На первом кадре и после смены режима догонять нечего: камера ставится
    // сразу, иначе она приезжает издалека через полсекунды.
    // Цель сдвигается вперёд на величину отставания сглаживателя: иначе на
    // 235 км/ч камера висит в 25 м вместо 18, и дистанция гуляет на 6 м при
    // каждом разгоне и торможении.
    const aimEye = compensateLag(pose.eye, heading, telemetry.speedMs, frameSeconds, rate)
    cameraEye = cameraEye === null ? aimEye : smoothTowards(cameraEye, aimEye, frameSeconds, rate)
    cameraLook = cameraLook === null
      ? pose.look
      : smoothTowards(
        cameraLook,
        compensateLag(pose.look, heading, telemetry.speedMs, frameSeconds, rate),
        frameSeconds, rate,
      )
    camera.position.set(cameraEye.x, cameraEye.y, cameraEye.z)
    camera.lookAt(cameraLook.x, cameraLook.y, cameraLook.z)
    if (Math.abs(camera.fov - pose.fov) > 0.1) {
      camera.fov = pose.fov
      camera.updateProjectionMatrix()
    }

    // Карта теней покрывает только окрестность болида, поэтому её источник
    // едет следом — иначе тень пропадает через сотню метров от старта.
    sun.target.position.set(telemetry.position.x, 0, telemetry.position.z)
    sun.position.set(telemetry.position.x + 300, 500, telemetry.position.z + 200)
    // Купол неба едет за камерой: он радиусом меньше трассы, и на дальнем
    // конце круга неподвижный купол ушёл бы за спину вместе с горизонтом.
    sky.position.set(cameraEye.x, 0, cameraEye.z)
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
      valid: lap.valid && lap.offTrackMetres <= OFF_TRACK_TOLERANCE,
      tyreTempC: tyres.reduce((s, t) => s + t.tempC, 0) / tyres.length,
      attemptsLeft: session.attemptsLeft,
      trackName: track.meta.name,
      trackLengthM: track.meta.officialLengthM,
      offTrackMetres: lap.offTrackMetres,
      recordMs: track.meta.realRecord.timeMs,
      recordDriver: track.meta.realRecord.driver,
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

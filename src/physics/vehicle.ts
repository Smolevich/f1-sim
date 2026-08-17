import RAPIER from '@dimforge/rapier3d-compat'
import { downforce, drag, type AeroSetup } from './aero'
import { bestGear, rpmFor, wheelTorque, WHEEL_RADIUS_M } from './drivetrain'
import { gripFactor, tyreForce, updateTyre, type TyreState } from './tyres'
import type { TrackPoint } from '../track/schema'

export type CarInput = {
  throttle: number
  brake: number
  steer: number
  gear: number
  drs: boolean
}

export type CarTelemetry = {
  speedMs: number
  rpm: number
  gear: number
  position: TrackPoint
}

const MASS_KG = 798
const WHEELBASE_M = 3.6
const TRACK_WIDTH_M = 1.6
const SUSPENSION_REST_M = 0.35
// Луч подвески выходит из ступицы в центре кузова, поэтому ход отмеряется от
// неё, а не от полотна: это расстояние до земли в разгруженном положении.
// Сжатие — разница с фактическим замером, статическая просадка
// (798 кг / 4 на 90 кН/м ≈ 22 мм) укладывается в ход с запасом.
const SUSPENSION_TRAVEL_M = SUSPENSION_REST_M + 0.1
const SUSPENSION_STIFFNESS = 90_000
const SUSPENSION_DAMPING = 6_000
const MAX_STEER_RAD = 0.3
const BRAKE_FORCE_N = 28_000
// Слип, на котором Magic Formula из tyres.ts достигает пика: sin(1.9·atan(10·s))
// максимальна при s = tan(π/3.8)/10. Запрошенную тягу отображаем в этот отрезок,
// чтобы полное сцепление отвечало полному пределу шины, а не срыву за пиком.
const SLIP_AT_GRIP_LIMIT = 0.1086
// Проскальзывание, эквивалентное полной загрузке пятна контакта: при нём
// равновесие тепловой модели tyres.ts (90·s = 0.6·(T−25)) даёт рабочие 100 °C.
const WORKING_SLIP = 0.5
// WHEEL_RADIUS_M импортируется из drivetrain: радиус колеса один и тот же
// и для оборотов, и для перевода момента в силу — разъехавшись, они дадут
// молча несогласованные тягу и передачи.

const WHEEL_OFFSETS: { x: number; z: number; steered: boolean; driven: boolean }[] = [
  { x: -TRACK_WIDTH_M / 2, z: WHEELBASE_M / 2, steered: true, driven: false },
  { x: TRACK_WIDTH_M / 2, z: WHEELBASE_M / 2, steered: true, driven: false },
  { x: -TRACK_WIDTH_M / 2, z: -WHEELBASE_M / 2, steered: false, driven: true },
  { x: TRACK_WIDTH_M / 2, z: -WHEELBASE_M / 2, steered: false, driven: true },
]

export class Vehicle {
  private world: RAPIER.World
  private body: RAPIER.RigidBody
  private tyres: TyreState[]
  private aero: AeroSetup = { frontWing: 0.5, rearWing: 0.5 }

  constructor(aero?: AeroSetup) {
    if (aero) this.aero = aero
    this.world = new RAPIER.World({ x: 0, y: -9.81, z: 0 })

    const ground = this.world.createRigidBody(RAPIER.RigidBodyDesc.fixed())
    this.world.createCollider(RAPIER.ColliderDesc.cuboid(5000, 0.1, 5000), ground)

    this.body = this.world.createRigidBody(
      RAPIER.RigidBodyDesc.dynamic()
        .setTranslation(0, SUSPENSION_REST_M + 0.2, 0)
        .setLinearDamping(0.05)
        .setAngularDamping(0.6),
    )
    this.world.createCollider(
      RAPIER.ColliderDesc.cuboid(1.0, 0.25, 2.8).setMass(MASS_KG),
      this.body,
    )

    this.tyres = WHEEL_OFFSETS.map(() => ({ compound: 'medium', tempC: 90, wear: 0 }))
  }

  step(input: CarInput, dt: number): void {
    // Лучи подвески читают query pipeline, а он наполняется отдельно от солвера:
    // без этого вызова первый castRay возвращает null, ни одно колесо не находит
    // землю, и машина проваливается сквозь трассу.
    this.world.updateSceneQueries()

    // addForce в Rapier держит силу до явного сброса, а не один шаг. Без этого
    // силы шага складываются с силами всех предыдущих, и подвеска за секунду
    // выбрасывает машину в небо.
    this.body.resetForces(true)
    this.body.resetTorques(true)

    const velocity = this.body.linvel()
    const speedMs = Math.hypot(velocity.x, velocity.z)
    const rotation = this.body.rotation()
    const forward = rotate({ x: 0, y: 0, z: 1 }, rotation)
    const rightVec = rotate({ x: 1, y: 0, z: 0 }, rotation)

    const df = downforce(this.aero, speedMs, input.drs)
    this.body.addForce({ x: 0, y: -(df.front + df.rear), z: 0 }, true)

    const dragN = drag(this.aero, speedMs, input.drs)
    if (speedMs > 0.1) {
      this.body.addForce(
        { x: (-velocity.x / speedMs) * dragN, y: 0, z: (-velocity.z / speedMs) * dragN },
        true,
      )
    }

    const gear = input.gear > 0 ? input.gear : bestGear(speedMs)
    const rpm = rpmFor(speedMs, gear)
    const steerRad = clamp(input.steer, -1, 1) * MAX_STEER_RAD

    WHEEL_OFFSETS.forEach((wheel, i) => {
      const anchor = this.body.translation()
      const offset = rotate({ x: wheel.x, y: 0, z: wheel.z }, rotation)
      const origin = {
        x: anchor.x + offset.x,
        y: anchor.y + offset.y,
        z: anchor.z + offset.z,
      }

      const ray = new RAPIER.Ray(origin, { x: 0, y: -1, z: 0 })
      // Седьмой аргумент — filterExcludeRigidBody: луч не должен цепляться за
      // собственный кузов, иначе подвеска упрётся сама в себя.
      const hit = this.world.castRay(
        ray, SUSPENSION_TRAVEL_M, true, undefined, undefined, undefined, this.body,
      )
      if (!hit) return

      const compression = SUSPENSION_TRAVEL_M - hit.timeOfImpact
      if (compression <= 0) return

      // Демпфер работает лишь при сжатой пружине: сам по себе он не имеет
      // равновесия и на падающей машине разгоняет её вверх вместо гашения.
      const load = Math.max(
        0,
        compression * SUSPENSION_STIFFNESS - velocity.y * SUSPENSION_DAMPING,
      )
      this.body.addForceAtPoint({ x: 0, y: load, z: 0 }, origin, true)

      const wheelForward = wheel.steered ? rotateY(forward, steerRad) : forward
      const wheelRight = wheel.steered ? rotateY(rightVec, steerRad) : rightVec

      const longVel = velocity.x * wheelForward.x + velocity.z * wheelForward.z
      const latVel = velocity.x * wheelRight.x + velocity.z * wheelRight.z

      const driveN = wheel.driven
        ? (wheelTorque(rpm, gear, input.throttle) / WHEEL_RADIUS_M) / 2
        : 0
      const brakeN = clamp(input.brake, 0, 1) * BRAKE_FORCE_N / 4

      // Слип — безразмерная величина: насколько запрошенная тяга превышает то,
      // что колесо способно передать. Пока она в пределах сцепления, слип мал и
      // Magic Formula отдаёт всю тягу; за пределом слип растёт, и начинается
      // пробуксовка. Считать его отношением сил (driveN/load) нельзя — это
      // сразу упирает слип в единицу и держит колесо в вечном букс.
      const gripLimitN = load * gripFactor(this.tyres[i])
      const slipRatio = gripLimitN > 0
        ? clamp(driveN / gripLimitN, -1, 1) * SLIP_AT_GRIP_LIMIT
        : 0
      const slipAngle = Math.atan2(latVel, Math.abs(longVel) + 1)

      const force = tyreForce(this.tyres[i], slipRatio, slipAngle, load)
      // Тяга не может превысить ни запрошенное двигателем, ни предел шины.
      const tractionN = Math.sign(driveN) * Math.min(
        Math.abs(driveN),
        Math.abs(force.longitudinal),
      )
      const longN = tractionN - Math.sign(longVel) * brakeN
      const latN = -force.lateral

      this.body.addForceAtPoint(
        {
          x: wheelForward.x * longN + wheelRight.x * latN,
          y: 0,
          z: wheelForward.z * longN + wheelRight.z * latN,
        },
        origin,
        true,
      )

      // Тепловая модель шины ждёт меру проскальзывания, при которой активная
      // езда держит рабочие ~100 °C. Нормированный слип для этого слишком мал:
      // шина остывала бы до 40 °C и теряла сцепление прямо на прямой. Мерой
      // берём загрузку пятна контакта — долю использованного предела.
      const utilisation = gripLimitN > 0
        ? Math.hypot(force.longitudinal, force.lateral) / gripLimitN
        : 0
      this.tyres[i] = updateTyre(
        this.tyres[i],
        utilisation * WORKING_SLIP + Math.abs(slipAngle),
        dt,
      )
    })

    this.world.timestep = dt
    this.world.step()
  }

  telemetry(): CarTelemetry {
    const v = this.body.linvel()
    const t = this.body.translation()
    const speedMs = Math.hypot(v.x, v.z)
    const gear = bestGear(speedMs)
    return { speedMs, rpm: rpmFor(speedMs, gear), gear, position: { x: t.x, y: t.y, z: t.z } }
  }

  /** Ориентация кузова для рендера: телеметрия намеренно остаётся без кватернионов. */
  orientation(): RAPIER.Rotation {
    return this.body.rotation()
  }
}

type Vec3 = { x: number; y: number; z: number }

function rotate(v: Vec3, q: RAPIER.Rotation): Vec3 {
  const { x, y, z, w } = q
  const ix = w * v.x + y * v.z - z * v.y
  const iy = w * v.y + z * v.x - x * v.z
  const iz = w * v.z + x * v.y - y * v.x
  const iw = -x * v.x - y * v.y - z * v.z
  return {
    x: ix * w + iw * -x + iy * -z - iz * -y,
    y: iy * w + iw * -y + iz * -x - ix * -z,
    z: iz * w + iw * -z + ix * -y - iy * -x,
  }
}

function rotateY(v: Vec3, angle: number): Vec3 {
  const c = Math.cos(angle)
  const s = Math.sin(angle)
  return { x: v.x * c - v.z * s, y: v.y, z: v.x * s + v.z * c }
}

function clamp(value: number, min: number, max: number): number {
  return Math.max(min, Math.min(max, value))
}

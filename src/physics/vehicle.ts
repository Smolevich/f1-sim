import RAPIER from '@dimforge/rapier3d-compat'
import { downforce, drag, type AeroSetup } from './aero'
import { bestGear, rpmFor, wheelTorque, WHEEL_RADIUS_M } from './drivetrain'
import { gripFactor, tyreForce, updateTyre, type TyreState } from './tyres'
import { buildEdges } from '../track/geometry'
import type { Track, TrackPoint } from '../track/schema'

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

export type VehicleStart = {
  position: TrackPoint
  /** Курс в радианах вокруг оси Y: куда смотрит нос болида на старте. */
  headingRad: number
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
// Проскальзывание, эквивалентное полной загрузке пятна контакта: при нём
// равновесие тепловой модели tyres.ts (90·s = 0.6·(T−25)) даёт рабочие 100 °C.
const WORKING_SLIP = 0.5
// Прогрев от качения по полотну. На этой «дозе» равновесие даёт 92.5 °C —
// свободно катящееся переднее колесо выходит в рабочее окно, оставаясь чуть
// холоднее ведущих задних, которые догреваются загрузкой пятна.
const ROAD_HEAT_SLIP = 0.45
// Скорость, с которой прогрев от дороги выходит на полку.
const ROAD_HEAT_SPEED_MS = 30
// Высота центра крена над пятном контакта. Боковая сила шины приложена в пятне,
// но кузов опирается на подвеску: плечо крена — это расстояние от пятна до
// центра крена, а не до ступицы. С полным плечом (0.45 м при полуколее 0.8 м)
// порог опрокидывания выходит ~1.5 g, ниже предела шин, и болид кувыркается
// в каждом повороте вместо того, чтобы скользить.
const ROLL_CENTRE_M = 0.1
// Знаменатель угла увода — не «плюс метр в секунду»: метровый пол завышает угол
// на малой скорости, где продольная составляющая сама порядка единиц, и болид
// срывается тем сильнее, чем медленнее едет. Достаточно защиты от деления на нуль.
const SLIP_DENOM_FLOOR_MS = 0.1
// Замедление на газоне. Сопоставимо с торможением двигателем на асфальте и
// заметно слабее тормозов (28 кН / 798 кг ≈ 35 м/с²): вылет должен стоить
// времени, но не выбрасывать болид из заезда.
const OFF_TRACK_DECEL_MS2 = 8
// Ниже этой скорости тормоз переключается на задний ход: болид должен уметь
// отъехать от стены, а не стоять в ней до сброса заезда.
const REVERSE_SPEED_MS = 1.5
// Заметно слабее тяги вперёд: это манёвр выезда, а не режим езды задом.
const REVERSE_FORCE_N = 6_000
// Отступ и высота повторяют отрисовку в trackside.ts: физическая стенка должна
// стоять там же, где нарисованная, иначе болид упирается в воздух или проезжает
// сквозь железо.
const BARRIER_OFFSET_M = 9
const BARRIER_HEIGHT_M = 1.4
const BARRIER_THICKNESS_M = 0.3
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
  /** Вертикальная нагрузка на каждое колесо за последний шаг, ньютоны. */
  readonly wheelLoads: number[] = [0, 0, 0, 0]
  /** Боковая сила каждого колеса за прошлый шаг: из неё считается предел диффа. */
  private readonly lateralForces: number[] = [0, 0, 0, 0]

  constructor(aero?: AeroSetup, start?: VehicleStart, track?: Track) {
    if (aero) this.aero = aero
    this.world = new RAPIER.World({ x: 0, y: -9.81, z: 0 })

    const ground = this.world.createRigidBody(RAPIER.RigidBodyDesc.fixed())
    this.world.createCollider(RAPIER.ColliderDesc.cuboid(5000, 0.1, 5000), ground)

    if (track) this.buildBarrierColliders(track)

    // Без стартовой позы болид появляется в начале координат — так его ставят
    // тесты физики на плоском полигоне. В игре позу задаёт трасса, иначе машина
    // спавнится в километре от полотна и едет по пустоте.
    const spawn = start?.position ?? { x: 0, y: 0, z: 0 }
    const heading = start?.headingRad ?? 0

    this.body = this.world.createRigidBody(
      RAPIER.RigidBodyDesc.dynamic()
        .setTranslation(spawn.x, spawn.y + SUSPENSION_REST_M + 0.2, spawn.z)
        .setRotation(yawQuaternion(heading))
        .setLinearDamping(0.05)
        .setAngularDamping(0.6),
    )
    this.world.createCollider(
      RAPIER.ColliderDesc.cuboid(1.0, 0.25, 2.8).setMass(MASS_KG),
      this.body,
    )

    this.tyres = WHEEL_OFFSETS.map(() => ({ compound: 'medium', tempC: 90, wear: 0 }))
  }

  /**
   * Стенка вдоль каждой стороны трассы: по кубоиду на сегмент. Статические
   * коллайдеры Rapier дёшевы, а альтернатива — trimesh на всю трассу — хуже
   * ловит скользящие удары под малым углом.
   */
  private buildBarrierColliders(track: Track): void {
    const { left, right } = buildEdges(track)
    const cl = track.centerline
    const n = cl.length

    for (const edge of [left, right]) {
      for (let i = 0; i < n; i++) {
        const j = (i + 1) % n
        const a = outward(edge[i], cl[i], BARRIER_OFFSET_M)
        const b = outward(edge[j], cl[j], BARRIER_OFFSET_M)
        const length = Math.hypot(b.x - a.x, b.z - a.z)
        if (length < 0.01) continue

        const body = this.world.createRigidBody(
          RAPIER.RigidBodyDesc.fixed().setTranslation(
            (a.x + b.x) / 2,
            BARRIER_HEIGHT_M / 2,
            (a.z + b.z) / 2,
          ).setRotation(yawQuaternion(Math.atan2(b.x - a.x, b.z - a.z))),
        )
        this.world.createCollider(
          RAPIER.ColliderDesc.cuboid(BARRIER_THICKNESS_M / 2, BARRIER_HEIGHT_M / 2, length / 2)
            .setRestitution(0.0)
            .setFriction(0.25),
          body,
        )
      }
    }
  }

  step(input: CarInput, dt: number): void {
    // Лучи подвески читают query pipeline, а он наполняется отдельно от солвера:
    // без этого вызова первый castRay возвращает null, ни одно колесо не находит
    // землю, и машина проваливается сквозь трассу.
    this.world.updateSceneQueries()

    // addForce в Rapier держит силу до явного сброса, а не один шаг.
    this.body.resetForces(true)
    this.body.resetTorques(true)

    const velocity = this.body.linvel()
    const angular = this.body.angvel()
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

    // Открытый дифференциал: он не может дать загруженному колесу больше момента,
    // чем принимает разгруженное. Без этого предела внутреннее заднее колесо в
    // повороте выдаёт тягу, которой физически не держит, и разница между колёсами
    // становится моментом рыскания, разворачивающим болид.
    //
    // Предел — остаток круга трения после боковой силы, а не весь круг: тяга,
    // забравшая круг целиком, оставляет разгруженное колесо без боковой силы,
    // и задняя ось перестаёт держать курс именно там, где это нужнее всего.
    // Боковая сила и нагрузки берутся с прошлого шага: на текущем они ещё не
    // измерены, а за 1/120 с меняются несопоставимо меньше, чем разброс
    // между колёсами.
    // Вывешенное колесо (нагрузка нулевая) из расчёта исключается: иначе его
    // нулевой предел через Math.min обнуляет тягу на всей оси, и болид глохнет
    // от любого поребрика. На плоской земле не проявляется, на рельефе — сразу.
    const drivenGrip = WHEEL_OFFSETS
      .map((wheel, i) => {
        if (!wheel.driven || this.wheelLoads[i] <= 0) return Infinity
        const limit = this.wheelLoads[i] * gripFactor(this.tyres[i])
        const lateral = Math.min(Math.abs(this.lateralForces[i]), limit)
        return Math.sqrt(Math.max(0, limit * limit - lateral * lateral))
      })
      .reduce((min, value) => Math.min(min, value), Infinity)

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
      this.wheelLoads[i] = 0
      this.lateralForces[i] = 0
      if (!hit) return

      const compression = SUSPENSION_TRAVEL_M - hit.timeOfImpact
      if (compression <= 0) return

      // Скорость в точке колеса, а не в центре масс: вращение кузова добавляет
      // ω×r, и без этого слагаемого все четыре колеса видят один угол увода
      // независимо от рыскания. Именно оно и гасит занос физически — иначе
      // единственным демпфером остаётся искусственный angularDamping.
      const spin = crossY(angular, offset)
      const wheelVelX = velocity.x + spin.x
      const wheelVelZ = velocity.z + spin.z

      // Демпфер работает лишь при сжатой пружине: сам по себе он не имеет
      // равновесия и на падающей машине разгоняет её вверх вместо гашения.
      // Вертикальную скорость берём в точке колеса — крен и тангаж сжимают
      // подвеску по углам, и демпфер по центру масс их не видит.
      const wheelVelY = velocity.y + spin.y
      const load = Math.max(
        0,
        compression * SUSPENSION_STIFFNESS - wheelVelY * SUSPENSION_DAMPING,
      )
      this.wheelLoads[i] = load
      this.body.addForceAtPoint({ x: 0, y: load, z: 0 }, origin, true)

      const wheelForward = wheel.steered ? rotateY(forward, steerRad) : forward
      const wheelRight = wheel.steered ? rotateY(rightVec, steerRad) : rightVec

      const longVel = wheelVelX * wheelForward.x + wheelVelZ * wheelForward.z
      const latVel = wheelVelX * wheelRight.x + wheelVelZ * wheelRight.z

      const driveN = wheel.driven
        ? Math.min(
            (wheelTorque(rpm, gear, input.throttle) / WHEEL_RADIUS_M) / 2,
            drivenGrip,
          )
        : 0
      const brakeN = clamp(input.brake, 0, 1) * BRAKE_FORCE_N / 4

      const gripLimitN = load * gripFactor(this.tyres[i])
      const slipAngle = Math.atan2(latVel, Math.abs(longVel) + SLIP_DENOM_FLOOR_MS)

      // Круг трения делится в пользу боковой силы: сколько требует угол увода,
      // столько она и берёт, тяге достаётся остаток. Обратный порядок оставляет
      // разгруженное внутреннее колесо вообще без боковой силы — тяга съедает
      // весь его круг, задняя ось перестаёт держать курс, и болид разворачивает.
      // Именно боковая сила возвращает машину на курс, поэтому приоритет её.
      //
      // Модель верна до пика Magic Formula (~12° увода) и только там и работает:
      // за пиком шина уже скользит, но здесь она сохраняет весь круг, а продольный
      // остаток с ростом угла снова растёт — физически наоборот. Болид в такие
      // углы не заходит (максимум ~5°), однако при добавлении поребриков и
      // рельефа это надо пересчитать, а не считать безобидным.
      const lateralFullN = tyreForce(this.tyres[i], 0, slipAngle, load).lateral
      const latN = -Math.sign(lateralFullN) * Math.min(Math.abs(lateralFullN), gripLimitN)
      // Продольный остаток круга делят тяга и тормоз: колесо не может передать
      // больше сцепления, чем у него есть, ни разгоняя, ни замедляя. Без этого
      // предела тормоз выдаёт полную колодочную силу на сорванной шине, и
      // отношение силы к сцеплению уходит в бесконечность вместе с её нагревом.
      const longCapN = Math.sqrt(Math.max(0, gripLimitN * gripLimitN - latN * latN))
      const tractionN = wheel.driven ? driveN : 0
      // Почти на месте тормоз работает как задний ход: без этого болид,
      // упёршийся носом в отбойник, застревает навсегда — Math.sign(longVel)
      // на нулевой скорости обнуляет тормозную силу, и выехать нечем.
      const brakingN = Math.abs(longVel) < REVERSE_SPEED_MS
        ? -REVERSE_FORCE_N / 4 * clamp(input.brake, 0, 1)
        : Math.sign(longVel) * brakeN
      const longN = clamp(tractionN - brakingN, -longCapN, longCapN)
      const force = { longitudinal: longN, lateral: latN }
      this.lateralForces[i] = latN

      // Сила шины приложена не на высоте ступицы, иначе плечо крена нулевое,
      // нагрузка на всех колёсах одинаковая и баланса перед/зад не существует.
      // Точка приложения — центр крена подвески, чуть выше пятна контакта:
      // через него подвеска и передаёт боковую силу кузову.
      const contact = {
        x: origin.x,
        y: origin.y - hit.timeOfImpact + ROLL_CENTRE_M,
        z: origin.z,
      }
      this.body.addForceAtPoint(
        {
          x: wheelForward.x * longN + wheelRight.x * latN,
          y: 0,
          z: wheelForward.z * longN + wheelRight.z * latN,
        },
        contact,
        true,
      )

      // Шину греет и дорога, а не только передаваемая ею сила. Без этого
      // слагаемого ненагруженные передние колёса на прямой (driveN = 0,
      // угол увода ≈ 0) остывают до окружающих 25 °C и теряют почти всё
      // сцепление — повернуть на таких невозможно.
      const roadHeat = Math.min(1, speedMs / ROAD_HEAT_SPEED_MS) * ROAD_HEAT_SLIP
      const utilisation = gripLimitN > 0
        ? Math.hypot(force.longitudinal, force.lateral) / gripLimitN
        : 0
      // Качение задаёт нижнюю границу прогрева, работа пятна поднимает выше неё.
      // Складывать эти вклады нельзя: у ведущих колёс сумма выводит шину за 160 °C,
      // где сцепление падает так же, как на холодной.
      this.tyres[i] = updateTyre(
        this.tyres[i],
        Math.max(roadHeat, utilisation * WORKING_SLIP) + Math.abs(slipAngle),
        dt,
      )
    })

    this.world.timestep = dt
    this.world.step()
  }

  /** Сопротивление газона: тормозит болид, пока он вне полотна. */
  applyOffTrackDrag(dt: number): void {
    const v = this.body.linvel()
    const speed = Math.hypot(v.x, v.z)
    if (speed < 0.5) return
    const decel = OFF_TRACK_DECEL_MS2 * dt
    const k = Math.max(0, 1 - decel / speed)
    this.body.setLinvel({ x: v.x * k, y: v.y, z: v.z * k }, true)
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

  /** Линейная скорость кузова, м/с по осям мира. */
  velocity(): Vec3 {
    return this.body.linvel()
  }

  /** Состояние шин: температура и износ по колёсам. */
  tyreStates(): readonly TyreState[] {
    return this.tyres
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

/** Горизонтальная часть ω×r: вклад вращения кузова в скорость точки. */
function crossY(omega: Vec3, r: Vec3): Vec3 {
  return {
    x: omega.y * r.z - omega.z * r.y,
    y: omega.z * r.x - omega.x * r.z,
    z: omega.x * r.y - omega.y * r.x,
  }
}

/** Кватернион поворота вокруг оси Y на угол курса. */
function yawQuaternion(angle: number): RAPIER.Rotation {
  return { x: 0, y: Math.sin(angle / 2), z: 0, w: Math.cos(angle / 2) }
}

function rotateY(v: Vec3, angle: number): Vec3 {
  const c = Math.cos(angle)
  const s = Math.sin(angle)
  return { x: v.x * c - v.z * s, y: v.y, z: v.x * s + v.z * c }
}

/** Точка, отодвинутая от осевой наружу на заданное расстояние. */
function outward(from: TrackPoint, centre: TrackPoint, meters: number): TrackPoint {
  const dx = from.x - centre.x
  const dz = from.z - centre.z
  const d = Math.hypot(dx, dz) || 1
  return { x: from.x + (dx / d) * meters, y: from.y, z: from.z + (dz / d) * meters }
}

function clamp(value: number, min: number, max: number): number {
  return Math.max(min, Math.min(max, value))
}

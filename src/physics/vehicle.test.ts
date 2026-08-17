import { readFileSync } from 'node:fs'
import { beforeAll, expect, test } from 'vitest'
import RAPIER from '@dimforge/rapier3d-compat'
import { Vehicle, type CarInput } from './vehicle'
import { FIXED_STEP } from './world'
import { isOnTrack, startPose } from '../track/geometry'
import type { Track } from '../track/schema'

const monza = (): Track =>
  JSON.parse(readFileSync('public/tracks/monza.json', 'utf8'))

/** Угол между носом болида и вектором его скорости, градусы. */
const sideslipDeg = (v: Vehicle): number => {
  const q = v.orientation()
  const t = v.telemetry()
  if (t.speedMs < 0.5) return 0
  const heading = Math.atan2(2 * q.w * q.y, 1 - 2 * q.y * q.y)
  const course = Math.atan2(v.velocity().x, v.velocity().z)
  const diff = Math.abs(heading - course) % (2 * Math.PI)
  return (diff > Math.PI ? 2 * Math.PI - diff : diff) * 180 / Math.PI
}

beforeAll(async () => { await RAPIER.init() })

const idle: CarInput = { throttle: 0, brake: 0, steer: 0, gear: 1, drs: false }
const full: CarInput = { throttle: 1, brake: 0, steer: 0, gear: 1, drs: false }

const run = (v: Vehicle, input: CarInput, seconds: number): void => {
  for (let i = 0; i < seconds / FIXED_STEP; i++) v.step(input, FIXED_STEP)
}

test('стоящая машина без газа не едет', () => {
  const v = new Vehicle()
  run(v, idle, 1)
  expect(v.telemetry().speedMs).toBeLessThan(0.5)
})

test('под газом машина разгоняется', () => {
  const v = new Vehicle()
  run(v, full, 3)
  expect(v.telemetry().speedMs).toBeGreaterThan(10)
})

test('тормоз замедляет машину', () => {
  const v = new Vehicle()
  run(v, full, 3)
  const before = v.telemetry().speedMs
  run(v, { ...idle, brake: 1 }, 1)
  expect(v.telemetry().speedMs).toBeLessThan(before)
})

test('разгон за 5 секунд укладывается в правдоподобный для F1 диапазон', () => {
  const v = new Vehicle()
  run(v, full, 5)
  const kmh = v.telemetry().speedMs * 3.6
  expect(kmh).toBeGreaterThan(100)
  expect(kmh).toBeLessThan(360)
})

test('болид стартует на полотне, а не рядом с трассой', () => {
  const track = monza()
  const v = new Vehicle(undefined, startPose(track))
  expect(isOnTrack(track, v.telemetry().position)).toBe(true)
})

test('болид под газом едет вдоль трассы, а не поперёк', () => {
  const track = monza()
  const v = new Vehicle(undefined, startPose(track))
  run(v, { throttle: 1, brake: 0, steer: 0, gear: 0, drs: false }, 5)
  expect(v.telemetry().speedMs).toBeGreaterThan(10)
  expect(isOnTrack(track, v.telemetry().position)).toBe(true)
})

test('болид не разворачивает при умеренном руле', () => {
  const track = monza()
  const v = new Vehicle(undefined, startPose(track))
  run(v, { throttle: 1, brake: 0, steer: 0, gear: 0, drs: false }, 3)

  let maxSideslip = 0
  const input: CarInput = { throttle: 0.3, brake: 0, steer: 0.3, gear: 0, drs: false }
  for (let i = 0; i < 5 / FIXED_STEP; i++) {
    v.step(input, FIXED_STEP)
    maxSideslip = Math.max(maxSideslip, sideslipDeg(v))
  }
  expect(maxSideslip).toBeLessThan(30)
})

test('все четыре шины выходят на рабочую температуру', () => {
  const track = monza()
  const v = new Vehicle(undefined, startPose(track))
  run(v, { throttle: 1, brake: 0, steer: 0, gear: 0, drs: false }, 30)
  for (const tyre of v.tyreStates()) {
    expect(tyre.tempC).toBeGreaterThan(60)
    expect(tyre.tempC).toBeLessThan(130)
  }
})

test('в повороте нагрузка перераспределяется на внешние колёса', () => {
  const track = monza()
  const v = new Vehicle(undefined, startPose(track))
  run(v, { throttle: 1, brake: 0, steer: 0, gear: 0, drs: false }, 3)
  run(v, { throttle: 0.3, brake: 0, steer: 0.3, gear: 0, drs: false }, 1.5)

  // Руль вправо по внутренней логике знака даёт крен на левый борт: внешними
  // оказываются колёса с индексами 1 и 3 (правый борт) либо 0 и 2 — сравниваем
  // борта, а не гадаем, какой из них внешний.
  const [fl, fr, rl, rr] = v.wheelLoads
  const leftSide = fl + rl
  const rightSide = fr + rr
  expect(Math.abs(leftSide - rightSide)).toBeGreaterThan(500)
})

/** Курс кузова в радианах вокруг Y. */
const headingOf = (v: Vehicle): number => {
  const q = v.orientation()
  return Math.atan2(2 * q.w * q.y, 1 - 2 * q.y * q.y)
}

// Знак смещения, а не модуль: |Δ| одинаков и при исправном руле, и при
// инвертированном. Руль берётся средний, а не полный: на полном локе машина
// теряет скорость раньше, чем успевает повернуть, и тест проходит вслепую.
test('руль поворачивает в заданную сторону', () => {
  const turn = (steer: number): number => {
    const v = new Vehicle()
    run(v, full, 2)
    const before = headingOf(v)
    run(v, { ...full, steer }, 2)
    return headingOf(v) - before
  }

  const right = turn(0.3)
  const left = turn(-0.3)
  expect(Math.abs(right)).toBeGreaterThan(0.05)
  expect(Math.sign(right)).toBe(-Math.sign(left))
})

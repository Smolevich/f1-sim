import { readFileSync } from 'node:fs'
import { beforeAll, expect, test } from 'vitest'
import RAPIER from '@dimforge/rapier3d-compat'
import { Vehicle, type CarInput } from './vehicle'
import { FIXED_STEP } from './world'
import { isOnTrack, startPose } from '../track/geometry'
import type { Track } from '../track/schema'

const monza = (): Track =>
  JSON.parse(readFileSync('public/tracks/monza.json', 'utf8'))

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

test('руль поворачивает машину', () => {
  const v = new Vehicle()
  run(v, full, 2)
  const straight = v.telemetry().position.x
  run(v, { ...full, steer: 1 }, 2)
  expect(Math.abs(v.telemetry().position.x - straight)).toBeGreaterThan(0.5)
})

import { beforeAll, expect, test } from 'vitest'
import { readFileSync } from 'node:fs'
import RAPIER from '@dimforge/rapier3d-compat'
import { Vehicle, type CarInput } from './vehicle'
import { FIXED_STEP } from './world'
import { startPose } from '../track/geometry'
import type { Track } from '../track/schema'

beforeAll(async () => { await RAPIER.init() })
const track: Track = JSON.parse(readFileSync('public/tracks/monza.json', 'utf8'))

const drive = (v: Vehicle, input: CarInput, seconds: number): void => {
  for (let i = 0; i < seconds / FIXED_STEP; i++) v.step(input, FIXED_STEP)
}

test('болид не улетает в поле сквозь отбойник', () => {
  const v = new Vehicle(undefined, startPose(track), track)
  // полный газ с полным рулём — гарантированный вылет с трассы
  drive(v, { throttle: 1, brake: 0, steer: 1, gear: 0, drs: false }, 12)
  const p = v.telemetry().position

  // расстояние до ближайшей точки осевой: за отбойником оно больше
  // полуширины плюс отступ отбойника плюс запас
  let nearest = Infinity
  for (const c of track.centerline) {
    nearest = Math.min(nearest, Math.hypot(p.x - c.x, p.z - c.z))
  }
  expect(nearest).toBeLessThan(30)
})

test('без трассы болид ведёт себя как раньше', () => {
  const v = new Vehicle()
  drive(v, { throttle: 1, brake: 0, steer: 0, gear: 0, drs: false }, 5)
  expect(v.telemetry().speedMs).toBeGreaterThan(10)
})

// Газ намеренно отпущен: под полным газом 914 л.с. разгоняют болид вдоль стенки
// быстрее, чем стенка его гасит, и «скорость после удара» меряла бы мотор, а не
// удар. Накатом видно именно потерю энергии в железе.
test('удар в отбойник гасит скорость', () => {
  const v = new Vehicle(undefined, startPose(track), track)
  drive(v, { throttle: 1, brake: 0, steer: 0, gear: 0, drs: false }, 4)
  const before = v.telemetry().speedMs
  drive(v, { throttle: 0, brake: 0, steer: 1, gear: 0, drs: false }, 10)
  expect(v.telemetry().speedMs).toBeLessThan(before / 2)
})

test('отбойник не даёт болиду провалиться под землю или взлететь', () => {
  const v = new Vehicle(undefined, startPose(track), track)
  drive(v, { throttle: 1, brake: 0, steer: 1, gear: 0, drs: false }, 12)
  const y = v.telemetry().position.y
  expect(y).toBeGreaterThan(0)
  expect(y).toBeLessThan(3)
})

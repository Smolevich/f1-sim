import { expect, test } from 'vitest'
import { CAMERA_ORDER, cameraPose, nextMode, SMOOTH_RATE, smoothTowards } from './cameras'

const at = { x: 0, y: 0, z: 0 }

test('режимы переключаются по кругу', () => {
  let mode = CAMERA_ORDER[0]
  for (let i = 0; i < CAMERA_ORDER.length; i++) mode = nextMode(mode)
  expect(mode).toBe(CAMERA_ORDER[0])
})

test('внешняя камера стоит позади болида', () => {
  const pose = cameraPose('chase', at, 0, 0)
  // курс 0 смотрит в +Z, значит камера должна быть в -Z
  expect(pose.eye.z).toBeLessThan(0)
})

test('кокпит ближе к болиду, чем внешняя камера', () => {
  const cockpit = cameraPose('cockpit', at, 0, 0)
  const chase = cameraPose('chase', at, 0, 0)
  expect(Math.hypot(cockpit.eye.x, cockpit.eye.z)).toBeLessThan(Math.hypot(chase.eye.x, chase.eye.z))
})

test('камера следует за курсом болида', () => {
  const north = cameraPose('chase', at, 0, 0)
  const east = cameraPose('chase', at, Math.PI / 2, 0)
  expect(Math.abs(north.eye.x - east.eye.x)).toBeGreaterThan(1)
})

test('поле зрения расширяется со скоростью', () => {
  expect(cameraPose('chase', at, 0, 80).fov).toBeGreaterThan(cameraPose('chase', at, 0, 0).fov)
})

test('поле зрения не растёт без предела', () => {
  expect(cameraPose('chase', at, 0, 500).fov).toBeLessThan(110)
})

test('сглаживание тянет камеру к цели, но не мгновенно', () => {
  const from = { x: 0, y: 0, z: 0 }
  const to = { x: 10, y: 0, z: 0 }
  const next = smoothTowards(from, to, 0.1, 5)
  expect(next.x).toBeGreaterThan(0)
  expect(next.x).toBeLessThan(10)
})

test('за большой шаг камера почти догоняет цель', () => {
  const next = smoothTowards({ x: 0, y: 0, z: 0 }, { x: 10, y: 0, z: 0 }, 1, 5)
  expect(next.x).toBeGreaterThan(9)
})

test('нулевая дистанция не двигает камеру', () => {
  const next = smoothTowards({ x: 5, y: 1, z: 2 }, { x: 5, y: 1, z: 2 }, 0.1, 5)
  expect(next.x).toBeCloseTo(5, 6)
})

test('кокпит сглаживается слабее внешней камеры', () => {
  // Из кокпита задержка читается как расхлябанность, а не как вес болида.
  expect(SMOOTH_RATE.cockpit).toBeGreaterThan(SMOOTH_RATE.chase)
})

test('ближние камеры сглажены достаточно, чтобы не дёргаться', () => {
  // Регрессия: при ставке 22 рывок камеры в кокпите был 0.17 м со скачками
  // до 0.54 м — в шесть раз больше, чем у chase, и читался как дрожание.
  expect(SMOOTH_RATE.cockpit).toBeLessThanOrEqual(14)
  expect(SMOOTH_RATE.bonnet).toBeLessThanOrEqual(14)
})

test('ближние камеры всё же жёстче внешних — иначе рулёжка расхлябанная', () => {
  expect(SMOOTH_RATE.cockpit).toBeGreaterThan(SMOOTH_RATE.chase)
  expect(SMOOTH_RATE.bonnet).toBeGreaterThan(SMOOTH_RATE.tcam)
})

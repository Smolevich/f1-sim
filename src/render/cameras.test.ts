import { expect, test } from 'vitest'
import {
  CAMERA_ORDER, cameraPose, compensateLag, lagDistance, nextMode, SMOOTH_RATE, smoothTowards,
} from './cameras'

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

test('отставание сглаживателя растёт со скоростью', () => {
  const slow = lagDistance(20, 1 / 60, 6)
  const fast = lagDistance(65, 1 / 60, 6)
  expect(fast).toBeGreaterThan(slow)
})

test('жёсткое сглаживание отстаёт меньше мягкого', () => {
  expect(lagDistance(65, 1 / 60, 20)).toBeLessThan(lagDistance(65, 1 / 60, 6))
})

test('на месте отставания нет', () => {
  expect(lagDistance(0, 1 / 60, 6)).toBe(0)
})

test('нулевая ставка не даёт деления на ноль', () => {
  expect(lagDistance(65, 1 / 60, 0)).toBe(0)
  expect(Number.isFinite(lagDistance(65, 0, 6))).toBe(true)
})

test('компенсация сдвигает цель по направлению движения', () => {
  // Курс 0 — движение вдоль +Z, значит цель уезжает вперёд по Z.
  const moved = compensateLag({ x: 0, y: 1, z: 0 }, 0, 65, 1 / 60, 6)
  expect(moved.z).toBeGreaterThan(5)
  expect(moved.x).toBeCloseTo(0, 6)
  expect(moved.y).toBe(1)
})

test('компенсация держит дистанцию камеры почти постоянной', () => {
  // Симуляция: цель едет равномерно, камера сглаживает компенсированную цель.
  const dt = 1 / 60
  const rate = 6
  const v = 65
  let cam = { x: 0, y: 0, z: 0 }
  let carZ = 0
  const gaps: number[] = []
  for (let i = 0; i < 300; i += 1) {
    carZ += v * dt
    const rig = { x: 0, y: 0, z: carZ - 17 }
    const aim = compensateLag(rig, 0, v, dt, rate)
    cam = smoothTowards(cam, aim, dt, rate)
    if (i > 200) gaps.push(carZ - cam.z)
  }
  const mean = gaps.reduce((a, b) => a + b, 0) / gaps.length
  // Без компенсации разрыв был бы ~27 м вместо 17.
  expect(mean).toBeGreaterThan(15)
  expect(mean).toBeLessThan(19)
})

test('камера погони стоит близко — иначе болида не разглядеть', () => {
  // Регрессия: 17 м позади и 7 м вверх превращали машину в точку.
  const pose = cameraPose('chase', { x: 0, y: 0.5, z: 0 }, 0, 60)
  const distance = Math.hypot(pose.eye.x, pose.eye.y - 0.5, pose.eye.z)
  expect(distance).toBeLessThan(11)
  expect(distance).toBeGreaterThan(6)
})

test('камера погони выше машины, но не над ней', () => {
  const pose = cameraPose('chase', { x: 0, y: 0.5, z: 0 }, 0, 60)
  expect(pose.eye.y).toBeGreaterThan(1.5)
  expect(pose.eye.y).toBeLessThan(4.5)
})

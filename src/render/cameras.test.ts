import { expect, test } from 'vitest'
import { CAMERA_ORDER, cameraPose, nextMode } from './cameras'

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

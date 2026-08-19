import { expect, test } from 'vitest'
import {
  BODY_SECTIONS, FRONT_WING, halfWidthAt, HALF_TRACK_M, LENGTH_M,
  REAR_WING, WHEEL_RADIUS_M, WHEELBASE_M, WIDTH_M,
} from './car-shape'

test('габариты соответствуют регламенту 2022+', () => {
  expect(LENGTH_M).toBeGreaterThan(5.0)
  expect(WIDTH_M).toBeCloseTo(2.0, 2)
  expect(WHEELBASE_M).toBeCloseTo(3.6, 2)
  expect(WHEEL_RADIUS_M * 2).toBeCloseTo(0.72, 2)
})

test('болид длинный и низкий — отношение длины к ширине около 2.8', () => {
  // Именно это отличает болид от легковушки: у неё отношение около 2.2.
  expect(LENGTH_M / WIDTH_M).toBeGreaterThan(2.6)
})

test('сечения идут от носа к корме без разрывов', () => {
  for (let i = 1; i < BODY_SECTIONS.length; i += 1) {
    expect(BODY_SECTIONS[i].z).toBeLessThan(BODY_SECTIONS[i - 1].z)
  }
})

test('нос узкий, кокпит широкий, корма снова сужается', () => {
  const nose = halfWidthAt(2.4)
  const cockpit = halfWidthAt(-0.2)
  const tail = halfWidthAt(-2.4)
  expect(nose).toBeLessThan(cockpit)
  expect(tail).toBeLessThan(cockpit)
  expect(nose).toBeLessThan(0.12)
})

test('монокок уже колеи — колёса стоят снаружи кузова', () => {
  const widest = Math.max(...BODY_SECTIONS.map((s) => s.halfWidth))
  expect(widest).toBeLessThan(HALF_TRACK_M)
})

test('переднее антикрыло шире монокока и уже колеи', () => {
  expect(FRONT_WING.halfWidth).toBeGreaterThan(halfWidthAt(2.2))
  expect(FRONT_WING.halfWidth).toBeLessThanOrEqual(WIDTH_M / 2)
})

test('заднее антикрыло уже переднего — так по регламенту', () => {
  expect(REAR_WING.halfWidth).toBeLessThan(FRONT_WING.halfWidth)
})

test('закрылок DRS стоит выше основного профиля', () => {
  expect(REAR_WING.flapY).toBeGreaterThan(REAR_WING.mainY)
})

test('полуширина за пределами машины не растёт', () => {
  expect(halfWidthAt(9)).toBeCloseTo(BODY_SECTIONS[0].halfWidth, 6)
  expect(halfWidthAt(-9)).toBeCloseTo(BODY_SECTIONS[BODY_SECTIONS.length - 1].halfWidth, 6)
})

test('борт шире своей высоты — болид приземистый, а не лодка', () => {
  // Регрессия: при h/w около 1 монокок выходил узким и высоким.
  for (const s of BODY_SECTIONS) {
    const height = s.top - s.bottom
    const width = s.halfWidth * 2
    expect(height / width).toBeLessThan(1.0)
  }
})

test('самое широкое сечение приходится на кокпит', () => {
  const widest = BODY_SECTIONS.reduce((a, b) => (b.halfWidth > a.halfWidth ? b : a))
  expect(Math.abs(widest.z)).toBeLessThan(0.6)
})

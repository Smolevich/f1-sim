import { expect, test } from 'vitest'
import {
  LEVEL, lateralG, longitudinalG, settle, targetAttitude,
} from './body-attitude'

test('на торможении нос клюёт вниз', () => {
  // Регрессия: размах тангажа был 0.52° за весь круг, машина шла как по
  // рельсам, и это читалось как «парит над дорогой».
  const braking = targetAttitude(-5, 0)
  expect(braking.pitch).toBeGreaterThan(0)
})

test('на разгоне корма приседает', () => {
  expect(targetAttitude(1.5, 0).pitch).toBeLessThan(0)
})

test('в повороте кузов кренится наружу', () => {
  const right = targetAttitude(0, 3)
  const left = targetAttitude(0, -3)
  expect(right.roll).toBeGreaterThan(0)
  expect(left.roll).toBeLessThan(0)
})

test('наклон ограничен — у болида ход подвески в миллиметрах', () => {
  const extreme = targetAttitude(-40, 40)
  expect(Math.abs(extreme.pitch)).toBeLessThanOrEqual(0.035)
  expect(Math.abs(extreme.roll)).toBeLessThanOrEqual(0.045)
})

test('кузов оседает плавно, а не щёлкает в цель', () => {
  const target = targetAttitude(-5, 0)
  const step = settle(LEVEL, target, 1 / 60)
  expect(step.pitch).toBeGreaterThan(0)
  expect(step.pitch).toBeLessThan(target.pitch)
})

test('за долгое время наклон приходит к цели', () => {
  const target = targetAttitude(-5, 2)
  let a = LEVEL
  for (let i = 0; i < 120; i += 1) a = settle(a, target, 1 / 60)
  expect(a.pitch).toBeCloseTo(target.pitch, 3)
  expect(a.roll).toBeCloseTo(target.roll, 3)
})

test('продольная перегрузка считается по изменению скорости', () => {
  // Торможение с 60 до 55 м/с за 0.1 с — это около −5 g.
  expect(longitudinalG(55, 60, 0.1)).toBeCloseTo(-5.1, 1)
})

test('нулевой шаг не даёт деления на ноль', () => {
  expect(longitudinalG(55, 60, 0)).toBe(0)
})

test('поперечная перегрузка растёт со скоростью в повороте', () => {
  const slow = lateralG(20, 1, 3.6)
  const fast = lateralG(60, 1, 3.6)
  expect(fast).toBeGreaterThan(slow)
})

test('на прямой поперечной перегрузки нет', () => {
  expect(lateralG(60, 0, 3.6)).toBe(0)
})

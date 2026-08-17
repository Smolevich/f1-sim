import { expect, test } from 'vitest'
import {
  bestGear, engineTorque, ersBoostW, rpmFor, updateErs, wheelTorque,
  GEAR_RATIOS, MAX_ERS_J, type ErsState,
} from './drivetrain'

test('восемь передач', () => {
  expect(GEAR_RATIOS).toHaveLength(8)
})

test('передачи идут по убыванию: первая самая короткая', () => {
  for (let i = 1; i < GEAR_RATIOS.length; i++) {
    expect(GEAR_RATIOS[i]).toBeLessThan(GEAR_RATIOS[i - 1])
  }
})

test('момент падает после пика оборотов', () => {
  expect(engineTorque(14000)).toBeLessThan(engineTorque(10500))
})

test('на низкой передаче момент на колесе выше', () => {
  expect(wheelTorque(9000, 1, 1)).toBeGreaterThan(wheelTorque(9000, 8, 1))
})

test('без газа момента на колесе нет', () => {
  expect(wheelTorque(9000, 3, 0)).toBe(0)
})

test('обороты растут со скоростью', () => {
  expect(rpmFor(80, 4)).toBeGreaterThan(rpmFor(40, 4))
})

test('автокоробка выбирает выше передачу на большей скорости', () => {
  expect(bestGear(90)).toBeGreaterThan(bestGear(20))
})

test('торможение заряжает ERS', () => {
  const s: ErsState = { chargeJ: 0, deploying: false }
  expect(updateErs(s, 0, 1, 1).chargeJ).toBeGreaterThan(0)
})

test('заряд ERS не превышает лимит на круг', () => {
  let s: ErsState = { chargeJ: 0, deploying: false }
  for (let i = 0; i < 1000; i++) s = updateErs(s, 0, 1, 1)
  expect(s.chargeJ).toBeLessThanOrEqual(MAX_ERS_J)
})

test('разряженный ERS не даёт буста', () => {
  expect(ersBoostW({ chargeJ: 0, deploying: true })).toBe(0)
})

test('заряженный ERS под газом даёт буст', () => {
  expect(ersBoostW({ chargeJ: MAX_ERS_J, deploying: true })).toBeGreaterThan(0)
})

test('расход ERS уменьшает заряд', () => {
  const s: ErsState = { chargeJ: MAX_ERS_J, deploying: true }
  expect(updateErs(s, 1, 0, 1).chargeJ).toBeLessThan(MAX_ERS_J)
})

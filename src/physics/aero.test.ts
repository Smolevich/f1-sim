import { expect, test } from 'vitest'
import { downforce, drag, type AeroSetup } from './aero'

const setup: AeroSetup = { frontWing: 0.5, rearWing: 0.5 }

test('прижим растёт квадратично со скоростью', () => {
  const at50 = downforce(setup, 50, false)
  const at100 = downforce(setup, 100, false)
  const ratio = (at100.front + at100.rear) / (at50.front + at50.rear)
  expect(ratio).toBeCloseTo(4, 1)
})

test('на стоянке прижима нет', () => {
  const d = downforce(setup, 0, false)
  expect(d.front + d.rear).toBe(0)
})

test('DRS снижает прижим на задней оси', () => {
  expect(downforce(setup, 80, true).rear).toBeLessThan(downforce(setup, 80, false).rear)
})

test('DRS снижает сопротивление', () => {
  expect(drag(setup, 80, true)).toBeLessThan(drag(setup, 80, false))
})

test('больше угол крыла — больше прижим и больше сопротивление', () => {
  const low: AeroSetup = { frontWing: 0.2, rearWing: 0.2 }
  const high: AeroSetup = { frontWing: 0.9, rearWing: 0.9 }
  const lowD = downforce(low, 80, false)
  const highD = downforce(high, 80, false)
  expect(highD.front + highD.rear).toBeGreaterThan(lowD.front + lowD.rear)
  expect(drag(high, 80, false)).toBeGreaterThan(drag(low, 80, false))
})

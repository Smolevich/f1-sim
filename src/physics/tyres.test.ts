import { expect, test } from 'vitest'
import { gripFactor, tyreForce, updateTyre, type TyreState } from './tyres'

const fresh = (over: Partial<TyreState> = {}): TyreState => ({
  compound: 'medium', tempC: 100, wear: 0, ...over,
})

test('холодная шина держит хуже прогретой', () => {
  expect(gripFactor(fresh({ tempC: 40 }))).toBeLessThan(gripFactor(fresh()))
})

test('перегретая шина держит хуже прогретой', () => {
  expect(gripFactor(fresh({ tempC: 160 }))).toBeLessThan(gripFactor(fresh()))
})

test('изношенная шина держит хуже свежей', () => {
  expect(gripFactor(fresh({ wear: 0.9 }))).toBeLessThan(gripFactor(fresh()))
})

test('soft держит лучше hard при прочих равных', () => {
  expect(gripFactor(fresh({ compound: 'soft' })))
    .toBeGreaterThan(gripFactor(fresh({ compound: 'hard' })))
})

test('круг трения: полный разгон с полным поворотом не даёт сумму больше предела', () => {
  const load = 4000
  const f = tyreForce(fresh(), 1, Math.PI / 4, load)
  const magnitude = Math.hypot(f.longitudinal, f.lateral)
  expect(magnitude).toBeLessThanOrEqual(load * gripFactor(fresh()) * 1.001)
})

test('скольжение греет шину', () => {
  expect(updateTyre(fresh({ tempC: 80 }), 0.5, 0.1).tempC).toBeGreaterThan(80)
})

test('шина остывает без скольжения', () => {
  expect(updateTyre(fresh({ tempC: 120 }), 0, 1).tempC).toBeLessThan(120)
})

test('износ растёт от скольжения и не превышает единицы', () => {
  let s = fresh()
  for (let i = 0; i < 10_000; i++) s = updateTyre(s, 1, 0.1)
  expect(s.wear).toBeGreaterThan(0)
  expect(s.wear).toBeLessThanOrEqual(1)
})

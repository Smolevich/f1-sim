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
  for (let i = 0; i < 50_000; i++) s = updateTyre(s, 1, 0.1)
  expect(s.wear).toBeGreaterThan(0)
  expect(s.wear).toBeLessThanOrEqual(1)
})

test('разгруженное колесо не передаёт силу', () => {
  const f = tyreForce(fresh(), 1, Math.PI / 4, -4000)
  expect(Math.hypot(f.longitudinal, f.lateral)).toBe(0)
})

test('шина не уходит в перегрев при постоянном скольжении', () => {
  let s = fresh()
  // минута непрерывного бокового скольжения — худший случай в заезде
  for (let i = 0; i < 60 / (1 / 120); i++) s = updateTyre(s, 0.5, 1 / 120)
  expect(s.tempC).toBeLessThan(120)
})

// Регрессия на баг «машина глохнет посреди круга»: в затяжном повороте по Монце
// шина упиралась в 141 °C со сцеплением 0.40, и болид останавливался на полотне.
// Проверяем не абстрактную «половину скольжения», а тот режим, который и убивал
// заезд: длительное сильное скольжение обязано оставлять машину едущей.
test('затяжное сильное скольжение не обнуляет сцепление', () => {
  let s = fresh()
  for (let i = 0; i < 60 / (1 / 120); i++) s = updateTyre(s, 1, 1 / 120)
  expect(s.tempC).toBeLessThan(135)
  expect(gripFactor(s)).toBeGreaterThan(1)
})

test('перегретая шина сохраняет часть сцепления', () => {
  // даже на верхней границе окна машина должна ехать, а не глохнуть
  expect(gripFactor({ compound: 'medium', tempC: 125, wear: 0 })).toBeGreaterThan(0.9)
})

test('холодная шина всё ещё держит хуже прогретой', () => {
  expect(gripFactor(fresh({ tempC: 40 }))).toBeLessThan(gripFactor(fresh()))
})

test('шина остывает быстрее, когда сильно перегрета', () => {
  const hot = updateTyre({ compound: 'medium', tempC: 140, wear: 0 }, 0, 1)
  const warm = updateTyre({ compound: 'medium', tempC: 105, wear: 0 }, 0, 1)
  expect(140 - hot.tempC).toBeGreaterThan(105 - warm.tempC)
})

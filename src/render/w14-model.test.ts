import { expect, test } from 'vitest'
import {
  BODY_MIN_WIDTH_M, bodyOffset, isBrandedMaterial, scaledHalfTrack, SCALE, WHEEL_WIDTH_M,
} from './w14-model'

test('масштаб приводит базу модели к физическим 3.6 м', () => {
  expect(3.143 * SCALE).toBeCloseTo(3.6, 2)
})

test('колея после масштаба близка к регламентной', () => {
  // Регламент 2022+: колея около 1.6 м, полуколея 0.8.
  const half = scaledHalfTrack()
  expect(half).toBeGreaterThan(0.6)
  expect(half).toBeLessThan(1.0)
})

test('кузов сдвигается так, чтобы колёса встали на землю', () => {
  expect(bodyOffset().y).toBeLessThan(0)
})

test('центр колёсной базы уезжает в ноль', () => {
  // Передняя ось 2.423, задняя -0.720: центр на 0.85, значит сдвиг обратный.
  expect(bodyOffset().z).toBeCloseTo(-0.85, 2)
})

test('спонсорские материалы опознаются', () => {
  for (const name of ['Mercedes-Logo', 'petronas_logo', 'teamviewer.004', 'pirelli', '44_lewis']) {
    expect(isBrandedMaterial(name)).toBe(true)
  }
})

test('материалы кузова не считаются спонсорскими', () => {
  for (const name of ['Material', 'Material.008', 'Material.034']) {
    expect(isBrandedMaterial(name)).toBe(false)
  }
})

test('регистр в имени материала не мешает опознанию', () => {
  expect(isBrandedMaterial('MERCEDES-LOGO')).toBe(true)
  expect(isBrandedMaterial('Petronas_PNG.002')).toBe(true)
})

test('монокок и понтоны попадают под перекраску', () => {
  // Регрессия: отбор по светлоте не работал — родная ливрея W14 чёрная,
  // а по объёму локальной геометрии порог проходило всё, включая колёса.
  // Ширина в мире разделяет чётко: понтон 1.54 м, монокок 1.30 м.
  expect(1.54).toBeGreaterThan(BODY_MIN_WIDTH_M)
  expect(1.30).toBeGreaterThan(BODY_MIN_WIDTH_M)
})

test('покрышки не перекрашиваются в цвет команды', () => {
  expect(WHEEL_WIDTH_M).toBeLessThan(BODY_MIN_WIDTH_M)
})

test('порог шире колеса, но уже болида', () => {
  // Болид 2 м в ширину: порог не должен отсекать сам кузов.
  expect(BODY_MIN_WIDTH_M).toBeGreaterThan(WHEEL_WIDTH_M)
  expect(BODY_MIN_WIDTH_M).toBeLessThan(2.0)
})

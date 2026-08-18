import { expect, test } from 'vitest'
import { DEFAULT_LIVERY, LIVERIES, liveryById } from './liveries'

test('идентификаторы ливрей уникальны', () => {
  const ids = LIVERIES.map((l) => l.id)
  expect(new Set(ids).size).toBe(ids.length)
})

test('ливрея находится по идентификатору', () => {
  expect(liveryById('papaya').name).toContain('Папайя')
})

test('неизвестный идентификатор даёт ливрею по умолчанию, а не падение', () => {
  expect(liveryById('нет-такой')).toBe(DEFAULT_LIVERY)
})

test('цвета заданы как числа в диапазоне RGB', () => {
  for (const livery of LIVERIES) {
    expect(livery.primary).toBeGreaterThanOrEqual(0)
    expect(livery.primary).toBeLessThanOrEqual(0xffffff)
    expect(livery.accent).toBeLessThanOrEqual(0xffffff)
  }
})

test('основной цвет отличается от акцента — иначе ливрея одноцветная', () => {
  for (const livery of LIVERIES) {
    expect(livery.primary).not.toBe(livery.accent)
  }
})

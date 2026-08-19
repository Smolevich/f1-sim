import { expect, test } from 'vitest'
import { zoneFor } from './paint'

const at = (x: number, y: number, z: number, height = 0.4, width = 0.4) =>
  ({ x, y, z, height, width })

test('нос несёт цвет команды — самое заметное пятно спереди', () => {
  expect(zoneFor(at(0.65, 0.44, 1.2))).toBe('livery')
})

test('полоса по осевой идёт цветом команды', () => {
  expect(zoneFor(at(0.65, 0.5, 0.3))).toBe('livery')
})

test('борт понтона тёмный, а не залит цветом команды', () => {
  // Именно ровная заливка борта и делает болид похожим на игрушку.
  expect(zoneFor(at(0.65 + 0.5, 0.4, -0.5))).toBe('carbon')
})

test('законцовка антикрыла цветная, профиль тёмный', () => {
  expect(zoneFor(at(0.65 + 0.8, 0.4, -2.0))).toBe('livery')
  expect(zoneFor(at(0.65, 0.72, -2.04))).toBe('wing')
})

test('днище уходит в карбон', () => {
  expect(zoneFor(at(0.65, 0.14, -0.37))).toBe('floor')
})

test('halo и крышка двигателя — карбон', () => {
  expect(zoneFor(at(0.64, 0.95, -0.32))).toBe('carbon')
})

test('на болиде есть и цвет команды, и тёмные зоны', () => {
  // Защита от вырождения схемы в один цвет — ровно та жалоба, из-за
  // которой раскраску и переделывали.
  const parts = [
    at(0.65, 0.44, 1.2), at(0.65, 0.5, 0.3), at(1.15, 0.4, -0.5),
    at(0.65, 0.14, -0.37), at(0.64, 0.95, -0.32), at(1.45, 0.4, -2.0),
  ]
  const zones = new Set(parts.map(zoneFor))
  expect(zones.has('livery')).toBe(true)
  expect(zones.has('carbon')).toBe(true)
  expect(zones.size).toBeGreaterThanOrEqual(3)
})

test('кузов во всю ширину не считается полосой по осевой', () => {
  // Регрессия: меш кузова 1.78 м шириной с центром на осевой забирал полосу,
  // и цветом команды заливало оба борта.
  expect(zoneFor(at(0.65, 0.32, -0.31, 0.67, 1.78))).not.toBe('livery')
})

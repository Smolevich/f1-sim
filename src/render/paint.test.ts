import { expect, test } from 'vitest'
import { zoneFor } from './paint'

const at = (x: number, y: number, z: number, height = 0.4, width = 0.4) =>
  ({ x, y, z, height, width })

test('нос несёт цвет команды — самое заметное пятно спереди', () => {
  expect(zoneFor(at(0.65, 0.44, 1.2))).toBe('livery')
})

test('монокок несёт цвет команды — он основной, а не акцент', () => {
  // Регрессия: карбон занимал 81% кузова, и Mercedes выглядел чёрным.
  expect(zoneFor(at(0.65, 0.5, 0.3))).toBe('livery')
})

test('низ борта понтона — тёмная вставка', () => {
  expect(zoneFor(at(0.65 + 0.5, 0.4, -0.5))).toBe('carbon')
})

test('верх борта остаётся в цвете команды', () => {
  expect(zoneFor(at(0.65 + 0.5, 0.55, -0.5))).toBe('livery')
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

test('цвет команды занимает большую часть кузова', () => {
  // Проверяем по сетке точек: если тёмных зон больше, чем цветных, машина
  // перестаёт читаться как ливрея этой команды.
  let livery = 0, dark = 0
  for (let z = -1.6; z <= 1.5; z += 0.2) {
    for (let y = 0.25; y <= 0.65; y += 0.1) {
      for (let dx = 0; dx <= 0.8; dx += 0.2) {
        const zone = zoneFor(at(0.645 + dx, y, z))
        if (zone === 'livery') livery += 1
        else dark += 1
      }
    }
  }
  expect(livery).toBeGreaterThan(dark)
})

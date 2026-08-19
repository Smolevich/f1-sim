import { expect, test } from 'vitest'
import { zoneFor } from './paint'

const at = (x: number, y: number, z: number, height = 0.4) => ({ x, y, z, height })

test('переднее антикрыло красится как крыло', () => {
  expect(zoneFor(at(0.65, 0.25, 1.87))).toBe('wing')
})

test('заднее антикрыло красится как крыло', () => {
  expect(zoneFor(at(0.65, 0.72, -2.04))).toBe('wing')
})

test('днище уходит в карбон, а не в цвет команды', () => {
  expect(zoneFor(at(0.65, 0.14, -0.37))).toBe('floor')
})

test('halo и крышка двигателя — карбон', () => {
  expect(zoneFor(at(0.64, 0.95, -0.32))).toBe('carbon')
})

test('борт монокока несёт цвет команды', () => {
  expect(zoneFor(at(0.65, 0.37, -0.78))).toBe('body')
})

test('зона считается по геометрии, а не по имени меша', () => {
  // Одна и та же высота на носу и в корме даёт крыло, в середине — кузов.
  expect(zoneFor(at(0.65, 0.4, 1.9))).toBe('wing')
  expect(zoneFor(at(0.65, 0.4, -1.9))).toBe('wing')
  expect(zoneFor(at(0.65, 0.4, 0))).toBe('body')
})

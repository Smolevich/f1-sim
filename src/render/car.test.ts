import * as THREE from 'three'
import { expect, test } from 'vitest'
import { spinWheels, steerAngleFor, wheelSpinDelta } from './car'
import type { CarParts } from './car'
import { steerLimitForSpeed } from '../physics/vehicle'

test('колесо крутится тем быстрее, чем выше скорость', () => {
  expect(wheelSpinDelta(60, 0.1)).toBeGreaterThan(wheelSpinDelta(30, 0.1))
})

test('на стоянке колесо не крутится', () => {
  expect(wheelSpinDelta(0, 0.1)).toBe(0)
})

test('угол поворота колёс растёт по модулю вместе с рулём', () => {
  expect(Math.abs(steerAngleFor(1))).toBeGreaterThan(Math.abs(steerAngleFor(0.5)))
})

test('противоположный руль даёт противоположный угол', () => {
  expect(Math.sign(steerAngleFor(1))).toBe(-Math.sign(steerAngleFor(-1)))
})

test('визуальный поворот колёс совпадает по знаку с физическим', () => {
  // Физика: rotateY(forward, steerRad) при положительном угле уводит
  // направление в отрицательный X. Рендер обязан давать тот же знак.
  const rotateY = (v: { x: number; z: number }, a: number) => ({
    x: v.x * Math.cos(a) - v.z * Math.sin(a),
    z: v.x * Math.sin(a) + v.z * Math.cos(a),
  })
  const physics = rotateY({ x: 0, z: 1 }, 0.3)

  const angle = steerAngleFor(1)
  // three.js: rotation.y = angle поворачивает вектор как Ry(angle)
  const render = { x: Math.sin(angle), z: Math.cos(angle) }

  expect(Math.sign(render.x)).toBe(Math.sign(physics.x))
})

test('поворот колёс ограничен максимальным углом', () => {
  expect(Math.abs(steerAngleFor(5))).toBeLessThanOrEqual(Math.abs(steerAngleFor(1)))
})

test('вращение и поворот руля живут на разных узлах — колесо не ходит восьмёркой', () => {
  // Регрессия: rotation.x и rotation.y стояли на одном объекте, углы Эйлера
  // перемножались, и ось качения уводило от горизонта до 17° за кадр.
  const hub = new THREE.Group()
  const wheel = new THREE.Group()
  hub.add(wheel)

  const parts: CarParts = { group: new THREE.Group(), wheels: [wheel], steered: [hub] }

  const axis = new THREE.Vector3()
  const tilts: number[] = []
  for (let i = 0; i < 8; i += 1) {
    spinWheels(parts, 40, 1, 1 / 60)
    hub.updateMatrixWorld(true)
    axis.set(1, 0, 0).applyQuaternion(wheel.getWorldQuaternion(new THREE.Quaternion()))
    tilts.push(Math.abs(axis.y))
  }

  for (const tilt of tilts) expect(tilt).toBeLessThan(1e-9)
})

test('на высокой скорости колёса почти не выворачиваются', () => {
  // Регрессия: рендер крутил полные 17.2° независимо от скорости, тогда как
  // физика на 350 км/ч даёт 0.9° — картинка врала в 20 раз.
  const slow = Math.abs(steerAngleFor(1, 10))
  const fast = Math.abs(steerAngleFor(1, 97))
  expect(fast).toBeLessThan(slow / 5)
})

test('на малой скорости руль работает на полный угол', () => {
  expect(Math.abs(steerAngleFor(1, 2))).toBeCloseTo(0.3, 3)
})

test('угол рендера совпадает с пределом физики', () => {
  const speed = 60
  const physics = steerLimitForSpeed(speed, 3.6, 0.3)
  expect(Math.abs(steerAngleFor(1, speed))).toBeCloseTo(physics, 6)
})

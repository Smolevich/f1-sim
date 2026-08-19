import * as THREE from 'three'
import { expect, test } from 'vitest'
import {
  CORNERS, isHollowWheelRing, MODEL_HALF_TRACK, RENDER_HALF_TRACK_M, SCALE, wheelAxle,
} from './f1-model'

const v = (x: number, y: number, z: number) => new THREE.Vector3(x, y, z)

test('масштаб приводит колёсную базу модели к физическим 3.6 м', () => {
  expect(3.03 * SCALE).toBeCloseTo(3.6, 3)
})

test('две передние стойки управляемые, две задние — нет', () => {
  expect(CORNERS.filter((c) => c.steered)).toHaveLength(2)
  expect(CORNERS.filter((c) => !c.steered)).toHaveLength(2)
})

test('колёса стоят в нишах модели, а не на колее физики', () => {
  expect(RENDER_HALF_TRACK_M).toBeLessThan(0.8)
  expect(RENDER_HALF_TRACK_M).toBeGreaterThan(0.55)
})

test('оси колёс симметричны относительно осевой машины', () => {
  const front = CORNERS.filter((c) => c.steered).map(wheelAxle)
  const left = front.find((a) => a.x < 0.645)!
  const right = front.find((a) => a.x > 0.645)!
  expect(0.645 - left.x).toBeCloseTo(right.x - 0.645, 6)
})

test('передние оси на передней оси модели, задние — на задней', () => {
  for (const c of CORNERS.filter((x) => x.steered)) expect(wheelAxle(c).z).toBeCloseTo(1.18, 3)
  for (const c of CORNERS.filter((x) => !x.steered)) expect(wheelAxle(c).z).toBeCloseTo(-1.85, 3)
})

test('тормозной диск опознаётся как полое кольцо и прячется', () => {
  // Замер из модели: толщина 0.02, диаметр 0.423, центр на правом борту.
  expect(isHollowWheelRing(v(0.02, 0.423, 0.423), v(1.22, 0.33, 1.18))).toBe(true)
})

test('днище не опознаётся как кольцо, хотя тоже плоское', () => {
  // Меш 23: тонкий по Y, но огромный по X и Z — это пол, а не колесо.
  expect(isHollowWheelRing(v(1.36, 0.19, 2.35), v(0.65, 0.14, -0.37))).toBe(false)
})

test('деталь на осевой машины не считается кольцом колеса', () => {
  expect(isHollowWheelRing(v(0.02, 0.42, 0.42), v(0.645, 0.33, 0))).toBe(false)
})

test('толстая деталь не считается кольцом', () => {
  expect(isHollowWheelRing(v(0.30, 0.42, 0.42), v(1.22, 0.33, 1.18))).toBe(false)
})

test('половина колеи совпадает с замером модели', () => {
  expect(MODEL_HALF_TRACK).toBeCloseTo(0.545, 3)
})

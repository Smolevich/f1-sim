import * as THREE from 'three'
import { expect, test } from 'vitest'
import { buildF1Car } from './f1-car'
import { makeTranslucent } from './ghost-car'

/** Габарит болида по осям в метрах. */
function size(object: THREE.Object3D): THREE.Vector3 {
  return new THREE.Box3().setFromObject(object).getSize(new THREE.Vector3())
}

test('руление и качение живут в разных узлах', () => {
  const parts = buildF1Car()
  for (const [i, pivot] of parts.steered.entries()) {
    expect(parts.wheels[i]).not.toBe(pivot)
    expect(parts.wheels[i].parent).toBe(pivot)
  }
})

test('поворот пивота не сбивает фазу качения колеса', () => {
  const parts = buildF1Car()
  for (const wheel of parts.wheels) wheel.rotation.x = 1.7
  for (const pivot of parts.steered) pivot.rotation.y = 0.3

  for (const wheel of parts.wheels) expect(wheel.rotation.x).toBeCloseTo(1.7, 9)
  for (const pivot of parts.steered) expect(pivot.rotation.y).toBeCloseTo(0.3, 9)
})

test('у каждого колеса остались спицы', () => {
  // Сплошной диск — тело вращения, и его качение невидимо: спицы обязательны.
  const parts = buildF1Car()
  for (const wheel of parts.wheels) {
    const meshes: THREE.Mesh[] = []
    wheel.traverse((n) => { if (n instanceof THREE.Mesh) meshes.push(n) })
    expect(meshes.length).toBeGreaterThanOrEqual(6)
  }
})

test('слияние кузова не задело колёса', () => {
  // Слияние статики схлопывает меши кузова, но пивоты и колёса обязано обойти,
  // иначе руление и качение стираются вместе с их матрицами.
  const parts = buildF1Car()
  expect(parts.wheels).toHaveLength(4)
  expect(parts.steered).toHaveLength(2)
  for (const wheel of parts.wheels) expect(parts.group.children).not.toContain(wheel)
})

test('слияние не потеряло геометрию: габариты остались прежними', () => {
  const box = size(buildF1Car().group)
  // Корпус по регламенту 2.00 x 5.63 м, но габаритная коробка считается по
  // крайним точкам обвеса: зеркала выносят ширину, носовой конус — длину.
  // Порог держит именно эти значения, чтобы слияние статики не съело деталь
  // и чтобы новая деталь не растянула болид.
  expect(box.x).toBeGreaterThan(1.9)
  expect(box.x).toBeLessThan(2.1)
  expect(box.z).toBeGreaterThan(5.8)
  expect(box.z).toBeLessThan(6.05)
})

test('силуэт остаётся вытянутым как у болида, а не как у дорожной машины', () => {
  // Отношение длины к высоте у F1 около 5.9:1, у дорожной машины около 3.5:1.
  const box = size(buildF1Car().group)
  expect(box.z / box.y).toBeGreaterThan(4.5)
})

test('ливрея собрана мешами и цвета не совпадают с кузовом', () => {
  const colours = new Set<string>()
  buildF1Car(0x1a4fa0).group.traverse((n) => {
    if (n instanceof THREE.Mesh) {
      colours.add((n.material as THREE.MeshStandardMaterial).color.getHexString())
    }
  })
  expect(colours.has('1a4fa0')).toBe(true)
  // Контрастный нос и полосы — отдельные материалы, а не текстура на кузове.
  expect(colours.size).toBeGreaterThanOrEqual(4)
})

test('призрак остаётся полупрозрачным после детализации болида', () => {
  const ghost = makeTranslucent(buildF1Car().group)
  const materials: THREE.MeshStandardMaterial[] = []
  ghost.traverse((n) => {
    if (n instanceof THREE.Mesh) materials.push(n.material as THREE.MeshStandardMaterial)
  })
  expect(materials.length).toBeGreaterThan(3)
  for (const material of materials) expect(material.transparent).toBe(true)
})

test('прозрачность призрака не утекает на болид игрока', () => {
  const player = buildF1Car()
  makeTranslucent(player.group)
  player.group.traverse((n) => {
    if (n instanceof THREE.Mesh) {
      expect((n.material as THREE.MeshStandardMaterial).transparent).toBe(false)
    }
  })
})

test('число вызовов отрисовки не выросло против недетализированного болида', () => {
  // Детализация подняла число мешей вдвое, и без слияния статики каждый стал бы
  // отдельным вызовом. Порог держит регресс: 51 меш было до детализации.
  let meshes = 0
  buildF1Car().group.traverse((n) => { if (n instanceof THREE.Mesh) meshes += 1 })
  expect(meshes).toBeLessThanOrEqual(51)
})

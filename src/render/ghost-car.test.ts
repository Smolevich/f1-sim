import * as THREE from 'three'
import { expect, test } from 'vitest'
import { buildCar } from './car'
import { buildGhostCar, makeTranslucent } from './ghost-car'

test('призрак остаётся полупрозрачным после переписывания car.ts', () => {
  const ghost = buildGhostCar()
  const mats: THREE.MeshStandardMaterial[] = []
  ghost.traverse((n) => { if (n instanceof THREE.Mesh) mats.push(n.material as THREE.MeshStandardMaterial) })
  expect(mats.length).toBeGreaterThan(10)
  for (const m of mats) {
    expect(m.transparent).toBe(true)
    expect(m.opacity).toBeCloseTo(0.35, 6)
  }
})

test('прозрачность призрака не утекает на болид игрока', () => {
  buildGhostCar()
  const player = buildCar()
  player.traverse((n) => {
    if (n instanceof THREE.Mesh) expect((n.material as THREE.MeshStandardMaterial).transparent).toBe(false)
  })
})

test('призрак из загруженной модели тоже полупрозрачен', () => {
  // Регрессия: в glTF один материал висит на нескольких мешах сразу, и раньше
  // призрак строился только из процедурного болида, так что модель осталась бы
  // непрозрачной, а её материал утёк бы игроку.
  const shared = new THREE.MeshStandardMaterial({ color: 0xff0000 })
  const model = new THREE.Group()
  for (let i = 0; i < 3; i++) model.add(new THREE.Mesh(new THREE.BoxGeometry(1, 1, 1), shared))

  const ghost = makeTranslucent(model)
  const mats: THREE.MeshStandardMaterial[] = []
  ghost.traverse((n) => { if (n instanceof THREE.Mesh) mats.push(n.material as THREE.MeshStandardMaterial) })
  expect(mats).toHaveLength(3)
  for (const m of mats) expect(m.opacity).toBeCloseTo(0.35, 6)
  expect(shared.transparent).toBe(false)
})

test('призрак не бросает тень: иначе на трассе две тени от одной машины', () => {
  const ghost = buildGhostCar()
  ghost.traverse((n) => { if (n instanceof THREE.Mesh) expect(n.castShadow).toBe(false) })
})

import * as THREE from 'three'
import { expect, test } from 'vitest'
import { buildCar } from './car'
import { buildGhostCar } from './ghost-car'

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

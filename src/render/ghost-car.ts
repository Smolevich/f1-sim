import * as THREE from 'three'
import { buildCar } from './car'

/** Тот же меш, что у игрока, но полупрозрачный и не бросающий тень. */
export function buildGhostCar(): THREE.Group {
  const ghost = buildCar(0xbbbbbb)
  ghost.traverse((node) => {
    if (node instanceof THREE.Mesh) {
      // Материалы в buildCar общие на несколько мешей, поэтому без клона
      // прозрачность утекла бы и на болид игрока.
      const clone = (node.material as THREE.MeshStandardMaterial).clone()
      clone.transparent = true
      clone.opacity = 0.35
      clone.depthWrite = false
      node.material = clone
    }
  })
  return ghost
}

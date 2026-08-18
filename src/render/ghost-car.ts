import * as THREE from 'three'
import { buildCar } from './car'

const GHOST_OPACITY = 0.35

/** Полупрозрачная копия готового меша: тот же силуэт, но сквозь него видно трассу. */
export function makeTranslucent(source: THREE.Object3D): THREE.Object3D {
  const ghost = source.clone(true)
  ghost.traverse((node) => {
    if (node instanceof THREE.Mesh) {
      // Материалы общие на несколько мешей (и в примитивном болиде, и в glTF),
      // поэтому без клона прозрачность утекла бы на болид игрока.
      const material = node.material as THREE.MeshStandardMaterial
      const clone = material.clone()
      clone.transparent = true
      clone.opacity = GHOST_OPACITY
      clone.depthWrite = false
      node.material = clone
      node.castShadow = false
    }
  })
  return ghost
}

/** Тот же меш, что у игрока, но полупрозрачный и не бросающий тень. */
export function buildGhostCar(source?: THREE.Object3D): THREE.Object3D {
  return makeTranslucent(source ?? buildCar(0xbbbbbb))
}

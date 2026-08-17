import * as THREE from 'three'
import { buildEdges } from '../track/geometry'
import type { Track } from '../track/schema'

/** Полотно трассы одной лентой треугольников между левым и правым краем. */
export function buildTrackMesh(track: Track): THREE.Mesh {
  const { left, right } = buildEdges(track)
  const positions: number[] = []
  const n = track.centerline.length

  for (let i = 0; i < n; i++) {
    const j = (i + 1) % n
    const l0 = left[i], r0 = right[i], l1 = left[j], r1 = right[j]
    positions.push(l0.x, l0.y, l0.z, r0.x, r0.y, r0.z, l1.x, l1.y, l1.z)
    positions.push(r0.x, r0.y, r0.z, r1.x, r1.y, r1.z, l1.x, l1.y, l1.z)
  }

  const geometry = new THREE.BufferGeometry()
  geometry.setAttribute('position', new THREE.Float32BufferAttribute(positions, 3))
  geometry.computeVertexNormals()

  return new THREE.Mesh(
    geometry,
    new THREE.MeshStandardMaterial({ color: 0x3a3a3a, side: THREE.DoubleSide }),
  )
}

import * as THREE from 'three'

/**
 * Колесо болида: покрышка, обод и пять спиц.
 *
 * Модель кузова покрышек не содержит — это CFD-геометрия, резину снимали для
 * расчёта потока, и на её месте остались только тормозные диски и полые
 * обтекатели. Поэтому колесо строится здесь, по размерам регламента 18".
 */
export type WheelSpec = {
  radius: number
  width: number
}

/** Регламент 2022+: диаметр 720 мм, ширина 305 спереди и 405 сзади. */
export const FRONT_WHEEL: WheelSpec = { radius: 0.36, width: 0.305 }
export const REAR_WHEEL: WheelSpec = { radius: 0.36, width: 0.405 }

/** Обод занимает 18 дюймов из 720 мм диаметра — отсюда доля 0.635. */
export const RIM_RATIO = 0.635

export function rimRadius(spec: WheelSpec): number {
  return spec.radius * RIM_RATIO
}

const SPOKE_COUNT = 5

export function buildWheel(spec: WheelSpec): THREE.Group {
  const wheel = new THREE.Group()

  const rubber = new THREE.MeshStandardMaterial({
    color: 0x16181d, roughness: 0.95, metalness: 0.02,
  })
  const metal = new THREE.MeshStandardMaterial({
    color: 0x9aa2ad, roughness: 0.35, metalness: 0.55,
  })

  // Покрышка: цилиндр, а не тор — у формульной резины профиль почти прямой,
  // тор дал бы округлое «колесо от велосипеда».
  const tyre = new THREE.Mesh(
    new THREE.CylinderGeometry(spec.radius, spec.radius, spec.width, 36, 1, true),
    rubber,
  )
  tyre.rotation.z = Math.PI / 2
  wheel.add(tyre)

  // Плечи: закрывают открытые торцы цилиндра, иначе колесо просвечивает насквозь.
  for (const side of [-1, 1]) {
    const shoulder = new THREE.Mesh(
      new THREE.RingGeometry(rimRadius(spec), spec.radius, 36),
      rubber,
    )
    shoulder.rotation.y = (side * Math.PI) / 2
    shoulder.position.x = (side * spec.width) / 2
    shoulder.material.side = THREE.DoubleSide
    wheel.add(shoulder)
  }

  const rim = new THREE.Mesh(
    new THREE.CylinderGeometry(rimRadius(spec), rimRadius(spec), spec.width * 0.92, 28),
    metal,
  )
  rim.rotation.z = Math.PI / 2
  wheel.add(rim)

  for (let i = 0; i < SPOKE_COUNT; i += 1) {
    const spoke = new THREE.Mesh(
      new THREE.BoxGeometry(spec.width * 0.5, rimRadius(spec) * 1.7, 0.035),
      metal,
    )
    spoke.rotation.x = (i * Math.PI * 2) / SPOKE_COUNT
    wheel.add(spoke)
  }

  return wheel
}

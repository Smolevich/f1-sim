export type AeroSetup = {
  frontWing: number
  rearWing: number
}

const AIR_DENSITY = 1.225
const FRONTAL_AREA = 1.5
const FRONT_LIFT_COEF = 1.6
const REAR_LIFT_COEF = 2.2
const BASE_DRAG_COEF = 0.7
const WING_DRAG_COEF = 0.5
// DRS открывает закрылок заднего крыла: часть прижима исчезает вместе с
// сопротивлением, поэтому на прямых машина едет заметно быстрее.
const DRS_DOWNFORCE_LOSS = 0.6
const DRS_DRAG_LOSS = 0.25

/** Прижимная сила по осям, ньютоны. */
export function downforce(
  setup: AeroSetup,
  speedMs: number,
  drsOpen: boolean,
): { front: number; rear: number } {
  const q = 0.5 * AIR_DENSITY * speedMs * speedMs * FRONTAL_AREA
  const rearFactor = drsOpen ? 1 - DRS_DOWNFORCE_LOSS : 1
  return {
    front: q * FRONT_LIFT_COEF * setup.frontWing,
    rear: q * REAR_LIFT_COEF * setup.rearWing * rearFactor,
  }
}

/** Сила лобового сопротивления, ньютоны. */
export function drag(setup: AeroSetup, speedMs: number, drsOpen: boolean): number {
  const q = 0.5 * AIR_DENSITY * speedMs * speedMs * FRONTAL_AREA
  const wings = WING_DRAG_COEF * (setup.frontWing + setup.rearWing)
  const coef = (BASE_DRAG_COEF + wings) * (drsOpen ? 1 - DRS_DRAG_LOSS : 1)
  return q * coef
}

export type AeroSetup = {
  frontWing: number
  rearWing: number
}

const AIR_DENSITY = 1.225
const FRONTAL_AREA = 1.5
// 3.0 и 4.2, а не 1.6 и 2.2: при прежних значениях прижим на 300 км/ч выходил
// 0.93 веса болида, тогда как реальный создаёт 1.5-2. Из-за этого не добирало
// и торможение (4.3 g против 5-6), и держак в быстрых поворотах. Баланс 42%
// на передок сохранён.
const FRONT_LIFT_COEF = 3.0
const REAR_LIFT_COEF = 4.2
// 0.85: с 0.7 предел по мощности выходил 336 км/ч, а с DRS болид улетал за 370
// при реальных 320 и 340. Полный Cd болида около 1.1-1.2 вместе с крыльями —
// это машина, спроектированная создавать прижим, а не резать воздух.
const BASE_DRAG_COEF = 0.85
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

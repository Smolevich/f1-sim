import { expect, test } from 'vitest'
import { skirtFalloff, SKIRT_RING_DISTANCES_M } from './terrain'

test('у кромки полотна юбка держит высоту трассы', () => {
  expect(skirtFalloff(0)).toBeCloseTo(1)
})

test('на внешнем краю юбка спадает к плоской земле', () => {
  const outer = SKIRT_RING_DISTANCES_M[SKIRT_RING_DISTANCES_M.length - 1]
  expect(skirtFalloff(outer)).toBeCloseTo(0)
})

test('спад монотонный — без волн между кольцами', () => {
  for (let i = 1; i < SKIRT_RING_DISTANCES_M.length; i++) {
    expect(skirtFalloff(SKIRT_RING_DISTANCES_M[i]))
      .toBeLessThan(skirtFalloff(SKIRT_RING_DISTANCES_M[i - 1]))
  }
})

test('спад гладкий у краёв — без излома на стыке с землёй', () => {
  const outer = SKIRT_RING_DISTANCES_M[SKIRT_RING_DISTANCES_M.length - 1]
  // Производная у обоих концов близка к нулю: smoothstep, а не линейный скат.
  const eps = 1
  expect(Math.abs(skirtFalloff(eps) - skirtFalloff(0))).toBeLessThan(eps / outer)
  expect(Math.abs(skirtFalloff(outer) - skirtFalloff(outer - eps))).toBeLessThan(eps / outer)
})

import { expect, test } from 'vitest'
import { skirtFalloff, SKIRT_RING_DISTANCES_M, terrainHeight, terrainPositions } from './terrain'
import type { Track } from '../track/schema'

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
  const eps = 1
  expect(Math.abs(skirtFalloff(eps) - skirtFalloff(0))).toBeLessThan(eps / outer)
  expect(Math.abs(skirtFalloff(outer) - skirtFalloff(outer - eps))).toBeLessThan(eps / outer)
})

/** Две параллельные прямые в 100 м друг от друга: верхняя на 5 м, нижняя на 0. */
function twoLevelTrack(): Track {
  return {
    meta: {
      id: 't', name: 'T', country: 'XX', officialLengthM: 2200,
      realRecord: { timeMs: 1, driver: 'X', year: 2026 },
    },
    centerline: [
      { x: 0, y: 0, z: 0 }, { x: 500, y: 0, z: 0 }, { x: 1000, y: 0, z: 0 },
      { x: 1000, y: 0, z: 100 }, { x: 500, y: 0, z: 100 }, { x: 0, y: 0, z: 100 },
    ],
    widthM: 12,
    sectorSplits: [0.3, 0.6],
    elevationsM: [5, 5, 5, 0, 0, 0],
  }
}

test('трава соседнего участка не накрывает чужое полотно — баг с травой на трассе', () => {
  const track = twoLevelTrack()
  // Точка на кромке нижней прямой: раньше сюда дотягивался лист юбки от
  // верхней прямой (в 100 м) и висел на 2 м выше полотна.
  const y = terrainHeight(track, 500, 93)
  expect(y).toBeLessThan(0)
})

test('высота поля у кромки — высота этого участка минус зазор', () => {
  const track = twoLevelTrack()
  expect(terrainHeight(track, 500, 8)).toBeLessThan(5)
  expect(terrainHeight(track, 500, 8)).toBeGreaterThan(4)
})

test('вдали от трассы поле сходит к плоской земле', () => {
  const track = twoLevelTrack()
  expect(terrainHeight(track, 500, -500)).toBeCloseTo(-0.25, 1)
})

test('треугольники поля смотрят нормалями вверх — не сквозь землю', () => {
  // Регрессия: обход [v00, v10, v01] давал нормали вниз, FrontSide отсекал
  // поле сверху, и рядом с дорогой сквозило нижним уровнем земли.
  const positions = terrainPositions(twoLevelTrack())
  for (let t = 0; t < positions.length; t += 9) {
    const e1 = [positions[t + 3] - positions[t], positions[t + 4] - positions[t + 1], positions[t + 5] - positions[t + 2]]
    const e2 = [positions[t + 6] - positions[t], positions[t + 7] - positions[t + 1], positions[t + 8] - positions[t + 2]]
    const ny = e1[2] * e2[0] - e1[0] * e2[2]
    expect(ny).toBeGreaterThan(0)
  }
})

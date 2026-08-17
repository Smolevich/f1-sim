import { expect, test } from 'vitest'
import { FIXED_STEP, stepsFor, type Accumulator } from './world'

const empty = (): Accumulator => ({ pending: 0 })

test('шаг физики — 1/120 секунды', () => {
  expect(FIXED_STEP).toBeCloseTo(1 / 120, 10)
})

test('кадр короче шага не даёт ни одного шага', () => {
  expect(stepsFor(empty(), FIXED_STEP / 2).steps).toBe(0)
})

test('кадр в один шаг даёт ровно один шаг', () => {
  expect(stepsFor(empty(), FIXED_STEP).steps).toBe(1)
})

test('кадр 60 Гц даёт два шага', () => {
  expect(stepsFor(empty(), 1 / 60).steps).toBe(2)
})

test('остаток переносится в следующий кадр', () => {
  const first = stepsFor(empty(), FIXED_STEP * 1.5)
  expect(first.steps).toBe(1)
  const second = stepsFor(first.acc, FIXED_STEP * 0.5)
  expect(second.steps).toBe(1)
})

test('за секунду набегает 120 шагов независимо от частоты кадров', () => {
  const countAt = (fps: number): number => {
    let acc = empty()
    let total = 0
    for (let i = 0; i < fps; i++) {
      const r = stepsFor(acc, 1 / fps)
      total += r.steps
      acc = r.acc
    }
    return total
  }
  // Допуск в один шаг — это не послабление, а следствие двоичной арифметики:
  // сумма 144 слагаемых 1/144 равна 0.9999999999999974, а не единице, и
  // последний шаг не добирает долей процента. Смысл теста в том, что частота
  // кадров не меняет темп физики, а не в точном равенстве.
  expect(countAt(60)).toBeGreaterThanOrEqual(119)
  expect(countAt(60)).toBeLessThanOrEqual(120)
  expect(countAt(144)).toBeGreaterThanOrEqual(119)
  expect(countAt(144)).toBeLessThanOrEqual(120)
})

test('длинный фриз не даёт спирали смерти', () => {
  expect(stepsFor(empty(), 10).steps).toBeLessThanOrEqual(30)
})

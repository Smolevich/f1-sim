import { expect, test } from 'vitest'
import { renderHudText, type HudModel } from './hud'

const model = (over: Partial<HudModel> = {}): HudModel => ({
  speedKmh: 248, gear: 6, rpm: 10_500, drs: false,
  currentMs: 84_310, bestMs: 82_140, deltaMs: -800,
  sector: 1, sectorBest: [true, false, false], valid: true, tyreTempC: 93,
  ...over,
})

test('строка круга содержит текущее время', () => {
  expect(renderHudText(model()).lapLine).toContain('1:24.310')
})

test('строка дельты показывает отрыв от лучшего', () => {
  expect(renderHudText(model()).deltaLine).toContain('-0.800')
})

test('без лучшего круга дельта не показывается', () => {
  expect(renderHudText(model({ bestMs: null, deltaMs: null })).deltaLine).not.toContain('+')
})

test('строка скорости содержит скорость и передачу', () => {
  const line = renderHudText(model()).speedLine
  expect(line).toContain('248')
  expect(line).toContain('6')
})

test('DRS отображается только когда открыт', () => {
  expect(renderHudText(model({ drs: true })).speedLine).toContain('DRS')
  expect(renderHudText(model({ drs: false })).speedLine).not.toContain('DRS')
})

test('невалидный круг помечается', () => {
  expect(renderHudText(model({ valid: false })).lapLine.toUpperCase()).toContain('СРЕЗ')
})

test('номер текущего сектора виден', () => {
  expect(renderHudText(model({ sector: 2 })).sectorLine).toContain('3')
})

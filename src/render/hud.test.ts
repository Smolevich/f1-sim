import { expect, test } from 'vitest'
import { renderHudText, type HudModel } from './hud'

const model = (over: Partial<HudModel> = {}): HudModel => ({
  speedKmh: 248, gear: 6, rpm: 10_500, drs: false,
  currentMs: 84_310, bestMs: 82_140, deltaMs: -800,
  sector: 1, sectorBest: [true, false, false], valid: true, tyreTempC: 93,
  attemptsLeft: 3,
  trackName: 'Монца', trackLengthM: 5793, offTrackMetres: 0,
  recordMs: 81_046, recordDriver: 'Rubens Barrichello',
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

test('первая попытка показывается как 1 из 3', () => {
  expect(renderHudText(model({ attemptsLeft: 3 })).attemptLine).toBe('ПОПЫТКА 1/3')
})

test('счётчик попыток растёт по мере их расхода', () => {
  expect(renderHudText(model({ attemptsLeft: 2 })).attemptLine).toBe('ПОПЫТКА 2/3')
  expect(renderHudText(model({ attemptsLeft: 1 })).attemptLine).toBe('ПОПЫТКА 3/3')
})

test('на нуле попыток счётчик не показывает четвёртую', () => {
  // Регрессия: used + 1 без ограничения давало «ПОПЫТКА 4/3» на финише.
  expect(renderHudText(model({ attemptsLeft: 0 })).attemptLine).not.toContain('4')
})

test('короткое касание травы показывает счётчик, а не срезку', () => {
  const line = renderHudText(model({ offTrackMetres: 12 })).lapLine
  expect(line).toContain('12')
  expect(line.toUpperCase()).not.toContain('СРЕЗ')
})

test('превышение порога помечается срезкой', () => {
  expect(renderHudText(model({ valid: false })).lapLine.toUpperCase()).toContain('СРЕЗ')
})

test('чистый круг не показывает счётчик выездов', () => {
  expect(renderHudText(model({ offTrackMetres: 0 })).lapLine).not.toContain('ВНЕ ТРАССЫ')
})

test('название трассы выводится', () => {
  // HUD везде в верхнем регистре, поэтому сверяем без учёта регистра.
  const line = renderHudText(model({ trackName: 'Монца' })).titleLine
  expect(line.toUpperCase()).toContain('МОНЦА')
})

test('в названии трассы видна её длина в километрах', () => {
  expect(renderHudText(model({ trackLengthM: 5793 })).titleLine).toContain('5.793')
})

test('рекорд трассы виден с именем автора', () => {
  const t = renderHudText(model({ recordMs: 81_046, recordDriver: 'Barrichello' }))
  expect(t.recordLine).toContain('1:21.046')
  expect(t.recordLine).toContain('Barrichello')
})

test('без личного результата показывается только рекорд трассы', () => {
  const t = renderHudText(model({ bestMs: null, recordMs: 81_046, recordDriver: 'X' }))
  expect(t.recordLine).toContain('1:21.046')
})

test('отставание от рекорда трассы считается по личному лучшему', () => {
  const t = renderHudText(model({ bestMs: 95_000, recordMs: 81_046, recordDriver: 'X' }))
  expect(t.recordLine).toContain('+13.954')
})

test('счётчик выездов округляется — дробные метры не лезут в HUD', () => {
  const t = renderHudText(model({ offTrackMetres: 54.42235785086342 }))
  expect(t.lapLine).toContain('54/')
  expect(t.lapLine).not.toContain('54.42')
})

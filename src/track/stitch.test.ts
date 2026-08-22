import { expect, test } from 'vitest'
import { stitchLoop, type StitchWay } from './stitch'

// Квадрат со стороной 0.001° на экваторе: каждая сторона ~111 м, круг ~445 м.
const A = { lat: 0, lon: 0 }
const B = { lat: 0, lon: 0.001 }
const C = { lat: 0.001, lon: 0.001 }
const D = { lat: 0.001, lon: 0 }
const SQUARE_M = 445

function way(name: string, ...points: { lat: number; lon: number }[]): StitchWay {
  return { name, geometry: points }
}

test('участки в произвольном порядке и направлении сшиваются в кольцо', () => {
  const loop = stitchLoop(
    [way('юг', A, B), way('запад', A, D), way('восток', B, C), way('север', C, D)],
    SQUARE_M,
  )
  expect(loop.length).toBe(4)
  expect(new Set(loop.map((p) => `${p.lat},${p.lon}`)).size).toBe(4)
})

test('висячий аппендикс вроде пит-лейна не рвёт кольцо', () => {
  const pit = { lat: -0.0005, lon: 0.0005 }
  const loop = stitchLoop(
    [way('юг', A, B), way('восток', B, C), way('север', C, D), way('запад', D, A),
      way('пит', B, pit)],
    SQUARE_M,
  )
  expect(loop.length).toBe(4)
})

test('на развилке выбирается ветка, замыкающая круг, а не тупиковая', () => {
  const dead = { lat: 0, lon: 0.002 }
  // Из B можно уйти в тупик (dead) или продолжить круг через C: жадный
  // сшиватель, беря первый попавшийся участок, умирал именно здесь.
  const loop = stitchLoop(
    [way('юг', A, B), way('тупик', B, dead), way('восток', B, C),
      way('север', C, D), way('запад', D, A)],
    SQUARE_M,
  )
  expect(loop.length).toBe(4)
})

test('малый паразитный контур не выдаётся за трассу — длина не сходится', () => {
  // Два коротких участка образуют замкнутую петлю ~222 м, но трасса — 445 м.
  expect(() => stitchLoop(
    [way('туда', A, B), way('обратно', B, A)],
    SQUARE_M,
  )).toThrow()
})

test('несвязные участки — понятная ошибка', () => {
  const far = { lat: 0.5, lon: 0.5 }
  const far2 = { lat: 0.5, lon: 0.501 }
  expect(() => stitchLoop(
    [way('юг', A, B), way('остров', far, far2)],
    SQUARE_M,
  )).toThrow(/замкну/)
})

test('стык в середине чужого участка: участок режется, кольцо замыкается', () => {
  const outside = { lat: -0.001, lon: 0 }
  // «Бульвар» уходит за пределы круга: E→A→B, круг проходит только по A→B,
  // а «запад» примыкает к его середине в A — как пит-лейн Монако к Альберу 1er.
  const loop = stitchLoop(
    [way('бульвар', outside, A, B), way('восток', B, C),
      way('север', C, D), way('запад', D, A)],
    SQUARE_M,
  )
  expect(loop.length).toBe(4)
})

test('микроразрыв в данных OSM перекрывается мостом, кольцо замыкается', () => {
  // «Юг» не дотягивается до B на ~22 м — как разрыв у Сент-Девот в Монако.
  const shortOfB = { lat: 0, lon: 0.0008 }
  const loop = stitchLoop(
    [way('юг', A, shortOfB), way('восток', B, C), way('север', C, D), way('запад', D, A)],
    SQUARE_M,
  )
  expect(loop.length).toBe(5)
})

test('разрыв больше моста — по-прежнему ошибка, а не тихая склейка', () => {
  const farShort = { lat: 0, lon: 0.0004 } // не хватает ~67 м
  expect(() => stitchLoop(
    [way('юг', A, farShort), way('восток', B, C), way('север', C, D), way('запад', D, A)],
    SQUARE_M,
  )).toThrow(/замкну/)
})

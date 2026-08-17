import { expect, test } from 'vitest'
import { readFileSync } from 'node:fs'
import { curvatureAt, kerbNodes, stripeSpan } from './trackside'
import type { Track } from '../track/schema'

const track: Track = JSON.parse(readFileSync('public/tracks/monza.json', 'utf8'))

test('на прямой кривизна близка к нулю', () => {
  // узлы 209-213 — главная прямая Монцы (шаг между ними под 190 м)
  expect(curvatureAt(track, 211)).toBeLessThan(0.05)
})

test('в шикане кривизна заметно больше, чем на прямой', () => {
  const straight = curvatureAt(track, 211)
  let maxCurve = 0
  for (let i = 0; i < track.centerline.length; i++) {
    maxCurve = Math.max(maxCurve, curvatureAt(track, i))
  }
  expect(maxCurve).toBeGreaterThan(straight * 10)
})

test('поребрики ставятся не везде', () => {
  const nodes = kerbNodes(track)
  expect(nodes.length).toBeGreaterThan(0)
  expect(nodes.length).toBeLessThan(track.centerline.length)
})

test('поребрики попадают в повороты, а не на прямую', () => {
  const nodes = new Set(kerbNodes(track))
  expect(nodes.has(211)).toBe(false)
})

// Полоса шире полутора метров читается сплошной лентой, а не чередованием
// блоков: именно так поребрик и выглядел на коротких сегментах, где округление
// к ближайшему целому давало одну красно-белую пару на весь сегмент.
test('полосы поребрика остаются в размер реальной, а не растягиваются', () => {
  const cl = track.centerline
  for (const i of kerbNodes(track)) {
    const j = (i + 1) % cl.length
    const length = Math.hypot(cl[j].x - cl[i].x, cl[j].z - cl[i].z)
    // stripeSpan — число красно-белых пар, значит одна полоса вдвое уже
    expect(length / (stripeSpan(length) * 2), `узел ${i}`).toBeLessThanOrEqual(1.5)
  }
})

test('короткий сегмент всё равно получает хотя бы одну пару полос', () => {
  expect(stripeSpan(0.2)).toBeGreaterThanOrEqual(1)
})

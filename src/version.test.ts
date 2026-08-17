import { expect, test } from 'vitest'
import { BUILD_MARKER } from './version'

test('build marker is non-empty', () => {
  expect(BUILD_MARKER.length).toBeGreaterThan(0)
})

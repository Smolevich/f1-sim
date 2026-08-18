import { expect, test } from 'vitest'
import { readFileSync } from 'node:fs'
import { recoveryPose } from './recovery'
import { isOnTrack } from './geometry'
import type { Track } from './schema'

const track: Track = JSON.parse(readFileSync('public/tracks/monza.json', 'utf8'))

test('возврат ставит болид на полотно', () => {
  const off = { x: track.centerline[50].x + 40, y: 0, z: track.centerline[50].z + 40 }
  expect(isOnTrack(track, recoveryPose(track, off).position)).toBe(true)
})

test('возврат происходит рядом с местом вылета, а не на старте', () => {
  const off = { x: track.centerline[150].x + 25, y: 0, z: track.centerline[150].z }
  const pose = recoveryPose(track, off)
  const start = track.centerline[0]
  const toStart = Math.hypot(pose.position.x - start.x, pose.position.z - start.z)
  expect(toStart).toBeGreaterThan(100)
})

test('курс направлен вдоль трассы', () => {
  const at = track.centerline[80]
  const pose = recoveryPose(track, { x: at.x, y: 0, z: at.z })
  const next = track.centerline[82]
  const expected = Math.atan2(next.x - at.x, next.z - at.z)
  expect(Math.abs(pose.headingRad - expected)).toBeLessThan(0.3)
})

import type { Track, TrackPoint } from './schema'

export type RecoveryPose = {
  position: TrackPoint
  headingRad: number
}

/**
 * Куда вернуть болид, застрявший или улетевший: на осевую линию в ближайшей
 * точке, носом по ходу трассы. Возврат на старт стоил бы игроку всего круга,
 * а упереться в отбойник можно на любом метре — тогда заезд просто кончается.
 */
export function recoveryPose(track: Track, from: TrackPoint): RecoveryPose {
  const cl = track.centerline
  const n = cl.length
  let nearest = 0
  let best = Infinity
  for (let i = 0; i < n; i++) {
    const d = (from.x - cl[i].x) ** 2 + (from.z - cl[i].z) ** 2
    if (d < best) {
      best = d
      nearest = i
    }
  }
  // Ставим на пару узлов вперёд: точно в точке вылета болид часто оказывается
  // вплотную к стене, и его снова прижимает.
  const at = cl[nearest]
  const ahead = cl[(nearest + 2) % n]
  return {
    position: { x: at.x, y: at.y, z: at.z },
    headingRad: Math.atan2(ahead.x - at.x, ahead.z - at.z),
  }
}

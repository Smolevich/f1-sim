import type { Track, TrackPoint } from '../track/schema'

const PADDING = 10

export type TrackProjection = {
  points: [number, number][]
  scale: number
  /** Мировой угол отсчёта и сдвиг в пикселях: ими же проецируется болид. */
  origin: { minX: number; minZ: number }
  offset: { x: number; y: number }
}

/**
 * Осевая линия в координаты канваса. Масштаб общий по обеим осям, иначе трасса
 * растянется и перестанет быть узнаваемой: Монца вытянута 1257 на 2171 м.
 */
export function projectTrack(track: Track, size: number): TrackProjection {
  const xs = track.centerline.map((p) => p.x)
  const zs = track.centerline.map((p) => p.z)
  const minX = Math.min(...xs), maxX = Math.max(...xs)
  const minZ = Math.min(...zs), maxZ = Math.max(...zs)
  const usable = size - PADDING * 2
  const scale = Math.min(usable / (maxX - minX), usable / (maxZ - minZ))

  const offset = {
    x: PADDING + (usable - (maxX - minX) * scale) / 2,
    y: PADDING + (usable - (maxZ - minZ) * scale) / 2,
  }

  return {
    points: track.centerline.map((p) => [
      offset.x + (p.x - minX) * scale,
      offset.y + (p.z - minZ) * scale,
    ]),
    scale,
    origin: { minX, minZ },
    offset,
  }
}

const SIZE = 190

export class Minimap {
  private canvas: HTMLCanvasElement
  private ctx: CanvasRenderingContext2D
  private projection: TrackProjection

  constructor(track: Track, parent: HTMLElement = document.body) {
    this.projection = projectTrack(track, SIZE)

    this.canvas = document.createElement('canvas')
    this.canvas.width = this.canvas.height = SIZE
    this.canvas.setAttribute(
      'style',
      'position:fixed;right:16px;bottom:16px;z-index:10;pointer-events:none;' +
      'background:rgba(8,12,20,.55);border-radius:10px;',
    )
    parent.appendChild(this.canvas)
    this.ctx = this.canvas.getContext('2d')!
  }

  update(position: TrackPoint, headingRad: number): void {
    const ctx = this.ctx
    const { points, scale, origin, offset } = this.projection
    ctx.clearRect(0, 0, SIZE, SIZE)

    ctx.strokeStyle = 'rgba(255,255,255,.75)'
    ctx.lineWidth = 2.5
    ctx.beginPath()
    points.forEach(([x, y], i) => (i === 0 ? ctx.moveTo(x, y) : ctx.lineTo(x, y)))
    ctx.closePath()
    ctx.stroke()

    const px = offset.x + (position.x - origin.minX) * scale
    const py = offset.y + (position.z - origin.minZ) * scale

    // Треугольник вместо точки: видно не только где болид, но и куда смотрит.
    // Курс отсчитывается от +Z к +X, а на канвасе +Y — это мировой +Z, поэтому
    // поворот идёт в ту же сторону, что и рыскание.
    ctx.fillStyle = '#4ec9ff'
    ctx.save()
    ctx.translate(px, py)
    ctx.rotate(-headingRad)
    ctx.beginPath()
    ctx.moveTo(0, -6)
    ctx.lineTo(4, 4)
    ctx.lineTo(-4, 4)
    ctx.closePath()
    ctx.fill()
    ctx.restore()
  }
}

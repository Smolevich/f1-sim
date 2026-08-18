import * as THREE from 'three'

type Rgb = [number, number, number]

/**
 * Пиксели шума вокруг базового цвета. Вынесено отдельно от canvas, чтобы
 * генератор тестировался без DOM: в vitest окружение node, canvas там нет.
 */
export function noisePixels(
  size: number, base: Rgb, spread: number,
): Uint8ClampedArray<ArrayBuffer> {
  const px = new Uint8ClampedArray(new ArrayBuffer(size * size * 4))
  for (let i = 0; i < size * size; i++) {
    // Один сдвиг на пиксель, а не на канал: разный шум по каналам красит
    // асфальт в цветные точки вместо зерна.
    const shift = spread === 0 ? 0 : Math.round((Math.random() - 0.5) * spread)
    px[i * 4] = base[0] + shift
    px[i * 4 + 1] = base[1] + shift
    px[i * 4 + 2] = base[2] + shift
    px[i * 4 + 3] = 255
  }
  return px
}

/** Детерминированный хеш: пейзаж обязан совпадать между запусками и сборками. */
function hash2(x: number, y: number): number {
  const s = Math.sin(x * 127.1 + y * 311.7) * 43758.5453
  return s - Math.floor(s)
}

/** Косинусное сглаживание: линейная интерполяция оставляет на пятнах ромбы. */
function fade(t: number): number {
  return t * t * (3 - 2 * t)
}

function valueNoise(x: number, y: number, period: number): number {
  const xi = Math.floor(x), yi = Math.floor(y)
  const fx = fade(x - xi), fy = fade(y - yi)
  // Координаты решётки заворачиваются по периоду, иначе текстура не стыкуется
  // сама с собой и на земле видны швы через каждый повтор.
  const wrap = (v: number): number => ((v % period) + period) % period
  const x0 = wrap(xi), x1 = wrap(xi + 1), y0 = wrap(yi), y1 = wrap(yi + 1)
  const top = hash2(x0, y0) * (1 - fx) + hash2(x1, y0) * fx
  const bottom = hash2(x0, y1) * (1 - fx) + hash2(x1, y1) * fx
  return top * (1 - fy) + bottom * fy
}

/**
 * Сумма октав шума в диапазоне 0..1. Отдельно от canvas — как и noisePixels,
 * чтобы тестировалось в node без DOM.
 */
export function fbm(x: number, y: number, octaves = 4, period = 8): number {
  let sum = 0, amplitude = 1, total = 0, freq = 1
  for (let o = 0; o < octaves; o++) {
    sum += valueNoise(x * freq, y * freq, period * freq) * amplitude
    total += amplitude
    amplitude *= 0.5
    freq *= 2
  }
  return sum / total
}

/**
 * Крупные пятна светлее и темнее среднего: серая карта, которой газон
 * домножается в шейдере. Без неё земля читается одним ровным листом, сколько
 * бы зерна ни было в самой траве.
 */
export function patchPixels(size: number, contrast: number): Uint8ClampedArray<ArrayBuffer> {
  const px = new Uint8ClampedArray(new ArrayBuffer(size * size * 4))
  for (let y = 0; y < size; y++) {
    for (let x = 0; x < size; x++) {
      const n = fbm((x / size) * 8, (y / size) * 8, 4, 8)
      const value = Math.round(255 * (1 + (n - 0.5) * contrast))
      const i = (y * size + x) * 4
      px[i] = px[i + 1] = px[i + 2] = value
      px[i + 3] = 255
    }
  }
  return px
}

function canvasFrom(size: number, px: Uint8ClampedArray<ArrayBuffer>): HTMLCanvasElement {
  const canvas = document.createElement('canvas')
  canvas.width = canvas.height = size
  const ctx = canvas.getContext('2d')!
  ctx.putImageData(new ImageData(px, size, size), 0, 0)
  return canvas
}

function tiling(canvas: HTMLCanvasElement, repeat: number): THREE.Texture {
  const texture = new THREE.CanvasTexture(canvas)
  texture.wrapS = texture.wrapT = THREE.RepeatWrapping
  texture.repeat.set(repeat, repeat)
  texture.anisotropy = 8
  return texture
}

export function makeAsphaltTexture(size = 256): THREE.Texture {
  return tiling(canvasFrom(size, noisePixels(size, [58, 58, 60], 26)), 1)
}

export function makeGrassTexture(size = 256): THREE.Texture {
  return tiling(canvasFrom(size, noisePixels(size, [64, 104, 54], 30)), 200)
}

/**
 * Карта крупных пятен для земли. Повтор считанные единицы на весь мир: пятно
 * должно быть размером с поле, иначе оно сливается с зерном травы.
 */
export function makePatchTexture(size = 256, repeat = 6, contrast = 0.55): THREE.Texture {
  return tiling(canvasFrom(size, patchPixels(size, contrast)), repeat)
}

/** Поребрик: чередование красного и белого поперёк направления движения. */
export function makeKerbTexture(): THREE.Texture {
  const canvas = document.createElement('canvas')
  canvas.width = 64
  canvas.height = 64
  const ctx = canvas.getContext('2d')!
  ctx.fillStyle = '#c8102e'
  ctx.fillRect(0, 0, 64, 64)
  ctx.fillStyle = '#f2f2f2'
  ctx.fillRect(0, 32, 64, 32)
  const texture = new THREE.CanvasTexture(canvas)
  texture.wrapS = texture.wrapT = THREE.RepeatWrapping
  return texture
}

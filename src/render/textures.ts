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

# F1 Sim — этап 8: графика

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Превратить визуальную заглушку в картинку, ради которой хочется ехать: размеченная трасса с поребриками и отбойниками, узнаваемый болид, камеры включая кокпит, эффекты скорости.

**Architecture:** Всё новое живёт в `src/render/`. Генерация текстур — процедурная, через canvas, без внешних ассетов: репозиторий публичный, а лицензионно чистых текстур асфальта под рукой нет. Геометрия обочин строится из уже готовых `buildEdges`. Физику не трогаем вообще.

**Spec:** `docs/superpowers/specs/2026-08-17-f1-sim-design.md` (раздел «Камеры» и этап 8)

## Global Constraints

- **Физику не трогать.** `src/physics/**` и `src/track/**` не меняются ни на строку: модель прошла четыре раунда ревью, регрессия там дороже любой картинки. Исключение — чтение уже существующих геттеров.
- Тайминг, призрак, HUD, leaderboard работают — не сломать. Полный набор перед коммитом: 110 vitest + 26 pytest.
- **Никаких внешних ассетов.** Ни скачанных текстур, ни GLTF, ни шрифтов. Всё процедурно: репо публичный, лицензии проверять нечем и некогда.
- Бюджет кадра: 60 fps на интегрированной графике. Каждая задача, добавляющая геометрию, обязана померить fps до и после.
- Тени включаем один раз и осознанно: shadow map дорог, тени только от солнца и только на полотне и болиде.
- Тип-аннотации везде, современный синтаксис. Комментарий — только про **почему**.
- Репо публичный: ни токенов, ни адресов, ни ID.
- Коммиты от `Stanislav Shupilkin <smolevich90@gmail.com>`, без `Co-Authored-By`.
- Прод только через CI.

## Порядок

Задачи 1–3 меняют картинку сильнее всего и стоят первыми. Каждая задача — самостоятельный видимый результат, после каждой можно остановиться.

---

### Task 1: Процедурные текстуры асфальта, травы и поребриков

**Files:**
- Create: `src/render/textures.ts`
- Test: `src/render/textures.test.ts`

**Interfaces:**
- Produces:
  - `makeAsphaltTexture(size?: number): THREE.Texture` — шум зерна, тайлится
  - `makeGrassTexture(size?: number): THREE.Texture`
  - `makeKerbTexture(): THREE.Texture` — красно-белые полосы
  - `noiseCanvas(size: number, base: [number,number,number], spread: number): HTMLCanvasElement` — чистая, тестируемая

Текстуры рисуются в `<canvas>` кодом. Внешних файлов нет по требованию выше.

- [ ] **Step 1: Написать падающие тесты**

`src/render/textures.test.ts` — тестируется генератор пикселей, не three.js:
```ts
import { expect, test } from 'vitest'
import { noisePixels } from './textures'

test('шум держится вокруг базового цвета', () => {
  const px = noisePixels(64, [60, 60, 60], 20)
  let sum = 0
  for (let i = 0; i < px.length; i += 4) sum += px[i]
  const mean = sum / (px.length / 4)
  expect(mean).toBeGreaterThan(40)
  expect(mean).toBeLessThan(80)
})

test('шум не однотонный', () => {
  const px = noisePixels(64, [60, 60, 60], 20)
  const first = px[0]
  let different = 0
  for (let i = 0; i < px.length; i += 4) if (px[i] !== first) different++
  expect(different).toBeGreaterThan(100)
})

test('нулевой разброс даёт ровный цвет', () => {
  const px = noisePixels(16, [10, 20, 30], 0)
  expect(px[0]).toBe(10)
  expect(px[1]).toBe(20)
  expect(px[2]).toBe(30)
})

test('канал прозрачности всегда непрозрачный', () => {
  const px = noisePixels(16, [60, 60, 60], 20)
  for (let i = 3; i < px.length; i += 4) expect(px[i]).toBe(255)
})

test('размер пикселей соответствует стороне', () => {
  expect(noisePixels(32, [0, 0, 0], 5).length).toBe(32 * 32 * 4)
})
```

- [ ] **Step 2: Запустить, убедиться что падают**

Run: `npx vitest run src/render/textures.test.ts`
Expected: FAIL — модуль не найден

- [ ] **Step 3: Реализация**

`src/render/textures.ts`:
```ts
import * as THREE from 'three'

type Rgb = [number, number, number]

/**
 * Пиксели шума вокруг базового цвета. Вынесено отдельно от canvas, чтобы
 * генератор тестировался без DOM: в vitest окружение node, canvas там нет.
 */
export function noisePixels(size: number, base: Rgb, spread: number): Uint8ClampedArray {
  const px = new Uint8ClampedArray(size * size * 4)
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

function canvasFrom(size: number, px: Uint8ClampedArray): HTMLCanvasElement {
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
```

- [ ] **Step 4: Запустить тесты**

Run: `npx vitest run src/render/textures.test.ts`
Expected: PASS, 5 тестов

- [ ] **Step 5: Коммит**

```bash
git add src/render/textures.ts src/render/textures.test.ts
git commit -m "feat: процедурные текстуры асфальта, травы и поребриков"
```

---

### Task 2: Полотно с текстурой, разметкой и стартовой решёткой

**Files:**
- Modify: `src/render/track-mesh.ts`
- Test: `src/render/track-mesh.test.ts`

**Interfaces:**
- Consumes: `buildEdges` (`src/track/geometry.ts`), `makeAsphaltTexture` (Task 1)
- Produces:
  - `buildTrackMesh(track: Track): THREE.Mesh` — теперь с UV и текстурой
  - `buildTrackLines(track: Track): THREE.Mesh` — белая разметка по краям
  - `buildStartLine(track: Track): THREE.Mesh` — шашечная стартовая линия
  - `trackUvs(track: Track): number[]` — чистая функция, тестируется

Ключевая правка: у полотна сейчас **нет UV-координат**, поэтому текстуру наложить не на что. UV по длине трассы (`v` растёт вдоль осевой) и по ширине (`u` от 0 до 1).

- [ ] **Step 1: Написать падающие тесты**

`src/render/track-mesh.test.ts`:
```ts
import { expect, test } from 'vitest'
import { readFileSync } from 'node:fs'
import { trackUvs } from './track-mesh'
import type { Track } from '../track/schema'

const track: Track = JSON.parse(readFileSync('public/tracks/monza.json', 'utf8'))

test('UV есть на каждую вершину полотна', () => {
  const uvs = trackUvs(track)
  // 6 вершин на сегмент, 2 числа на вершину
  expect(uvs.length).toBe(track.centerline.length * 6 * 2)
})

test('координата поперёк трассы лежит в пределах нуля и единицы', () => {
  const uvs = trackUvs(track)
  for (let i = 0; i < uvs.length; i += 2) {
    expect(uvs[i]).toBeGreaterThanOrEqual(0)
    expect(uvs[i]).toBeLessThanOrEqual(1)
  }
})

test('координата вдоль трассы растёт с длиной, а не с номером узла', () => {
  const uvs = trackUvs(track)
  // v первой вершины первого сегмента против v первой вершины сотого
  const first = uvs[1]
  const hundredth = uvs[100 * 6 * 2 + 1]
  expect(hundredth).toBeGreaterThan(first)
})

test('масштаб вдоль трассы соответствует метрам, а не сегментам', () => {
  const uvs = trackUvs(track)
  const last = uvs[(track.centerline.length - 1) * 6 * 2 + 1]
  // 5792 м при повторе раз в 8 м -> около 724
  expect(last).toBeGreaterThan(500)
  expect(last).toBeLessThan(1000)
})
```

- [ ] **Step 2: Запустить, убедиться что падают**

Run: `npx vitest run src/render/track-mesh.test.ts`
Expected: FAIL — `trackUvs` не экспортируется

- [ ] **Step 3: Реализация**

`src/render/track-mesh.ts` — переписать целиком:
```ts
import * as THREE from 'three'
import { buildEdges } from '../track/geometry'
import type { Track, TrackPoint } from '../track/schema'
import { makeAsphaltTexture } from './textures'

/** Один повтор текстуры асфальта на столько метров пути. */
const ASPHALT_TILE_M = 8
const LINE_WIDTH_M = 0.15
/** Приподнимаем разметку над полотном, иначе она тонет в нём при z-fight. */
const OVERLAY_LIFT_M = 0.02

/**
 * UV полотна: поперёк трассы 0..1, вдоль — пройденные метры, делённые на шаг
 * тайла. Считать вдоль по номеру сегмента нельзя: узлы OSM стоят неравномерно
 * (на Монце от 2 до 190 м), и текстура растянулась бы на прямых и сжалась в
 * шиканах.
 */
export function trackUvs(track: Track): number[] {
  const cl = track.centerline
  const n = cl.length
  const uvs: number[] = []
  let travelled = 0

  for (let i = 0; i < n; i++) {
    const j = (i + 1) % n
    const segment = distance(cl[i], cl[j])
    const v0 = travelled / ASPHALT_TILE_M
    const v1 = (travelled + segment) / ASPHALT_TILE_M
    // Порядок вершин повторяет buildTrackMesh: l0 r0 l1, r0 r1 l1
    uvs.push(0, v0, 1, v0, 0, v1)
    uvs.push(1, v0, 1, v1, 0, v1)
    travelled += segment
  }

  return uvs
}

export function buildTrackMesh(track: Track): THREE.Mesh {
  const { left, right } = buildEdges(track)
  const positions: number[] = []
  const n = track.centerline.length

  for (let i = 0; i < n; i++) {
    const j = (i + 1) % n
    const l0 = left[i], r0 = right[i], l1 = left[j], r1 = right[j]
    positions.push(l0.x, l0.y, l0.z, r0.x, r0.y, r0.z, l1.x, l1.y, l1.z)
    positions.push(r0.x, r0.y, r0.z, r1.x, r1.y, r1.z, l1.x, l1.y, l1.z)
  }

  const geometry = new THREE.BufferGeometry()
  geometry.setAttribute('position', new THREE.Float32BufferAttribute(positions, 3))
  geometry.setAttribute('uv', new THREE.Float32BufferAttribute(trackUvs(track), 2))
  geometry.computeVertexNormals()

  const mesh = new THREE.Mesh(geometry, new THREE.MeshStandardMaterial({
    map: makeAsphaltTexture(),
    roughness: 0.95,
    metalness: 0,
    side: THREE.DoubleSide,
  }))
  mesh.receiveShadow = true
  return mesh
}

/** Белая линия по обоим краям полотна — то, что глаз читает как «трасса». */
export function buildTrackLines(track: Track): THREE.Mesh {
  const { left, right } = buildEdges(track)
  const cl = track.centerline
  const n = cl.length
  const positions: number[] = []

  for (const edge of [left, right]) {
    for (let i = 0; i < n; i++) {
      const j = (i + 1) % n
      const inward0 = toward(edge[i], cl[i], LINE_WIDTH_M)
      const inward1 = toward(edge[j], cl[j], LINE_WIDTH_M)
      quad(positions, edge[i], inward0, edge[j], inward1, OVERLAY_LIFT_M)
    }
  }

  const geometry = new THREE.BufferGeometry()
  geometry.setAttribute('position', new THREE.Float32BufferAttribute(positions, 3))
  geometry.computeVertexNormals()
  return new THREE.Mesh(geometry, new THREE.MeshBasicMaterial({ color: 0xf5f5f5 }))
}

/** Шашечная стартовая линия поперёк полотна на нулевом узле. */
export function buildStartLine(track: Track): THREE.Mesh {
  const { left, right } = buildEdges(track)
  const positions: number[] = []
  const squares = 12
  const depth = 1.2

  for (let k = 0; k < squares; k += 2) {
    const a = lerp(left[0], right[0], k / squares)
    const b = lerp(left[0], right[0], (k + 1) / squares)
    const forward = unit(track.centerline[0], track.centerline[1])
    const a2 = { x: a.x + forward.x * depth, y: a.y, z: a.z + forward.z * depth }
    const b2 = { x: b.x + forward.x * depth, y: b.y, z: b.z + forward.z * depth }
    quad(positions, a, b, a2, b2, OVERLAY_LIFT_M)
  }

  const geometry = new THREE.BufferGeometry()
  geometry.setAttribute('position', new THREE.Float32BufferAttribute(positions, 3))
  geometry.computeVertexNormals()
  return new THREE.Mesh(geometry, new THREE.MeshBasicMaterial({ color: 0xffffff }))
}

function distance(a: TrackPoint, b: TrackPoint): number {
  return Math.hypot(b.x - a.x, b.y - a.y, b.z - a.z)
}

function toward(from: TrackPoint, to: TrackPoint, meters: number): TrackPoint {
  const d = Math.hypot(to.x - from.x, to.z - from.z) || 1
  return {
    x: from.x + ((to.x - from.x) / d) * meters,
    y: from.y,
    z: from.z + ((to.z - from.z) / d) * meters,
  }
}

function lerp(a: TrackPoint, b: TrackPoint, k: number): TrackPoint {
  return { x: a.x + (b.x - a.x) * k, y: a.y, z: a.z + (b.z - a.z) * k }
}

function unit(a: TrackPoint, b: TrackPoint): TrackPoint {
  const d = Math.hypot(b.x - a.x, b.z - a.z) || 1
  return { x: (b.x - a.x) / d, y: 0, z: (b.z - a.z) / d }
}

function quad(
  out: number[], a: TrackPoint, b: TrackPoint, c: TrackPoint, d: TrackPoint, lift: number,
): void {
  out.push(a.x, a.y + lift, a.z, b.x, b.y + lift, b.z, c.x, c.y + lift, c.z)
  out.push(b.x, b.y + lift, b.z, d.x, d.y + lift, d.z, c.x, c.y + lift, c.z)
}
```

- [ ] **Step 4: Подключить в main.ts**

Рядом с `scene.add(buildTrackMesh(track))` добавить:
```ts
  scene.add(buildTrackLines(track))
  scene.add(buildStartLine(track))
```

- [ ] **Step 5: Тесты и проверка в браузере**

Run: `npm test && npx tsc -b && npm run build`, затем `npm run dev`
Expected: асфальт с зерном, белые линии по краям, шашечная линия на старте.

- [ ] **Step 6: Коммит**

```bash
git add -A
git commit -m "feat: текстура асфальта, разметка по краям, стартовая линия"
```

---

### Task 3: Поребрики, отбойники и трава с текстурой

**Files:**
- Create: `src/render/trackside.ts`
- Modify: `src/render/scene.ts` (трава), `src/main.ts`
- Test: `src/render/trackside.test.ts`

**Interfaces:**
- Consumes: `buildEdges`, `makeKerbTexture`
- Produces:
  - `curvatureAt(track: Track, index: number): number` — кривизна в узле, чистая
  - `buildKerbs(track: Track): THREE.Mesh` — поребрики только в поворотах
  - `buildBarriers(track: Track): THREE.Mesh` — отбойники по периметру

Поребрики ставятся не по всей трассе, а там, где она реально изгибается — иначе Монца станет полосатой на всём протяжении, включая километровую прямую.

- [ ] **Step 1: Написать падающие тесты**

`src/render/trackside.test.ts`:
```ts
import { expect, test } from 'vitest'
import { readFileSync } from 'node:fs'
import { curvatureAt, kerbNodes } from './trackside'
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
```

- [ ] **Step 2: Запустить, убедиться что падают**

Run: `npx vitest run src/render/trackside.test.ts`
Expected: FAIL — модуль не найден

- [ ] **Step 3: Реализация**

`src/render/trackside.ts`:
```ts
import * as THREE from 'three'
import { buildEdges } from '../track/geometry'
import type { Track, TrackPoint } from '../track/schema'
import { makeKerbTexture } from './textures'

/** Порог кривизны, с которого узел считается поворотом. */
const KERB_CURVATURE = 0.06
const KERB_WIDTH_M = 1.2
const KERB_LIFT_M = 0.03
const BARRIER_HEIGHT_M = 1.0
const BARRIER_OFFSET_M = 6

/**
 * Кривизна в узле — угол между направлением входа и выхода. Меряется по
 * нормированным направлениям, потому что соседние сегменты OSM различаются по
 * длине на два порядка, и разность сырых векторов дала бы кривизну прямой.
 */
export function curvatureAt(track: Track, index: number): number {
  const cl = track.centerline
  const n = cl.length
  const prev = cl[(index - 1 + n) % n]
  const here = cl[index]
  const next = cl[(index + 1) % n]

  const inX = here.x - prev.x, inZ = here.z - prev.z
  const outX = next.x - here.x, outZ = next.z - here.z
  const inLen = Math.hypot(inX, inZ) || 1
  const outLen = Math.hypot(outX, outZ) || 1

  const dot = (inX / inLen) * (outX / outLen) + (inZ / inLen) * (outZ / outLen)
  return Math.acos(Math.max(-1, Math.min(1, dot)))
}

export function kerbNodes(track: Track): number[] {
  const nodes: number[] = []
  for (let i = 0; i < track.centerline.length; i++) {
    if (curvatureAt(track, i) >= KERB_CURVATURE) nodes.push(i)
  }
  return nodes
}

/** Поребрики по обеим сторонам в поворотах. */
export function buildKerbs(track: Track): THREE.Mesh {
  const { left, right } = buildEdges(track)
  const cl = track.centerline
  const n = cl.length
  const positions: number[] = []
  const uvs: number[] = []
  const nodes = new Set(kerbNodes(track))

  for (let i = 0; i < n; i++) {
    if (!nodes.has(i)) continue
    const j = (i + 1) % n
    for (const [edge, sign] of [[left, 1], [right, -1]] as const) {
      const outward0 = away(edge[i], cl[i], KERB_WIDTH_M)
      const outward1 = away(edge[j], cl[j], KERB_WIDTH_M)
      pushQuad(positions, edge[i], outward0, edge[j], outward1, KERB_LIFT_M)
      // Полосы поперёк движения: повтор по длине, один по ширине.
      uvs.push(0, 0, 1, 0, 0, 1, 1, 0, 1, 1, 0, 1)
      void sign
    }
  }

  const geometry = new THREE.BufferGeometry()
  geometry.setAttribute('position', new THREE.Float32BufferAttribute(positions, 3))
  geometry.setAttribute('uv', new THREE.Float32BufferAttribute(uvs, 2))
  geometry.computeVertexNormals()

  const texture = makeKerbTexture()
  texture.repeat.set(1, 1)
  const mesh = new THREE.Mesh(geometry, new THREE.MeshStandardMaterial({
    map: texture, roughness: 0.8, side: THREE.DoubleSide,
  }))
  mesh.receiveShadow = true
  return mesh
}

/** Отбойники: вертикальная стенка на отдалении от полотна. */
export function buildBarriers(track: Track): THREE.Mesh {
  const { left, right } = buildEdges(track)
  const cl = track.centerline
  const n = cl.length
  const positions: number[] = []

  for (const edge of [left, right]) {
    for (let i = 0; i < n; i++) {
      const j = (i + 1) % n
      const base0 = away(edge[i], cl[i], BARRIER_OFFSET_M)
      const base1 = away(edge[j], cl[j], BARRIER_OFFSET_M)
      const top0 = { ...base0, y: base0.y + BARRIER_HEIGHT_M }
      const top1 = { ...base1, y: base1.y + BARRIER_HEIGHT_M }
      pushQuad(positions, base0, top0, base1, top1, 0)
    }
  }

  const geometry = new THREE.BufferGeometry()
  geometry.setAttribute('position', new THREE.Float32BufferAttribute(positions, 3))
  geometry.computeVertexNormals()
  return new THREE.Mesh(geometry, new THREE.MeshStandardMaterial({
    color: 0xdddde2, roughness: 0.6, metalness: 0.3, side: THREE.DoubleSide,
  }))
}

function away(from: TrackPoint, centre: TrackPoint, meters: number): TrackPoint {
  const dx = from.x - centre.x, dz = from.z - centre.z
  const d = Math.hypot(dx, dz) || 1
  return { x: from.x + (dx / d) * meters, y: from.y, z: from.z + (dz / d) * meters }
}

function pushQuad(
  out: number[], a: TrackPoint, b: TrackPoint, c: TrackPoint, d: TrackPoint, lift: number,
): void {
  out.push(a.x, a.y + lift, a.z, b.x, b.y + lift, b.z, c.x, c.y + lift, c.z)
  out.push(b.x, b.y + lift, b.z, d.x, d.y + lift, d.z, c.x, c.y + lift, c.z)
}
```

- [ ] **Step 4: Трава с текстурой в scene.ts**

Заменить материал земли на текстурированный:
```ts
  const ground = new THREE.Mesh(
    new THREE.PlaneGeometry(10_000, 10_000),
    new THREE.MeshStandardMaterial({
      map: makeGrassTexture(),
      roughness: 1,
      polygonOffset: true,
      polygonOffsetFactor: 1,
      polygonOffsetUnits: 1,
    }),
  )
  ground.receiveShadow = true
```

- [ ] **Step 5: Подключить в main.ts и померить fps**

```ts
  scene.add(buildKerbs(track))
  scene.add(buildBarriers(track))
```
Померить fps до и после в браузере, записать оба числа в отчёт. Если просело ниже 60 — сказать об этом, а не молча оставить.

- [ ] **Step 6: Коммит**

```bash
git add -A
git commit -m "feat: поребрики в поворотах, отбойники, трава с текстурой"
```

---

### Task 4: Болид — нормальная модель с вращающимися колёсами

**Files:**
- Modify: `src/render/car.ts`, `src/main.ts`
- Test: `src/render/car.test.ts`

**Interfaces:**
- Produces:
  - `buildCar(color?: number): THREE.Group` — детализированный болид
  - `type CarParts = { group: THREE.Group; wheels: THREE.Object3D[]; steered: THREE.Object3D[] }`
  - `buildCarParts(color?: number): CarParts` — колёса доступны для анимации
  - `spinWheels(parts: CarParts, speedMs: number, steerRad: number, dt: number): void`

Сейчас колёса — статичные цилиндры, они не крутятся и не поворачиваются. Это то, что сильнее всего выдаёт заглушку при взгляде на болид.

- [ ] **Step 1: Написать падающие тесты**

`src/render/car.test.ts`:
```ts
import { expect, test } from 'vitest'
import { wheelSpinDelta, steerAngleFor } from './car'

test('колесо крутится тем быстрее, чем выше скорость', () => {
  expect(wheelSpinDelta(60, 0.1)).toBeGreaterThan(wheelSpinDelta(30, 0.1))
})

test('на стоянке колесо не крутится', () => {
  expect(wheelSpinDelta(0, 0.1)).toBe(0)
})

test('угол поворота колёс пропорционален рулю', () => {
  expect(steerAngleFor(1)).toBeGreaterThan(steerAngleFor(0.5))
  expect(steerAngleFor(-1)).toBeLessThan(0)
})

test('поворот колёс ограничен максимальным углом', () => {
  expect(Math.abs(steerAngleFor(5))).toBeLessThanOrEqual(Math.abs(steerAngleFor(1)))
})
```

- [ ] **Step 2: Запустить, убедиться что падают**

Run: `npx vitest run src/render/car.test.ts`
Expected: FAIL — функции не экспортируются

- [ ] **Step 3: Реализация**

`src/render/car.ts` — переписать, сохранив сигнатуру `buildCar` (её зовёт `ghost-car.ts`):
```ts
import * as THREE from 'three'
import { WHEEL_RADIUS_M } from '../physics/drivetrain'

const LENGTH_M = 5.6
const WIDTH_M = 2.0
const WHEEL_WIDTH_M = 0.38
/** Максимальный угол поворота колёс в рендере, совпадает с MAX_STEER_RAD физики. */
const MAX_STEER_RAD = 0.3

export type CarParts = {
  group: THREE.Group
  wheels: THREE.Object3D[]
  steered: THREE.Object3D[]
}

export function wheelSpinDelta(speedMs: number, dt: number): number {
  return speedMs <= 0 ? 0 : (speedMs / WHEEL_RADIUS_M) * dt
}

export function steerAngleFor(steer: number): number {
  return Math.max(-1, Math.min(1, steer)) * MAX_STEER_RAD
}

export function spinWheels(parts: CarParts, speedMs: number, steer: number, dt: number): void {
  const delta = wheelSpinDelta(speedMs, dt)
  for (const wheel of parts.wheels) wheel.rotation.x -= delta
  const angle = steerAngleFor(steer)
  for (const pivot of parts.steered) pivot.rotation.y = angle
}

export function buildCarParts(color = 0x1e3a8a): CarParts {
  const group = new THREE.Group()
  const body = new THREE.MeshStandardMaterial({ color, metalness: 0.6, roughness: 0.35 })
  const dark = new THREE.MeshStandardMaterial({ color: 0x15161a, metalness: 0.4, roughness: 0.5 })
  const rubber = new THREE.MeshStandardMaterial({ color: 0x0d0d0f, roughness: 0.9 })
  const rim = new THREE.MeshStandardMaterial({ color: 0xb8b8c0, metalness: 0.9, roughness: 0.25 })

  // Монокок: узкий нос, широкие понтоны, сужение к корме — силуэт F1 читается
  // в основном по этому профилю, а не по деталям.
  const tub = new THREE.Mesh(new THREE.BoxGeometry(0.85, 0.32, 2.6), body)
  tub.position.set(0, 0.42, -0.1)
  group.add(tub)

  const engineCover = new THREE.Mesh(new THREE.BoxGeometry(0.7, 0.42, 1.9), body)
  engineCover.position.set(0, 0.55, -1.3)
  group.add(engineCover)

  const airbox = new THREE.Mesh(new THREE.BoxGeometry(0.34, 0.3, 0.5), body)
  airbox.position.set(0, 0.86, -0.55)
  group.add(airbox)

  for (const side of [-1, 1]) {
    const pod = new THREE.Mesh(new THREE.BoxGeometry(0.42, 0.34, 1.7), body)
    pod.position.set(side * 0.62, 0.4, -0.5)
    group.add(pod)
  }

  const nose = new THREE.Mesh(new THREE.ConeGeometry(0.2, 1.9, 10), body)
  nose.rotation.x = Math.PI / 2
  nose.position.set(0, 0.36, 1.9)
  group.add(nose)

  const frontWing = new THREE.Mesh(new THREE.BoxGeometry(WIDTH_M, 0.07, 0.75), body)
  frontWing.position.set(0, 0.14, 2.55)
  group.add(frontWing)

  const frontFlap = new THREE.Mesh(new THREE.BoxGeometry(WIDTH_M * 0.95, 0.05, 0.3), dark)
  frontFlap.position.set(0, 0.26, 2.45)
  group.add(frontFlap)

  const rearWing = new THREE.Mesh(new THREE.BoxGeometry(WIDTH_M * 0.8, 0.05, 0.62), body)
  rearWing.position.set(0, 0.98, -2.5)
  group.add(rearWing)

  for (const side of [-1, 1]) {
    const endplate = new THREE.Mesh(new THREE.BoxGeometry(0.05, 0.45, 0.62), dark)
    endplate.position.set(side * WIDTH_M * 0.4, 0.82, -2.5)
    group.add(endplate)
  }

  const diffuser = new THREE.Mesh(new THREE.BoxGeometry(1.1, 0.22, 0.5), dark)
  diffuser.position.set(0, 0.22, -2.35)
  group.add(diffuser)

  const halo = new THREE.Mesh(new THREE.TorusGeometry(0.36, 0.045, 8, 20, Math.PI), dark)
  halo.position.set(0, 0.78, 0.35)
  halo.rotation.x = -Math.PI / 2
  group.add(halo)

  const helmet = new THREE.Mesh(new THREE.SphereGeometry(0.17, 12, 10), dark)
  helmet.position.set(0, 0.72, 0.15)
  group.add(helmet)

  // Колесо в собственном пивоте: пивот поворачивается рулём, колесо крутится
  // вокруг своей оси — без разделения одно движение затирало бы другое.
  const wheels: THREE.Object3D[] = []
  const steered: THREE.Object3D[] = []
  const tyreGeometry = new THREE.CylinderGeometry(WHEEL_RADIUS_M, WHEEL_RADIUS_M, WHEEL_WIDTH_M, 24)
  const rimGeometry = new THREE.CylinderGeometry(WHEEL_RADIUS_M * 0.62, WHEEL_RADIUS_M * 0.62, WHEEL_WIDTH_M * 1.02, 16)

  for (const [x, z, isFront] of [
    [-0.86, 1.75, true], [0.86, 1.75, true], [-0.86, -1.75, false], [0.86, -1.75, false],
  ] as const) {
    const pivot = new THREE.Group()
    pivot.position.set(x, WHEEL_RADIUS_M, z)
    const wheel = new THREE.Group()
    const tyre = new THREE.Mesh(tyreGeometry, rubber)
    tyre.rotation.z = Math.PI / 2
    tyre.castShadow = true
    const disc = new THREE.Mesh(rimGeometry, rim)
    disc.rotation.z = Math.PI / 2
    wheel.add(tyre, disc)
    pivot.add(wheel)
    group.add(pivot)
    wheels.push(wheel)
    if (isFront) steered.push(pivot)
  }

  group.traverse((node) => { if (node instanceof THREE.Mesh) node.castShadow = true })
  void LENGTH_M
  return { group, wheels, steered }
}

export function buildCar(color = 0x1e3a8a): THREE.Group {
  return buildCarParts(color).group
}
```

- [ ] **Step 4: Анимация колёс в main.ts**

Заменить `const carMesh = buildCar()` на:
```ts
  const carParts = buildCarParts()
  const carMesh = carParts.group
```
и в кадре, после обновления позиции:
```ts
    spinWheels(carParts, telemetry.speedMs, lastSteer, frameSeconds)
```
где `lastSteer` — значение руля из последнего прочитанного ввода.

- [ ] **Step 5: Тесты и браузер**

Run: `npm test && npx tsc -b && npm run build`, затем проверить в браузере.
Expected: болид узнаваем как F1, колёса крутятся при движении и поворачиваются при A/D.

- [ ] **Step 6: Коммит**

```bash
git add -A
git commit -m "feat: детализированный болид, колёса крутятся и поворачиваются"
```

---

### Task 5: Камеры и свет

**Files:**
- Create: `src/render/cameras.ts`
- Modify: `src/render/scene.ts`, `src/main.ts`
- Test: `src/render/cameras.test.ts`

**Interfaces:**
- Produces:
  - `type CameraMode = 'chase' | 'tcam' | 'cockpit' | 'bonnet'`
  - `const CAMERA_ORDER: CameraMode[]`
  - `cameraPose(mode, position, headingRad, speedMs): { eye: Vec3; look: Vec3; fov: number }`
  - `nextMode(mode: CameraMode): CameraMode`

Спека требует кокпит, T-cam, капот и внешнюю. Переключение по клавише `C`.

- [ ] **Step 1: Написать падающие тесты**

`src/render/cameras.test.ts`:
```ts
import { expect, test } from 'vitest'
import { CAMERA_ORDER, cameraPose, nextMode } from './cameras'

const at = { x: 0, y: 0, z: 0 }

test('режимы переключаются по кругу', () => {
  let mode = CAMERA_ORDER[0]
  for (let i = 0; i < CAMERA_ORDER.length; i++) mode = nextMode(mode)
  expect(mode).toBe(CAMERA_ORDER[0])
})

test('внешняя камера стоит позади болида', () => {
  const pose = cameraPose('chase', at, 0, 0)
  // курс 0 смотрит в +Z, значит камера должна быть в -Z
  expect(pose.eye.z).toBeLessThan(0)
})

test('кокпит ближе к болиду, чем внешняя камера', () => {
  const cockpit = cameraPose('cockpit', at, 0, 0)
  const chase = cameraPose('chase', at, 0, 0)
  expect(Math.hypot(cockpit.eye.x, cockpit.eye.z)).toBeLessThan(Math.hypot(chase.eye.x, chase.eye.z))
})

test('камера следует за курсом болида', () => {
  const north = cameraPose('chase', at, 0, 0)
  const east = cameraPose('chase', at, Math.PI / 2, 0)
  expect(Math.abs(north.eye.x - east.eye.x)).toBeGreaterThan(1)
})

test('поле зрения расширяется со скоростью', () => {
  expect(cameraPose('chase', at, 0, 80).fov).toBeGreaterThan(cameraPose('chase', at, 0, 0).fov)
})

test('поле зрения не растёт без предела', () => {
  expect(cameraPose('chase', at, 0, 500).fov).toBeLessThan(110)
})
```

- [ ] **Step 2: Запустить, убедиться что падают**

Run: `npx vitest run src/render/cameras.test.ts`
Expected: FAIL — модуль не найден

- [ ] **Step 3: Реализация**

`src/render/cameras.ts`:
```ts
type Vec3 = { x: number; y: number; z: number }

export type CameraMode = 'chase' | 'tcam' | 'cockpit' | 'bonnet'

export const CAMERA_ORDER: CameraMode[] = ['chase', 'tcam', 'cockpit', 'bonnet']

const BASE_FOV = 70
const FOV_GAIN = 0.22
const MAX_FOV = 104

type Rig = { back: number; height: number; ahead: number }

const RIGS: Record<CameraMode, Rig> = {
  chase: { back: 17, height: 7, ahead: 1 },
  tcam: { back: 2.2, height: 2.1, ahead: 8 },
  cockpit: { back: -0.2, height: 1.05, ahead: 12 },
  bonnet: { back: -2.0, height: 0.8, ahead: 14 },
}

export function nextMode(mode: CameraMode): CameraMode {
  return CAMERA_ORDER[(CAMERA_ORDER.indexOf(mode) + 1) % CAMERA_ORDER.length]
}

/**
 * Поле зрения растёт со скоростью — приём, которым гоночные игры продают
 * ощущение скорости: геометрия по краям кадра начинает лететь мимо быстрее.
 * Потолок нужен, иначе на максималке картинка уходит в рыбий глаз.
 */
export function cameraPose(
  mode: CameraMode, position: Vec3, headingRad: number, speedMs: number,
): { eye: Vec3; look: Vec3; fov: number } {
  const rig = RIGS[mode]
  const sin = Math.sin(headingRad)
  const cos = Math.cos(headingRad)

  return {
    eye: {
      x: position.x - sin * rig.back,
      y: position.y + rig.height,
      z: position.z - cos * rig.back,
    },
    look: {
      x: position.x + sin * rig.ahead,
      y: position.y + (mode === 'chase' ? 1 : 0.6),
      z: position.z + cos * rig.ahead,
    },
    fov: Math.min(MAX_FOV, BASE_FOV + speedMs * FOV_GAIN),
  }
}
```

- [ ] **Step 4: Солнце с тенями в scene.ts**

Заменить свет на направленный с shadow map:
```ts
  const sun = new THREE.DirectionalLight(0xfff4e6, 2.2)
  sun.position.set(300, 500, 200)
  sun.castShadow = true
  sun.shadow.mapSize.set(2048, 2048)
  // Тень покрывает окрестность болида, а не всю трассу: карта на 5 км даёт
  // такой шаг, что тени не видно вовсе.
  const span = 120
  sun.shadow.camera.left = -span
  sun.shadow.camera.right = span
  sun.shadow.camera.top = span
  sun.shadow.camera.bottom = -span
  sun.shadow.camera.far = 1200
  scene.add(sun, sun.target)
```
и включить в рендерере:
```ts
  renderer.shadowMap.enabled = true
  renderer.shadowMap.type = THREE.PCFSoftShadowMap
```
`createScene` возвращает ещё и `sun`, чтобы `main.ts` двигал его цель за болидом.

- [ ] **Step 5: Подключить камеры в main.ts**

Переключение по `C`, применение позы каждый кадр:
```ts
  let cameraMode: CameraMode = 'chase'
  window.addEventListener('keydown', (e) => {
    if (e.code === 'KeyC') cameraMode = nextMode(cameraMode)
  })
```
```ts
    const pose = cameraPose(cameraMode, telemetry.position, heading, telemetry.speedMs)
    camera.position.set(pose.eye.x, pose.eye.y, pose.eye.z)
    camera.lookAt(pose.look.x, pose.look.y, pose.look.z)
    if (Math.abs(camera.fov - pose.fov) > 0.1) {
      camera.fov = pose.fov
      camera.updateProjectionMatrix()
    }
    sun.target.position.set(telemetry.position.x, 0, telemetry.position.z)
    sun.position.set(telemetry.position.x + 300, 500, telemetry.position.z + 200)
    // Болид не рисуем из кокпита: изнутри виден только затылок собственного шлема.
    carMesh.visible = cameraMode !== 'cockpit'
```

- [ ] **Step 6: Тесты, fps и браузер**

Run: `npm test && npx tsc -b && npm run build`
Проверить каждый режим камеры в браузере, померить fps с тенями и без. Записать числа.

- [ ] **Step 7: Коммит**

```bash
git add -A
git commit -m "feat: камеры (кокпит, T-cam, капот, внешняя), солнце с тенями"
```

---

### Task 6: Деплой и проверка на проде

**Files:** нет новых

- [ ] **Step 1: Полный набор**

Run: `npm test && npx tsc -b && npm run build && cd api && uv run pytest -q`
Expected: 110+ vitest, 26 pytest, tsc чистый

- [ ] **Step 2: Скан на секреты**

```bash
grep -rInE "hvs\.|cfut_|gho_|tskey|100\.102\.38\.7" --include='*.ts' --include='*.py' src/ api/ deploy/ .github/
```
Expected: пусто

- [ ] **Step 3: Деплой**

```bash
git push
gh run watch -R Smolevich/f1-sim
```
GitHub периодически отдаёт 429/503 на скачивании экшенов — это их сбой, лечится повтором.

- [ ] **Step 4: Проверка в браузере на проде**

Открыть `https://games.smolevich.com`, проехать круг, переключить все камеры.
Expected: текстуры, разметка, поребрики, отбойники, тени, вращающиеся колёса, работающие камеры. Ноль ошибок в консоли. Скриншоты каждого режима камеры.

- [ ] **Step 5: Коммит, если что-то правилось**

## Что дальше

- Этап 6: остальные пять трасс
- Этап 7: сетап, ассисты (TC, ABS, автокоробка), геймпад и руль
- Этап 9: гонка на дистанцию с пит-стопами
- Долги из ревью: фиолетовые секторы (`sectorBest` захардкожен), точная посекторная дельта

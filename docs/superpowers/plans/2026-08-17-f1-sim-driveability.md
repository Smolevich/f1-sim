# F1 Sim — управляемость и реализм

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Сделать игру управляемой и честной: врезался — остановился, руль слушается, видно куда ехать и где тормозить.

**Повод.** Пользователь сел играть и сказал: «почти неуправляемо», «если я врезаюсь, то я еду по полю», «реалистичности пока ноль». Проверено — он прав по всем пунктам:

- **Отбойники нарисованы, но физики у них нет.** В мире Rapier существуют только плоская земля 5000×5000 и сам болид. Ни границ трассы, ни столкновений. Вылет ничем не наказывается, кроме потери скорости на траве, поэтому нет ни риска, ни смысла держать траекторию.
- **Руль идёт до упора 0.29 с.** На 200 км/ч это 16 м пути, больше ширины трассы. Для клавиатуры типично 0.15–0.20 с.
- **Подсказок нет.** Ни миникарты, ни линии торможения — за поворотом не видно, что дальше, и трасса заучивается вслепую.

**Architecture:** Коллайдеры отбойников строятся из уже готовых `buildEdges` и живут в `Vehicle` рядом с землёй. Подсказки — новые модули рендера. Руль — константы в `keyboard.ts`.

## Global Constraints

- **Модель физики не переписывать.** Шины, аэродинамика, трансмиссия, круг трения в `tyres.ts`/`aero.ts`/`drivetrain.ts` откалиброваны по реальным цифрам F1 и прошли четыре раунда ревью. Меняем только то, что названо в задачах.
- `src/track/**` не трогать: `buildEdges`, `isOnTrack`, `progressFraction` держат тайминг и валидацию.
- Игра должна продолжать работать целиком: таймер, секторы, призрак, HUD, leaderboard, камеры, графика.
- Полный набор перед каждым коммитом: 135 vitest + 26 pytest.
- **Проверка — живой ездой в браузере, а не только тестами.** Это прямое следствие того, что 53 зелёных теста в своё время пропустили болид, ехавший в километре от трассы.
- Тип-аннотации везде; комментарий — только про **почему**.
- Репо публичный: ни токенов, ни адресов.
- Коммиты от `Stanislav Shupilkin <smolevich90@gmail.com>`, без `Co-Authored-By`.

---

### Task 1: Отбойники становятся твёрдыми

**Files:**
- Modify: `src/physics/vehicle.ts`
- Test: `src/physics/collision.test.ts`

**Interfaces:**
- Consumes: `buildEdges` из `src/track/geometry.ts`, тип `Track`
- Produces:
  - `Vehicle` принимает необязательный `track` и строит коллайдеры отбойников
  - `constructor(aero?: AeroSetup, start?: VehicleStart, track?: Track)`

Самый важный пункт: без него всё остальное косметика.

- [ ] **Step 1: Написать падающие тесты**

`src/physics/collision.test.ts`:
```ts
import { beforeAll, expect, test } from 'vitest'
import { readFileSync } from 'node:fs'
import RAPIER from '@dimforge/rapier3d-compat'
import { Vehicle, type CarInput } from './vehicle'
import { FIXED_STEP } from './world'
import { startPose } from '../track/geometry'
import type { Track } from '../track/schema'

beforeAll(async () => { await RAPIER.init() })
const track: Track = JSON.parse(readFileSync('public/tracks/monza.json', 'utf8'))

const drive = (v: Vehicle, input: CarInput, seconds: number): void => {
  for (let i = 0; i < seconds / FIXED_STEP; i++) v.step(input, FIXED_STEP)
}

test('болид не улетает в поле сквозь отбойник', () => {
  const v = new Vehicle(undefined, startPose(track), track)
  // полный газ с полным рулём — гарантированный вылет с трассы
  drive(v, { throttle: 1, brake: 0, steer: 1, gear: 0, drs: false }, 12)
  const p = v.telemetry().position

  // расстояние до ближайшей точки осевой: за отбойником оно больше
  // полуширины плюс отступ отбойника плюс запас
  let nearest = Infinity
  for (const c of track.centerline) {
    nearest = Math.min(nearest, Math.hypot(p.x - c.x, p.z - c.z))
  }
  expect(nearest).toBeLessThan(30)
})

test('без трассы болид ведёт себя как раньше', () => {
  const v = new Vehicle()
  drive(v, { throttle: 1, brake: 0, steer: 0, gear: 0, drs: false }, 5)
  expect(v.telemetry().speedMs).toBeGreaterThan(10)
})

test('удар в отбойник гасит скорость', () => {
  const v = new Vehicle(undefined, startPose(track), track)
  drive(v, { throttle: 1, brake: 0, steer: 0, gear: 0, drs: false }, 4)
  const before = v.telemetry().speedMs
  drive(v, { throttle: 1, brake: 0, steer: 1, gear: 0, drs: false }, 10)
  expect(v.telemetry().speedMs).toBeLessThan(before)
})
```

- [ ] **Step 2: Запустить, убедиться что падают**

Run: `npx vitest run src/physics/collision.test.ts`
Expected: FAIL — сейчас болид уезжает в поле, `nearest` будет заметно больше 30 м

- [ ] **Step 3: Реализация**

В `src/physics/vehicle.ts` добавить построение коллайдеров. Импорт `buildEdges` и типа `Track` вверху файла:

```ts
import { buildEdges } from '../track/geometry'
import type { Track, TrackPoint } from '../track/schema'
```

Константы рядом с остальными:
```ts
// Отступ и высота повторяют отрисовку в trackside.ts: физическая стенка должна
// стоять там же, где нарисованная, иначе болид упирается в воздух или проезжает
// сквозь железо.
const BARRIER_OFFSET_M = 6
const BARRIER_HEIGHT_M = 1.4
const BARRIER_THICKNESS_M = 0.3
```

В конструкторе после земли:
```ts
    if (track) this.buildBarrierColliders(track)
```

Метод:
```ts
  /**
   * Стенка вдоль каждой стороны трассы: по кубоиду на сегмент. Статические
   * коллайдеры Rapier дёшевы, а альтернатива — trimesh на всю трассу — хуже
   * ловит скользящие удары под малым углом.
   */
  private buildBarrierColliders(track: Track): void {
    const { left, right } = buildEdges(track)
    const cl = track.centerline
    const n = cl.length

    for (const edge of [left, right]) {
      for (let i = 0; i < n; i++) {
        const j = (i + 1) % n
        const a = outward(edge[i], cl[i], BARRIER_OFFSET_M)
        const b = outward(edge[j], cl[j], BARRIER_OFFSET_M)
        const length = Math.hypot(b.x - a.x, b.z - a.z)
        if (length < 0.01) continue

        const body = this.world.createRigidBody(
          RAPIER.RigidBodyDesc.fixed().setTranslation(
            (a.x + b.x) / 2,
            BARRIER_HEIGHT_M / 2,
            (a.z + b.z) / 2,
          ).setRotation(yawQuaternion(Math.atan2(b.x - a.x, b.z - a.z))),
        )
        this.world.createCollider(
          RAPIER.ColliderDesc.cuboid(BARRIER_THICKNESS_M / 2, BARRIER_HEIGHT_M / 2, length / 2)
            .setRestitution(0.1)
            .setFriction(0.4),
          body,
        )
      }
    }
  }
```

Вспомогательная функция рядом с `rotate`/`clamp`:
```ts
function outward(from: TrackPoint, centre: TrackPoint, meters: number): TrackPoint {
  const dx = from.x - centre.x
  const dz = from.z - centre.z
  const d = Math.hypot(dx, dz) || 1
  return { x: from.x + (dx / d) * meters, y: from.y, z: from.z + (dz / d) * meters }
}
```

Отскок маленький (0.1): реальный отбойник гасит удар, а не отправляет болид обратно на трассу как мячик.

- [ ] **Step 4: Передать трассу в main.ts**

Все три места создания `Vehicle` (стартовое и в `reset`) получают трассу:
```ts
  const makeVehicle = (): Vehicle => new Vehicle(undefined, startPose(track), track)
```

- [ ] **Step 5: Запустить тесты**

Run: `npx vitest run src/physics/collision.test.ts && npm test`
Expected: PASS, и все прежние 135 тестов зелёные

- [ ] **Step 6: Проверить в браузере**

Разогнаться и намеренно въехать в отбойник.
Expected: болид останавливается у стены, а не уезжает в поле. Записать, что видно.

- [ ] **Step 7: Коммит**

```bash
git add -A
git commit -m "feat: отбойники останавливают болид, а не пропускают в поле"
```

---

### Task 2: Отзывчивый руль с настройкой

**Files:**
- Modify: `src/input/keyboard.ts`
- Test: `src/input/keyboard.test.ts`

**Interfaces:**
- Produces:
  - `steerTowards(current: number, target: number, dt: number, rate: number): number` — чистая
  - `KeyboardInput.sensitivity: number` — множитель скорости руля, по умолчанию 1

Сейчас руль идёт до упора 0.29 с. На 200 км/ч это 16 метров — больше ширины трассы, поэтому машина «не слушается».

- [ ] **Step 1: Написать падающие тесты**

`src/input/keyboard.test.ts`:
```ts
import { expect, test } from 'vitest'
import { STEER_RATE, STEER_RETURN, steerTowards } from './keyboard'

test('руль доходит до упора примерно за 0.15 с', () => {
  let steer = 0
  let t = 0
  while (steer < 0.999 && t < 1) {
    steer = steerTowards(steer, 1, 1 / 120, STEER_RATE)
    t += 1 / 120
  }
  expect(t).toBeGreaterThan(0.10)
  expect(t).toBeLessThan(0.20)
})

test('руль возвращается в ноль быстрее, чем набирается', () => {
  expect(STEER_RETURN).toBeGreaterThan(STEER_RATE)
})

test('руль не перескакивает цель', () => {
  expect(steerTowards(0.99, 1, 1 / 120, 100)).toBeLessThanOrEqual(1)
  expect(steerTowards(-0.99, -1, 1 / 120, 100)).toBeGreaterThanOrEqual(-1)
})

test('при нулевой цели руль идёт к нулю', () => {
  expect(steerTowards(0.5, 0, 1 / 120, 5)).toBeLessThan(0.5)
  expect(steerTowards(-0.5, 0, 1 / 120, 5)).toBeGreaterThan(-0.5)
})

test('чувствительность ускоряет набор руля', () => {
  const slow = steerTowards(0, 1, 1 / 120, STEER_RATE)
  const fast = steerTowards(0, 1, 1 / 120, STEER_RATE * 2)
  expect(fast).toBeGreaterThan(slow)
})
```

- [ ] **Step 2: Запустить, убедиться что падают**

Run: `npx vitest run src/input/keyboard.test.ts`
Expected: FAIL — `steerTowards` не экспортируется, и при текущем 3.5 первый тест даёт 0.29 с

- [ ] **Step 3: Реализация**

В `src/input/keyboard.ts`:
```ts
// 7.0 даёт полный поворот за 0.14 с. Прежние 3.5 — это 0.29 с, а на 200 км/ч
// болид за это время проезжает 16 м, больше ширины трассы: руль ощущался
// ватным, машина «не слушалась».
export const STEER_RATE = 7.0
// Возврат быстрее набора: отпустил клавишу — машина сразу распрямляется,
// иначе в связке поворотов руль остаётся вывернутым.
export const STEER_RETURN = 9.0

/** Плавное движение руля к цели без перескока. */
export function steerTowards(current: number, target: number, dt: number, rate: number): number {
  const step = rate * dt
  const delta = target - current
  if (Math.abs(delta) <= step) return target
  return current + Math.sign(delta) * step
}
```

Класс использует новую функцию и множитель чувствительности:
```ts
  /** Множитель скорости руля: игрок подстраивает под себя. */
  sensitivity = 1

  read(dt: number): CarInput {
    const left = KEYS.left.some((k) => this.pressed.has(k))
    const right = KEYS.right.some((k) => this.pressed.has(k))
    const target = (right ? 1 : 0) - (left ? 1 : 0)

    if (this.smoothing) {
      const rate = (target === 0 ? STEER_RETURN : STEER_RATE) * this.sensitivity
      this.steer = steerTowards(this.steer, target, dt, rate)
    } else {
      this.steer = target
    }
    ...
```

- [ ] **Step 4: Тесты и живая проверка**

Run: `npx vitest run src/input/ && npm test`
Затем в браузере: пройти шикану, оценить отзывчивость.
Expected: машина слушается заметно быстрее, но не дёргается.

- [ ] **Step 5: Коммит**

```bash
git add -A
git commit -m "feat: руль вдвое отзывчивее, вынесен в чистую функцию"
```

---

### Task 3: Миникарта и подсветка поворотов

**Files:**
- Create: `src/render/minimap.ts`
- Modify: `src/main.ts`
- Test: `src/render/minimap.test.ts`

**Interfaces:**
- Produces:
  - `projectTrack(track: Track, size: number): { points: [number, number][]; scale: number }` — чистая
  - `class Minimap` с `update(position: TrackPoint, headingRad: number): void`

Ехать вслепую — половина ощущения «неуправляемо»: за поворотом не видно, что дальше.

- [ ] **Step 1: Написать падающие тесты**

`src/render/minimap.test.ts`:
```ts
import { expect, test } from 'vitest'
import { readFileSync } from 'node:fs'
import { projectTrack } from './minimap'
import type { Track } from '../track/schema'

const track: Track = JSON.parse(readFileSync('public/tracks/monza.json', 'utf8'))

test('проекция даёт точку на каждый узел', () => {
  expect(projectTrack(track, 200).points.length).toBe(track.centerline.length)
})

test('все точки помещаются в заданный размер', () => {
  const { points } = projectTrack(track, 200)
  for (const [x, y] of points) {
    expect(x).toBeGreaterThanOrEqual(0)
    expect(x).toBeLessThanOrEqual(200)
    expect(y).toBeGreaterThanOrEqual(0)
    expect(y).toBeLessThanOrEqual(200)
  }
})

test('пропорции трассы сохраняются', () => {
  const { points } = projectTrack(track, 200)
  const xs = points.map((p) => p[0])
  const ys = points.map((p) => p[1])
  const w = Math.max(...xs) - Math.min(...xs)
  const h = Math.max(...ys) - Math.min(...ys)
  // Монца вытянута: 1257 x 2171 м, значит по высоте карта заполнена сильнее
  expect(h).toBeGreaterThan(w)
})

test('карта заполняет отведённое место хотя бы наполовину', () => {
  const { points } = projectTrack(track, 200)
  const ys = points.map((p) => p[1])
  expect(Math.max(...ys) - Math.min(...ys)).toBeGreaterThan(100)
})
```

- [ ] **Step 2: Запустить, убедиться что падают**

Run: `npx vitest run src/render/minimap.test.ts`
Expected: FAIL — модуль не найден

- [ ] **Step 3: Реализация**

`src/render/minimap.ts`:
```ts
import type { Track, TrackPoint } from '../track/schema'

const PADDING = 10

/**
 * Осевая линия в координаты канваса. Масштаб общий по обеим осям, иначе трасса
 * растянется и перестанет быть узнаваемой: Монца вытянута 1257 на 2171 м.
 */
export function projectTrack(
  track: Track, size: number,
): { points: [number, number][]; scale: number } {
  const xs = track.centerline.map((p) => p.x)
  const zs = track.centerline.map((p) => p.z)
  const minX = Math.min(...xs), maxX = Math.max(...xs)
  const minZ = Math.min(...zs), maxZ = Math.max(...zs)
  const usable = size - PADDING * 2
  const scale = Math.min(usable / (maxX - minX), usable / (maxZ - minZ))

  const offsetX = PADDING + (usable - (maxX - minX) * scale) / 2
  const offsetY = PADDING + (usable - (maxZ - minZ) * scale) / 2

  return {
    points: track.centerline.map((p) => [
      offsetX + (p.x - minX) * scale,
      offsetY + (p.z - minZ) * scale,
    ]),
    scale,
  }
}

const SIZE = 190

export class Minimap {
  private canvas: HTMLCanvasElement
  private ctx: CanvasRenderingContext2D
  private points: [number, number][]
  private origin: { minX: number; minZ: number }
  private scale: number
  private offset: { x: number; y: number }

  constructor(private track: Track, parent: HTMLElement = document.body) {
    const projected = projectTrack(track, SIZE)
    this.points = projected.points
    this.scale = projected.scale

    const xs = track.centerline.map((p) => p.x)
    const zs = track.centerline.map((p) => p.z)
    this.origin = { minX: Math.min(...xs), minZ: Math.min(...zs) }
    this.offset = { x: this.points[0][0] - (track.centerline[0].x - this.origin.minX) * this.scale,
                    y: this.points[0][1] - (track.centerline[0].z - this.origin.minZ) * this.scale }

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
    ctx.clearRect(0, 0, SIZE, SIZE)

    ctx.strokeStyle = 'rgba(255,255,255,.75)'
    ctx.lineWidth = 2.5
    ctx.beginPath()
    this.points.forEach(([x, y], i) => (i === 0 ? ctx.moveTo(x, y) : ctx.lineTo(x, y)))
    ctx.closePath()
    ctx.stroke()

    const px = this.offset.x + (position.x - this.origin.minX) * this.scale
    const py = this.offset.y + (position.z - this.origin.minZ) * this.scale

    // Треугольник вместо точки: видно не только где болид, но и куда смотрит.
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
```

- [ ] **Step 4: Подключить в main.ts**

```ts
  const minimap = new Minimap(track)
```
и в кадре рядом с обновлением HUD:
```ts
    minimap.update(telemetry.position, heading)
```

- [ ] **Step 5: Тесты и браузер**

Run: `npm test && npx tsc -b && npm run build`
Expected: в правом нижнем углу контур Монцы, синий треугольник едет по нему и поворачивается.

- [ ] **Step 6: Коммит**

```bash
git add -A
git commit -m "feat: миникарта с положением и курсом болида"
```

---

### Task 4: Живая проверка управляемости и калибровка

**Files:**
- Возможные правки в `src/input/keyboard.ts` (только константы)

Задача не пишет новый код, а проверяет, стало ли реально лучше — и чинит по результатам.

- [ ] **Step 1: Сценарий живой езды в браузере**

Написать скрипт Playwright, который проезжает первую шикану Монцы человеческими действиями: разгон, торможение, поворот, выход. Записать:
- удалось ли пройти поворот, не вылетев
- сколько раз болид развернуло
- финальную скорость и время

- [ ] **Step 2: Прогнать на трёх настройках руля**

`STEER_RATE` 5.0, 7.0, 9.0 — для каждой прогнать сценарий и записать результат. Выбрать ту, где поворот проходится увереннее всего, и оставить её.

- [ ] **Step 3: Проверить столкновения**

Намеренно въехать в отбойник на 150+ км/ч. Ожидается: болид останавливается или скользит вдоль стены, не проваливается сквозь и не улетает в поле.

- [ ] **Step 4: Записать вывод**

В отчёт: что стало лучше, что осталось плохо, какие числа. Если после всех правок игра всё ещё неуправляема — сказать это прямо с цифрами, а не подгонять формулировку.

- [ ] **Step 5: Коммит, если константы менялись**

---

### Task 5: Деплой

- [ ] **Step 1:** `npm test && npx tsc -b && npm run build && cd api && uv run pytest -q`
- [ ] **Step 2:** скан на секреты
- [ ] **Step 3:** `git push && gh run watch -R Smolevich/f1-sim` (GitHub периодически отдаёт 429/503 — лечится повтором)
- [ ] **Step 4:** проверить на `https://games.smolevich.com`: въехать в отбойник, пройти шикану, посмотреть миникарту
- [ ] **Step 5:** скриншоты

## Что дальше

- Этап 6: остальные пять трасс
- Этап 7: сетап и ассисты (TC, ABS, автокоробка), геймпад и руль
- Этап 9: гонка с пит-стопами
- Долги: точный `simRecord`, фиолетовые секторы, посекторная дельта

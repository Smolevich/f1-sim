# F1 Sim — реальная модель болида, режим попыток, пауза

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Заменить самодельный болид на настоящую 3D-модель и превратить бесконечное катание в заезд с попытками, финишем и паузой.

**Повод.** Пользователь: «болид говно полное, он вообще не реалистичен, я просил уходить от болида как в minecraft», «я должен видеть реальный болид», «трасса не фиксирует мой лучший круг, просто сбрасывая каждый раз, нет паузы и нет финиша как такового — например даётся 3 попытки на лучший круг».

Проверено:
- Болид собран из **23 примитивов** (7 коробок, 6 цилиндров, 2 сферы, 2 капсулы, тор, экструзия). Попытка «скруглить» дала разрозненные пузыри вместо силуэта. Дальше лепить из примитивов бессмысленно — нужна модель.
- Механика круга работает (проверено: замыкается за 146.5 с, валиден). Круг «не фиксируется», потому что игрок не доезжает: вылетает, жмёт `R`, круг помечен срезкой и в рекорд не идёт.
- Паузы нет вообще. Финиша нет: заезд бесконечный.

**Модель уже скачана и лежит в репозитории:** `public/models/chassis-draco.glb` (42 КБ), `public/models/wheel-draco.glb` (4.8 КБ) из [pmndrs/racing-game](https://github.com/pmndrs/racing-game) — MIT-репозиторий, декларирующий только CC0-ассеты. Лицензия описана в `docs/assets.md`. Файлы сжаты Draco, нужен `DRACOLoader`.

## Global Constraints

- **Физику не трогать.** `src/physics/**`, `src/track/**` — только чтение. Модель влияет исключительно на рендер.
- Всё существующее должно продолжать работать: таймер, секторы, призрак, HUD, leaderboard, камеры, миникарта, отбойники, панель клавиш, возврат по `R`.
- Полный набор перед каждым коммитом: 164 vitest + 26 pytest.
- Никаких новых внешних загрузок в рантайме: модели уже в `public/`.
- Тип-аннотации везде; комментарий — только про **почему**.
- Коммиты от `Stanislav Shupilkin <smolevich90@gmail.com>`, без `Co-Authored-By`.
- Проверка — глазами в браузере. Скриншот болида с T-cam обязателен.

---

### Task 1: Загрузка реальной модели болида

**Files:**
- Create: `src/render/car-model.ts`
- Modify: `src/render/car.ts`, `src/main.ts`
- Test: `src/render/car-model.test.ts`

**Interfaces:**
- Produces:
  - `loadCarModel(): Promise<CarParts>` — грузит glb, возвращает те же `CarParts`, что сейчас отдаёт `buildCarParts`
  - `fitToWheelbase(group: THREE.Group, wheelbaseM: number): number` — чистая функция масштаба

Ключ: модель приходит в своих единицах, её надо привести к колёсной базе 3.6 м, иначе болид будет размером с автобус или с игрушку.

- [ ] **Step 1: Написать падающие тесты**

`src/render/car-model.test.ts` — тестируется только чистая математика подгонки, без three.js-загрузчика:
```ts
import { expect, test } from 'vitest'
import { scaleForWheelbase } from './car-model'

test('модель уменьшается, если её база больше целевой', () => {
  expect(scaleForWheelbase(7.2, 3.6)).toBeCloseTo(0.5, 3)
})

test('модель увеличивается, если её база меньше целевой', () => {
  expect(scaleForWheelbase(1.8, 3.6)).toBeCloseTo(2, 3)
})

test('совпадающая база даёт единичный масштаб', () => {
  expect(scaleForWheelbase(3.6, 3.6)).toBeCloseTo(1, 6)
})

test('нулевая или отрицательная база не роняет расчёт', () => {
  expect(scaleForWheelbase(0, 3.6)).toBe(1)
  expect(scaleForWheelbase(-2, 3.6)).toBe(1)
})
```

- [ ] **Step 2: Запустить, убедиться что падают**

Run: `npx vitest run src/render/car-model.test.ts`
Expected: FAIL — модуль не найден

- [ ] **Step 3: Реализация**

`src/render/car-model.ts`:
- `GLTFLoader` + `DRACOLoader` (декодер брать из `three/examples/jsm/libs/draco/`, положить в `public/draco/` если понадобится — проверить, работает ли встроенный путь)
- грузить `chassis-draco.glb` и `wheel-draco.glb`
- четыре колеса клонировать из одной модели и расставить по `WHEEL_OFFSETS`-подобным координатам
- каждое колесо в собственном пивоте: пивот рулит, колесо вращается (как в текущем `buildCarParts`)
- `scaleForWheelbase(modelWheelbase, targetWheelbase)` — чистая, экспортируемая
- вернуть `CarParts` того же вида, что и раньше: `{ group, wheels, steered }`

```ts
export function scaleForWheelbase(modelM: number, targetM: number): number {
  return modelM > 0 ? targetM / modelM : 1
}
```

- [ ] **Step 4: Подключить в main.ts с запасным вариантом**

Загрузка асинхронная и может не удаться (битый файл, отсутствующий декодер). Тогда игра обязана продолжить работать на старом процедурном болиде, а не показать пустой экран:
```ts
  let carParts: CarParts
  try {
    carParts = await loadCarModel()
  } catch {
    // Не удалось — едем на процедурной модели: пустой экран хуже грубого болида.
    carParts = buildCarParts()
  }
```

- [ ] **Step 5: Призрак**

`ghost-car.ts` клонирует материалы для полупрозрачности — проверить, что он работает и с загруженной моделью. Если `clone()` на glTF-материалах ведёт себя иначе, поправить там же.

- [ ] **Step 6: Проверка в браузере**

Скриншот с T-cam и с внешней камеры. Требование: болид узнаётся как гоночная машина, не разваливается на части, колёса на месте и вращаются.
Замерить размер бандла до и после — модели 47 КБ, это допустимо.

- [ ] **Step 7: Коммит**

```bash
git add -A
git commit -m "feat: реальная модель болида вместо примитивов"
```

---

### Task 2: Заезд с попытками, финишем и паузой

**Files:**
- Create: `src/session/session.ts`
- Modify: `src/main.ts`, `src/render/hud.ts`
- Test: `src/session/session.test.ts`

**Interfaces:**
- Produces:
  - `type SessionState = { attemptsLeft: number; bestMs: number | null; finished: boolean; paused: boolean }`
  - `const TOTAL_ATTEMPTS: number` (3)
  - `createSession(): SessionState`
  - `completeAttempt(state, lap): SessionState` — учитывает круг, тратит попытку
  - `spendAttempt(state): SessionState` — для сброса по `T`
  - `continueBeyond(state): SessionState` — «продолжить после финиша»
  - `togglePause(state): SessionState`

Три попытки на лучший круг, потом финиш с итогом и предложением продолжить.

- [ ] **Step 1: Написать падающие тесты**

`src/session/session.test.ts`:
```ts
import { expect, test } from 'vitest'
import {
  completeAttempt, continueBeyond, createSession, spendAttempt, togglePause,
  TOTAL_ATTEMPTS,
} from './session'

const lap = (timeMs: number, valid = true) => ({ timeMs, sectors: [0, 0, 0] as [number, number, number], valid })

test('заезд начинается с трёх попыток', () => {
  expect(createSession().attemptsLeft).toBe(TOTAL_ATTEMPTS)
  expect(TOTAL_ATTEMPTS).toBe(3)
})

test('валидный круг тратит попытку и запоминается как лучший', () => {
  const s = completeAttempt(createSession(), lap(90_000))
  expect(s.attemptsLeft).toBe(2)
  expect(s.bestMs).toBe(90_000)
})

test('лучший круг обновляется только при улучшении', () => {
  let s = completeAttempt(createSession(), lap(90_000))
  s = completeAttempt(s, lap(95_000))
  expect(s.bestMs).toBe(90_000)
  s = completeAttempt(s, lap(85_000))
  expect(s.bestMs).toBe(85_000)
})

test('невалидный круг тратит попытку, но не идёт в рекорд', () => {
  const s = completeAttempt(createSession(), lap(80_000, false))
  expect(s.attemptsLeft).toBe(2)
  expect(s.bestMs).toBeNull()
})

test('после трёх попыток заезд завершён', () => {
  let s = createSession()
  for (let i = 0; i < 3; i++) s = completeAttempt(s, lap(90_000 + i))
  expect(s.finished).toBe(true)
  expect(s.attemptsLeft).toBe(0)
})

test('попытки не уходят в минус', () => {
  let s = createSession()
  for (let i = 0; i < 6; i++) s = completeAttempt(s, lap(90_000))
  expect(s.attemptsLeft).toBe(0)
})

test('можно продолжить после финиша, лучший круг сохраняется', () => {
  let s = createSession()
  for (let i = 0; i < 3; i++) s = completeAttempt(s, lap(90_000))
  const after = continueBeyond(s)
  expect(after.finished).toBe(false)
  expect(after.bestMs).toBe(90_000)
  expect(after.attemptsLeft).toBeGreaterThan(0)
})

test('сброс круга тратит попытку', () => {
  expect(spendAttempt(createSession()).attemptsLeft).toBe(2)
})

test('пауза переключается', () => {
  const s = togglePause(createSession())
  expect(s.paused).toBe(true)
  expect(togglePause(s).paused).toBe(false)
})
```

- [ ] **Step 2: Запустить, убедиться что падают**

Run: `npx vitest run src/session/session.test.ts`
Expected: FAIL — модуль не найден

- [ ] **Step 3: Реализация**

`src/session/session.ts` — чистые функции, без DOM и three.js. `LapResult` импортировать из `src/timing/laptimer.ts`.

- [ ] **Step 4: Пауза в игровом цикле**

В `main.ts`: клавиша `P` переключает пузу. На паузе **физика не шагает и таймер не идёт**, но кадр рисуется — иначе экран замрёт и будет похож на зависание. Показать оверлей «ПАУЗА».

Важно: на паузе не накапливать `sessionMs`, иначе круг «проедет» время простоя.

- [ ] **Step 5: Экран финиша**

Оверлей после третьей попытки: лучший круг, сколько попыток использовано, кнопки «продолжить» (`Enter`) и «заново» (`T`). Пока открыт — физика на паузе.

- [ ] **Step 6: Попытки в HUD**

Добавить в `HudModel` поле `attemptsLeft: number` и строку вида `ПОПЫТКА 2/3`. Обновить существующие тесты `renderHudText` под новое поле, не ослабляя их.

- [ ] **Step 7: Проверка в браузере**

Проехать: убедиться, что `P` ставит паузу, таймер стоит, `R` возвращает на трассу без потери круга, а после трёх кругов появляется финиш.

- [ ] **Step 8: Коммит**

```bash
git add -A
git commit -m "feat: три попытки, финиш с итогом, пауза"
```

---

### Task 3: Деплой

- [ ] **Step 1:** `npm test && npx tsc -b && npm run build && cd api && uv run pytest -q`
- [ ] **Step 2:** скан на секреты
- [ ] **Step 3:** `git push && gh run watch -R Smolevich/f1-sim`
- [ ] **Step 4:** на `https://games.smolevich.com` проверить модель, паузу, попытки и финиш; скриншоты

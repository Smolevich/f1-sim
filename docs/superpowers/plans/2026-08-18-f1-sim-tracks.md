# F1 Sim — пять трасс, выбор на старте, рекорд круга

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Добавить пять трасс с выбором на старте и показать рекорд круга на экране.

**Повод.** Пользователь: «стоит добавить остальные трассы тоже в план, чтобы я мог выбирать на старте», «я хочу, чтобы у меня на этой гонке рекорд по времени, по проезду круга, он был виден».

**Что уже готово и переиспользуется:** пайплайн `scripts/build-track.ts` собирает трассу из OpenStreetMap, сшивает участки в замкнутый контур и проверяет длину против официальной с допуском 2%. На Монце даёт 5792 м против 5793 официальных. Схема `Track`, валидация, тайминг, секторы, отбойники, поребрики — всё работает от JSON и не требует правок под новую трассу.

## Global Constraints

- **Физику не трогать.** `src/physics/**` только чтение. Выверено по регламенту FIA: 0-100 за 2.47 с, максималка 317 км/ч, торможение 5.8 g.
- `scripts/build-track.ts` менять можно только в части конфигурации трасс (`CIRCUITS`), логику сшивки не переписывать — она отлажена.
- Всё существующее продолжает работать: призрак, leaderboard, попытки, пауза, камеры, миникарта, возврат по R.
- Полный набор перед каждым коммитом: 224 vitest + 26 pytest.
- Overpass API троттлит при частых запросах и отвечает HTML вместо JSON. Это не ошибка кода: пауза 3-5 с между запросами и повтор при HTML-ответе.
- Тип-аннотации везде; комментарий — только про **почему**.
- Коммиты от `Stanislav Shupilkin <smolevich90@gmail.com>`, без `Co-Authored-By`.

---

### Task 1: Пять трасс из OpenStreetMap

**Files:**
- Modify: `scripts/build-track.ts`
- Create: `public/tracks/spa.json`, `monaco.json`, `silverstone.json`, `suzuka.json`, `interlagos.json`
- Test: `src/track/tracks.test.ts`

Реальные данные для конфигурации (длина и рекорд круга — официальные):

| id | Название | Длина | Рекорд круга | Автор рекорда |
|---|---|---|---|---|
| `spa` | Circuit de Spa-Francorchamps | 7004 м | 1:46.286 | Боттас, 2018 |
| `monaco` | Circuit de Monaco | 3337 м | 1:12.909 | Хэмилтон, 2021 |
| `silverstone` | Silverstone Circuit | 5891 м | 1:27.097 | Ферстаппен, 2020 |
| `suzuka` | Suzuka International Racing Course | 5807 м | 1:30.983 | Хэмилтон, 2019 |
| `interlagos` | Autódromo José Carlos Pace | 4309 м | 1:10.540 | Ферстаппен, 2018 |

- [ ] **Step 1: Найти OSM-relation каждой трассы**

Искать по ограничивающей рамке, а не по имени: имена в OSM непоследовательны. Рамки:
- Спа: `50.42,5.94,50.46,5.99`
- Монако: `43.72,7.41,43.75,7.44`
- Сильверстоун: `52.06,-1.04,52.09,-1.00`
- Сузука: `34.83,136.52,34.86,136.55`
- Интерлагос: `-23.71,-46.71,-23.69,-46.68`

Запрос вида:
```
[out:json][timeout:50];
(way["highway"="raceway"](BBOX);rel["highway"="raceway"](BBOX););
out ids tags;
```
Если трасса размечена как relation с `type=circuit` — брать его id. Если только ways — собрать их список и научить скрипт работать со списком ways, а не с relation.

**Пауза 4 с между запросами.** При HTML-ответе ждать 30 с и повторять.

- [ ] **Step 2: Прогнать сборку каждой трассы**

`npx tsx scripts/build-track.ts <id>` для каждой. Валидатор длины уже встроен: расхождение больше 2% — трасса собрана неверно, и это надо чинить, а не ослаблять допуск.

Записать в отчёт для каждой: число точек, измеренную длину, расхождение с официальной.

- [ ] **Step 3: Написать тесты**

`src/track/tracks.test.ts` — по одному тесту на трассу:
```ts
import { expect, test } from 'vitest'
import { readFileSync } from 'node:fs'
import { centerlineLength, validateTrack, type Track } from './schema'

const TRACKS = ['monza', 'spa', 'monaco', 'silverstone', 'suzuka', 'interlagos']

for (const id of TRACKS) {
  test(`трасса ${id} валидна и совпадает с официальной длиной`, () => {
    const track: Track = JSON.parse(readFileSync(`public/tracks/${id}.json`, 'utf8'))
    expect(validateTrack(track)).toEqual([])
    const measured = centerlineLength(track.centerline)
    const deviation = Math.abs(measured - track.meta.officialLengthM) / track.meta.officialLengthM
    expect(deviation).toBeLessThan(0.02)
  })
}

test('у каждой трассы свой рекорд и название', () => {
  const seen = new Set<string>()
  for (const id of TRACKS) {
    const t: Track = JSON.parse(readFileSync(`public/tracks/${id}.json`, 'utf8'))
    expect(t.meta.name.length).toBeGreaterThan(3)
    expect(t.meta.realRecord.timeMs).toBeGreaterThan(60_000)
    expect(seen.has(t.meta.name)).toBe(false)
    seen.add(t.meta.name)
  }
})
```

- [ ] **Step 4: Коммит**

```bash
git add -A
git commit -m "feat: пять трасс из OpenStreetMap"
```

---

### Task 2: Выбор трассы на старте

**Files:**
- Modify: `src/render/menu.ts`, `src/main.ts`
- Create: `src/track/catalogue.ts`
- Test: `src/track/catalogue.test.ts`

**Interfaces:**
- Produces:
  - `type TrackEntry = { id: string; name: string; lengthM: number; recordMs: number }`
  - `const TRACK_CATALOGUE: TrackEntry[]`
  - `askStart(existingName: string | null): Promise<{ name: string; trackId: string }>` — меню возвращает и имя, и трассу

- [ ] **Step 1: Написать падающие тесты**

`src/track/catalogue.test.ts`:
```ts
import { expect, test } from 'vitest'
import { TRACK_CATALOGUE } from './catalogue'

test('в каталоге шесть трасс', () => {
  expect(TRACK_CATALOGUE).toHaveLength(6)
})

test('идентификаторы уникальны', () => {
  const ids = TRACK_CATALOGUE.map((t) => t.id)
  expect(new Set(ids).size).toBe(ids.length)
})

test('у каждой трассы есть рекорд и длина', () => {
  for (const t of TRACK_CATALOGUE) {
    expect(t.recordMs).toBeGreaterThan(60_000)
    expect(t.lengthM).toBeGreaterThan(3000)
  }
})

test('Монако короче Спа', () => {
  const monaco = TRACK_CATALOGUE.find((t) => t.id === 'monaco')!
  const spa = TRACK_CATALOGUE.find((t) => t.id === 'spa')!
  expect(monaco.lengthM).toBeLessThan(spa.lengthM)
})
```

- [ ] **Step 2: Реализация**

Каталог — чистые данные, без загрузки JSON: он нужен меню до того, как трасса выбрана.

Меню получает выпадающий список трасс: название, длина, рекорд круга. Выбранный `trackId` сохраняется в localStorage и подставляется при следующем запуске.

`main.ts` грузит `/tracks/${trackId}.json` вместо жёстко зашитой Монцы. Личный рекорд, призрак и leaderboard уже разделены по `track.meta.id` — проверить, что это так, и ничего не смешивается между трассами.

- [ ] **Step 3: Проверка в браузере**

Выбрать Спа, проехать, вернуться в меню (`T`), выбрать Монако — убедиться, что грузится другая трасса и рекорды не перепутались.

- [ ] **Step 4: Коммит**

```bash
git add -A
git commit -m "feat: выбор трассы на старте"
```

---

### Task 3: Рекорд круга на экране

**Files:**
- Modify: `src/render/hud.ts`, `src/main.ts`
- Test: `src/render/hud.test.ts`

Пользователь: «хочу, чтобы рекорд по времени проезда круга был виден».

Показывать две вещи: **реальный рекорд трассы** (из `track.meta.realRecord` — например, Баррикелло 1:21.046 в Монце) и **свой лучший круг**. Разница между ними — это и есть цель заезда.

- [ ] **Step 1: Написать падающие тесты**

Добавить в `src/render/hud.test.ts`:
```ts
test('рекорд трассы виден с именем автора', () => {
  const t = renderHudText(model({ recordMs: 81_046, recordDriver: 'Barrichello' }))
  expect(t.recordLine).toContain('1:21.046')
  expect(t.recordLine).toContain('Barrichello')
})

test('без личного результата показывается только рекорд трассы', () => {
  const t = renderHudText(model({ bestMs: null, recordMs: 81_046, recordDriver: 'X' }))
  expect(t.recordLine).toContain('1:21.046')
})

test('отставание от рекорда трассы считается по личному лучшему', () => {
  const t = renderHudText(model({ bestMs: 95_000, recordMs: 81_046, recordDriver: 'X' }))
  expect(t.recordLine).toContain('+13.954')
})
```

- [ ] **Step 2: Реализация**

`HudModel` получает `recordMs: number` и `recordDriver: string`, `HudText` — `recordLine`. Формат:
`РЕКОРД 1:21.046 Barrichello` и, если есть личный лучший, `+13.954` к нему.

- [ ] **Step 3: Проверка и коммит**

```bash
git add -A
git commit -m "feat: рекорд трассы и отставание в HUD"
```

---

### Task 4: Деплой

- [ ] **Step 1:** полный набор — vitest, pytest, tsc, build
- [ ] **Step 2:** скан на секреты
- [ ] **Step 3:** `git push && gh run watch -R Smolevich/f1-sim`
- [ ] **Step 4:** на `https://games.smolevich.com` выбрать каждую из шести трасс, проверить загрузку и рекорд в HUD; скриншоты

## Что дальше

- Модель болида: пользователь пришлёт .glb, встроить и добавить выбор команды с ливреями
- Этап 7: сетап и ассисты, геймпад и руль
- Этап 9: гонка с пит-стопами
- Долг: трибуны теряют ступени дальше 200 м, нужен LOD

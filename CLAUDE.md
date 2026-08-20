# f1-sim

Браузерный симулятор Формулы-1 (three.js + Rapier). Первая версия — квалификация:
один круг на время, призрак, leaderboard топ-5 на трассу.

- Спека: `docs/superpowers/specs/2026-08-17-f1-sim-design.md`
- План: `docs/superpowers/plans/`

## Деплой

`games.smolevich.com` → Cloudflare-туннель `telegram-bot` → nginx :80 на hetzner-bot.
Статика в `/var/www/games`, API — uvicorn на :8096 (8095 занят cat-game).

В корне домена — лендинг с выбором игры (`landing/index.html`), сама игра под
`/f1/` (сборка Vite с `base: '/f1/'`). Новая игра добавляется своим подкаталогом
и плиткой на лендинге; трогать nginx для этого не нужно.

Только через CI (`.github/workflows/deploy.yml`). Руками на сервере не править.

## Правила

Физика и тайминг — чистые функции без three.js и DOM. Шаг физики фиксированный 1/120 с.
Репо публичный: ни токенов, ни адресов сервера в коде.

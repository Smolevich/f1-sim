# f1-sim

Браузерный симулятор Формулы-1 (three.js + Rapier). Первая версия — квалификация:
один круг на время, призрак, leaderboard топ-5 на трассу.

- Спека: `docs/superpowers/specs/2026-08-17-f1-sim-design.md`
- План: `docs/superpowers/plans/`

## Деплой

`games.smolevich.com` → Cloudflare-туннель `telegram-bot` → nginx :80 на hetzner-bot.
Статика в `/var/www/games`, API — uvicorn на :8096 (8095 занят cat-game), корневой `/api/` домена — наш.

В корне домена — лендинг с выбором игры (`landing/index.html`), сама игра под
`/f1/` (сборка Vite с `base: '/f1/'`). «Лунные осколки» (репо cat-game) — под
`/moon-shards/`: статика и сервер у неё свои, а vhost отсюда подключает её location'ы
из `/etc/nginx/games.d/*.conf`, которые кладёт CI cat-game. Новая игра — плитка на
лендинге плюс свой подкаталог или свой файл в `games.d`.

Только через CI (`.github/workflows/deploy.yml`). Руками на сервере не править.

## Правила

Физика и тайминг — чистые функции без three.js и DOM. Шаг физики фиксированный 1/120 с.
Репо публичный: ни токенов, ни адресов сервера в коде.

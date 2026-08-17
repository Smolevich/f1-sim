# f1-sim

Браузерный симулятор Формулы-1 (three.js + Rapier). Первая версия — квалификация:
один круг на время, призрак, leaderboard топ-5 на трассу.

- Спека: `docs/superpowers/specs/2026-08-17-f1-sim-design.md`
- План: `docs/superpowers/plans/`

## Деплой

`games.smolevich.com` → Cloudflare-туннель `telegram-bot` → nginx :80 на hetzner-bot.
Статика в `/var/www/f1-sim`, API — uvicorn на :8096 (8095 занят cat-game).

Только через CI (`.github/workflows/deploy.yml`). Руками на сервере не править.

## Правила

Физика и тайминг — чистые функции без three.js и DOM. Шаг физики фиксированный 1/120 с.
Репо публичный: ни токенов, ни адресов сервера в коде.

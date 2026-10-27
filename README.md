# HoroTube

Школьный «YouTube» с оболочкой HoroOS: видео и шортсы, HoroChat с группами, Почта, Документы, Файлы, статьи в Поиске, Студия кода и HoroStore, игры. Один HTML-файл, сервер — Supabase.

**Сайт:** https://ndsavels-oss.github.io/HoroTube/

## Что где

- `index.html` — готовый сайт (его и открывает GitHub Pages). Руками не правится, собирается из `build/`.
- `build/` — исходники: модули `*.js` и `*.css`, `base/HoroTube.v4.html` (основа), сборка `b.sh` (`assemble4.py` → `assemble5.py`). Номер версии в `build/VERSION`, что нового — в `build/NOTES.txt`.
- `sql/` — серверная часть для Supabase. `all_in_one.sql` = все файлы по порядку, его и запускать в Supabase → SQL Editor (повторный запуск безопасен). `*_rollback.sql` откатывают отдельные части.
- `apps/` — приложения учеников для Студии кода (Бамбузл и др.).
- `tests/smoke.js` — проверка в Chromium и WebKit (движок Safari) на компьютере и iPhone; `tests/mock.js` — поддельный Supabase для неё.

## Как выпустить новую версию

1. Изменить файлы в `build/`, поднять `build/VERSION`, написать `build/NOTES.txt`.
2. `build/b.sh` — пересобирает `index.html` и проверяет синтаксис.
3. Если менялся SQL — запустить `sql/all_in_one.sql` в Supabase **до** выпуска сайта.
4. Закоммитить. GitHub сам прогонит проверку (вкладка Actions) и обновит сайт.

## Проверка у себя

```
npm i --no-save playwright@1.48.2
npx playwright install chromium webkit
node tests/smoke.js
```

## Как применить SQL к базе

Руками в Supabase ничего вставлять не нужно:

1. Один раз: Supabase → **Connect** → вкладка **Session pooler** → скопируй строку `postgresql://postgres.…@…pooler.supabase.com:5432/postgres` и подставь в неё пароль базы вместо `[YOUR-PASSWORD]`. В GitHub: **Settings → Secrets and variables → Actions → New repository secret**, имя `SUPABASE_DB_URL`, значение — эта строка.
2. Каждый раз: **Actions → «Выполнить SQL в базе» → Run workflow**. Сначала режим «Проверить» (всё выполняется и откатывается, база не меняется), потом «Выполнить».

Всё выполняется одной транзакцией: при любой ошибке база остаётся как была. Пароль хранится только в секретах GitHub и в журналах скрыт.

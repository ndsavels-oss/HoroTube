#!/usr/bin/env bash
# Runs one SQL file against the real Supabase database.
# Used by .github/workflows/sql.yml; DB_URL comes from the repository secret.
# MODE=check runs the file inside a transaction and rolls it back.
set -euo pipefail
cd "$(dirname "$0")/.."

FILE="${FILE:-sql/all_in_one.sql}"
MODE="${MODE:-check}"

if [ -z "${DB_URL:-}" ]; then
  echo "::error::Нет секрета SUPABASE_DB_URL. Добавь его: Settings → Secrets and variables → Actions → New repository secret."
  exit 1
fi
if ! [[ "$FILE" =~ ^sql/[A-Za-z0-9_]+\.sql$ ]] || [ ! -f "$FILE" ]; then
  echo "::error::Файл $FILE не найден. Нужно имя вида sql/all_in_one.sql"
  exit 1
fi
case "$FILE" in *_rollback.sql) [ "$MODE" = run ] && echo "::warning::Запускается откат $FILE: он удаляет таблицы и данные этой части.";; esac

export PGSSLMODE="${PGSSLMODE:-require}" PGCONNECT_TIMEOUT=10
if ! cands=$(python3 sql/dburl.py 2>&1); then
  [ "$cands" = nopw ] && { echo "::error::В строке SUPABASE_DB_URL нет пароля: вместо [YOUR-PASSWORD] впиши пароль базы."; exit 1; }
  echo "::error::Строка в SUPABASE_DB_URL не похожа на адрес базы или в ней нет пароля. Нужна строка вида postgresql://postgres:ПАРОЛЬ@…"
  exit 1
fi
ok=; last=
while IFS= read -r u; do
  if out=$(psql "$u" -XAtqc 'select version()' 2>&1); then ok=$u; break; fi
  last=$out
  # the right server answered but refused the password: no point trying other addresses
  case "$out" in *"password authentication failed"*) break;; esac
done <<< "$cands"
if [ -z "$ok" ]; then
  echo "$last" | sed -E 's#postgres(ql)?://[^ ]*#<адрес скрыт>#g'
  case "$last" in
    *"password authentication failed"*) echo "::error::База ответила, но пароль не подошёл. Проверь пароль в секрете SUPABASE_DB_URL.";;
    *) echo "::error::Не удалось подключиться к базе ни по одному адресу.";;
  esac
  exit 1
fi
DB_URL=$ok
echo "Подключился к ${ok##*@}"
echo "База: $out"
echo "Файл: $FILE ($(wc -l < "$FILE") строк, sha256 $(sha256sum "$FILE" | cut -c1-12)), коммит ${GITHUB_SHA:-local}"

tmp=$(mktemp)
{
  echo '\set ON_ERROR_STOP 1'
  echo 'set client_min_messages = warning;'
  echo 'begin;'
  echo "\\i $FILE"
  if [ "$MODE" = run ]; then echo 'commit;'; else echo 'rollback;'; fi
} > "$tmp"
rc=0
psql "$DB_URL" -X -q -f "$tmp" > "$tmp.log" 2>&1 || rc=$?
grep -v 'NOTICE:' "$tmp.log" || true
rm -f "$tmp" "$tmp.log"
if [ "$rc" != 0 ]; then
  echo "::error::SQL остановился с ошибкой (см. строку ERROR выше). Ничего не изменилось: всё откатилось."
  exit 1
fi
if [ "$MODE" = run ]; then
  echo "::notice::Готово: $FILE применён к базе."
else
  echo "::notice::Проверка прошла: $FILE выполнится без ошибок. База не изменилась. Чтобы применить, запусти ещё раз с режимом «Выполнить»."
fi

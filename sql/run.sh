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

export PGSSLMODE="${PGSSLMODE:-require}" PGCONNECT_TIMEOUT=15
if ! out=$(psql "$DB_URL" -XAtqc 'select version()' 2>&1); then
  echo "$out" | sed -E 's#postgres(ql)?://[^ ]*#<адрес скрыт>#g'
  case "$out" in
    *"password authentication failed"*) echo "::error::Неверный пароль базы в секрете SUPABASE_DB_URL.";;
    *"Network is unreachable"*|*"could not translate host"*|*"No route"*) echo "::error::Не удалось достучаться до базы. Нужна строка «Session pooler» (адрес …pooler.supabase.com), а не «Direct connection».";;
    *) echo "::error::Не удалось подключиться к базе.";;
  esac
  exit 1
fi
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

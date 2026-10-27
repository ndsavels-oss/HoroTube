-- Откат moderation.sql. Возвращает фильтр из security.sql и удаляет очередь модерации.
-- Внимание: таблица ht_mod_notes (очередь админа) будет удалена вместе с записями.
drop trigger if exists ht_note on public.videos;
drop trigger if exists ht_note on public.comments;
drop trigger if exists ht_note on public.chat;
drop function if exists public.ht_mod_note_trg();
drop function if exists public.ht_mod_note_text(jsonb);
drop table if exists public.ht_mod_notes;

-- фильтр и проверка слова в том виде, как в security.sql
create or replace function public.ht_bad_word(w text) returns boolean
language sql stable security definer set search_path = public as $$
  select exists (
    select 1 from ht_bad_patterns p
    where w ~ p.pattern or regexp_replace(w, '(.)\1+', '\1', 'g') ~ p.pattern
  );
$$;

create or replace function public.ht_text_filter() returns trigger
language plpgsql set search_path = public as $$
declare v text; col text := tg_argv[0];
begin
  if public.ht_is_admin() then return new; end if;
  v := to_jsonb(new) ->> col;
  if v is null then return new; end if;
  if tg_op = 'UPDATE' and v is not distinct from (to_jsonb(old) ->> col) then return new; end if;
  if public.ht_is_bad(v) then
    raise exception 'Есть недопустимые слова. Напиши по-другому.';
  end if;
  if tg_argv[1] = 'contacts' and public.ht_has_contact(v) then
    raise exception 'Нельзя оставлять ссылки, телефоны и контакты.';
  end if;
  return new;
end $$;

-- исходная ht_is_bad из security.sql
create or replace function public.ht_is_bad(t text) returns boolean
language plpgsql stable security definer set search_path = public as $$
declare w text; buf text := ''; joined text := '';
begin
  t := replace(lower(coalesce(t, '')), 'ё', 'е');
  t := regexp_replace(t, '[.*~_-]+', ' ', 'g');
  for w in select x from regexp_split_to_table(t, '[^a-zа-я0-9@]+') x where x <> '' loop
    -- «с у к а» по одной букве склеиваем в одно слово
    if length(w) = 1 then buf := buf || w; continue; end if;
    if buf <> '' then
      if ht_bad_word(buf) then return true; end if;
      joined := joined || ' ' || buf; buf := '';
    end if;
    -- латиница вместо кириллицы внутри русского слова: «cyкa» -> «сука»
    if w ~ '[а-я]' then
      w := translate(w, 'abceopxykmt0364@', 'авсеорхукмтозбча');
    end if;
    if ht_bad_word(w) then return true; end if;
    joined := joined || ' ' || w;
  end loop;
  if buf <> '' then
    if ht_bad_word(buf) then return true; end if;
    joined := joined || ' ' || buf;
  end if;
  return joined ~ '(^| )(твою мать|убей себя|иди на ху)';
end $$;

drop function if exists public.ht_moderate(text);
drop function if exists public.ht_is_ok_word(text);
drop table if exists public.ht_ok_patterns;
drop table if exists public.ht_bad_words;

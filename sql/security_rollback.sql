-- Откат security.sql: удаляет всё, что он добавил (объекты с префиксом ht_).
-- Ваши собственные политики и функции не затрагиваются.
-- Лимиты бакета avatars (размер и тип файла) остаются; при желании снимите их вручную.
do $$
declare r record;
begin
  for r in select event_object_schema s, event_object_table t, trigger_name n
             from information_schema.triggers
            where trigger_name like 'ht\_%' and event_object_schema = 'public'
            group by 1, 2, 3 loop
    execute format('drop trigger if exists %I on %I.%I', r.n, r.s, r.t);
  end loop;
  for r in select schemaname s, tablename t, policyname n from pg_policies
            where policyname like 'ht\_%' and schemaname in ('public', 'storage') loop
    execute format('drop policy if exists %I on %I.%I', r.n, r.s, r.t);
  end loop;
end $$;

-- объекты из moderation.sql (если он применялся)
drop function if exists public.ht_mod_note_trg();
drop function if exists public.ht_mod_note_text(jsonb);
drop table if exists public.ht_mod_notes;
drop function if exists public.ht_moderate(text);
drop function if exists public.ht_is_ok_word(text);
drop table if exists public.ht_ok_patterns;
drop table if exists public.ht_bad_words;

drop function if exists public.ht_add_tubek(uuid, int);
drop function if exists public.ht_rate_limit();
drop function if exists public.ht_text_filter();
drop function if exists public.ht_has_contact(text);
drop function if exists public.ht_is_bad(text);
drop function if exists public.ht_bad_word(text);
drop table if exists public.ht_bad_patterns;
drop function if exists public.ht_guard_videos();
drop function if exists public.ht_set_author();
drop function if exists public.ht_guard_profiles();
drop function if exists public.ht_direct();
drop function if exists public.ht_is_banned();
drop function if exists public.ht_is_staff();
drop function if exists public.ht_is_admin();

-- Обновление 24.10
drop function if exists public.ht_admin_set_password(uuid, text);

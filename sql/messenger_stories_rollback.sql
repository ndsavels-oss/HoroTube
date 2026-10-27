-- Откат messenger_stories.sql: удаляет мессенджер и правила для историй и файлов.
-- ВНИМАНИЕ: таблица ht_dm (вся личная переписка) будет удалена.
-- Таблицу stories и файлы в хранилище откат не удаляет.
drop table if exists public.ht_dm cascade;
drop table if exists public.ht_dm_blocks cascade;
drop function if exists public.ht_dm_threads();
drop function if exists public.ht_dm_read(uuid);
drop function if exists public.ht_find_users(text);
drop function if exists public.ht_guard_dm() cascade;
drop trigger if exists ht_guard on public.stories;
drop trigger if exists ht_filter_text on public.stories;
drop trigger if exists ht_note on public.stories;
drop function if exists public.ht_guard_stories() cascade;
do $$ declare p text; begin
  foreach p in array array['ht_stories_p_sel','ht_stories_p_ins','ht_stories_p_del','ht_stories_sel','ht_stories_ins','ht_stories_upd','ht_stories_del'] loop
    if to_regclass('public.stories') is not null then execute format('drop policy if exists %I on public.stories', p); end if;
  end loop;
end $$;
drop policy if exists ht_media_p_sel on storage.objects;
drop policy if exists ht_media_p_ins on storage.objects;
drop policy if exists ht_media_p_del on storage.objects;
drop policy if exists ht_media_ins on storage.objects;
drop policy if exists ht_media_upd on storage.objects;
drop policy if exists ht_media_del on storage.objects;
-- Проверка ссылок на видео (VK и свои файлы) остаётся: она в security.sql.

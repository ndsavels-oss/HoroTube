-- =====================================================================
-- HoroTube: обновления без повторной вставки кода (25.10.2026)
-- Запускать после apps.sql. Повторный запуск безопасен.
--
-- Как это работает: на хостинге один раз размещается маленький файл
-- index.html (загрузчик). Он берёт из Supabase самую новую версию
-- HoroTube и открывает её. Новую версию выпускает админ прямо на сайте:
-- приложение «Обновления» → «Выпустить обновление» → выбрать файл.
-- Писать в ht_releases и в хранилище ht_releases может только админ.
-- =====================================================================

-- файлы версий: читать может кто угодно (их открывает загрузчик до входа),
-- а загружать, менять и удалять — только админ.
-- Тип text/plain нарочно: файл не открывается как страница на домене Supabase,
-- загрузчик просто читает его текст.
insert into storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
values ('ht_releases', 'ht_releases', true, 15728640, array['text/plain'])
on conflict (id) do update set public = true, file_size_limit = 15728640, allowed_mime_types = array['text/plain'];

drop policy if exists ht_releases_ins on storage.objects;
create policy ht_releases_ins on storage.objects for insert to authenticated
  with check (bucket_id = 'ht_releases' and public.ht_is_admin());
drop policy if exists ht_releases_upd on storage.objects;
create policy ht_releases_upd on storage.objects for update to authenticated
  using (bucket_id = 'ht_releases' and public.ht_is_admin())
  with check (bucket_id = 'ht_releases' and public.ht_is_admin());
drop policy if exists ht_releases_del on storage.objects;
create policy ht_releases_del on storage.objects for delete to authenticated
  using (bucket_id = 'ht_releases' and public.ht_is_admin());

create table if not exists public.ht_releases (
  id         bigserial primary key,
  version    text not null unique check (version ~ '^[0-9A-Za-z._-]{1,32}$'),
  notes      text not null default '' check (length(notes) <= 4000),
  path       text not null check (path ~ '^[0-9A-Za-z._-]{1,64}\.html$'),
  size_bytes integer check (size_bytes between 1 and 15728640),
  revoked    boolean not null default false,   -- отозванную версию загрузчик пропускает
  created_at timestamptz not null default now(),
  created_by uuid default auth.uid() references auth.users (id) on delete set null
);
alter table public.ht_releases enable row level security;
revoke all on public.ht_releases from anon, authenticated;
grant select on public.ht_releases to anon, authenticated;
drop policy if exists ht_releases_read on public.ht_releases;
create policy ht_releases_read on public.ht_releases for select to anon, authenticated using (true);
-- политик на insert/update нет: менять список можно только функциями ниже

create or replace function public.ht_publish_release(p_version text, p_notes text, p_path text, p_size integer)
returns bigint language plpgsql security definer set search_path = public as $$
declare rid bigint;
begin
  if not public.ht_is_admin() then
    perform public.ht_flag('release', 'Пытался выпустить обновление сайта без прав админа');
    return null;
  end if;
  if not exists (select 1 from storage.objects where bucket_id = 'ht_releases' and name = p_path) then
    raise exception 'Файл % не найден в хранилище ht_releases', p_path;
  end if;
  insert into ht_releases (version, notes, path, size_bytes)
  values (p_version, left(coalesce(p_notes, ''), 4000), p_path, p_size)
  returning id into rid;
  return rid;
end $$;

create or replace function public.ht_revoke_release(p_id bigint, p_revoked boolean)
returns boolean language plpgsql security definer set search_path = public as $$
begin
  if not public.ht_is_admin() then
    perform public.ht_flag('release', 'Пытался отозвать обновление сайта без прав админа');
    return false;
  end if;
  update ht_releases set revoked = coalesce(p_revoked, true) where id = p_id;
  return found;
end $$;

revoke all on function public.ht_publish_release(text, text, text, integer) from public, anon;
revoke all on function public.ht_revoke_release(bigint, boolean) from public, anon;
grant execute on function public.ht_publish_release(text, text, text, integer) to authenticated;
grant execute on function public.ht_revoke_release(bigint, boolean) to authenticated;

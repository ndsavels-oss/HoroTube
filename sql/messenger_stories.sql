-- =====================================================================
-- HoroTube: мессенджер, истории (сторис) и загрузка видеофайлов
--
-- Порядок: сначала security.sql, потом moderation.sql, потом этот файл.
-- Supabase -> SQL Editor -> New query -> вставить весь файл -> Run.
-- Повторный запуск безопасен. Откат: messenger_stories_rollback.sql.
--
-- Если у вас уже была таблица stories (из stories.sql ребят), файл её
-- не удаляет: он только добавляет недостающие столбцы и правила.
-- =====================================================================


-- ---------------------------------------------------------------------
-- 0. Помощники
-- ---------------------------------------------------------------------
-- Адрес публичных файлов нашего Supabase. Если проект Supabase сменится,
-- поменяйте адрес здесь (он же записан в HoroTube.html как SB_URL).
create or replace function public.ht_storage_base() returns text
language sql immutable as $$
  select 'https://xuqyywongnzuyvqxaimq.supabase.co/storage/v1/object/public/'::text;
$$;

create or replace function public.ht_is_premium() returns boolean
language sql stable security definer set search_path = public as $$
  select exists (select 1 from profiles where id = auth.uid()
                 and (role = 'admin' or premium or premium_until > now()));
$$;


-- ---------------------------------------------------------------------
-- 1. МЕССЕНДЖЕР: личные сообщения между пользователями
--    Переписку видят двое участников и админ (это школьный сайт,
--    и в мессенджере об этом написано).
-- ---------------------------------------------------------------------
create table if not exists public.ht_dm (
  id           bigserial primary key,
  sender_id    uuid not null default auth.uid() references auth.users (id) on delete cascade,
  recipient_id uuid not null references auth.users (id) on delete cascade,
  author_name  text,
  body         text not null check (char_length(body) between 1 and 1000),
  created_at   timestamptz not null default now(),
  read_at      timestamptz
);
create index if not exists ht_dm_pair on public.ht_dm (sender_id, recipient_id, created_at desc);
create index if not exists ht_dm_inbox on public.ht_dm (recipient_id, read_at);

-- Кто кого заблокировал: заблокированный не может писать
create table if not exists public.ht_dm_blocks (
  blocker    uuid not null default auth.uid() references auth.users (id) on delete cascade,
  blocked    uuid not null references auth.users (id) on delete cascade,
  created_at timestamptz not null default now(),
  primary key (blocker, blocked)
);

create or replace function public.ht_guard_dm() returns trigger
language plpgsql security definer set search_path = public as $$
declare n int;
begin
  if auth.uid() is null then return new; end if;   -- SQL Editor: без проверок
  if new.sender_id is distinct from auth.uid() then
    perform public.ht_flag('spoof', 'Пытался отправить личное сообщение от чужого имени');
  end if;
  new.sender_id := auth.uid();
  new.created_at := now();
  new.read_at := null;
  new.author_name := (select coalesce(nullif(name, ''), nick) from profiles where id = auth.uid());
  if public.ht_is_banned() then
    raise exception 'Аккаунт заблокирован';
  end if;
  if new.recipient_id = auth.uid() then
    raise exception 'Нельзя написать самому себе';
  end if;
  if not exists (select 1 from profiles where id = new.recipient_id) then
    raise exception 'Пользователь не найден';
  end if;
  if public.ht_is_admin() then return new; end if;
  if exists (select 1 from ht_dm_blocks where blocker = auth.uid() and blocked = new.recipient_id) then
    raise exception 'Ты заблокировал этого пользователя. Разблокируй, чтобы написать.';
  end if;
  if exists (select 1 from ht_dm_blocks where blocker = new.recipient_id and blocked = auth.uid()) then
    raise exception 'Этот пользователь ограничил сообщения от тебя.';
  end if;
  select count(*) into n from ht_dm where sender_id = auth.uid() and created_at > now() - interval '1 minute';
  if n >= 15 then
    raise exception 'Слишком часто. Подожди немного и попробуй снова.';
  end if;
  return new;
end $$;

drop trigger if exists ht_guard on public.ht_dm;
create trigger ht_guard before insert on public.ht_dm
  for each row execute function public.ht_guard_dm();

-- Мат и контакты (телефоны, ссылки, ники мессенджеров) в личке запрещены:
-- так чужой взрослый не уведёт ребёнка в другой мессенджер.
drop trigger if exists ht_filter_body on public.ht_dm;
create trigger ht_filter_body before insert on public.ht_dm
  for each row execute function public.ht_text_filter('body', 'contacts');

alter table public.ht_dm enable row level security;
alter table public.ht_dm_blocks enable row level security;
revoke all on public.ht_dm, public.ht_dm_blocks from anon;
revoke all on public.ht_dm, public.ht_dm_blocks from authenticated;
grant select, insert, delete on public.ht_dm to authenticated;
grant select, insert, delete on public.ht_dm_blocks to authenticated;
grant usage on sequence public.ht_dm_id_seq to authenticated;

drop policy if exists ht_dm_read on public.ht_dm;
create policy ht_dm_read on public.ht_dm for select to authenticated
  using (sender_id = auth.uid() or recipient_id = auth.uid() or public.ht_is_admin());
drop policy if exists ht_dm_send on public.ht_dm;
create policy ht_dm_send on public.ht_dm for insert to authenticated
  with check (sender_id = auth.uid() and not public.ht_is_banned());
-- удалять сообщения может только админ: переписку нельзя «подчистить»
drop policy if exists ht_dm_delete on public.ht_dm;
create policy ht_dm_delete on public.ht_dm for delete to authenticated
  using (public.ht_is_admin());

drop policy if exists ht_blocks_own on public.ht_dm_blocks;
create policy ht_blocks_own on public.ht_dm_blocks for all to authenticated
  using (blocker = auth.uid() or public.ht_is_admin())
  with check (blocker = auth.uid());

-- Список переписок: собеседник, последнее сообщение, сколько непрочитанных
create or replace function public.ht_dm_threads()
returns table (partner_id uuid, nick text, name text, role text, last_body text,
               last_at timestamptz, last_from_me boolean, unread int, blocked boolean)
language sql stable security definer set search_path = public as $$
  with my as (
    select case when d.sender_id = auth.uid() then d.recipient_id else d.sender_id end as partner, d.*
    from ht_dm d where d.sender_id = auth.uid() or d.recipient_id = auth.uid()
  ), last as (
    select distinct on (partner) partner, body, created_at, sender_id = auth.uid() as from_me
    from my order by partner, created_at desc
  )
  select l.partner, p.nick, coalesce(nullif(p.name, ''), p.nick), p.role, l.body, l.created_at, l.from_me,
         (select count(*) from ht_dm u where u.recipient_id = auth.uid() and u.sender_id = l.partner and u.read_at is null)::int,
         exists (select 1 from ht_dm_blocks b where b.blocker = auth.uid() and b.blocked = l.partner)
  from last l left join profiles p on p.id = l.partner
  order by l.created_at desc
  limit 100;
$$;

-- Отметить сообщения от собеседника прочитанными
create or replace function public.ht_dm_read(partner uuid) returns void
language sql security definer set search_path = public as $$
  update ht_dm set read_at = now()
   where recipient_id = auth.uid() and sender_id = partner and read_at is null;
$$;

-- Поиск собеседника по нику или имени (только ник, имя и роль, без класса и баланса)
create or replace function public.ht_find_users(q text)
returns table (id uuid, nick text, name text, role text)
language plpgsql stable security definer set search_path = public as $$
begin
  if auth.uid() is null then return; end if;
  q := btrim(coalesce(q, ''));
  if char_length(q) < 2 then return; end if;
  q := replace(replace(replace(q, '\', '\\'), '%', '\%'), '_', '\_');
  return query
    select p.id, p.nick, coalesce(nullif(p.name, ''), p.nick), p.role
    from profiles p
    where p.id <> auth.uid() and not coalesce(p.banned, false)
      and (p.nick ilike '%' || q || '%' or p.name ilike '%' || q || '%')
    order by p.nick
    limit 20;
end $$;

revoke all on function public.ht_dm_threads(), public.ht_dm_read(uuid), public.ht_find_users(text) from public, anon;
grant execute on function public.ht_dm_threads(), public.ht_dm_read(uuid), public.ht_find_users(text) to authenticated;


-- ---------------------------------------------------------------------
-- 2. ИСТОРИИ (сторис): видны 24 часа, выкладывать может только премиум
-- ---------------------------------------------------------------------
create table if not exists public.stories (id bigserial primary key);
alter table public.stories add column if not exists user_id     uuid default auth.uid() references auth.users (id) on delete cascade;
alter table public.stories add column if not exists author_name text;
alter table public.stories add column if not exists text        text;
alter table public.stories add column if not exists bg          text;
alter table public.stories add column if not exists image_url   text;
alter table public.stories add column if not exists path        text;
alter table public.stories add column if not exists created_at  timestamptz default now();
alter table public.stories add column if not exists expires_at  timestamptz default now() + interval '24 hours';
create index if not exists ht_stories_live on public.stories (expires_at);

create or replace function public.ht_guard_stories() returns trigger
language plpgsql security definer set search_path = public as $$
declare n int;
begin
  if auth.uid() is null then return new; end if;
  if tg_op = 'UPDATE' then
    if public.ht_is_admin() then return new; end if;
    raise exception 'Историю нельзя изменить, только удалить';
  end if;
  if public.ht_is_banned() then
    raise exception 'Аккаунт заблокирован';
  end if;
  if not public.ht_is_premium() then
    perform public.ht_flag('story', 'Пытался выложить историю без премиума в обход сайта');
    return null;
  end if;
  new.user_id := auth.uid();
  new.author_name := (select coalesce(nullif(nick, ''), name) from profiles where id = auth.uid());
  new.created_at := now();
  new.expires_at := now() + interval '24 hours';
  new.text := nullif(btrim(coalesce(new.text, '')), '');
  if char_length(new.text) > 120 then
    raise exception 'Текст истории: не больше 120 символов';
  end if;
  if new.bg is null or new.bg !~ '^#[0-9A-Fa-f]{6}$' then
    new.bg := '#007BFF';
  end if;
  -- картинка или видео: только файл из своей папки в хранилище stories
  if new.image_url is not null or new.path is not null then
    if new.path is null or new.path !~ ('^' || auth.uid()::text || '/[0-9]+\.(jpg|mp4|webm|mov)$')
       or new.image_url is distinct from public.ht_storage_base() || 'stories/' || new.path then
      perform public.ht_flag('story', 'Пытался вставить в историю чужую картинку: ' || coalesce(new.image_url, ''));
      return null;
    end if;
  end if;
  if new.text is null and new.image_url is null then
    raise exception 'Добавь картинку или текст';
  end if;
  if not public.ht_is_admin() then
    select count(*) into n from stories where user_id = auth.uid() and created_at > now() - interval '1 day';
    if n >= 10 then
      raise exception 'Не больше 10 историй в день';
    end if;
  end if;
  return new;
end $$;

drop trigger if exists ht_guard on public.stories;
create trigger ht_guard before insert or update on public.stories
  for each row execute function public.ht_guard_stories();
drop trigger if exists ht_filter_text on public.stories;
create trigger ht_filter_text before insert on public.stories
  for each row execute function public.ht_text_filter('text', 'contacts');

alter table public.stories enable row level security;
revoke all on public.stories from anon;
grant select, insert, delete on public.stories to authenticated;
do $$ begin
  if to_regclass('public.stories_id_seq') is not null then
    grant usage on sequence public.stories_id_seq to authenticated;
  end if;
end $$;

-- Разрешающие правила
drop policy if exists ht_stories_p_sel on public.stories;
create policy ht_stories_p_sel on public.stories for select to authenticated using (true);
drop policy if exists ht_stories_p_ins on public.stories;
create policy ht_stories_p_ins on public.stories for insert to authenticated with check (true);
drop policy if exists ht_stories_p_del on public.stories;
create policy ht_stories_p_del on public.stories for delete to authenticated using (true);
-- Ограничивающие (RESTRICTIVE): действуют, даже если раньше кто-то разрешил «всё всем»
drop policy if exists ht_stories_sel on public.stories;
create policy ht_stories_sel on public.stories as restrictive for select to authenticated, anon
  using (expires_at > now() or user_id = auth.uid() or public.ht_is_admin());
drop policy if exists ht_stories_ins on public.stories;
create policy ht_stories_ins on public.stories as restrictive for insert to authenticated, anon
  with check (user_id = auth.uid() and not public.ht_is_banned());
drop policy if exists ht_stories_upd on public.stories;
create policy ht_stories_upd on public.stories as restrictive for update to authenticated, anon
  using (public.ht_is_admin());
drop policy if exists ht_stories_del on public.stories;
create policy ht_stories_del on public.stories as restrictive for delete to authenticated, anon
  using (user_id = auth.uid() or public.ht_is_admin());

-- Хранилище историй: картинка JPEG (сайт сжимает до 720 px) или видео до 30 секунд, файл до 15 МБ
insert into storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
values ('stories', 'stories', true, 15728640, array['image/jpeg', 'video/mp4', 'video/webm', 'video/quicktime'])
on conflict (id) do update set public = true, file_size_limit = 15728640,
  allowed_mime_types = array['image/jpeg', 'video/mp4', 'video/webm', 'video/quicktime'];


-- ---------------------------------------------------------------------
-- 3. ВИДЕОФАЙЛЫ: загрузка роликов с устройства и ссылки VK Видео
-- ---------------------------------------------------------------------
-- Видео до 50 МБ (mp4, webm, mov) и обложка-кадр JPEG.
-- Бесплатный Supabase даёт 1 ГБ хранилища: это примерно 20–40 роликов.
insert into storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
values ('videos', 'videos', true, 52428800, array['video/mp4', 'video/webm', 'video/quicktime', 'image/jpeg'])
on conflict (id) do update set public = true, file_size_limit = 52428800,
  allowed_mime_types = array['video/mp4', 'video/webm', 'video/quicktime', 'image/jpeg'];

-- Тот же триггер, что в security.sql (там он тоже обновлён), но теперь
-- разрешает VK Видео и файл из своей папки videos/<id>/
create or replace function public.ht_guard_videos() returns trigger
language plpgsql set search_path = public as $$
declare k text;
begin
  if not public.ht_direct() or public.ht_is_admin() then
    return new;
  end if;
  if tg_op = 'INSERT' or new.url is distinct from old.url then
    if new.url is null or new.url ~ '["''()[:space:]\\<>]' or not (
         new.url ~* '^https://((www\.|m\.)?youtube\.com/|youtu\.be/|(www\.)?vimeo\.com/|(www\.|m\.)?vk\.com/|(www\.|m\.)?vkvideo\.ru/)'
         or starts_with(new.url, public.ht_storage_base() || 'videos/' || auth.uid()::text || '/')) then
      perform public.ht_flag('video', 'Пытался добавить видео с запрещённой ссылкой: ' || coalesce(new.url, 'пусто'));
      return null;
    end if;
  end if;
  if (to_jsonb(new) ->> 'cover') is not null and (to_jsonb(new) ->> 'cover') !~ '^https://[^"''()[:space:]\\]+$' then
    perform public.ht_flag('video', 'Пытался поставить обложку с опасной ссылкой');
    return null;
  end if;
  if tg_op = 'INSERT' then
    if not public.ht_is_staff() then
      new.status := 'pending';
    end if;
    new := jsonb_populate_record(new, '{"views":0,"likes":0,"r_fire":0,"r_laugh":0,"r_wow":0}'::jsonb);
    return new;
  end if;
  foreach k in array array['status', 'author_id', 'author_role', 'author_name', 'views', 'likes',
                           'r_fire', 'r_laugh', 'r_wow', 'published_at', 'created_at'] loop
    if (to_jsonb(new) -> k) is distinct from (to_jsonb(old) -> k) then
      perform public.ht_flag('video', format('Пытался сам изменить у видео поле «%s» (накрутка или самопубликация)', k));
      return null;
    end if;
  end loop;
  return new;
end $$;


-- ---------------------------------------------------------------------
-- 4. Права на файлы историй и видео: каждый пишет только в свою папку
--    <id пользователя>/..., удалить может хозяин или админ.
-- ---------------------------------------------------------------------
drop policy if exists ht_media_p_sel on storage.objects;
create policy ht_media_p_sel on storage.objects for select to authenticated
  using (bucket_id in ('stories', 'videos'));
drop policy if exists ht_media_p_ins on storage.objects;
create policy ht_media_p_ins on storage.objects for insert to authenticated
  with check (bucket_id in ('stories', 'videos') and (storage.foldername(name))[1] = auth.uid()::text);
drop policy if exists ht_media_p_del on storage.objects;
create policy ht_media_p_del on storage.objects for delete to authenticated
  using (bucket_id in ('stories', 'videos') and ((storage.foldername(name))[1] = auth.uid()::text or public.ht_is_admin()));

drop policy if exists ht_media_ins on storage.objects;
create policy ht_media_ins on storage.objects as restrictive for insert to authenticated
  with check (bucket_id not in ('stories', 'videos') or (
    ((storage.foldername(name))[1] = auth.uid()::text or public.ht_is_admin())
    and not public.ht_is_banned()
    and (bucket_id <> 'stories' or public.ht_is_premium())));
drop policy if exists ht_media_upd on storage.objects;
create policy ht_media_upd on storage.objects as restrictive for update to authenticated
  using (bucket_id not in ('stories', 'videos') or public.ht_is_admin());
drop policy if exists ht_media_del on storage.objects;
create policy ht_media_del on storage.objects as restrictive for delete to authenticated
  using (bucket_id not in ('stories', 'videos') or (storage.foldername(name))[1] = auth.uid()::text or public.ht_is_admin());


-- ---------------------------------------------------------------------
-- 5. Очередь автопроверки (если выполнен moderation.sql):
--    подозрительные личные сообщения и истории попадают админу
-- ---------------------------------------------------------------------
do $$ begin
  if to_regproc('public.ht_mod_note_trg') is not null then
    execute 'drop trigger if exists ht_note on public.ht_dm';
    execute 'create trigger ht_note after insert on public.ht_dm for each row execute function public.ht_mod_note_trg(''dm'', ''body'')';
    execute 'drop trigger if exists ht_note on public.stories';
    execute 'create trigger ht_note after insert on public.stories for each row execute function public.ht_mod_note_trg(''story'', ''text'')';
  end if;
end $$;

-- Забаненный не может блокировать/жаловаться через новые таблицы
drop policy if exists ht_not_banned_ins on public.ht_dm_blocks;
create policy ht_not_banned_ins on public.ht_dm_blocks as restrictive for insert to authenticated
  with check (not public.ht_is_banned());

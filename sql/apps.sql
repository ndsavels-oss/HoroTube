-- =====================================================================
-- HoroTube: приложения в стиле iPad — Галерея, Портфолио, Календарь
--
-- Выполнять после security.sql, moderation.sql, messenger_stories.sql,
-- chess.sql, premium_chess.sql и friends.sql (нужны ht_is_admin, ht_is_bad,
-- ht_has_contact, ht_flag и ht_friends). Проще всего — all_in_one.sql.
-- Повторный запуск безопасен. Откат: apps_rollback.sql.
--
-- Галерея — личная: фото и видео видит только владелец (и админ школы,
-- как и личные сообщения). Хранилище «gallery» закрытое: файлы открываются
-- по временным ссылкам. Лимиты: фото до 15 МБ, видео до 50 МБ,
-- не больше 500 файлов у одного ученика.
-- Почта — письма администрации (и ответы от неё). Это не мессенджер:
-- ученик пишет только учителям и админам, учителя и админы — кому угодно.
-- Свои приложения: ученик пишет код в «Кодилке», отправляет его письмом
-- админам, админ смотрит и публикует в HoroStore. Код приложений работает
-- в закрытой «песочнице» (iframe без доступа к сайту, аккаунту и интернету).
-- Таймер, секундомер, будильник и монтаж видео работают в браузере,
-- сервер для них не нужен.
-- =====================================================================

-- ---------------------------------------------------------------------
-- 1. ГАЛЕРЕЯ
-- ---------------------------------------------------------------------
insert into storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
values ('gallery', 'gallery', false, 52428800,
        array['image/jpeg', 'image/png', 'image/webp', 'video/mp4', 'video/webm', 'video/quicktime'])
on conflict (id) do update set public = false, file_size_limit = 52428800,
  allowed_mime_types = array['image/jpeg', 'image/png', 'image/webp', 'video/mp4', 'video/webm', 'video/quicktime'];

-- файлы галереи: свои — да, чужие — только админ
drop policy if exists ht_gallery_sel on storage.objects;
create policy ht_gallery_sel on storage.objects for select to authenticated
  using (bucket_id = 'gallery' and ((storage.foldername(name))[1] = auth.uid()::text or public.ht_is_admin()));
drop policy if exists ht_gallery_ins on storage.objects;
create policy ht_gallery_ins on storage.objects for insert to authenticated
  with check (bucket_id = 'gallery' and (storage.foldername(name))[1] = auth.uid()::text and not public.ht_is_banned());
drop policy if exists ht_gallery_del on storage.objects;
create policy ht_gallery_del on storage.objects for delete to authenticated
  using (bucket_id = 'gallery' and ((storage.foldername(name))[1] = auth.uid()::text or public.ht_is_admin()));

create table if not exists public.ht_gallery (
  id         bigserial primary key,
  user_id    uuid not null default auth.uid() references auth.users (id) on delete cascade,
  path       text not null,                  -- <uid>/<время>.<расширение> в хранилище gallery
  kind       text not null check (kind in ('photo', 'video')),
  album      text check (char_length(album) <= 40),
  favorite   boolean not null default false,
  caption    text check (char_length(caption) <= 200),
  width      int, height int, duration real, size_bytes bigint,
  taken_at   timestamptz not null default now(),
  created_at timestamptz not null default now(),
  deleted_at timestamptz                      -- «Недавно удалённые»: через 30 дней удаляется насовсем
);
create index if not exists ht_gallery_user on public.ht_gallery (user_id, taken_at desc);

create or replace function public.ht_guard_gallery() returns trigger
language plpgsql security definer set search_path = public as $$
declare n int;
begin
  if auth.uid() is null or public.ht_is_admin() then return new; end if;
  if public.ht_is_banned() then raise exception 'Аккаунт заблокирован'; end if;
  if tg_op = 'INSERT' then
    if new.user_id is distinct from auth.uid() then
      perform public.ht_flag('spoof', 'Пытался положить файл в чужую галерею'); return null;
    end if;
    if new.path !~ ('^' || auth.uid()::text || '/[0-9]+(-[0-9]+)?\.(jpg|jpeg|png|webp|mp4|webm|mov)$') then
      perform public.ht_flag('gallery', 'Подставил чужой или странный путь к файлу галереи: ' || left(new.path, 80)); return null;
    end if;
    select count(*) into n from ht_gallery where user_id = auth.uid();
    if n >= 500 then raise exception 'В галерее уже 500 файлов. Удали ненужные, чтобы добавить новые.'; end if;
    new.created_at := now(); new.deleted_at := null;
  else
    if (new.user_id, new.path, new.kind, new.created_at) is distinct from (old.user_id, old.path, old.kind, old.created_at) then
      perform public.ht_flag('gallery', 'Пытался подменить файл в галерее'); return null;
    end if;
  end if;
  if public.ht_is_bad(coalesce(new.caption, '') || ' ' || coalesce(new.album, '')) then
    raise exception 'В подписи или названии альбома есть недопустимые слова';
  end if;
  return new;
end $$;
drop trigger if exists ht_guard on public.ht_gallery;
create trigger ht_guard before insert or update on public.ht_gallery
  for each row execute function public.ht_guard_gallery();

alter table public.ht_gallery enable row level security;
revoke all on public.ht_gallery from anon, authenticated;
grant select, insert, update, delete on public.ht_gallery to authenticated;
grant usage on sequence public.ht_gallery_id_seq to authenticated;
drop policy if exists ht_gallery_own on public.ht_gallery;
create policy ht_gallery_own on public.ht_gallery for all to authenticated
  using (user_id = auth.uid() or public.ht_is_admin())
  with check (user_id = auth.uid() or public.ht_is_admin());


-- ---------------------------------------------------------------------
-- 2. ПОРТФОЛИО «обо мне»
--    Учителя и админ видят всегда. Ученики: все, только друзья или никто —
--    это выбирает владелец.
-- ---------------------------------------------------------------------
create table if not exists public.ht_portfolio (
  user_id      uuid primary key default auth.uid() references auth.users (id) on delete cascade,
  about        text check (char_length(about) <= 1000),
  dream        text check (char_length(dream) <= 200),
  hobbies      text[] not null default '{}',
  skills       text[] not null default '{}',
  achievements jsonb not null default '[]'::jsonb,   -- [{"e":"🏆","t":"Олимпиада по математике","y":"2026"}]
  color        text not null default 'blue' check (color in ('blue', 'purple', 'pink', 'green', 'orange', 'dark')),
  visibility   text not null default 'all' check (visibility in ('all', 'friends', 'me')),
  updated_at   timestamptz not null default now()
);

create or replace function public.ht_guard_portfolio() returns trigger
language plpgsql security definer set search_path = public as $$
declare t text;
begin
  if auth.uid() is null or public.ht_is_admin() then return new; end if;
  if public.ht_is_banned() then raise exception 'Аккаунт заблокирован'; end if;
  if new.user_id is distinct from auth.uid() then
    perform public.ht_flag('spoof', 'Пытался изменить чужое портфолио'); return null;
  end if;
  if cardinality(new.hobbies) > 20 or cardinality(new.skills) > 20 or jsonb_array_length(new.achievements) > 30 then
    raise exception 'Слишком много пунктов: не больше 20 увлечений и навыков и 30 достижений';
  end if;
  t := concat_ws(' ', new.about, new.dream, array_to_string(new.hobbies, ' '), array_to_string(new.skills, ' '), new.achievements::text);
  if char_length(t) > 6000 then raise exception 'Слишком длинный текст'; end if;
  if public.ht_is_bad(t) then raise exception 'В портфолио есть недопустимые слова'; end if;
  if public.ht_has_contact(t) then raise exception 'В портфолио нельзя писать телефоны, ссылки и ники в мессенджерах'; end if;
  new.updated_at := now();
  return new;
end $$;
drop trigger if exists ht_guard on public.ht_portfolio;
create trigger ht_guard before insert or update on public.ht_portfolio
  for each row execute function public.ht_guard_portfolio();

-- можно ли мне смотреть портфолио этого человека
create or replace function public.ht_can_see_portfolio(owner uuid, vis text) returns boolean
language sql stable security definer set search_path = public as $$
  select owner = auth.uid() or public.ht_is_staff() or vis = 'all'   -- учителя и админ видят всегда
      or (vis = 'friends' and exists (select 1 from ht_friends where a = least(owner, auth.uid()) and b = greatest(owner, auth.uid())));
$$;

alter table public.ht_portfolio enable row level security;
revoke all on public.ht_portfolio from anon, authenticated;
grant select, insert, update on public.ht_portfolio to authenticated;
drop policy if exists ht_portfolio_read on public.ht_portfolio;
create policy ht_portfolio_read on public.ht_portfolio for select to authenticated
  using (public.ht_can_see_portfolio(user_id, visibility));
drop policy if exists ht_portfolio_ins on public.ht_portfolio;
create policy ht_portfolio_ins on public.ht_portfolio for insert to authenticated
  with check (user_id = auth.uid());
drop policy if exists ht_portfolio_upd on public.ht_portfolio;
create policy ht_portfolio_upd on public.ht_portfolio for update to authenticated
  using (user_id = auth.uid() or public.ht_is_admin()) with check (user_id = auth.uid() or public.ht_is_admin());

-- цифры для портфолио: видео, лайки, друзья (без баланса и личных данных)
create or replace function public.ht_portfolio_stats(owner uuid)
returns table (videos int, likes int, views int, friends int, since timestamptz)
language sql stable security definer set search_path = public as $$
  select (select count(*) from videos where author_id = owner and status = 'approved')::int,
         (select coalesce(sum(likes), 0) from videos where author_id = owner and status = 'approved')::int,
         (select coalesce(sum(views), 0) from videos where author_id = owner and status = 'approved')::int,
         (select count(*) from ht_friends where owner in (a, b))::int,
         (select created_at from profiles where id = owner)
  where exists (select 1 from profiles where id = owner);
$$;


-- ---------------------------------------------------------------------
-- 3. КАЛЕНДАРЬ: личное расписание, видно только себе
-- ---------------------------------------------------------------------
create table if not exists public.ht_events (
  id         bigserial primary key,
  user_id    uuid not null default auth.uid() references auth.users (id) on delete cascade,
  title      text not null check (char_length(title) between 1 and 100),
  notes      text check (char_length(notes) <= 500),
  start_at   timestamptz not null,
  end_at     timestamptz,
  all_day    boolean not null default false,
  color      text not null default 'blue' check (color in ('blue', 'red', 'green', 'orange', 'purple', 'pink', 'gray')),
  repeat     text not null default 'none' check (repeat in ('none', 'daily', 'weekdays', 'weekly', 'monthly', 'yearly')),
  remind_min int check (remind_min in (0, 5, 10, 15, 30, 60, 1440)),
  created_at timestamptz not null default now(),
  check (end_at is null or end_at >= start_at)
);
create index if not exists ht_events_user on public.ht_events (user_id, start_at);

create or replace function public.ht_guard_events() returns trigger
language plpgsql security definer set search_path = public as $$
declare n int;
begin
  if auth.uid() is null or public.ht_is_admin() then return new; end if;
  if new.user_id is distinct from auth.uid() then
    perform public.ht_flag('spoof', 'Пытался записать событие в чужой календарь'); return null;
  end if;
  if tg_op = 'INSERT' then
    select count(*) into n from ht_events where user_id = auth.uid();
    if n >= 1000 then raise exception 'В календаре уже 1000 событий. Удали старые.'; end if;
  end if;
  return new;
end $$;
drop trigger if exists ht_guard on public.ht_events;
create trigger ht_guard before insert or update on public.ht_events
  for each row execute function public.ht_guard_events();

alter table public.ht_events enable row level security;
revoke all on public.ht_events from anon, authenticated;
grant select, insert, update, delete on public.ht_events to authenticated;
grant usage on sequence public.ht_events_id_seq to authenticated;
drop policy if exists ht_events_own on public.ht_events;
create policy ht_events_own on public.ht_events for all to authenticated
  using (user_id = auth.uid()) with check (user_id = auth.uid());



-- ---------------------------------------------------------------------
-- 4. СВОИ ПРИЛОЖЕНИЯ (Кодилка -> Почта -> HoroStore)
--    code      — черновик автора, его видит только автор и админ;
--    pub_code  — версия, которую проверил и выпустил админ (её видят все).
-- ---------------------------------------------------------------------
create table if not exists public.ht_user_apps (
  id           bigserial primary key,
  author_id    uuid not null default auth.uid() references auth.users (id) on delete cascade,
  name         text not null check (char_length(name) between 1 and 30),
  icon         text not null default '✨' check (char_length(icon) <= 8),
  color        text not null default 'blue' check (color in ('blue', 'purple', 'pink', 'green', 'orange', 'red', 'dark', 'teal')),
  description  text not null default '' check (char_length(description) <= 300),
  code         text not null default '' check (char_length(code) <= 200000),
  status       text not null default 'draft' check (status in ('draft', 'review', 'published', 'rejected')),
  pub_code     text,
  listed       boolean not null default false,          -- показывать в HoroStore
  review_note  text,
  installs     int not null default 0,
  created_at   timestamptz not null default now(),
  updated_at   timestamptz not null default now(),
  published_at timestamptz
);
create index if not exists ht_user_apps_author on public.ht_user_apps (author_id);
-- цена в Tubek (0 = бесплатно): price задаёт автор, pub_price — цена выпущенной версии (её утверждает админ)
alter table public.ht_user_apps add column if not exists price int not null default 0;
alter table public.ht_user_apps add column if not exists pub_price int not null default 0;
-- номер выпущенной версии: +1 при каждом выпуске (первый выпуск = 1)
alter table public.ht_user_apps add column if not exists version int not null default 0;
alter table public.ht_user_apps drop constraint if exists ht_user_apps_price_chk;
alter table public.ht_user_apps add constraint ht_user_apps_price_chk check (price between 0 and 50 and pub_price between 0 and 50);

create table if not exists public.ht_app_installs (
  user_id uuid not null default auth.uid() references auth.users (id) on delete cascade,
  app_id  bigint not null references public.ht_user_apps (id) on delete cascade,
  primary key (user_id, app_id)
);

create or replace function public.ht_guard_user_apps() returns trigger
language plpgsql security definer set search_path = public as $$
declare n int; t text;
begin
  -- auth.uid() пустой — запрос из SQL Editor; ht.sys — изменение из проверенных функций ниже
  if auth.uid() is null or public.ht_is_admin() or current_setting('ht.sys', true) = '1' then return new; end if;
  if public.ht_is_banned() then raise exception 'Аккаунт заблокирован'; end if;
  if tg_op = 'INSERT' then
    if new.author_id is distinct from auth.uid() then
      perform public.ht_flag('spoof', 'Пытался создать приложение от чужого имени'); return null;
    end if;
    select count(*) into n from ht_user_apps where author_id = auth.uid();
    if n >= 20 then raise exception 'У тебя уже 20 приложений. Удали старые, чтобы создать новое.'; end if;
    new.status := 'draft'; new.pub_code := null; new.pub_price := 0; new.version := 0; new.listed := false; new.review_note := null;
    new.installs := 0; new.published_at := null; new.created_at := now();
  else
    if old.author_id is distinct from auth.uid()
       or (new.author_id, new.pub_code, new.pub_price, new.version, new.listed, new.installs, new.published_at, new.created_at, new.review_note)
          is distinct from (old.author_id, old.pub_code, old.pub_price, old.version, old.listed, old.installs, old.published_at, old.created_at, old.review_note) then
      perform public.ht_flag('store', 'Пытался сам опубликовать или подменить приложение'); return null;
    end if;
    -- автор может только вернуть в черновик; на проверку отправляет письмо админам
    if new.status is distinct from old.status and new.status <> 'draft' then
      perform public.ht_flag('store', 'Пытался сам поменять статус приложения на ' || new.status); return null;
    end if;
  end if;
  t := new.name || ' ' || new.description;
  if public.ht_is_bad(t) then raise exception 'В названии или описании есть недопустимые слова'; end if;
  if public.ht_has_contact(t) then raise exception 'В описании нельзя писать телефоны, ссылки и ники в мессенджерах'; end if;
  new.updated_at := now();
  return new;
end $$;
drop trigger if exists ht_guard on public.ht_user_apps;
create trigger ht_guard before insert or update on public.ht_user_apps
  for each row execute function public.ht_guard_user_apps();

alter table public.ht_user_apps enable row level security;
revoke all on public.ht_user_apps from anon, authenticated;
grant select, insert, update, delete on public.ht_user_apps to authenticated;
grant usage on sequence public.ht_user_apps_id_seq to authenticated;
drop policy if exists ht_user_apps_own on public.ht_user_apps;
create policy ht_user_apps_own on public.ht_user_apps for all to authenticated
  using (author_id = auth.uid() or public.ht_is_admin())
  with check (author_id = auth.uid() or public.ht_is_admin());
alter table public.ht_app_installs enable row level security;
revoke all on public.ht_app_installs from anon, authenticated;

-- витрина HoroStore: только выпущенные версии, без черновиков.
-- Код платного приложения получают только те, кто его купил, автор и админ.
drop function if exists public.ht_store_apps();
create or replace function public.ht_store_apps()
returns table (id bigint, name text, icon text, color text, description text, code text,
               author_name text, author_nick text, installs int, published_at timestamptz, mine boolean,
               price int, owned boolean, version int)
language sql stable security definer set search_path = public as $$
  select a.id, a.name, a.icon, a.color, a.description,
         -- админ тоже покупает платные приложения; проверяет он их по письму, а не из магазина
         case when a.pub_price = 0 or a.author_id = auth.uid()
                   or exists (select 1 from ht_app_installs i where i.app_id = a.id and i.user_id = auth.uid())
              then a.pub_code end,
         coalesce(nullif(p.name, ''), p.nick), p.nick, a.installs, a.published_at, a.author_id = auth.uid(),
         a.pub_price,
         a.pub_price = 0 or a.author_id = auth.uid()
           or exists (select 1 from ht_app_installs i where i.app_id = a.id and i.user_id = auth.uid()),
         a.version
  from ht_user_apps a join profiles p on p.id = a.author_id
  where a.listed and a.pub_code is not null and auth.uid() is not null
  order by a.installs desc, a.published_at desc
  limit 200;
$$;

-- «Загрузить»: считаем установки, один раз на человека
create or replace function public.ht_install_app(app bigint) returns void
language plpgsql security definer set search_path = public as $$
begin
  if auth.uid() is null then raise exception 'Войди в аккаунт'; end if;
  if not exists (select 1 from ht_user_apps where id = app and listed) then raise exception 'Приложение не найдено'; end if;
  if exists (select 1 from ht_user_apps where id = app and pub_price > 0 and author_id <> auth.uid())
     and not exists (select 1 from ht_app_installs where app_id = app and user_id = auth.uid()) then
    raise exception 'Это платное приложение, сначала купи его';
  end if;
  insert into ht_app_installs (user_id, app_id) values (auth.uid(), app) on conflict do nothing;
  if found then
    perform set_config('ht.sys', '1', true);
    update ht_user_apps set installs = installs + 1 where id = app;
    perform set_config('ht.sys', '', true);
  end if;
end $$;


-- ---------------------------------------------------------------------
-- 5. ПОЧТА
-- ---------------------------------------------------------------------
create table if not exists public.ht_mail (
  id         bigserial primary key,
  from_id    uuid not null default auth.uid() references auth.users (id) on delete cascade,
  to_id      uuid references auth.users (id) on delete cascade,  -- null + to_admins = «Администрация»
  to_admins  boolean not null default false,
  subject    text not null check (char_length(subject) between 1 and 120),
  body       text not null default '' check (char_length(body) <= 5000),
  app_id     bigint references public.ht_user_apps (id) on delete set null,
  app_name   text,                -- снимок приложения в момент отправки:
  app_icon   text,                -- админ публикует ровно то, что посмотрел
  app_code   text,
  reply_to   bigint references public.ht_mail (id) on delete set null,
  created_at timestamptz not null default now(),
  read_at    timestamptz,
  from_del   boolean not null default false,
  to_del     boolean not null default false,
  check ((to_id is null) = to_admins)
);
alter table public.ht_mail add column if not exists app_price int;
-- app_update: письмо с обновлением уже выпущенного приложения (а не новым приложением)
alter table public.ht_mail add column if not exists app_update boolean not null default false;
-- корзина: когда письмо убрали в корзину (у отправителя и у получателя отдельно)
alter table public.ht_mail add column if not exists from_trash timestamptz;
alter table public.ht_mail add column if not exists to_trash timestamptz;
-- вложения: [{path, name, size, type}], файлы лежат в закрытом хранилище ht_mail_files
alter table public.ht_mail add column if not exists files jsonb not null default '[]'::jsonb;

insert into storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
values ('ht_mail_files', 'ht_mail_files', false, 26214400, null)
on conflict (id) do update set public = false, file_size_limit = 26214400;
create index if not exists ht_mail_to on public.ht_mail (to_id, created_at desc);
create index if not exists ht_mail_from on public.ht_mail (from_id, created_at desc);

create or replace function public.ht_is_staff_id(u uuid) returns boolean
language sql stable security definer set search_path = public as $$
  select exists (select 1 from profiles where id = u and role in ('teacher', 'admin'));
$$;

create or replace function public.ht_guard_mail() returns trigger
language plpgsql security definer set search_path = public as $$
declare n int; a record; f jsonb; p text;
begin
  if auth.uid() is null or current_setting('ht.sys', true) = '1' then return new; end if;
  if tg_op = 'UPDATE' then
    perform public.ht_flag('mail', 'Пытался изменить письмо'); return null;
  end if;
  if public.ht_is_banned() then raise exception 'Аккаунт заблокирован'; end if;
  if new.from_id is distinct from auth.uid() then
    perform public.ht_flag('spoof', 'Пытался отправить письмо от чужого имени'); return null;
  end if;
  if not public.ht_is_staff() then
    if not new.to_admins and not public.ht_is_staff_id(new.to_id) then
      raise exception 'Почтой можно писать только учителям и администрации. Друзьям пиши в HoroChat.';
    end if;
    select count(*) into n from ht_mail where from_id = auth.uid() and created_at > now() - interval '1 day';
    if n >= 20 then raise exception 'Сегодня уже отправлено 20 писем. Попробуй завтра.'; end if;
  end if;
  if public.ht_is_bad(new.subject || ' ' || new.body) then raise exception 'В письме есть недопустимые слова'; end if;
  new.created_at := now(); new.read_at := null; new.from_del := false; new.to_del := false;
  new.app_name := null; new.app_icon := null; new.app_code := null; new.app_price := null; new.app_update := false;
  new.from_trash := null; new.to_trash := null;
  -- вложения: только свои уже загруженные файлы, не больше 5
  if new.files is null or jsonb_typeof(new.files) <> 'array' then new.files := '[]'::jsonb; end if;
  if jsonb_array_length(new.files) > 5 then raise exception 'К письму можно приложить не больше 5 файлов'; end if;
  for f in select value from jsonb_array_elements(new.files) loop
    p := f ->> 'path';
    if p is null or p !~ ('^' || auth.uid()::text || '/[0-9]+-[0-9]+\.[a-z0-9]{1,5}$')
       or not exists (select 1 from storage.objects o where o.bucket_id = 'ht_mail_files' and o.name = p) then
      perform public.ht_flag('spoof', 'Приложил к письму чужой или несуществующий файл'); return null;
    end if;
    if char_length(coalesce(f ->> 'name', '')) not between 1 and 100 then raise exception 'У файла слишком длинное имя'; end if;
    if public.ht_is_bad(f ->> 'name') then raise exception 'В имени файла есть недопустимые слова'; end if;
  end loop;
  new.files := (select coalesce(jsonb_agg(jsonb_build_object('path', e ->> 'path', 'name', e ->> 'name',
                  'size', case when (e ->> 'size') ~ '^[0-9]{1,12}$' then (e ->> 'size')::bigint else 0 end,
                  'type', left(coalesce(e ->> 'type', ''), 100))), '[]'::jsonb)
                from jsonb_array_elements(new.files) e);
  if new.app_id is not null then
    select * into a from ht_user_apps where id = new.app_id;
    if not found or a.author_id <> auth.uid() then
      perform public.ht_flag('store', 'Приложил к письму чужое приложение'); return null;
    end if;
    if not new.to_admins then raise exception 'Приложение для HoroStore отправляется администрации'; end if;
    if char_length(a.code) < 10 then raise exception 'В приложении пока нет кода'; end if;
    new.app_name := a.name; new.app_icon := a.icon; new.app_code := a.code; new.app_price := a.price;
    new.app_update := a.listed and a.pub_code is not null;
    if new.app_update and a.code = a.pub_code and a.price = a.pub_price then
      raise exception 'В приложении нет изменений: в HoroStore уже эта версия';
    end if;
    perform set_config('ht.sys', '1', true);
    update ht_user_apps set status = 'review', review_note = null where id = a.id;
    perform set_config('ht.sys', '', true);
  end if;
  return new;
end $$;
drop trigger if exists ht_guard on public.ht_mail;
create trigger ht_guard before insert or update on public.ht_mail
  for each row execute function public.ht_guard_mail();

alter table public.ht_mail enable row level security;
revoke all on public.ht_mail from anon, authenticated;
grant select, insert on public.ht_mail to authenticated;
grant usage on sequence public.ht_mail_id_seq to authenticated;
drop policy if exists ht_mail_read on public.ht_mail;
create policy ht_mail_read on public.ht_mail for select to authenticated
  using ((from_id = auth.uid() and not from_del) or (to_id = auth.uid() and not to_del)
         or (to_admins and public.ht_is_admin()));
drop policy if exists ht_mail_send on public.ht_mail;
create policy ht_mail_send on public.ht_mail for insert to authenticated
  with check (from_id = auth.uid());

-- файлы писем: загружать — в свою папку; открывать — тем, кто видит письмо с этим файлом
create or replace function public.ht_mail_file_ok(p text) returns boolean
language sql stable security definer set search_path = public as $$
  select split_part(p, '/', 1) = auth.uid()::text
      or exists (select 1 from ht_mail m
                 where m.files @> jsonb_build_array(jsonb_build_object('path', p))
                   and (m.from_id = auth.uid() or m.to_id = auth.uid() or (m.to_admins and public.ht_is_admin())));
$$;
drop policy if exists ht_mailf_sel on storage.objects;
create policy ht_mailf_sel on storage.objects for select to authenticated
  using (bucket_id = 'ht_mail_files' and public.ht_mail_file_ok(name));
drop policy if exists ht_mailf_ins on storage.objects;
create policy ht_mailf_ins on storage.objects for insert to authenticated
  with check (bucket_id = 'ht_mail_files' and (storage.foldername(name))[1] = auth.uid()::text and not public.ht_is_banned());

-- прочитано / в корзину / вернуть из корзины / удалить насовсем
create or replace function public.ht_mail_mark(m bigint, act text) returns void
language plpgsql security definer set search_path = public as $$
begin
  perform set_config('ht.sys', '1', true);
  if act = 'read' then
    update ht_mail set read_at = coalesce(read_at, now())
     where id = m and (to_id = auth.uid() or (to_admins and public.ht_is_admin()));
  elsif act = 'trash' then
    update ht_mail set from_trash = case when from_id = auth.uid() then coalesce(from_trash, now()) else from_trash end,
                       to_trash = case when to_id = auth.uid() or (to_admins and public.ht_is_admin() and from_id <> auth.uid())
                                       then coalesce(to_trash, now()) else to_trash end
     where id = m and (from_id = auth.uid() or to_id = auth.uid() or (to_admins and public.ht_is_admin()));
  elsif act = 'restore' then
    update ht_mail set from_trash = case when from_id = auth.uid() then null else from_trash end,
                       to_trash = case when to_id = auth.uid() or (to_admins and public.ht_is_admin() and from_id <> auth.uid())
                                       then null else to_trash end
     where id = m and (from_id = auth.uid() or to_id = auth.uid() or (to_admins and public.ht_is_admin()));
  elsif act = 'purge' then
    -- очистить корзину (m = 0) или удалить то, что лежит в корзине дольше 30 дней (m = -1)
    update ht_mail set from_del = from_del or (from_id = auth.uid() and from_trash is not null and (m = 0 or from_trash < now() - interval '30 days')),
                       to_del = to_del or ((to_id = auth.uid() or (to_admins and public.ht_is_admin())) and to_trash is not null
                                           and (m = 0 or to_trash < now() - interval '30 days'))
     where (from_id = auth.uid() and from_trash is not null) or ((to_id = auth.uid() or (to_admins and public.ht_is_admin())) and to_trash is not null);
  elsif act = 'delete' then
    update ht_mail set from_del = from_del or from_id = auth.uid(),
                       to_del = to_del or to_id = auth.uid() or (to_admins and public.ht_is_admin())
     where id = m and (from_id = auth.uid() or to_id = auth.uid() or (to_admins and public.ht_is_admin()));
  else raise exception 'Неизвестное действие';
  end if;
  perform set_config('ht.sys', '', true);
end $$;

-- кому можно писать: учителя и админы (для учителей и админов — все)
create or replace function public.ht_mail_people()
returns table (id uuid, nick text, name text, role text)
language sql stable security definer set search_path = public as $$
  select p.id, p.nick, coalesce(nullif(p.name, ''), p.nick), p.role from profiles p
  where auth.uid() is not null and p.id <> auth.uid() and not coalesce(p.banned, false)
    and (public.ht_is_staff() or p.role in ('teacher', 'admin'))
  order by (p.role = 'student'), 3 limit 500;
$$;

-- админ: выпустить приложение из письма в HoroStore или отклонить
create or replace function public.ht_review_app(mail bigint, ok boolean, note text default '') returns void
language plpgsql security definer set search_path = public as $$
declare m record; a record; upd boolean; v int;
begin
  if not public.ht_is_admin() then
    perform public.ht_flag('store', 'Не админ пытался выпустить приложение'); return;
  end if;
  select * into m from ht_mail where id = mail and to_admins and app_id is not null;
  if not found then raise exception 'Письмо с приложением не найдено'; end if;
  select * into a from ht_user_apps where id = m.app_id;
  if not found then raise exception 'Автор уже удалил это приложение'; end if;
  -- старое письмо не должно затереть более новую версию
  if exists (select 1 from ht_mail where app_id = a.id and to_admins and id > m.id) then
    raise exception 'Автор уже прислал более новую версию. Открой последнее письмо с этим приложением.';
  end if;
  note := left(coalesce(note, ''), 1000);
  upd := a.listed and a.pub_code is not null;
  v := a.version + 1;
  perform set_config('ht.sys', '1', true);
  if ok then
    update ht_user_apps set pub_code = m.app_code, pub_price = coalesce(m.app_price, 0), listed = true, status = 'published',
           version = v, published_at = now(), review_note = nullif(note, '') where id = a.id;
  else
    -- выпущенное приложение остаётся в HoroStore в прежней версии
    update ht_user_apps set status = 'rejected', review_note = nullif(note, '') where id = a.id;
  end if;
  update ht_mail set read_at = coalesce(read_at, now()) where id = mail;
  perform set_config('ht.sys', '', true);
  insert into ht_mail (from_id, to_id, to_admins, subject, body, reply_to)
  values (auth.uid(), a.author_id, false,
          case when ok and upd then '✅ «' || a.name || '» обновлено до версии ' || v
               when ok then '✅ «' || a.name || '» теперь в HoroStore'
               when upd then '↩️ Обновление «' || a.name || '» пока не выпустили'
               else '↩️ «' || a.name || '» пока не выпустили' end,
          case when ok and upd then 'Админ проверил обновление и выпустил его. У всех, кто загрузил приложение, оно заменится на новую версию.'
               when ok then 'Админ проверил приложение и выпустил его. Его уже можно загрузить в HoroStore.'
               when upd then 'Админ посмотрел обновление и вернул его на доработку. В HoroStore пока остаётся прежняя версия.'
               else 'Админ посмотрел приложение и вернул его на доработку.' end
          || case when note <> '' then E'\n\nКомментарий: ' || note else '' end,
          mail);
end $$;

-- админ: убрать приложение из HoroStore
create or replace function public.ht_unlist_app(app bigint) returns void
language plpgsql security definer set search_path = public as $$
begin
  if not public.ht_is_admin() then perform public.ht_flag('store', 'Не админ пытался убрать приложение'); return; end if;
  update ht_user_apps set listed = false, status = 'rejected' where id = app;
end $$;

revoke all on function public.ht_can_see_portfolio(uuid, text), public.ht_portfolio_stats(uuid),
  public.ht_store_apps(), public.ht_install_app(bigint), public.ht_is_staff_id(uuid),
  public.ht_mail_mark(bigint, text), public.ht_mail_people(), public.ht_review_app(bigint, boolean, text),
  public.ht_unlist_app(bigint), public.ht_mail_file_ok(text) from public, anon;
grant execute on function public.ht_can_see_portfolio(uuid, text), public.ht_portfolio_stats(uuid),
  public.ht_store_apps(), public.ht_install_app(bigint), public.ht_is_staff_id(uuid),
  public.ht_mail_mark(bigint, text), public.ht_mail_people(), public.ht_review_app(bigint, boolean, text),
  public.ht_unlist_app(bigint), public.ht_mail_file_ok(text) to authenticated;


-- ---------------------------------------------------------------------
-- 6. Платные приложения HoroStore. Цена задаётся только здесь, на сервере:
--    из браузера нельзя ни поменять цену, ни «купить» без списания Tubek.
-- ---------------------------------------------------------------------
create table if not exists public.ht_app_buys (
  user_id    uuid not null references auth.users (id) on delete cascade,
  app        text not null,
  price      int  not null,
  created_at timestamptz not null default now(),
  primary key (user_id, app)
);
alter table public.ht_app_buys enable row level security;
revoke all on public.ht_app_buys from anon, authenticated;
grant select on public.ht_app_buys to authenticated;
drop policy if exists ht_app_buys_read on public.ht_app_buys;
create policy ht_app_buys_read on public.ht_app_buys for select to authenticated
  using (user_id = auth.uid() or public.ht_is_admin());

create or replace function public.ht_app_price(item text) returns int
language sql immutable as $$
  select case item
    when 'x_sudoku' then 15
    when 'x_2048'   then 10
    when 'x_blocks' then 20
    when 'x_pixel'  then 10
    when 'x_drums'  then 10
    when 'x_mendel' then 5
    when 'x_type'   then 5
  end;
$$;

-- Купить приложение: списывает Tubek один раз, повторная покупка ничего не списывает.
-- Возвращает баланс после покупки.
create or replace function public.ht_buy_app(item text) returns int
language plpgsql security definer set search_path = public as $$
declare cost int; bal int;
begin
  if auth.uid() is null then raise exception 'Нужно войти'; end if;
  if public.ht_is_banned() then raise exception 'Аккаунт заблокирован'; end if;
  cost := public.ht_app_price(item);
  if cost is null then raise exception 'Такого платного приложения нет'; end if;
  select coalesce(tubek, 0) into bal from profiles where id = auth.uid() for update;
  if exists (select 1 from ht_app_buys b where b.user_id = auth.uid() and b.app = item) then
    return bal;
  end if;
  if bal < cost then
    raise exception 'Не хватает Tubek: нужно %, у тебя %', cost, bal;
  end if;
  update profiles set tubek = tubek - cost where id = auth.uid();
  insert into ht_app_buys (user_id, app, price) values (auth.uid(), item, cost);
  insert into ht_tubek_log (user_id, source, amount, ref) values (auth.uid(), 'app', -cost, item);
  return bal - cost;
end $$;

-- Купить приложение другого ученика: у покупателя списывается цена, автор получает 70%
-- (округление вниз), остальное сгорает, поэтому «перекидывать» Tubek друг другу невыгодно.
-- Покупка = установка (ht_app_installs). Повторная покупка ничего не списывает.
create or replace function public.ht_buy_user_app(app bigint) returns int
language plpgsql security definer set search_path = public as $$
declare a record; bal int; share int;
begin
  if auth.uid() is null then raise exception 'Нужно войти'; end if;
  if public.ht_is_banned() then raise exception 'Аккаунт заблокирован'; end if;
  select * into a from ht_user_apps where id = app and listed and pub_code is not null;
  if not found then raise exception 'Приложение не найдено'; end if;
  select coalesce(tubek, 0) into bal from profiles where id = auth.uid() for update;
  if a.author_id = auth.uid() or a.pub_price = 0
     or exists (select 1 from ht_app_installs where app_id = app and user_id = auth.uid()) then
    perform public.ht_install_app(app);
    return bal;
  end if;
  if bal < a.pub_price then
    raise exception 'Не хватает Tubek: нужно %, у тебя %', a.pub_price, bal;
  end if;
  share := floor(a.pub_price * 0.7);
  update profiles set tubek = tubek - a.pub_price where id = auth.uid();
  insert into ht_tubek_log (user_id, source, amount, ref) values (auth.uid(), 'uapp', -a.pub_price, a.id::text);
  if share > 0 then
    update profiles set tubek = coalesce(tubek, 0) + share where id = a.author_id;
    insert into ht_tubek_log (user_id, source, amount, ref) values (a.author_id, 'uapp_sale', share, a.id::text);
  end if;
  insert into ht_app_installs (user_id, app_id) values (auth.uid(), app) on conflict do nothing;
  perform set_config('ht.sys', '1', true);
  update ht_user_apps set installs = installs + 1 where id = app;
  perform set_config('ht.sys', '', true);
  return bal - a.pub_price;
end $$;
revoke all on function public.ht_buy_user_app(bigint) from public, anon;
grant execute on function public.ht_buy_user_app(bigint) to authenticated;

revoke all on function public.ht_buy_app(text), public.ht_app_price(text) from public, anon;
grant execute on function public.ht_buy_app(text), public.ht_app_price(text) to authenticated;

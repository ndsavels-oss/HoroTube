-- =====================================================================
-- HoroTube: приложение «Файлы» (и «Документы») и группы в HoroChat
--
-- Выполнять после всех остальных файлов (нужны ht_is_admin, ht_is_staff,
-- ht_is_banned, ht_is_bad, ht_flag, ht_text_filter, ht_friends).
-- Проще всего — all_in_one.sql. Повторный запуск безопасен.
-- Откат: files_groups_rollback.sql.
--
-- Файлы — личные, как Фото: видит только владелец (и админ школы).
-- Текстовые файлы (документы, заметки, код) хранятся прямо в таблице,
-- видео и прочие файлы — в закрытом хранилище ht_files (до 50 МБ файл,
-- до 300 МБ и 500 файлов у одного ученика).
-- Группы: создатель добавляет друзей (учителя и админ — кого угодно),
-- до 30 человек. Переписку видят участники и админ школы. Мат, телефоны
-- и ссылки отправить нельзя, как и в личных сообщениях.
-- =====================================================================

-- ---------------------------------------------------------------------
-- 1. ФАЙЛЫ
-- ---------------------------------------------------------------------
insert into storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
values ('ht_files', 'ht_files', false, 52428800, null)
on conflict (id) do update set public = false, file_size_limit = 52428800;

drop policy if exists ht_files_sel on storage.objects;
create policy ht_files_sel on storage.objects for select to authenticated
  using (bucket_id = 'ht_files' and ((storage.foldername(name))[1] = auth.uid()::text or public.ht_is_admin()));
drop policy if exists ht_files_ins on storage.objects;
create policy ht_files_ins on storage.objects for insert to authenticated
  with check (bucket_id = 'ht_files' and (storage.foldername(name))[1] = auth.uid()::text and not public.ht_is_banned());
drop policy if exists ht_files_del on storage.objects;
create policy ht_files_del on storage.objects for delete to authenticated
  using (bucket_id = 'ht_files' and ((storage.foldername(name))[1] = auth.uid()::text or public.ht_is_admin()));

create table if not exists public.ht_files (
  id         bigserial primary key,
  user_id    uuid not null default auth.uid() references auth.users (id) on delete cascade,
  name       text not null check (char_length(name) between 1 and 80),
  kind       text not null check (kind in ('doc', 'note', 'code', 'video', 'image', 'other')),
  mime       text not null default '' check (char_length(mime) <= 100),
  body       text check (char_length(body) <= 400000),   -- документ, заметка или код
  path       text,                                          -- <uid>/<время>-<число>.<расш> в хранилище ht_files
  size       bigint not null default 0,
  src        text check (char_length(src) <= 40),           -- откуда: docs, notes, code, edit, upload, mail
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  check ((body is null) <> (path is null))
);
create index if not exists ht_files_user on public.ht_files (user_id, updated_at desc);

create or replace function public.ht_guard_files() returns trigger
language plpgsql security definer set search_path = public as $$
declare n int; tot bigint; sz bigint;
begin
  if auth.uid() is null or public.ht_is_admin() then return new; end if;
  if public.ht_is_banned() then raise exception 'Аккаунт заблокирован'; end if;
  if tg_op = 'INSERT' then
    if new.user_id is distinct from auth.uid() then
      perform public.ht_flag('spoof', 'Пытался положить файл в чужие Файлы'); return null;
    end if;
    if new.path is not null then
      if new.path !~ ('^' || auth.uid()::text || '/[0-9]+-[0-9]+\.[a-z0-9]{1,5}$') then
        perform public.ht_flag('files', 'Подставил чужой или странный путь к файлу: ' || left(new.path, 80)); return null;
      end if;
      -- размер берём у самого хранилища, а не со слов браузера
      select coalesce((o.metadata ->> 'size')::bigint, new.size) into sz
        from storage.objects o where o.bucket_id = 'ht_files' and o.name = new.path;
      if not found then raise exception 'Файл ещё не загрузился. Попробуй снова.'; end if;
      new.size := greatest(coalesce(sz, 0), 0);
    end if;
    select count(*), coalesce(sum(size), 0) into n, tot from ht_files where user_id = auth.uid();
    if n >= 500 then raise exception 'В Файлах уже 500 файлов. Удали ненужные.'; end if;
    new.created_at := now();
  else
    if (new.user_id, new.path, new.kind, new.created_at) is distinct from (old.user_id, old.path, old.kind, old.created_at)
       or (old.path is not null and new.size is distinct from old.size) then
      perform public.ht_flag('files', 'Пытался подменить файл'); return null;
    end if;
    select coalesce(sum(size), 0) into tot from ht_files where user_id = auth.uid() and id <> new.id;
  end if;
  if new.body is not null then new.size := octet_length(new.body); end if;
  if tot + new.size > 314572800 then raise exception 'Места в Файлах не хватает (максимум 300 МБ). Удали ненужное.'; end if;
  if public.ht_is_bad(new.name) then raise exception 'В имени файла есть недопустимые слова'; end if;
  new.updated_at := now();
  return new;
end $$;
drop trigger if exists ht_guard on public.ht_files;
create trigger ht_guard before insert or update on public.ht_files
  for each row execute function public.ht_guard_files();

alter table public.ht_files enable row level security;
revoke all on public.ht_files from anon, authenticated;
grant select, insert, update, delete on public.ht_files to authenticated;
grant usage on sequence public.ht_files_id_seq to authenticated;
drop policy if exists ht_files_own on public.ht_files;
create policy ht_files_own on public.ht_files for all to authenticated
  using (user_id = auth.uid() or public.ht_is_admin())
  with check (user_id = auth.uid() or public.ht_is_admin());


-- ---------------------------------------------------------------------
-- 2. ГРУППЫ В HoroChat
-- ---------------------------------------------------------------------
create table if not exists public.ht_groups (
  id         bigserial primary key,
  name       text not null check (char_length(name) between 1 and 40),
  icon       text not null default '👥' check (char_length(icon) <= 8),
  owner_id   uuid references auth.users (id) on delete set null,
  created_at timestamptz not null default now()
);
create table if not exists public.ht_group_members (
  group_id  bigint not null references public.ht_groups (id) on delete cascade,
  user_id   uuid not null references auth.users (id) on delete cascade,
  added_by  uuid references auth.users (id) on delete set null,
  joined_at timestamptz not null default now(),
  last_read bigint not null default 0,
  primary key (group_id, user_id)
);
create index if not exists ht_group_members_user on public.ht_group_members (user_id);
create table if not exists public.ht_group_msgs (
  id          bigserial primary key,
  group_id    bigint not null references public.ht_groups (id) on delete cascade,
  sender_id   uuid default auth.uid() references auth.users (id) on delete set null,
  author_name text,
  body        text not null check (char_length(body) between 1 and 1000),
  sys         boolean not null default false,               -- «Анна добавила Бориса» и т. п.
  created_at  timestamptz not null default now()
);
create index if not exists ht_group_msgs_g on public.ht_group_msgs (group_id, id desc);

create or replace function public.ht_in_group(g bigint) returns boolean
language sql stable security definer set search_path = public as $$
  select exists (select 1 from ht_group_members where group_id = g and user_id = auth.uid());
$$;
create or replace function public.ht_is_friend(u uuid) returns boolean
language sql stable security definer set search_path = public as $$
  select exists (select 1 from ht_friends where a = least(auth.uid(), u) and b = greatest(auth.uid(), u));
$$;

create or replace function public.ht_guard_group_msg() returns trigger
language plpgsql security definer set search_path = public as $$
declare n int;
begin
  if auth.uid() is null or current_setting('ht.sys', true) = '1' then return new; end if;
  if public.ht_is_banned() then raise exception 'Аккаунт заблокирован'; end if;
  if new.sender_id is distinct from auth.uid() then
    perform public.ht_flag('spoof', 'Пытался написать в группу от чужого имени'); return null;
  end if;
  if not public.ht_in_group(new.group_id) then
    perform public.ht_flag('group', 'Пытался написать в группу, где его нет'); return null;
  end if;
  select count(*) into n from ht_group_msgs where sender_id = auth.uid() and created_at > now() - interval '1 minute';
  if n >= 15 then raise exception 'Слишком часто. Подожди немного и попробуй снова.'; end if;
  new.sys := false;
  new.created_at := now();
  new.author_name := (select coalesce(nullif(name, ''), nick) from profiles where id = auth.uid());
  return new;
end $$;
drop trigger if exists ht_guard on public.ht_group_msgs;
create trigger ht_guard before insert on public.ht_group_msgs
  for each row execute function public.ht_guard_group_msg();
drop trigger if exists ht_filter_body on public.ht_group_msgs;
create trigger ht_filter_body before insert on public.ht_group_msgs
  for each row execute function public.ht_text_filter('body', 'contacts');

alter table public.ht_groups enable row level security;
alter table public.ht_group_members enable row level security;
alter table public.ht_group_msgs enable row level security;
revoke all on public.ht_groups, public.ht_group_members, public.ht_group_msgs from anon, authenticated;
grant select on public.ht_groups, public.ht_group_members to authenticated;
grant select, insert on public.ht_group_msgs to authenticated;
grant delete on public.ht_group_msgs to authenticated;
grant usage on sequence public.ht_group_msgs_id_seq to authenticated;
drop policy if exists ht_groups_read on public.ht_groups;
create policy ht_groups_read on public.ht_groups for select to authenticated
  using (public.ht_in_group(id) or public.ht_is_admin());
drop policy if exists ht_gm_read on public.ht_group_members;
create policy ht_gm_read on public.ht_group_members for select to authenticated
  using (public.ht_in_group(group_id) or public.ht_is_admin());
drop policy if exists ht_gmsg_read on public.ht_group_msgs;
create policy ht_gmsg_read on public.ht_group_msgs for select to authenticated
  using (public.ht_in_group(group_id) or public.ht_is_admin());
drop policy if exists ht_gmsg_send on public.ht_group_msgs;
create policy ht_gmsg_send on public.ht_group_msgs for insert to authenticated
  with check (sender_id = auth.uid() and not public.ht_is_banned());
-- удалять сообщения может только админ, как и в личке
drop policy if exists ht_gmsg_del on public.ht_group_msgs;
create policy ht_gmsg_del on public.ht_group_msgs for delete to authenticated
  using (public.ht_is_admin());

-- служебное сообщение в группе
create or replace function public.ht_group_note(g bigint, t text) returns void
language plpgsql security definer set search_path = public as $$
begin
  perform set_config('ht.sys', '1', true);
  insert into ht_group_msgs (group_id, sender_id, author_name, body, sys) values (g, null, null, left(t, 1000), true);
  perform set_config('ht.sys', '', true);
end $$;
revoke all on function public.ht_group_note(bigint, text) from public, anon, authenticated;

create or replace function public.ht_nm(u uuid) returns text
language sql stable security definer set search_path = public as $$
  select coalesce(nullif(name, ''), nick, 'Пользователь') from profiles where id = u;
$$;

-- добавить людей: создатель группы (или админ); ученики — только друзей
create or replace function public.ht_group_add(g bigint, users uuid[]) returns int
language plpgsql security definer set search_path = public as $$
declare u uuid; n int := 0; cnt int; gr record; names text := '';
begin
  if auth.uid() is null then raise exception 'Войди в аккаунт'; end if;
  if public.ht_is_banned() then raise exception 'Аккаунт заблокирован'; end if;
  select * into gr from ht_groups where id = g;
  if not found then raise exception 'Группа не найдена'; end if;
  if gr.owner_id is distinct from auth.uid() and not public.ht_is_admin() then
    perform public.ht_flag('group', 'Пытался добавить людей в чужую группу'); return 0;
  end if;
  foreach u in array coalesce(users, '{}') loop
    if u = auth.uid() or exists (select 1 from ht_group_members where group_id = g and user_id = u) then continue; end if;
    if not exists (select 1 from profiles where id = u and not coalesce(banned, false)) then continue; end if;
    if not public.ht_is_staff() and not public.ht_is_friend(u) then
      raise exception 'В группу можно добавлять только друзей';
    end if;
    if exists (select 1 from ht_dm_blocks where blocker = u and blocked = auth.uid()) then continue; end if;
    select count(*) into cnt from ht_group_members where group_id = g;
    if cnt >= 30 then raise exception 'В группе уже 30 человек'; end if;
    insert into ht_group_members (group_id, user_id, added_by) values (g, u, auth.uid());
    -- новичок не видит старые непрочитанные: всё, что было до него, считаем прочитанным
    update ht_group_members set last_read = coalesce((select max(id) from ht_group_msgs where group_id = g), 0)
     where group_id = g and user_id = u;
    n := n + 1; names := names || case when names = '' then '' else ', ' end || public.ht_nm(u);
  end loop;
  if n > 0 then perform public.ht_group_note(g, public.ht_nm(auth.uid()) || ' добавил(а): ' || names); end if;
  return n;
end $$;

create or replace function public.ht_group_create(p_name text, p_icon text, users uuid[]) returns bigint
language plpgsql security definer set search_path = public as $$
declare g bigint; n int;
begin
  if auth.uid() is null then raise exception 'Войди в аккаунт'; end if;
  if public.ht_is_banned() then raise exception 'Аккаунт заблокирован'; end if;
  p_name := btrim(coalesce(p_name, ''));
  if char_length(p_name) not between 1 and 40 then raise exception 'Название группы — от 1 до 40 символов'; end if;
  if public.ht_is_bad(p_name) or public.ht_has_contact(p_name) then raise exception 'В названии есть недопустимые слова или контакты'; end if;
  select count(*) into n from ht_groups where owner_id = auth.uid();
  if n >= 10 and not public.ht_is_staff() then raise exception 'Можно создать не больше 10 групп'; end if;
  insert into ht_groups (name, icon, owner_id) values (p_name, coalesce(nullif(left(btrim(coalesce(p_icon, '')), 8), ''), '👥'), auth.uid())
    returning id into g;
  insert into ht_group_members (group_id, user_id, added_by) values (g, auth.uid(), auth.uid());
  perform public.ht_group_note(g, public.ht_nm(auth.uid()) || ' создал(а) группу «' || p_name || '»');
  perform public.ht_group_add(g, users);
  return g;
end $$;

create or replace function public.ht_group_edit(g bigint, p_name text, p_icon text) returns void
language plpgsql security definer set search_path = public as $$
declare gr record;
begin
  select * into gr from ht_groups where id = g;
  if not found then raise exception 'Группа не найдена'; end if;
  if gr.owner_id is distinct from auth.uid() and not public.ht_is_admin() then
    perform public.ht_flag('group', 'Пытался переименовать чужую группу'); return;
  end if;
  p_name := btrim(coalesce(p_name, ''));
  if char_length(p_name) not between 1 and 40 then raise exception 'Название группы — от 1 до 40 символов'; end if;
  if public.ht_is_bad(p_name) or public.ht_has_contact(p_name) then raise exception 'В названии есть недопустимые слова или контакты'; end if;
  update ht_groups set name = p_name, icon = coalesce(nullif(left(btrim(coalesce(p_icon, '')), 8), ''), icon) where id = g;
  if p_name <> gr.name then perform public.ht_group_note(g, public.ht_nm(auth.uid()) || ' переименовал(а) группу в «' || p_name || '»'); end if;
end $$;

-- убрать участника (создатель или админ) или выйти самому (u = себя)
create or replace function public.ht_group_remove(g bigint, u uuid) returns void
language plpgsql security definer set search_path = public as $$
declare gr record; nxt uuid;
begin
  if auth.uid() is null then raise exception 'Войди в аккаунт'; end if;
  select * into gr from ht_groups where id = g;
  if not found then raise exception 'Группа не найдена'; end if;
  if u is distinct from auth.uid() and gr.owner_id is distinct from auth.uid() and not public.ht_is_admin() then
    perform public.ht_flag('group', 'Пытался убрать человека из чужой группы'); return;
  end if;
  delete from ht_group_members where group_id = g and user_id = u;
  if not found then return; end if;
  if not exists (select 1 from ht_group_members where group_id = g) then
    delete from ht_groups where id = g; return;
  end if;
  perform public.ht_group_note(g, case when u = auth.uid() then public.ht_nm(u) || ' вышел(ла) из группы'
                                       else public.ht_nm(auth.uid()) || ' убрал(а) из группы: ' || public.ht_nm(u) end);
  -- создатель вышел: группа переходит к тому, кто в ней дольше всех
  if gr.owner_id = u then
    select user_id into nxt from ht_group_members where group_id = g order by joined_at limit 1;
    update ht_groups set owner_id = nxt where id = g;
    perform public.ht_group_note(g, 'Теперь группой управляет ' || public.ht_nm(nxt));
  end if;
end $$;

-- список моих групп для чатов: последнее сообщение и сколько непрочитанных
create or replace function public.ht_group_list()
returns table (id bigint, name text, icon text, owner_id uuid, members int, last_body text, last_at timestamptz,
               last_from text, last_sys boolean, unread int)
language sql stable security definer set search_path = public as $$
  select g.id, g.name, g.icon, g.owner_id,
         (select count(*) from ht_group_members x where x.group_id = g.id)::int,
         l.body, coalesce(l.created_at, g.created_at), l.author_name, coalesce(l.sys, false),
         (select count(*) from ht_group_msgs u where u.group_id = g.id and u.id > m.last_read
            and u.sender_id is distinct from auth.uid() and not u.sys)::int
  from ht_group_members m join ht_groups g on g.id = m.group_id
  left join lateral (select * from ht_group_msgs z where z.group_id = g.id order by z.id desc limit 1) l on true
  where m.user_id = auth.uid()
  order by coalesce(l.created_at, g.created_at) desc
  limit 100;
$$;

create or replace function public.ht_group_people(g bigint)
returns table (id uuid, nick text, name text, role text, owner boolean, joined_at timestamptz)
language sql stable security definer set search_path = public as $$
  select p.id, p.nick, coalesce(nullif(p.name, ''), p.nick), p.role, p.id = gr.owner_id, m.joined_at
  from ht_group_members m join profiles p on p.id = m.user_id join ht_groups gr on gr.id = m.group_id
  where m.group_id = g and (public.ht_in_group(g) or public.ht_is_admin())
  order by p.id = gr.owner_id desc, m.joined_at;
$$;

create or replace function public.ht_group_read(g bigint) returns void
language sql security definer set search_path = public as $$
  update ht_group_members set last_read = greatest(last_read, coalesce((select max(id) from ht_group_msgs where group_id = g), 0))
   where group_id = g and user_id = auth.uid();
$$;

revoke all on function public.ht_in_group(bigint), public.ht_is_friend(uuid), public.ht_nm(uuid),
  public.ht_group_add(bigint, uuid[]), public.ht_group_create(text, text, uuid[]), public.ht_group_edit(bigint, text, text),
  public.ht_group_remove(bigint, uuid), public.ht_group_list(), public.ht_group_people(bigint), public.ht_group_read(bigint)
  from public, anon;
grant execute on function public.ht_in_group(bigint), public.ht_is_friend(uuid), public.ht_nm(uuid),
  public.ht_group_add(bigint, uuid[]), public.ht_group_create(text, text, uuid[]), public.ht_group_edit(bigint, text, text),
  public.ht_group_remove(bigint, uuid), public.ht_group_list(), public.ht_group_people(bigint), public.ht_group_read(bigint)
  to authenticated;

-- =====================================================================
-- HoroTube: онлайн-шахматы (кто сейчас в шахматах + партии)
--
-- Выполнять после security.sql и messenger_stories.sql.
-- Supabase -> SQL Editor -> New query -> вставить весь файл -> Run.
-- Повторный запуск безопасен. Откат: chess_rollback.sql.
--
-- Игра с компьютером и обучение работают и без этого файла.
--
-- Что проверяет сервер: ходить можно только в своей партии и только в
-- свою очередь, по одному ходу; запись хода вида e2e4. Правила шахмат
-- (можно ли так ходить) проверяет сайт у обоих игроков: невозможный ход
-- соперника сайт не покажет. За онлайн-партии Tubek не дают, поэтому
-- подделывать результат незачем.
-- =====================================================================

-- Кто сейчас на странице шахмат (сайт отмечается каждые несколько секунд)
create table if not exists public.ht_chess_lobby (
  user_id uuid primary key default auth.uid() references auth.users (id) on delete cascade,
  name    text,
  seen_at timestamptz not null default now()
);

create or replace function public.ht_guard_chess_lobby() returns trigger
language plpgsql security definer set search_path = public as $$
begin
  if auth.uid() is null then return new; end if;
  if public.ht_is_banned() then raise exception 'Аккаунт заблокирован'; end if;
  new.user_id := auth.uid();
  new.name := (select coalesce(nullif(name, ''), nick) || ' (@' || nick || ')' from profiles where id = auth.uid());
  new.seen_at := now();
  return new;
end $$;

drop trigger if exists ht_guard on public.ht_chess_lobby;
create trigger ht_guard before insert or update on public.ht_chess_lobby
  for each row execute function public.ht_guard_chess_lobby();

alter table public.ht_chess_lobby enable row level security;
revoke all on public.ht_chess_lobby from anon, authenticated;
grant select, insert, update, delete on public.ht_chess_lobby to authenticated;

drop policy if exists ht_lobby_sel on public.ht_chess_lobby;
create policy ht_lobby_sel on public.ht_chess_lobby for select to authenticated
  using (seen_at > now() - interval '2 minutes' or user_id = auth.uid());
drop policy if exists ht_lobby_ins on public.ht_chess_lobby;
create policy ht_lobby_ins on public.ht_chess_lobby for insert to authenticated
  with check (user_id = auth.uid());
drop policy if exists ht_lobby_upd on public.ht_chess_lobby;
create policy ht_lobby_upd on public.ht_chess_lobby for update to authenticated
  using (user_id = auth.uid()) with check (user_id = auth.uid());
drop policy if exists ht_lobby_del on public.ht_chess_lobby;
create policy ht_lobby_del on public.ht_chess_lobby for delete to authenticated
  using (user_id = auth.uid() or public.ht_is_admin());


-- Партии
create table if not exists public.ht_chess (
  id          bigserial primary key,
  white       uuid not null references auth.users (id) on delete cascade,
  black       uuid not null references auth.users (id) on delete cascade,
  white_name  text,
  black_name  text,
  created_by  uuid not null default auth.uid(),
  status      text not null default 'invited' check (status in ('invited', 'active', 'finished', 'declined')),
  moves       text not null default '',   -- ходы через пробел: e2e4 e7e5 g1f3 ...
  ply         int  not null default 0,    -- сколько ходов сделано
  result      text check (result in ('1-0', '0-1', '1/2-1/2')),
  reason      text check (reason in ('mate', 'stalemate', 'fifty', 'repeat', 'material', 'resign')),
  created_at  timestamptz not null default now(),
  updated_at  timestamptz not null default now()
);
create index if not exists ht_chess_white on public.ht_chess (white, status);
create index if not exists ht_chess_black on public.ht_chess (black, status);

create or replace function public.ht_guard_chess() returns trigger
language plpgsql security definer set search_path = public as $$
declare other uuid; n int; mover uuid; mv text;
begin
  if auth.uid() is null then return new; end if;   -- SQL Editor: без проверок
  if tg_op = 'INSERT' then
    if public.ht_is_banned() then raise exception 'Аккаунт заблокирован'; end if;
    if auth.uid() not in (new.white, new.black) or new.white = new.black then
      raise exception 'Можно позвать только другого игрока, а играть — самому';
    end if;
    other := case when new.white = auth.uid() then new.black else new.white end;
    if not exists (select 1 from profiles where id = other and not coalesce(banned, false)) then
      raise exception 'Игрок не найден';
    end if;
    if to_regclass('public.ht_dm_blocks') is not null and exists (
         select 1 from ht_dm_blocks where (blocker = other and blocked = auth.uid()) or (blocker = auth.uid() and blocked = other)) then
      raise exception 'Нельзя позвать этого игрока';
    end if;
    select count(*) into n from ht_chess where created_by = auth.uid() and created_at > now() - interval '1 hour';
    if n >= 30 then raise exception 'Слишком много приглашений. Подожди немного.'; end if;
    new.created_by := auth.uid();
    new.status := 'invited'; new.moves := ''; new.ply := 0; new.result := null; new.reason := null;
    new.created_at := now(); new.updated_at := now();
    new.white_name := (select coalesce(nullif(name, ''), nick) from profiles where id = new.white);
    new.black_name := (select coalesce(nullif(name, ''), nick) from profiles where id = new.black);
    return new;
  end if;

  -- UPDATE
  if public.ht_is_admin() then new.updated_at := now(); return new; end if;
  if auth.uid() not in (old.white, old.black) then perform public.ht_flag('chess', 'Пытался изменить чужую партию'); return null; end if;
  if (new.white, new.black, new.white_name, new.black_name, new.created_by, new.created_at)
     is distinct from (old.white, old.black, old.white_name, old.black_name, old.created_by, old.created_at) then
    perform public.ht_flag('chess', 'Пытался подменить игроков партии'); return null;
  end if;
  new.updated_at := now();

  if old.status = 'invited' then
    if new.moves <> old.moves or new.ply <> old.ply or new.result is not null or new.reason is not null then
      raise exception 'Партия ещё не началась';
    end if;
    if new.status = 'active' then
      if auth.uid() = old.created_by then perform public.ht_flag('chess', 'Пытался сам принять своё приглашение'); return null; end if;
      if old.created_at < now() - interval '10 minutes' then raise exception 'Приглашение устарело'; end if;
    elsif new.status not in ('declined', 'invited') then
      raise exception 'Так нельзя';
    end if;
    return new;
  end if;

  if old.status <> 'active' then raise exception 'Партия уже закончена'; end if;
  if new.status not in ('active', 'finished') then raise exception 'Так нельзя'; end if;

  if new.ply = old.ply then
    -- без хода можно только сдаться
    if new.moves <> old.moves then raise exception 'Так нельзя'; end if;
    if new.status = 'finished' then
      if new.reason is distinct from 'resign'
         or new.result is distinct from (case when auth.uid() = old.white then '0-1' else '1-0' end) then
        perform public.ht_flag('chess', 'Пытался «сдаться» за соперника, то есть приписать себе победу'); return null;
      end if;
    elsif new.result is not null or new.reason is not null then
      raise exception 'Так нельзя';
    end if;
    return new;
  end if;

  -- обычный ход: ровно один, в свою очередь
  mover := case when old.ply % 2 = 0 then old.white else old.black end;
  if auth.uid() <> mover then perform public.ht_flag('chess', 'Пытался сходить за соперника'); return null; end if;
  if new.ply <> old.ply + 1 then perform public.ht_flag('chess', 'Пытался сделать несколько ходов сразу'); return null; end if;
  mv := case when old.moves = '' then new.moves else substr(new.moves, length(old.moves) + 2) end;
  if mv !~ '^[a-h][1-8][a-h][1-8][qrbn]?$'
     or new.moves <> (case when old.moves = '' then mv else old.moves || ' ' || mv end) then
    perform public.ht_flag('chess', 'Прислал ход в неверной записи: ' || left(new.moves, 60)); return null;
  end if;
  if new.status = 'finished' then
    -- после своего хода можно объявить мат (свою победу) или ничью
    if not ((new.reason = 'mate' and new.result = (case when mover = old.white then '1-0' else '0-1' end))
         or (new.reason in ('stalemate', 'fifty', 'repeat', 'material') and new.result = '1/2-1/2')) then
      perform public.ht_flag('chess', 'Пытался приписать себе победу без мата'); return null;
    end if;
  elsif new.result is not null or new.reason is not null then
    raise exception 'Так нельзя';
  end if;
  return new;
end $$;

drop trigger if exists ht_guard on public.ht_chess;
create trigger ht_guard before insert or update on public.ht_chess
  for each row execute function public.ht_guard_chess();

alter table public.ht_chess enable row level security;
revoke all on public.ht_chess from anon, authenticated;
grant select, insert, update on public.ht_chess to authenticated;
grant delete on public.ht_chess to authenticated;
grant usage on sequence public.ht_chess_id_seq to authenticated;

drop policy if exists ht_chess_sel on public.ht_chess;
create policy ht_chess_sel on public.ht_chess for select to authenticated
  using (auth.uid() in (white, black) or public.ht_is_admin());
drop policy if exists ht_chess_ins on public.ht_chess;
create policy ht_chess_ins on public.ht_chess for insert to authenticated
  with check (created_by = auth.uid() and not public.ht_is_banned());
drop policy if exists ht_chess_upd on public.ht_chess;
create policy ht_chess_upd on public.ht_chess for update to authenticated
  using (auth.uid() in (white, black) or public.ht_is_admin())
  with check (auth.uid() in (white, black) or public.ht_is_admin());
drop policy if exists ht_chess_del on public.ht_chess;
create policy ht_chess_del on public.ht_chess for delete to authenticated
  using (public.ht_is_admin());

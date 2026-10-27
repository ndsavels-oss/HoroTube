-- =====================================================================
-- HoroTube: Tubek за шахматы и тарифы премиума (Игры / Всё сразу)
--
-- Выполнять последним: после security.sql, moderation.sql,
-- messenger_stories.sql и chess.sql.
-- Supabase -> SQL Editor -> New query -> вставить весь файл -> Run.
-- Повторный запуск безопасен. Откат: premium_chess_rollback.sql.
--
-- Сколько дают (всё считает сервер, сайт только просит):
--   с компьютером: победа на уровне «Новичок» +1, «Любитель» +2, «Сильный» +4
--   обучение: задача «мат в 1» +1, «мат в 2» +2, эндшпиль +3
--   онлайн: победа +5, ничья +2 каждому (если в партии хотя бы 20 ходов)
--   лимит: не больше 20 🪙 за шахматы в день
--
-- Тарифы (только за Tubek):
--   🎮 «Игры»: только Аркада (все игры и шахматы) — 7 дней 30 🪙, 30 дней 100 🪙
--   ⭐ «Всё сразу»: Аркада + сторис, реакции, статус, темы, золотая рамка —
--      1 день 10 🪙, 7 дней 50 🪙, 30 дней 170 🪙
-- =====================================================================

-- Тариф «Игры» хранится отдельно от премиума: так золотая рамка и ⭐ у имени
-- остаются только у тарифа «Всё сразу». Менять таблицу может только сервер.
create table if not exists public.ht_plans (
  user_id     uuid primary key references auth.users (id) on delete cascade,
  games_until timestamptz
);
alter table public.ht_plans enable row level security;
revoke all on public.ht_plans from anon, authenticated;
grant select on public.ht_plans to authenticated;
drop policy if exists ht_plans_read on public.ht_plans;
create policy ht_plans_read on public.ht_plans for select to authenticated
  using (user_id = auth.uid() or public.ht_is_admin());

-- Можно ли играть в Аркаду: «Всё сразу», «Игры» или премиум от админа.
-- Для самого админа игры тоже платные (решение 25.10), поэтому роль здесь не проверяем.
create or replace function public.ht_can_play() returns boolean
language sql stable security definer set search_path = public as $$
  select exists (select 1 from profiles where id = auth.uid() and (coalesce(premium, false) or premium_until > now()))
      or exists (select 1 from ht_plans where user_id = auth.uid() and games_until > now());
$$;

-- Журнал начислений: из него считаются лимиты, админ видит, кто за что получил
create table if not exists public.ht_tubek_log (
  id         bigserial primary key,
  user_id    uuid not null references auth.users (id) on delete cascade,
  source     text not null,       -- chess_ai1, chess_m1, chess_online_win, premium_7 ...
  amount     int  not null,
  ref        text,                -- например, id онлайн-партии
  created_at timestamptz not null default now()
);
create index if not exists ht_tubek_log_user on public.ht_tubek_log (user_id, created_at desc);
alter table public.ht_tubek_log enable row level security;
revoke all on public.ht_tubek_log from anon, authenticated;
grant select on public.ht_tubek_log to authenticated;
drop policy if exists ht_tubek_log_read on public.ht_tubek_log;
create policy ht_tubek_log_read on public.ht_tubek_log for select to authenticated
  using (user_id = auth.uid() or public.ht_is_admin());

-- Сколько шахматных Tubek человек уже получил сегодня
create or replace function public.ht_chess_today(uid uuid) returns int
language sql stable security definer set search_path = public as $$
  select coalesce(sum(amount), 0)::int from ht_tubek_log
  where user_id = uid and source like 'chess%' and created_at > date_trunc('day', now());
$$;

-- Начислить с учётом дневного лимита; возвращает, сколько реально начислено
create or replace function public.ht_chess_pay(uid uuid, src text, amt int, r text) returns int
language plpgsql security definer set search_path = public as $$
declare left_today int;
begin
  left_today := greatest(0, 20 - public.ht_chess_today(uid));
  amt := least(amt, left_today);
  if amt <= 0 then return 0; end if;
  update profiles set tubek = coalesce(tubek, 0) + amt where id = uid;
  insert into ht_tubek_log (user_id, source, amount, ref) values (uid, src, amt, r);
  return amt;
end $$;

-- Победа над компьютером и решённые задачи.
-- Партию с компьютером сервер видеть не может, поэтому защищают паузы:
-- честная победа над компьютером занимает минуты, задача — секунды.
-- Ответ: сколько начислено; 0 — лимит на сегодня; -1 — слишком быстро.
create or replace function public.ht_chess_reward(kind text) returns int
language plpgsql security definer set search_path = public as $$
declare amt int; pause interval; last timestamptz;
begin
  if auth.uid() is null then raise exception 'Нужно войти'; end if;
  if public.ht_is_banned() then raise exception 'Аккаунт заблокирован'; end if;
  if not public.ht_can_play() then
    perform public.ht_flag('cheat', 'Просил Tubek за шахматы без доступа к Аркаде (в обход сайта)');
    return -2;
  end if;
  case kind
    when 'ai1'    then amt := 1; pause := interval '2 minutes';
    when 'ai2'    then amt := 2; pause := interval '3 minutes';
    when 'ai3'    then amt := 4; pause := interval '4 minutes';
    when 'm1'     then amt := 1; pause := interval '10 seconds';
    when 'm2'     then amt := 2; pause := interval '20 seconds';
    when 'ending' then amt := 3; pause := interval '1 minute';
    else
      perform public.ht_flag('cheat', 'Просил Tubek за несуществующую игру: ' || left(coalesce(kind, ''), 40));
      return -2;
  end case;
  -- одна награда за раз: пауза считается от прошлой награды этого же вида
  select max(created_at) into last from ht_tubek_log
   where user_id = auth.uid() and source = 'chess_' || kind;
  if last is not null and last > now() - pause then
    -- честный игрок так быстро не выигрывает: похоже на накрутку из консоли
    perform public.ht_flag('cheat_fast', format('Слишком частые награды за шахматы (%s): быстрее, чем можно честно выиграть', kind));
    return -1;
  end if;
  return public.ht_chess_pay(auth.uid(), 'chess_' || kind, amt, null);
end $$;

-- Онлайн: когда партия закончилась, сервер сам награждает игроков.
-- Чтобы друзья не «фармили» Tubek, сдаваясь друг другу:
-- партия засчитывается, только если в ней не меньше 20 ходов,
-- и с одним и тем же соперником награда — не больше 3 партий в день.
create or replace function public.ht_chess_online_reward() returns trigger
language plpgsql security definer set search_path = public as $$
declare n int;
begin
  if new.status <> 'finished' or old.status = 'finished' or new.ply < 20 or new.result is null then
    return new;
  end if;
  select count(distinct ref) into n from ht_tubek_log
   where source like 'chess_online%' and created_at > date_trunc('day', now())
     and user_id in (new.white, new.black)
     and ref in (select id::text from ht_chess
                 where (white = new.white and black = new.black) or (white = new.black and black = new.white));
  if n >= 3 then return new; end if;
  if new.result = '1-0' then
    perform public.ht_chess_pay(new.white, 'chess_online_win', 5, new.id::text);
  elsif new.result = '0-1' then
    perform public.ht_chess_pay(new.black, 'chess_online_win', 5, new.id::text);
  else
    perform public.ht_chess_pay(new.white, 'chess_online_draw', 2, new.id::text);
    perform public.ht_chess_pay(new.black, 'chess_online_draw', 2, new.id::text);
  end if;
  return new;
end $$;

do $$ begin
  if to_regclass('public.ht_chess') is not null then
    execute 'drop trigger if exists ht_reward on public.ht_chess';
    execute 'create trigger ht_reward after update on public.ht_chess for each row execute function public.ht_chess_online_reward()';
  end if;
end $$;


-- ---------------------------------------------------------------------
-- Покупка тарифа. Цены задаёт сервер: из браузера можно выбрать только тариф.
-- Если тариф ещё идёт, новые дни добавляются к нему.
-- Старая функция buy_premium (7 дней за 50) продолжает работать.
-- ---------------------------------------------------------------------
drop function if exists public.ht_buy_premium(int);
create or replace function public.ht_buy_plan(plan text, days int) returns timestamptz
language plpgsql security definer set search_path = public as $$
declare cost int; p record; v timestamptz; g timestamptz;
begin
  if auth.uid() is null then raise exception 'Нужно войти'; end if;
  if public.ht_is_banned() then raise exception 'Аккаунт заблокирован'; end if;
  cost := case
    when plan = 'games' and days = 7  then 30
    when plan = 'games' and days = 30 then 100
    when plan = 'all'   and days = 1  then 10
    when plan = 'all'   and days = 7  then 50
    when plan = 'all'   and days = 30 then 170
  end;
  if cost is null then raise exception 'Такого тарифа нет'; end if;
  select premium, premium_until, tubek, role into p from profiles where id = auth.uid() for update;
  if coalesce(p.premium, false) then
    raise exception 'У тебя уже бессрочный премиум';
  end if;
  if coalesce(p.tubek, 0) < cost then
    raise exception 'Не хватает Tubek: нужно %, у тебя %', cost, coalesce(p.tubek, 0);
  end if;
  update profiles set tubek = tubek - cost where id = auth.uid();
  if plan = 'all' then
    v := greatest(coalesce(p.premium_until, now()), now()) + make_interval(days => days);
    update profiles set premium_until = v where id = auth.uid();
  else
    select games_until into g from ht_plans where user_id = auth.uid();
    v := greatest(coalesce(g, now()), now()) + make_interval(days => days);
    insert into ht_plans (user_id, games_until) values (auth.uid(), v)
      on conflict (user_id) do update set games_until = excluded.games_until;
  end if;
  insert into ht_tubek_log (user_id, source, amount) values (auth.uid(), plan || '_' || days, -cost);
  return v;
end $$;

revoke all on function public.ht_chess_reward(text), public.ht_buy_plan(text, int), public.ht_can_play() from public, anon;
grant execute on function public.ht_chess_reward(text), public.ht_buy_plan(text, int), public.ht_can_play() to authenticated;
revoke all on function public.ht_chess_pay(uuid, text, int, text), public.ht_chess_today(uuid) from public, anon, authenticated;

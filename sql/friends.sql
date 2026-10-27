-- =====================================================================
-- HoroTube: друзья по QR-коду (+1 Tubek за нового друга)
--
-- Выполнять после security.sql, messenger_stories.sql и premium_chess.sql
-- (нужны ht_flag, ht_dm_blocks и журнал ht_tubek_log).
-- Supabase -> SQL Editor -> New query -> вставить весь файл -> Run.
-- Повторный запуск безопасен. Откат: friends_rollback.sql.
--
-- Как это работает:
--   у каждого свой код друга из 8 знаков (например K7MX4QPA), он же в QR-коде;
--   друг наводит камеру на QR (или вводит код) — и вы оба друзья;
--   за нового друга +1 🪙 каждому, но не больше 5 🪙 за друзей в день,
--   и за одну и ту же пару только один раз (удалить и добавить снова — без Tubek);
--   подбирать чужие коды нельзя: не больше 30 попыток в час,
--   а 10 неверных кодов за час попадают в «🕵️ Проверку» у админа.
-- =====================================================================

-- Код друга. Таблицу читает только сервер: код можно узнать только свой.
create table if not exists public.ht_friend_codes (
  user_id    uuid primary key references auth.users (id) on delete cascade,
  code       text not null unique check (code ~ '^[A-Z2-9]{8}$'),
  created_at timestamptz not null default now()
);
alter table public.ht_friend_codes enable row level security;
revoke all on public.ht_friend_codes from anon, authenticated;

-- Дружба: одна строка на пару, a < b
create table if not exists public.ht_friends (
  a          uuid not null references auth.users (id) on delete cascade,
  b          uuid not null references auth.users (id) on delete cascade,
  created_at timestamptz not null default now(),
  primary key (a, b),
  check (a < b)
);
create index if not exists ht_friends_b on public.ht_friends (b);
alter table public.ht_friends enable row level security;
revoke all on public.ht_friends from anon, authenticated;
grant select on public.ht_friends to authenticated;
drop policy if exists ht_friends_read on public.ht_friends;
create policy ht_friends_read on public.ht_friends for select to authenticated
  using (auth.uid() in (a, b) or public.ht_is_admin());

-- Попытки ввести код: из них считается защита от подбора
create table if not exists public.ht_friend_tries (
  id      bigserial primary key,
  user_id uuid not null references auth.users (id) on delete cascade,
  ok      boolean not null,
  at      timestamptz not null default now()
);
create index if not exists ht_friend_tries_user on public.ht_friend_tries (user_id, at desc);
alter table public.ht_friend_tries enable row level security;
revoke all on public.ht_friend_tries from anon, authenticated;

-- Новый случайный код: 8 знаков без похожих (нет 0/O, 1/I)
create or replace function public.ht_new_friend_code() returns text
language plpgsql volatile set search_path = public as $$
declare abc text := 'ABCDEFGHJKLMNPQRSTUVWXYZ23456789'; r bytea; c text; i int;
begin
  loop
    r := uuid_send(gen_random_uuid());
    c := '';
    foreach i in array array[0, 1, 2, 3, 4, 5, 10, 11] loop   -- эти байты случайные целиком
      c := c || substr(abc, 1 + get_byte(r, i) % 32, 1);
    end loop;
    exit when not exists (select 1 from ht_friend_codes where code = c);
  end loop;
  return c;
end $$;

-- Мой код друга (renew = true — сделать новый, старый QR перестанет работать)
create or replace function public.ht_my_friend_code(renew boolean default false) returns text
language plpgsql security definer set search_path = public as $$
declare c text;
begin
  if auth.uid() is null then raise exception 'Нужно войти'; end if;
  if public.ht_is_banned() then raise exception 'Аккаунт заблокирован'; end if;
  select code into c from ht_friend_codes where user_id = auth.uid();
  if c is null or renew then
    c := public.ht_new_friend_code();
    insert into ht_friend_codes (user_id, code) values (auth.uid(), c)
      on conflict (user_id) do update set code = excluded.code, created_at = now();
  end if;
  return c;
end $$;

-- Добавить друга по коду. Ответ — json:
--   {"ok":true, "friend":{...}, "reward":1, "already":false}
--   {"ok":false, "error":"текст для человека"}
-- Неверный код не вызывает ошибку, а возвращает ok:false: так попытка
-- остаётся в журнале и защита от подбора работает.
create or replace function public.ht_add_friend(code text) returns jsonb
language plpgsql security definer set search_path = public as $$
declare me uuid := auth.uid(); other uuid; n int; bad int; x uuid; y uuid; pay int := 0; f record;
begin
  if me is null then raise exception 'Нужно войти'; end if;
  if public.ht_is_banned() then raise exception 'Аккаунт заблокирован'; end if;

  select count(*), count(*) filter (where not ok) into n, bad
    from ht_friend_tries where user_id = me and at > now() - interval '1 hour';
  if n >= 30 then
    return jsonb_build_object('ok', false, 'error', 'Слишком много попыток. Подожди час и попробуй снова.');
  end if;

  code := upper(regexp_replace(coalesce(code, ''), '[^A-Za-z0-9]', '', 'g'));
  select c.user_id into other from ht_friend_codes c
    join profiles p on p.id = c.user_id and not coalesce(p.banned, false)
   where c.code = ht_add_friend.code;
  insert into ht_friend_tries (user_id, ok) values (me, other is not null);
  if other is null then
    if bad + 1 = 10 then
      perform public.ht_flag('friend_guess', '10 неверных кодов друга за час: похоже на подбор чужих кодов');
    end if;
    return jsonb_build_object('ok', false, 'error', 'Такого кода нет. Проверь буквы или попроси друга показать QR ещё раз.');
  end if;
  if other = me then
    return jsonb_build_object('ok', false, 'error', 'Это твой собственный код 🙂');
  end if;
  if exists (select 1 from ht_dm_blocks where (blocker = me and blocked = other) or (blocker = other and blocked = me)) then
    return jsonb_build_object('ok', false, 'error', 'Нельзя добавить: кто-то из вас заблокировал другого в сообщениях.');
  end if;

  select p.id, p.nick, coalesce(nullif(p.name, ''), p.nick) as name, p.role into f from profiles p where p.id = other;
  x := least(me, other); y := greatest(me, other);
  if exists (select 1 from ht_friends where a = x and b = y) then
    return jsonb_build_object('ok', true, 'already', true, 'reward', 0, 'friend', to_jsonb(f));
  end if;
  if (select count(*) from ht_friends where me in (a, b)) >= 300 then
    return jsonb_build_object('ok', false, 'error', 'У тебя уже 300 друзей: это максимум.');
  end if;

  insert into ht_friends (a, b) values (x, y);

  -- +1 🪙 каждому: один раз за пару и не больше 5 🪙 за друзей в день
  foreach x in array array[me, other] loop
    if not exists (select 1 from ht_tubek_log where user_id = x and source = 'friend' and ref = least(me, other)::text || '|' || greatest(me, other)::text)
       and (select count(*) from ht_tubek_log where user_id = x and source = 'friend' and created_at > date_trunc('day', now())) < 5 then
      update profiles set tubek = coalesce(tubek, 0) + 1 where id = x;
      insert into ht_tubek_log (user_id, source, amount, ref)
        values (x, 'friend', 1, least(me, other)::text || '|' || greatest(me, other)::text);
      if x = me then pay := 1; end if;
    end if;
  end loop;
  return jsonb_build_object('ok', true, 'already', false, 'reward', pay, 'friend', to_jsonb(f));
end $$;

-- Мои друзья (заблокированные админом не показываются)
create or replace function public.ht_my_friends()
returns table (id uuid, nick text, name text, role text, since timestamptz)
language sql stable security definer set search_path = public as $$
  select p.id, p.nick, coalesce(nullif(p.name, ''), p.nick), p.role, f.created_at
  from ht_friends f
  join profiles p on p.id = case when f.a = auth.uid() then f.b else f.a end
  where auth.uid() in (f.a, f.b) and not coalesce(p.banned, false)
  order by f.created_at desc;
$$;

-- Друзья любого пользователя — только для админа (вкладка «💬 Переписки» → «Контакты»)
create or replace function public.ht_admin_friends(target uuid)
returns table (id uuid, nick text, name text, since timestamptz)
language plpgsql stable security definer set search_path = public as $$
begin
  if not public.ht_is_admin() then raise exception 'Только для администратора'; end if;
  return query
    select p.id, p.nick, coalesce(nullif(p.name, ''), p.nick), f.created_at
    from ht_friends f join profiles p on p.id = case when f.a = target then f.b else f.a end
    where target in (f.a, f.b) order by f.created_at desc;
end $$;

-- Убрать из друзей (Tubek за этого друга остаются, но повторно не начисляются)
create or replace function public.ht_remove_friend(other uuid) returns void
language sql security definer set search_path = public as $$
  delete from ht_friends where a = least(auth.uid(), other) and b = greatest(auth.uid(), other);
$$;

revoke all on function public.ht_new_friend_code() from public, anon, authenticated;
revoke all on function public.ht_my_friend_code(boolean), public.ht_add_friend(text), public.ht_my_friends(),
                       public.ht_admin_friends(uuid), public.ht_remove_friend(uuid) from public, anon;
grant execute on function public.ht_my_friend_code(boolean), public.ht_add_friend(text), public.ht_my_friends(),
                          public.ht_admin_friends(uuid), public.ht_remove_friend(uuid) to authenticated;

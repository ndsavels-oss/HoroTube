-- =====================================================================
-- HoroTube: серверная защита (Supabase / PostgreSQL)
--
-- Зачем: браузер можно обмануть, сервер нельзя. Всё, что проверяет
-- JavaScript (кто админ, есть ли мат, забанен ли ученик), ученик может
-- обойти из консоли браузера. Здесь те же правила, но в базе данных.
--
-- Как применять:
--   1. Сначала выполните запросы из раздела 0 (только чтение) и сохраните
--      результат: это снимок текущих правил.
--   2. Выполните весь файл в Supabase: SQL Editor -> New query -> Run.
--      Файл можно запускать повторно, он ничего не дублирует.
--   3. Пройдите проверку из README (вход учеником, попытки «взлома»).
--   4. Если что-то сломалось, выполните security_rollback.sql.
--
-- Все объекты называются с префиксом ht_, чтобы их было легко найти
-- и удалить. Существующие политики и функции этот файл НЕ меняет:
-- он только добавляет запреты поверх них.
-- =====================================================================


-- ---------------------------------------------------------------------
-- 0. АУДИТ (только чтение). Запустите отдельно и сохраните результат.
-- ---------------------------------------------------------------------
-- Включён ли RLS на каждой таблице (rowsecurity должно быть true везде):
--   select tablename, rowsecurity from pg_tables where schemaname = 'public' order by 1;
-- Все политики:
--   select tablename, policyname, permissive, cmd, roles, qual, with_check
--   from pg_policies where schemaname = 'public' order by 1, 2;
-- Функции и то, от чьего имени они работают (prosecdef = true значит SECURITY DEFINER):
--   select proname, prosecdef from pg_proc
--   where pronamespace = 'public'::regnamespace order by 1;
-- Триггеры:
--   select event_object_table, trigger_name, action_timing, event_manipulation
--   from information_schema.triggers where trigger_schema = 'public' order by 1, 2;


-- ---------------------------------------------------------------------
-- 1. Вспомогательные функции
-- ---------------------------------------------------------------------
-- SECURITY DEFINER: функция читает profiles в обход RLS, иначе политики,
-- которые её вызывают, могли бы зациклиться.
create or replace function public.ht_is_admin() returns boolean
language sql stable security definer set search_path = public as $$
  select exists (select 1 from profiles where id = auth.uid() and role = 'admin');
$$;

create or replace function public.ht_is_staff() returns boolean
language sql stable security definer set search_path = public as $$
  select exists (select 1 from profiles where id = auth.uid() and role in ('teacher', 'admin'));
$$;

create or replace function public.ht_is_banned() returns boolean
language sql stable security definer set search_path = public as $$
  select coalesce((select banned from profiles where id = auth.uid()), false);
$$;

-- true, если запрос пришёл прямо из браузера (supabase-js), а не из
-- серверной функции SECURITY DEFINER (buy_premium, claim_daily...) и не
-- из другого триггера (например, счётчика лайков).
create or replace function public.ht_direct() returns boolean
language sql stable as $$
  select current_user in ('authenticated', 'anon') and pg_trigger_depth() <= 1;
$$;


-- Журнал подозрительных действий: попытки сделать из консоли браузера то,
-- что сайт сам никогда не делает (накрутить Tubek, стать админом, подделать
-- автора, сходить в шахматах вне очереди). Такие попытки не выполняются,
-- а записываются сюда, и админка показывает этих пользователей.
create table if not exists public.ht_security_log (
  id         bigserial primary key,
  user_id    uuid,
  kind       text not null,
  detail     text,
  created_at timestamptz not null default now()
);
create index if not exists ht_security_log_user on public.ht_security_log (user_id, created_at desc);
alter table public.ht_security_log enable row level security;
revoke all on public.ht_security_log from anon, authenticated;
grant select, delete on public.ht_security_log to authenticated;
drop policy if exists ht_seclog_admin on public.ht_security_log;
create policy ht_seclog_admin on public.ht_security_log for all to authenticated
  using (public.ht_is_admin());

create or replace function public.ht_flag(k text, d text) returns void
language plpgsql security definer set search_path = public as $$
begin
  if auth.uid() is null then return; end if;
  -- не больше 100 записей в час от одного человека, чтобы журнал нельзя было засорить
  if (select count(*) from ht_security_log where user_id = auth.uid() and created_at > now() - interval '1 hour') >= 100 then
    return;
  end if;
  insert into ht_security_log (user_id, kind, detail) values (auth.uid(), k, left(d, 300));
end $$;
revoke all on function public.ht_flag(text, text) from public, anon;
grant execute on function public.ht_flag(text, text) to authenticated;


-- ---------------------------------------------------------------------
-- 2. Профили: роль, бан, Tubek и премиум меняет только админ
-- ---------------------------------------------------------------------
create or replace function public.ht_guard_profiles() returns trigger
language plpgsql set search_path = public as $$
declare k text;
begin
  if not public.ht_direct() or public.ht_is_admin() then
    return new;
  end if;
  if tg_op = 'INSERT' then
    -- профиль, созданный из браузера, всегда обычный ученик
    new := jsonb_populate_record(new, '{"role":"student","banned":false,"tubek":0,"premium":false,"premium_until":null}'::jsonb);
    return new;
  end if;
  foreach k in array array['id', 'nick', 'role', 'banned', 'tubek', 'premium', 'premium_until'] loop
    if (to_jsonb(new) -> k) is distinct from (to_jsonb(old) -> k) then
      perform public.ht_flag('profile', format('Пытался сам изменить в профиле поле «%s» на %s', k, to_jsonb(new) -> k));
      return null;   -- изменение не выполняется
    end if;
  end loop;
  return new;
end $$;

drop trigger if exists ht_guard on public.profiles;
create trigger ht_guard before insert or update on public.profiles
  for each row execute function public.ht_guard_profiles();


-- ---------------------------------------------------------------------
-- 3. Автор записи берётся из сессии, а не из запроса
--    (иначе ученик может подписать комментарий как «Учитель ✔»)
-- ---------------------------------------------------------------------
create or replace function public.ht_set_author() returns trigger
language plpgsql security definer set search_path = public as $$
declare p record;
begin
  -- нет сессии: запись делает сервер (SQL Editor, миграции), ничего не трогаем
  if auth.uid() is null then
    return new;
  end if;
  -- сайт никогда не присылает автора сам: значит, это подделка из консоли
  if (to_jsonb(new) ->> 'author_id') is not null and (to_jsonb(new) ->> 'author_id') <> auth.uid()::text
     or (to_jsonb(new) ->> 'author_role') is not null then
    perform public.ht_flag('spoof', format('Пытался подписать запись в %s чужим именем или ролью', tg_table_name));
  end if;
  select role, coalesce(nullif(name, ''), nick) as name into p from profiles where id = auth.uid();
  new := jsonb_populate_record(new, jsonb_build_object(
    'author_id', auth.uid(), 'author_role', p.role, 'author_name', p.name));
  return new;
end $$;

drop trigger if exists ht_author on public.comments;
create trigger ht_author before insert on public.comments
  for each row execute function public.ht_set_author();
drop trigger if exists ht_author on public.chat;
create trigger ht_author before insert on public.chat
  for each row execute function public.ht_set_author();
drop trigger if exists ht_author on public.videos;
create trigger ht_author before insert on public.videos
  for each row execute function public.ht_set_author();


-- ---------------------------------------------------------------------
-- 4. Видео: модерация, только YouTube/Vimeo/VK или свой файл, нельзя накрутить счётчики
-- ---------------------------------------------------------------------
-- адрес публичных файлов Supabase (тот же, что SB_URL в HoroTube.html)
create or replace function public.ht_storage_base() returns text
language sql immutable as $$
  select 'https://xuqyywongnzuyvqxaimq.supabase.co/storage/v1/object/public/'::text;
$$;

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

drop trigger if exists ht_guard on public.videos;
create trigger ht_guard before insert or update on public.videos
  for each row execute function public.ht_guard_videos();


-- ---------------------------------------------------------------------
-- 5. Фильтр мата и контактов на сервере
--    Слова хранятся в таблице: админ может дополнять список без
--    изменения кода (insert into ht_bad_patterns values ('^слово'))
-- ---------------------------------------------------------------------
create table if not exists public.ht_bad_patterns (pattern text primary key);
alter table public.ht_bad_patterns enable row level security;  -- из браузера таблица недоступна

insert into public.ht_bad_patterns (pattern) values
  ('^(сука|суки|суку|сукой|сучка|сучара|дура|дуры|дурак|дураки|дурачье|лох|лохи|лоха|лохушка|чмо|чмошник|даун|дауны|дауна|тварь|твари|скотина|козлина|жид|жиды|жидов|жидовка|хач|хачи|чурка|чурки)$'),
  ('^(на|по|от|за|ни|до|вы|об|под|при|раз)?ху[йеяию]'), ('пизд'),
  ('^(за|на|у|вы|от|отъ|объ|по|раз|разъ|съ|до|въ|при|об|про|пере|долбо|недо)?еб(а|у|л|н|и|ш|к)'),
  ('^(у|долбо|недо)еб'), ('^(вы)?бля'), ('^муд(ак|ил|оз|ач)'), ('^пид[оа]?р'), ('^педик'),
  ('г[ао]нд[оа]н'), ('залуп'), ('шлюх'), ('^(за|по|на|от)?дроч'), ('^мраз'), ('^ублюд'), ('^сволоч'),
  ('^г[ао]вн'), ('^жоп'), ('^(на|по|об|вы|за|от)?сра(ть|л|н|ч)'), ('^дерьм'), ('^сдох'), ('^убейс'),
  ('^дебил'), ('^идиот'), ('^кретин'), ('^придур'), ('^урод'), ('^тупиц'), ('^тупорыл'), ('^жирдя'),
  ('^нигг'), ('^жидовск'), ('^шалав'), ('^курв'),
  ('fuck'), ('shit'), ('bitch'), ('cunt'), ('ass?hole'), ('^dick(head)?s?$'), ('nigg'), ('^fag(got)?s?$'),
  ('retard'), ('whore'), ('^slut'), ('bastard'), ('^pizd'), ('^[xh][uy][iyj]'), ('^bly(a|at|ad)'),
  ('^suk[aiu]$'), ('^(za|na|vy|po|ot)?eba[tln]'), ('^mudak'), ('^pid[oa]r'), ('^gandon')
on conflict do nothing;

create or replace function public.ht_bad_word(w text) returns boolean
language sql stable security definer set search_path = public as $$
  select exists (
    select 1 from ht_bad_patterns p
    where w ~ p.pattern or regexp_replace(w, '(.)\1+', '\1', 'g') ~ p.pattern
  );
$$;

-- Та же логика, что isBad() в HoroTube.html
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

-- Та же логика, что hasContact(): телефоны, ссылки, ники мессенджеров
create or replace function public.ht_has_contact(t text) returns boolean
language plpgsql immutable as $$
declare m text;
begin
  t := coalesce(t, '');
  for m in select (regexp_matches(t, '[0-9+][0-9 ().-]{7,}[0-9]', 'g'))[1] loop
    if length(regexp_replace(m, '[^0-9]', '', 'g')) >= 9 then return true; end if;
  end loop;
  return t ~* '(https?://|www\.|t\.me|vk\.com|@[a-z0-9_]{3,}|[a-z0-9а-я-]+\.(ru|com|net|org|me|io|su|info|рф|online|site|xyz)([^a-z0-9а-я]|$))';
end $$;

-- Триггер: аргумент 1 — имя столбца, аргумент 2 — 'contacts', если запрещены и контакты
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

drop trigger if exists ht_filter_body on public.comments;
create trigger ht_filter_body before insert or update on public.comments
  for each row execute function public.ht_text_filter('body', 'contacts');
drop trigger if exists ht_filter_body on public.chat;
create trigger ht_filter_body before insert or update on public.chat
  for each row execute function public.ht_text_filter('body', 'words');
drop trigger if exists ht_filter_title on public.videos;
create trigger ht_filter_title before insert or update on public.videos
  for each row execute function public.ht_text_filter('title', 'words');
drop trigger if exists ht_filter_nick on public.profiles;
create trigger ht_filter_nick before insert or update on public.profiles
  for each row execute function public.ht_text_filter('nick', 'words');
drop trigger if exists ht_filter_name on public.profiles;
create trigger ht_filter_name before insert or update on public.profiles
  for each row execute function public.ht_text_filter('name', 'words');
drop trigger if exists ht_filter_status on public.profiles;
create trigger ht_filter_status before insert or update on public.profiles
  for each row execute function public.ht_text_filter('status', 'contacts');


-- ---------------------------------------------------------------------
-- 6. Защита от спама: не больше N записей за период от одного человека
-- ---------------------------------------------------------------------
create or replace function public.ht_rate_limit() returns trigger
language plpgsql security definer set search_path = public as $$
declare n int;
begin
  if auth.uid() is null or public.ht_is_admin() then return new; end if;
  execute format('select count(*) from %I.%I where author_id = $1 and created_at > now() - $2::interval',
                 tg_table_schema, tg_table_name)
    into n using auth.uid(), tg_argv[1];
  if n >= tg_argv[0]::int then
    raise exception 'Слишком часто. Подожди немного и попробуй снова.';
  end if;
  return new;
end $$;

drop trigger if exists ht_rate on public.comments;
create trigger ht_rate before insert on public.comments
  for each row execute function public.ht_rate_limit('5', '1 minute');
drop trigger if exists ht_rate on public.chat;
create trigger ht_rate before insert on public.chat
  for each row execute function public.ht_rate_limit('10', '1 minute');
drop trigger if exists ht_rate on public.videos;
create trigger ht_rate before insert on public.videos
  for each row execute function public.ht_rate_limit('10', '1 day');


-- ---------------------------------------------------------------------
-- 7. Политики RLS. Все они RESTRICTIVE: они только сужают то, что уже
--    разрешено, и не открывают ничего нового.
-- ---------------------------------------------------------------------
-- 7.1 Забаненный ученик ничего не может создавать и менять
do $$
declare t text;
begin
  foreach t in array array['comments', 'chat', 'videos', 'reports', 'likes', 'confusions',
                           'reactions', 'subscriptions', 'channels', 'video_views'] loop
    if to_regclass('public.' || t) is not null then
      execute format('drop policy if exists ht_not_banned_ins on public.%I', t);
      execute format('create policy ht_not_banned_ins on public.%I as restrictive for insert to authenticated with check (not public.ht_is_banned())', t);
      execute format('drop policy if exists ht_not_banned_upd on public.%I', t);
      execute format('create policy ht_not_banned_upd on public.%I as restrictive for update to authenticated using (not public.ht_is_banned())', t);
    end if;
  end loop;
end $$;

-- 7.2 Чат: ученик видит и пишет только в свою переписку с админом
drop policy if exists ht_own_chat on public.chat;
create policy ht_own_chat on public.chat as restrictive for all to authenticated
  using (user_id = auth.uid() or public.ht_is_admin())
  with check (user_id = auth.uid() or public.ht_is_admin());

-- 7.3 Видео на проверке и отклонённые видят только автор и админ
drop policy if exists ht_video_visibility on public.videos;
create policy ht_video_visibility on public.videos as restrictive for select to authenticated, anon
  using (status = 'approved' or author_id = auth.uid() or public.ht_is_admin());

-- 7.4 Видео можно выложить только в свой канал
drop policy if exists ht_own_channel on public.videos;
create policy ht_own_channel on public.videos as restrictive for insert to authenticated
  with check (
    videos.channel_id is null or public.ht_is_admin()
    or exists (select 1 from public.channels c where c.id = videos.channel_id and c.owner_id = auth.uid())
  );

-- 7.5 Профили (имя, класс, баланс) целиком видны только владельцу и админу.
--     Другим ученикам данные отдают функции public_profiles и top_tubek.
--     ВАЖНО: эти две функции должны быть SECURITY DEFINER (см. аудит),
--     иначе таблица лидеров и значки ⭐ перестанут работать.
drop policy if exists ht_own_profile on public.profiles;
create policy ht_own_profile on public.profiles as restrictive for select to authenticated, anon
  using (id = auth.uid() or public.ht_is_admin());

-- 7.6 Аватарки: каждый загружает только в свою папку avatars/<id>/
drop policy if exists ht_avatar_own_ins on storage.objects;
create policy ht_avatar_own_ins on storage.objects as restrictive for insert to authenticated
  with check (bucket_id <> 'avatars' or (storage.foldername(name))[1] = auth.uid()::text or public.ht_is_admin());
drop policy if exists ht_avatar_own_upd on storage.objects;
create policy ht_avatar_own_upd on storage.objects as restrictive for update to authenticated
  using (bucket_id <> 'avatars' or (storage.foldername(name))[1] = auth.uid()::text or public.ht_is_admin());
drop policy if exists ht_avatar_own_del on storage.objects;
create policy ht_avatar_own_del on storage.objects as restrictive for delete to authenticated
  using (bucket_id <> 'avatars' or (storage.foldername(name))[1] = auth.uid()::text or public.ht_is_admin());

-- Аватарка: только JPEG до 1 МБ (сайт сам сжимает её до 560x560)
update storage.buckets
   set file_size_limit = 1048576, allowed_mime_types = array['image/jpeg']
 where id = 'avatars';


-- ---------------------------------------------------------------------
-- 8. Начисление Tubek админом одной командой (без потери начислений,
--    если ученик в ту же секунду получил награду)
-- ---------------------------------------------------------------------
create or replace function public.ht_add_tubek(target uuid, delta int) returns int
language plpgsql security definer set search_path = public as $$
declare v int;
begin
  if not public.ht_is_admin() then
    raise exception 'Только для администратора';
  end if;
  update profiles set tubek = greatest(0, coalesce(tubek, 0) + delta)
   where id = target returning tubek into v;
  return v;
end $$;


-- ---------------------------------------------------------------------
-- 9. Админ задаёт ученику новый пароль (кнопка «🔑 Новый пароль» в админке)
--    Старый пароль узнать нельзя никому: Supabase хранит только его хеш.
-- ---------------------------------------------------------------------
create or replace function public.ht_admin_set_password(target uuid, pass text) returns void
language plpgsql security definer set search_path = public, extensions, auth as $$
begin
  if not public.ht_is_admin() then
    raise exception 'Только для администратора';
  end if;
  if char_length(coalesce(pass, '')) < 6 then
    raise exception 'Пароль: не короче 6 символов';
  end if;
  if exists (select 1 from public.profiles where id = target and role = 'admin' and id <> auth.uid()) then
    raise exception 'Пароль другого администратора менять нельзя';
  end if;
  update auth.users set encrypted_password = crypt(pass, gen_salt('bf')), updated_at = now() where id = target;
  if not found then
    raise exception 'Пользователь не найден';
  end if;
end $$;
revoke all on function public.ht_admin_set_password(uuid, text) from public, anon;
grant execute on function public.ht_admin_set_password(uuid, text) to authenticated;

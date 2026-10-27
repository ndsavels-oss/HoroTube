-- HoroTube: вся серверная часть одним файлом (security + moderation + messenger_stories + chess + premium_chess + friends + apps + updates + files_groups + reviews).
-- Supabase -> SQL Editor -> New query -> вставить весь файл -> Run. Повторный запуск безопасен.

-- ===== security.sql =====
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

-- ===== moderation.sql =====
-- =====================================================================
-- HoroTube: умная модерация (Supabase / PostgreSQL)
--
-- Что добавляет:
--   1. Поиск замаскированного мата: «х#й», «бл*дь», «п!зда», «с@ка»,
--      и слов с пропущенной буквой: «пзда», «блдь».
--   2. Оценку риска 0..100 для каждого текста и короткий комментарий
--      с причинами («замаскированное грубое слово», «контакт» и т.д.).
--   3. Очередь для админа (таблица ht_mod_notes):
--      - каждое видео ученика, ушедшее на проверку, получает комментарий
--        автопроверки;
--      - подозрительные комментарии и сообщения (оценка 30..69)
--        публикуются, но попадают админу на проверку;
--      - явный мат (оценка 70+) отклоняется сразу, как и раньше.
--   4. Исключения для обычных слов, которые фильтр путал с матом
--      («педикюр», «бляшка», «уродился», «залпа», «Пиза»...).
--
-- ВАЖНО: сначала должен быть выполнен security.sql. Этот файл можно
-- запускать повторно. Откат: moderation_rollback.sql.
-- =====================================================================

do $$
begin
  if to_regprocedure('public.ht_is_bad(text)') is null then
    raise exception 'Сначала выполните security.sql, потом этот файл';
  end if;
end $$;


-- ---------------------------------------------------------------------
-- 1. Словари. Из браузера недоступны (RLS включён, политик нет).
--    Пополнять их можно прямо в SQL Editor, код менять не нужно.
-- ---------------------------------------------------------------------
-- Полные формы грубых слов для поиска масок и пропущенных букв.
-- weight: 90 = мат (блокируется), 60 = оскорбление (идёт админу на проверку)
create table if not exists public.ht_bad_words (word text primary key, weight int not null default 90);
alter table public.ht_bad_words enable row level security;

-- Обычные слова, которые похожи на грубые (регулярные выражения)
create table if not exists public.ht_ok_patterns (pattern text primary key, note text);
alter table public.ht_ok_patterns enable row level security;

insert into public.ht_bad_words (word, weight)
select w, 90 from unnest(string_to_array(
  'хуй хуя хуе хуи хую хуем хуйня хуйню хуйней хуевый хуево хуесос хуета хуило '
  'пизда пизды пизде пизду пиздой пиздец пиздеца пиздюк пиздеть пиздит пиздабол '
  'блядь бляди блядей блядина блядский бля блять '
  'ебать ебал ебала ебали ебаный ебаная ебаное ебанат ебанутый ебло еблан ебу ебет ебут ебешь '
  'заебал заебала заебали заебись выебал выебать уебок уебан уебище долбоеб долбоебы '
  'сука суки суку сукой сучка сучки сучара сучонок '
  'пидор пидора пидоры пидорас пидар пидарас пидрила '
  'мудак мудака мудаки мудила залупа залупы залупу шлюха шлюхи шлюху шлюхой '
  'гондон гондона гандон гандона дрочить дрочит дрочил дрочила', ' ')) w
on conflict do nothing;

insert into public.ht_bad_words (word, weight)
select w, 60 from unnest(string_to_array(
  'говно говна говнюк мразь мрази тварь твари ублюдок ублюдки сволочь сволочи дебил дебила дебилы '
  'идиот идиоты кретин кретины придурок придурки урод уроды жопа жопу жопой даун дауны чмо лох лохи', ' ')) w
on conflict do nothing;

-- Найдены проверкой по словарю русского языка (3 млн словоформ)
insert into public.ht_ok_patterns (pattern, note) values
  ('^педикюр', 'педикюр'), ('^бляш', 'бляшка'), ('^блях', 'бляха'), ('^блямб', 'блямба'),
  ('^уроди[лт]', 'уродился, уродится (урожай)'), ('^курвиметр', 'прибор'),
  ('^ска$', 'музыкальный стиль'), ('^пиз(а|е|у|ы|ой)$', 'город Пиза'), ('^пизанск', 'Пизанская башня'),
  ('^залп(а|у|ы)$', 'залп'), ('^маз(ь|и)$', 'мазь'), ('^гона$', 'гон'), ('^пиар$', 'пиар'),
  ('^дан(ы)?$', 'дан, даны'), ('^дун(ы)?$', 'дюны'), ('^ело$', 'ело'), ('^елан$', 'елань'),
  ('^суч(а|и)$', 'сучить нитку'), ('^урд(ы)?$', 'урд'), ('^хило$', 'хило'),
  ('^уроди(в|ш)', 'уродиться'), ('^уродят', 'уродятся'), ('^уродли', 'уродливый'), ('^уродов', 'уродовать'),
  ('^уродуе', 'уродуемый'), ('^уродую', 'уродующий'), ('^уродств', 'уродство'), ('^блям', 'блямба'),
  ('^блянск', 'фамилия'), ('^кретинг', 'город Кретинга'), ('^дрочен', 'дрочёна (блюдо)'), ('^дрочнев', 'фамилия')
on conflict do nothing;


-- ---------------------------------------------------------------------
-- 2. Проверка одного слова теперь учитывает исключения
--    (ht_is_bad из security.sql вызывает эту функцию)
-- ---------------------------------------------------------------------
create or replace function public.ht_is_ok_word(w text) returns boolean
language sql stable security definer set search_path = public as $$
  select exists (select 1 from ht_ok_patterns o where w ~ o.pattern);
$$;

create or replace function public.ht_bad_word(w text) returns boolean
language sql stable security definer set search_path = public as $$
  select not ht_is_ok_word(w) and exists (
    select 1 from ht_bad_patterns p
    where w ~ p.pattern or regexp_replace(w, '(.)\1+', '\1', 'g') ~ p.pattern
  );
$$;


-- То же, что в security.sql, плюс: слово, набранное по одной латинской
-- букве («c y k a»), проверяется и в русском написании
create or replace function public.ht_is_bad(t text) returns boolean
language plpgsql stable security definer set search_path = public as $$
declare w text; buf text := ''; joined text := '';
begin
  t := replace(lower(coalesce(t, '')), 'ё', 'е');
  t := regexp_replace(t, '[.*~_-]+', ' ', 'g');
  for w in select x from regexp_split_to_table(t, '[^a-zа-я0-9@]+') x where x <> '' loop
    if length(w) = 1 then buf := buf || w; continue; end if;
    if buf <> '' then
      if ht_bad_word(buf) or ht_bad_word(translate(buf, 'abceopxykmt0364@', 'авсеорхукмтозбча')) then return true; end if;
      joined := joined || ' ' || buf; buf := '';
    end if;
    if w ~ '[а-я]' then
      w := translate(w, 'abceopxykmt0364@', 'авсеорхукмтозбча');
    end if;
    if ht_bad_word(w) then return true; end if;
    joined := joined || ' ' || w;
  end loop;
  if buf <> '' then
    if ht_bad_word(buf) or ht_bad_word(translate(buf, 'abceopxykmt0364@', 'авсеорхукмтозбча')) then return true; end if;
    joined := joined || ' ' || buf;
  end if;
  return joined ~ '(^| )(твою мать|убей себя|иди на ху)';
end $$;


-- ---------------------------------------------------------------------
-- 3. Оценка текста: {score, words_score, contact, level, reasons}
--    level: block (70+ за грубые слова), review (30..69), ok (<30)
-- ---------------------------------------------------------------------
create or replace function public.ht_moderate(t text) returns jsonb
language plpgsql stable security definer set search_path = public as $$
declare
  ws int := 0;            -- оценка за грубые слова
  extra int := 0;         -- прочие сигналы
  reasons text[] := '{}';
  contact boolean;
  raw text; c text; lo text; wild text; sc int; nwild int; caps int; letters int;
begin
  t := coalesce(t, '');

  -- 3.1 Прямые грубые слова, в том числе «с у к а» и латиница вместо кириллицы
  if ht_is_bad(t) then
    ws := 95; reasons := array_append(reasons, 'грубое слово');
  end if;

  -- 3.2 Каждое слово по отдельности: маски и пропущенные буквы
  for raw in select x from regexp_split_to_table(t, '[[:space:]]+') x where x <> '' loop
    c := replace(lower(raw), 'ё', 'е');
    -- знаки препинания по краям слова не маскируют буквы
    c := regexp_replace(c, '^[.,;:!?()«»"''“”/\\|-]+|[.,;:!?()«»"''“”/\\|-]+$', '', 'g');
    if c !~ '[а-я]' or length(c) > 24 then continue; end if;
    -- латиница и цифры вместо русских букв; @ здесь считается маской
    c := translate(c, 'abceopxykmt0364', 'авсеорхукмтозбч');
    lo := regexp_replace(c, '[^а-я]', '', 'g');
    letters := length(lo);
    nwild := length(c) - letters;
    if letters < 2 then continue; end if;
    -- обычное слово без масок из списка исключений не проверяем
    if nwild = 0 and ht_is_ok_word(lo) then continue; end if;

    -- «х#й», «бл*дь»: каждый посторонний знак внутри слова = одна скрытая буква
    if nwild between 1 and 3 and letters > nwild then
      wild := regexp_replace(c, '[^а-я]', '.', 'g');
      select max(b.weight) into sc from ht_bad_words b
       where length(b.word) = length(wild) and b.word ~ ('^' || wild || '$');
      if sc is not null then
        ws := greatest(ws, sc - 10);
        reasons := array_append(reasons, format('замаскированное грубое слово «%s»', raw));
        continue;
      end if;
      -- «с#ука»: знак вставлен между буквами
      if ht_bad_word(lo) then
        ws := greatest(ws, 85);
        reasons := array_append(reasons, format('замаскированное грубое слово «%s»', raw));
        continue;
      end if;
    end if;

    -- «пзда», «бл*дь» без одной буквы (первая и последняя буквы на месте)
    if letters >= 3 then
      select max(b.weight) into sc
        from ht_bad_words b, generate_series(2, length(b.word) - 1) i
       where length(b.word) = letters + 1
         and substr(b.word, 1, i - 1) || substr(b.word, i + 1) = lo;
      if sc is not null and not ht_bad_word(lo) then
        ws := greatest(ws, sc - 20);
        reasons := array_append(reasons, format('похоже на грубое слово без буквы «%s»', raw));
      end if;
    end if;
  end loop;

  -- 3.3 Контакты: телефон, ссылка, ник в мессенджере
  contact := ht_has_contact(t);
  if contact then
    extra := greatest(extra, 60);
    reasons := array_append(reasons, 'контакт (телефон, ссылка или ник)');
  end if;

  -- 3.4 КРИК: длинный текст почти целиком заглавными буквами
  letters := length(regexp_replace(t, '[^[:alpha:]]', '', 'g'));
  caps := length(regexp_replace(t, '[^А-ЯЁA-Z]', '', 'g'));
  if letters >= 10 and caps >= letters * 0.7 then
    extra := extra + 15;
    reasons := array_append(reasons, 'текст заглавными буквами (крик)');
  end if;

  sc := least(100, greatest(ws, extra) + case when ws > 0 and extra > 0 then 10 else 0 end);
  return jsonb_build_object(
    'score', sc,
    'words_score', ws,
    'contact', contact,
    'level', case when ws >= 70 then 'block' when sc >= 30 then 'review' else 'ok' end,
    'reasons', to_jsonb(reasons));
end $$;


-- ---------------------------------------------------------------------
-- 4. Фильтр перед записью теперь использует оценку
--    (те же триггеры ht_filter_* из security.sql)
-- ---------------------------------------------------------------------
create or replace function public.ht_text_filter() returns trigger
language plpgsql set search_path = public as $$
declare v text; col text := tg_argv[0]; m jsonb;
begin
  if public.ht_is_admin() then return new; end if;
  v := to_jsonb(new) ->> col;
  if v is null then return new; end if;
  if tg_op = 'UPDATE' and v is not distinct from (to_jsonb(old) ->> col) then return new; end if;
  m := public.ht_moderate(v);
  if (m ->> 'words_score')::int >= 70 then
    raise exception 'Есть недопустимые слова. Напиши по-другому.';
  end if;
  if tg_argv[1] = 'contacts' and (m ->> 'contact')::boolean then
    raise exception 'Нельзя оставлять ссылки, телефоны и контакты.';
  end if;
  return new;
end $$;


-- ---------------------------------------------------------------------
-- 5. Очередь для админа: что проверить и почему
-- ---------------------------------------------------------------------
create table if not exists public.ht_mod_notes (
  id          bigserial primary key,
  kind        text not null,      -- video (на проверке), video_flag, comment, chat
  target_id   text not null,      -- id видео, комментария или сообщения
  author_id   uuid,
  author_name text,
  excerpt     text,               -- сам текст (первые 300 символов)
  score       int not null,
  level       text not null,
  note        text not null,      -- комментарий автопроверки для админа
  reviewed    boolean not null default false,
  created_at  timestamptz not null default now()
);
create index if not exists ht_mod_notes_open on public.ht_mod_notes (reviewed, created_at desc);
alter table public.ht_mod_notes enable row level security;
revoke all on public.ht_mod_notes from anon;
grant select, update, delete on public.ht_mod_notes to authenticated;

drop policy if exists ht_notes_admin on public.ht_mod_notes;
create policy ht_notes_admin on public.ht_mod_notes for all to authenticated
  using (public.ht_is_admin()) with check (public.ht_is_admin());

create or replace function public.ht_mod_note_text(m jsonb) returns text
language sql immutable as $$
  select format('Автопроверка: %s/100, %s. %s',
    m ->> 'score',
    case m ->> 'level' when 'block' then 'явное нарушение'
                       when 'review' then 'нужна проверка человеком'
                       else 'замечаний нет' end,
    case when jsonb_array_length(m -> 'reasons') = 0 then 'Проверьте содержание видео.'
         else 'Причины: ' || (select string_agg(r, '; ') from jsonb_array_elements_text(m -> 'reasons') r) || '.' end);
$$;

-- После записи: аргумент 1 — вид записи, аргумент 2 — столбец с текстом
create or replace function public.ht_mod_note_trg() returns trigger
language plpgsql security definer set search_path = public as $$
declare j jsonb := to_jsonb(new); m jsonb; k text := tg_argv[0];
begin
  if auth.uid() is null or public.ht_is_admin() then return new; end if;
  m := public.ht_moderate(j ->> tg_argv[1]);
  if k = 'video' then
    -- видео ученика на проверке получает комментарий всегда,
    -- опубликованное сразу (учитель) только если есть замечания
    if coalesce(j ->> 'status', '') <> 'pending' then
      if m ->> 'level' = 'ok' then return new; end if;
      k := 'video_flag';
    end if;
  elsif m ->> 'level' <> 'review' then
    return new;
  end if;
  insert into ht_mod_notes (kind, target_id, author_id, author_name, excerpt, score, level, note)
  values (k, j ->> 'id', auth.uid(), j ->> 'author_name', left(j ->> tg_argv[1], 300),
          (m ->> 'score')::int, m ->> 'level', public.ht_mod_note_text(m));
  return new;
end $$;

drop trigger if exists ht_note on public.videos;
create trigger ht_note after insert on public.videos
  for each row execute function public.ht_mod_note_trg('video', 'title');
drop trigger if exists ht_note on public.comments;
create trigger ht_note after insert on public.comments
  for each row execute function public.ht_mod_note_trg('comment', 'body');
drop trigger if exists ht_note on public.chat;
create trigger ht_note after insert on public.chat
  for each row execute function public.ht_mod_note_trg('chat', 'body');

-- ===== messenger_stories.sql =====
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

-- ===== chess.sql =====
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

-- ===== premium_chess.sql =====
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

-- ===== friends.sql =====
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

-- ===== apps.sql =====
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

-- ===== updates.sql =====
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

-- ===== files_groups.sql =====
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

-- ===== reviews.sql =====
-- HoroTube: статьи учеников в Поиске и проверка видео и статей через Почту.
-- Запускать после apps.sql. Повторный запуск безопасен. Откат: reviews_rollback.sql.
--
-- 1. ht_articles: статья ученика. title/body/tags — черновик автора, pub_* — проверенная
--    админом версия, которую видят все. Пока автор правит выпущенную статью, в Поиске
--    остаётся прежняя версия.
-- 2. Письмо на проверку: статья (ht_article_submit) и видео ученика (триггер на videos)
--    приходят администрации в Почту. Админ выпускает или возвращает прямо из письма.
-- 3. Читать статьи можно только через ht_articles_find / ht_article_get: так наружу
--    уходит лишь выпущенная версия, а черновики никто чужой не видит.

-- ---------------------------------------------------------------------
-- 1. Статьи
-- ---------------------------------------------------------------------
create table if not exists public.ht_articles (
  id           bigserial primary key,
  author_id    uuid not null default auth.uid() references auth.users (id) on delete cascade,
  title        text not null default '' check (char_length(title) <= 120),
  body         text not null default '' check (char_length(body) <= 30000),
  tags         text[] not null default '{}',
  status       text not null default 'draft' check (status in ('draft', 'review', 'published', 'rejected')),
  pub_title    text,
  pub_body     text,
  pub_tags     text[],
  version      int not null default 0,
  views        int not null default 0,
  review_note  text,
  created_at   timestamptz not null default now(),
  updated_at   timestamptz not null default now(),
  published_at timestamptz
);
create index if not exists ht_articles_author on public.ht_articles (author_id, updated_at desc);
create index if not exists ht_articles_pub on public.ht_articles (published_at desc) where pub_body is not null;

create or replace function public.ht_guard_articles() returns trigger
language plpgsql security definer set search_path = public as $$
declare n int; k text;
begin
  if auth.uid() is null or current_setting('ht.sys', true) = '1' then return new; end if;
  if public.ht_is_banned() then raise exception 'Аккаунт заблокирован'; end if;
  if tg_op = 'INSERT' then
    if new.author_id is distinct from auth.uid() then
      perform public.ht_flag('spoof', 'Пытался создать статью от чужого имени'); return null;
    end if;
    select count(*) into n from ht_articles where author_id = auth.uid();
    if n >= 100 then raise exception 'У тебя уже 100 статей. Удали ненужные.'; end if;
    new := jsonb_populate_record(new, '{"status":"draft","pub_title":null,"pub_body":null,"pub_tags":null,"version":0,"views":0,"review_note":null,"published_at":null}'::jsonb);
    new.created_at := now();
  else
    foreach k in array array['author_id', 'status', 'pub_title', 'pub_body', 'pub_tags', 'version', 'views',
                             'review_note', 'published_at', 'created_at'] loop
      if (to_jsonb(new) -> k) is distinct from (to_jsonb(old) -> k) then
        perform public.ht_flag('article', format('Пытался сам изменить у статьи поле «%s»', k)); return null;
      end if;
    end loop;
  end if;
  if cardinality(new.tags) > 8 or exists (select 1 from unnest(new.tags) t where char_length(t) not between 1 and 30) then
    raise exception 'Теги: не больше 8, каждый до 30 символов';
  end if;
  if public.ht_is_bad(new.title || ' ' || array_to_string(new.tags, ' ')) then
    raise exception 'В названии или тегах есть недопустимые слова';
  end if;
  new.updated_at := now();
  return new;
end $$;
drop trigger if exists ht_guard on public.ht_articles;
create trigger ht_guard before insert or update on public.ht_articles
  for each row execute function public.ht_guard_articles();

alter table public.ht_articles enable row level security;
revoke all on public.ht_articles from anon, authenticated;
grant select, insert, update, delete on public.ht_articles to authenticated;
grant usage on sequence public.ht_articles_id_seq to authenticated;
drop policy if exists ht_articles_sel on public.ht_articles;
create policy ht_articles_sel on public.ht_articles for select to authenticated
  using (author_id = auth.uid() or public.ht_is_admin());
drop policy if exists ht_articles_ins on public.ht_articles;
create policy ht_articles_ins on public.ht_articles for insert to authenticated
  with check (author_id = auth.uid());
drop policy if exists ht_articles_upd on public.ht_articles;
create policy ht_articles_upd on public.ht_articles for update to authenticated
  using (author_id = auth.uid()) with check (author_id = auth.uid());
drop policy if exists ht_articles_del on public.ht_articles;
create policy ht_articles_del on public.ht_articles for delete to authenticated
  using (author_id = auth.uid() or public.ht_is_admin());

-- ---------------------------------------------------------------------
-- 2. Письма на проверку: что проверяется (видео или статья) и снимок статьи
-- ---------------------------------------------------------------------
alter table public.ht_mail add column if not exists item_kind text check (item_kind in ('video', 'article'));
alter table public.ht_mail add column if not exists item_id bigint;
alter table public.ht_mail add column if not exists item_title text;
alter table public.ht_mail add column if not exists item_body text;
alter table public.ht_mail add column if not exists item_tags text[];
create index if not exists ht_mail_item on public.ht_mail (item_kind, item_id) where item_kind is not null;

-- из браузера эти поля задать нельзя: их пишут только серверные функции ниже
create or replace function public.ht_guard_mail_item() returns trigger
language plpgsql set search_path = public as $$
begin
  if auth.uid() is null or current_setting('ht.sys', true) = '1' then return new; end if;
  if new.item_kind is not null or new.item_id is not null or new.item_title is not null
     or new.item_body is not null or new.item_tags is not null then
    perform public.ht_flag('mail', 'Пытался подделать письмо на проверку');
    return null;
  end if;
  return new;
end $$;
drop trigger if exists ht_guard_item on public.ht_mail;
create trigger ht_guard_item before insert or update on public.ht_mail
  for each row execute function public.ht_guard_mail_item();

-- ученик отправляет статью на проверку: в письмо кладётся снимок, выпускается ровно он
create or replace function public.ht_article_submit(art bigint) returns bigint
language plpgsql security definer set search_path = public as $$
declare a record; n int; mid bigint;
begin
  if auth.uid() is null then raise exception 'Войди в аккаунт'; end if;
  if public.ht_is_banned() then raise exception 'Аккаунт заблокирован'; end if;
  select * into a from ht_articles where id = art;
  if not found or a.author_id <> auth.uid() then
    perform public.ht_flag('article', 'Пытался отправить на проверку чужую статью'); return null;
  end if;
  if char_length(btrim(a.title)) < 3 then raise exception 'Напиши название статьи (от 3 символов)'; end if;
  if char_length(btrim(a.body)) < 200 then raise exception 'Статья слишком короткая: нужно хотя бы 200 символов'; end if;
  if public.ht_is_bad(a.title || ' ' || a.body) then raise exception 'В статье есть недопустимые слова'; end if;
  if a.pub_body is not null and a.title = a.pub_title and a.body = a.pub_body and a.tags = a.pub_tags then
    raise exception 'В статье нет изменений: в Поиске уже эта версия';
  end if;
  select count(*) into n from ht_mail where from_id = auth.uid() and item_kind = 'article' and created_at > now() - interval '1 day';
  if n >= 10 and not public.ht_is_staff() then raise exception 'Сегодня уже отправлено 10 статей. Попробуй завтра.'; end if;
  perform set_config('ht.sys', '1', true);
  update ht_articles set status = 'review', review_note = null where id = a.id;
  insert into ht_mail (from_id, to_id, to_admins, subject, body, item_kind, item_id, item_title, item_body, item_tags)
  values (auth.uid(), null, true,
          left((case when a.pub_body is not null then '📰 Обновление статьи: «' else '📰 Статья на проверку: «' end) || a.title || '»', 120),
          'Новая статья для Поиска ждёт проверки. Нажми «Читать», чтобы открыть её.',
          'article', a.id, a.title, a.body, a.tags)
  returning id into mid;
  perform set_config('ht.sys', '', true);
  return mid;
end $$;

-- админ: выпустить статью из письма или вернуть на доработку
create or replace function public.ht_review_article(mail bigint, ok boolean, note text default '') returns void
language plpgsql security definer set search_path = public as $$
declare m record; a record; upd boolean;
begin
  if not public.ht_is_admin() then
    perform public.ht_flag('article', 'Не админ пытался выпустить статью'); return;
  end if;
  select * into m from ht_mail where id = mail and to_admins and item_kind = 'article';
  if not found then raise exception 'Письмо со статьёй не найдено'; end if;
  select * into a from ht_articles where id = m.item_id;
  if not found then raise exception 'Автор уже удалил эту статью'; end if;
  if exists (select 1 from ht_mail where item_kind = 'article' and item_id = a.id and to_admins and id > m.id) then
    raise exception 'Автор уже прислал более новую версию. Открой последнее письмо с этой статьёй.';
  end if;
  note := left(coalesce(note, ''), 2000);
  upd := a.pub_body is not null;
  perform set_config('ht.sys', '1', true);
  if ok then
    update ht_articles set pub_title = m.item_title, pub_body = m.item_body, pub_tags = coalesce(m.item_tags, '{}'),
           status = 'published', version = version + 1, published_at = coalesce(published_at, now()),
           review_note = nullif(note, '') where id = a.id;
  else
    update ht_articles set status = 'rejected', review_note = nullif(note, '') where id = a.id;
  end if;
  update ht_mail set read_at = coalesce(read_at, now()) where id = mail;
  insert into ht_mail (from_id, to_id, to_admins, subject, body, reply_to)
  values (auth.uid(), a.author_id, false,
          left(case when ok and upd then '✅ Статья «' || m.item_title || '» обновлена'
                    when ok then '✅ Статья «' || m.item_title || '» опубликована'
                    else '↩️ Статью «' || m.item_title || '» пока не опубликовали' end, 120),
          case when ok then 'Админ проверил статью. Теперь её можно найти в Поиске HoroTube.'
               when upd then 'Админ посмотрел изменения и вернул их на доработку. В Поиске пока остаётся прежняя версия.'
               else 'Админ посмотрел статью и вернул её на доработку.' end
          || case when note <> '' then E'\n\nОтзыв: ' || note else '' end,
          mail);
  perform set_config('ht.sys', '', true);
end $$;

-- видео ученика на проверке: письмо администрации приходит само
create or replace function public.ht_video_mail() returns trigger
language plpgsql security definer set search_path = public as $$
begin
  if new.status is distinct from 'pending' or new.author_id is null then return new; end if;
  perform set_config('ht.sys', '1', true);
  insert into ht_mail (from_id, to_id, to_admins, subject, body, item_kind, item_id, item_title)
  values (new.author_id, null, true,
          left((case when new.kind = 'short' then '⚡ Шортс на проверку: «' else '🎬 Видео на проверку: «' end) || coalesce(new.title, '') || '»', 120),
          'Новое видео ждёт проверки. Посмотри его и выпусти или верни автору.',
          'video', new.id, new.title);
  perform set_config('ht.sys', '', true);
  return new;
end $$;
drop trigger if exists ht_video_mail on public.videos;
create trigger ht_video_mail after insert on public.videos
  for each row execute function public.ht_video_mail();

-- админ: опубликовать видео из письма или отклонить
create or replace function public.ht_review_video(mail bigint, ok boolean, note text default '') returns void
language plpgsql security definer set search_path = public as $$
declare m record; v record;
begin
  if not public.ht_is_admin() then
    perform public.ht_flag('video', 'Не админ пытался опубликовать видео'); return;
  end if;
  select * into m from ht_mail where id = mail and to_admins and item_kind = 'video';
  if not found then raise exception 'Письмо с видео не найдено'; end if;
  select * into v from videos where id = m.item_id;
  if not found then raise exception 'Автор уже удалил это видео'; end if;
  note := left(coalesce(note, ''), 2000);
  update videos set status = case when ok then 'approved' else 'rejected' end where id = v.id;
  update ht_mod_notes set reviewed = true where kind = 'video' and target_id = v.id::text;
  perform set_config('ht.sys', '1', true);
  update ht_mail set read_at = coalesce(read_at, now()) where id = mail;
  if v.author_id is not null and v.author_id <> auth.uid() then
    insert into ht_mail (from_id, to_id, to_admins, subject, body, reply_to)
    values (auth.uid(), v.author_id, false,
            left(case when ok then '✅ Видео «' || coalesce(v.title, '') || '» опубликовано'
                      else '↩️ Видео «' || coalesce(v.title, '') || '» не опубликовали' end, 120),
            case when ok then 'Админ посмотрел видео и выпустил его. Его уже видят все.'
                 else 'Админ посмотрел видео и не стал его публиковать.' end
            || case when note <> '' then E'\n\nОтзыв: ' || note else '' end,
            mail);
  end if;
  perform set_config('ht.sys', '', true);
end $$;

-- ---------------------------------------------------------------------
-- 3. Поиск и чтение выпущенных статей
-- ---------------------------------------------------------------------
create or replace function public.ht_articles_find(q text default '', lim int default 20)
returns table (id bigint, title text, excerpt text, tags text[], author_id uuid, author_name text, author_nick text,
               views int, published_at timestamptz, words int)
language plpgsql stable security definer set search_path = public as $$
declare p text;
begin
  if auth.uid() is null then return; end if;
  q := btrim(coalesce(q, ''));
  p := '%' || replace(replace(replace(q, '\', '\\'), '%', '\%'), '_', '\_') || '%';
  return query
    select a.id, a.pub_title, left(regexp_replace(a.pub_body, '\s+', ' ', 'g'), 220), a.pub_tags, a.author_id,
           coalesce(nullif(pr.name, ''), pr.nick), pr.nick, a.views, a.published_at,
           coalesce(array_length(regexp_split_to_array(btrim(a.pub_body), '\s+'), 1), 0)
    from ht_articles a join profiles pr on pr.id = a.author_id
    where a.pub_body is not null and not coalesce(pr.banned, false)
      and (q = '' or a.pub_title ilike p or a.pub_body ilike p
           or exists (select 1 from unnest(a.pub_tags) t where t ilike p) or pr.nick ilike p)
    order by (a.pub_title ilike p) desc, a.published_at desc
    limit greatest(1, least(coalesce(lim, 20), 50));
end $$;

create or replace function public.ht_article_get(art bigint)
returns table (id bigint, title text, body text, tags text[], author_id uuid, author_name text, author_nick text,
               views int, published_at timestamptz, version int)
language plpgsql security definer set search_path = public as $$
begin
  if auth.uid() is null then return; end if;
  perform set_config('ht.sys', '1', true);
  update ht_articles a set views = a.views + 1
   where a.id = art and a.pub_body is not null and a.author_id <> auth.uid();
  perform set_config('ht.sys', '', true);
  return query
    select a.id, a.pub_title, a.pub_body, a.pub_tags, a.author_id, coalesce(nullif(pr.name, ''), pr.nick), pr.nick,
           a.views, a.published_at, a.version
    from ht_articles a join profiles pr on pr.id = a.author_id
    where a.id = art and a.pub_body is not null;
end $$;

-- админ: убрать статью из Поиска
create or replace function public.ht_unpublish_article(art bigint) returns void
language plpgsql security definer set search_path = public as $$
begin
  if not public.ht_is_admin() then perform public.ht_flag('article', 'Не админ пытался убрать статью'); return; end if;
  perform set_config('ht.sys', '1', true);
  update ht_articles set pub_title = null, pub_body = null, pub_tags = null, status = 'rejected' where id = art;
  perform set_config('ht.sys', '', true);
end $$;

revoke all on function public.ht_article_submit(bigint), public.ht_review_article(bigint, boolean, text),
  public.ht_review_video(bigint, boolean, text), public.ht_articles_find(text, int), public.ht_article_get(bigint),
  public.ht_unpublish_article(bigint) from public, anon;
grant execute on function public.ht_article_submit(bigint), public.ht_review_article(bigint, boolean, text),
  public.ht_review_video(bigint, boolean, text), public.ht_articles_find(text, int), public.ht_article_get(bigint),
  public.ht_unpublish_article(bigint) to authenticated;
revoke all on function public.ht_video_mail(), public.ht_guard_articles(), public.ht_guard_mail_item() from public, anon, authenticated;


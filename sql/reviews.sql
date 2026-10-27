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

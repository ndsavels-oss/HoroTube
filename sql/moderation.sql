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

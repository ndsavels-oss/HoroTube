-- =====================================================================
-- HoroTube: инструменты админа. Запускать только в Supabase SQL Editor,
-- по одной команде, подставив свои значения. Из браузера это недоступно.
-- =====================================================================


-- 1. Ученик забыл пароль: задать новый.
--    Старый пароль узнать нельзя никому, даже админу: Supabase хранит
--    только его хеш (необратимый отпечаток). Поэтому пароль не «смотрят»,
--    а меняют на новый и сообщают ученику лично.
--    Замените petya на ник ученика и НовыйПароль на новый пароль (от 6 символов).
update auth.users
   set encrypted_password = crypt('НовыйПароль', gen_salt('bf'))
 where email = lower('petya') || '@horotube.school';
-- Должно вывести UPDATE 1. Если UPDATE 0, ник набран неверно.
-- Если ошибка «function crypt does not exist», замените crypt на
-- extensions.crypt и gen_salt на extensions.gen_salt.


-- 2. Все ученики одной таблицей (без паролей).
--    То же самое есть на сайте: Админка → Пользователи → «Скачать список (CSV)».
select p.nick, p.name, p.class, p.role, p.tubek, p.premium, p.banned, p.created_at,
       count(v.id) filter (where v.status = 'approved') as videos_published,
       count(v.id) as videos_total
  from public.profiles p
  left join public.videos v on v.author_id = p.id
 group by p.id
 order by p.class, p.name;


-- 3. Добавить слово в фильтр (после moderation.sql)
--    insert into public.ht_bad_words (word, weight) values ('слово', 90);   -- 90 мат, 60 оскорбление
--    insert into public.ht_bad_patterns (pattern) values ('^корень');       -- все слова с этого корня
-- 4. Фильтр ошибочно ругается на обычное слово:
--    insert into public.ht_ok_patterns (pattern, note) values ('^слово', 'почему это нормально');

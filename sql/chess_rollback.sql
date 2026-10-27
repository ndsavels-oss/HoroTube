-- Откат chess.sql: удаляет онлайн-партии и список игроков.
-- Игра с компьютером и обучение продолжат работать.
drop table if exists public.ht_chess cascade;
drop table if exists public.ht_chess_lobby cascade;
drop function if exists public.ht_guard_chess() cascade;
drop function if exists public.ht_guard_chess_lobby() cascade;

-- Откат premium_chess.sql: шахматы снова без Tubek, остаётся только тариф buy_premium.
-- Уже начисленные Tubek и купленный премиум не отнимаются.
do $$ begin
  if to_regclass('public.ht_chess') is not null then execute 'drop trigger if exists ht_reward on public.ht_chess'; end if;
end $$;
drop function if exists public.ht_chess_online_reward();
drop function if exists public.ht_chess_reward(text);
drop function if exists public.ht_buy_plan(text, int);
drop function if exists public.ht_buy_premium(int);
drop function if exists public.ht_can_play();
drop table if exists public.ht_plans;
drop function if exists public.ht_chess_pay(uuid, text, int, text);
drop function if exists public.ht_chess_today(uuid);
drop table if exists public.ht_tubek_log;

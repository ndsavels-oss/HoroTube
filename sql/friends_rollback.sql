-- Откат friends.sql: убирает друзей и коды. Tubek, уже начисленные за друзей, остаются.
drop function if exists public.ht_add_friend(text);
drop function if exists public.ht_my_friend_code(boolean);
drop function if exists public.ht_new_friend_code();
drop function if exists public.ht_my_friends();
drop function if exists public.ht_admin_friends(uuid);
drop function if exists public.ht_remove_friend(uuid);
drop table if exists public.ht_friend_tries;
drop table if exists public.ht_friends;
drop table if exists public.ht_friend_codes;

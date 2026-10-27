-- Откат files_groups.sql: убирает Файлы и группы HoroChat вместе с данными.
-- Файлы в хранилище ht_files удалите в Supabase -> Storage вручную (или оставьте).
drop table if exists public.ht_group_msgs;
drop table if exists public.ht_group_members;
drop table if exists public.ht_groups;
drop table if exists public.ht_files;
drop function if exists public.ht_guard_files();
drop function if exists public.ht_guard_group_msg();
drop function if exists public.ht_group_note(bigint, text);
drop function if exists public.ht_group_add(bigint, uuid[]);
drop function if exists public.ht_group_create(text, text, uuid[]);
drop function if exists public.ht_group_edit(bigint, text, text);
drop function if exists public.ht_group_remove(bigint, uuid);
drop function if exists public.ht_group_list();
drop function if exists public.ht_group_people(bigint);
drop function if exists public.ht_group_read(bigint);
drop function if exists public.ht_in_group(bigint);
drop function if exists public.ht_is_friend(uuid);
drop function if exists public.ht_nm(uuid);
drop policy if exists ht_files_sel on storage.objects;
drop policy if exists ht_files_ins on storage.objects;
drop policy if exists ht_files_del on storage.objects;

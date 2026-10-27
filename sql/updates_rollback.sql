-- Откат updates.sql. Загруженные файлы версий в хранилище не удаляются.
drop function if exists public.ht_publish_release(text, text, text, integer);
drop function if exists public.ht_revoke_release(bigint, boolean);
drop table if exists public.ht_releases;
drop policy if exists ht_releases_ins on storage.objects;
drop policy if exists ht_releases_upd on storage.objects;
drop policy if exists ht_releases_del on storage.objects;

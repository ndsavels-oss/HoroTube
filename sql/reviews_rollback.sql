-- Откат reviews.sql: статьи и письма на проверку видео и статей.
drop trigger if exists ht_video_mail on public.videos;
drop trigger if exists ht_guard_item on public.ht_mail;
drop function if exists public.ht_video_mail();
drop function if exists public.ht_guard_mail_item();
drop function if exists public.ht_article_submit(bigint);
drop function if exists public.ht_review_article(bigint, boolean, text);
drop function if exists public.ht_review_video(bigint, boolean, text);
drop function if exists public.ht_articles_find(text, int);
drop function if exists public.ht_article_get(bigint);
drop function if exists public.ht_unpublish_article(bigint);
alter table public.ht_mail drop column if exists item_kind, drop column if exists item_id,
  drop column if exists item_title, drop column if exists item_body, drop column if exists item_tags;
drop table if exists public.ht_articles;
drop function if exists public.ht_guard_articles();

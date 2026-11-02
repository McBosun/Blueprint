-- Blueprint: one-time update. Safe to run more than once.
-- Supabase > SQL Editor > New query > paste all > Run.

-- 1. Profile fields
alter table public.bp_profiles
  add column if not exists display_name text check (char_length(display_name) <= 30),
  add column if not exists bio text check (char_length(bio) <= 160),
  add column if not exists location text check (char_length(location) <= 40),
  add column if not exists link text check (char_length(link) <= 200),
  add column if not exists interests text[] not null default '{}',
  add column if not exists avatar_url text;

update public.bp_profiles
set username = left(lower(regexp_replace(username, '[^a-zA-Z0-9_.]', '', 'g')), 15) || '_' || substr(id::text, 1, 4)
where username !~ '^[a-z0-9_.]{3,20}$';

alter table public.bp_profiles drop constraint if exists bp_username_format;
alter table public.bp_profiles add constraint bp_username_format check (username ~ '^[a-z0-9_.]{3,20}$');

-- 2. Every new account gets a profile
create or replace function public.bp_handle_new_user() returns trigger
language plpgsql security definer set search_path = '' as $$
begin
  insert into public.bp_profiles (id, username)
  values (new.id, left(lower(regexp_replace(split_part(coalesce(new.email, 'user'), '@', 1), '[^a-zA-Z0-9_.]', '', 'g')), 15) || '_' || substr(new.id::text, 1, 4))
  on conflict (id) do nothing;
  return new;
end $$;

drop trigger if exists bp_on_auth_user_created on auth.users;
create trigger bp_on_auth_user_created after insert on auth.users
for each row execute function public.bp_handle_new_user();

-- 3. Give a profile to any account that doesn't have one yet (fixes failed posts)
insert into public.bp_profiles (id, username)
select u.id, left(lower(regexp_replace(split_part(coalesce(u.email, 'user'), '@', 1), '[^a-zA-Z0-9_.]', '', 'g')), 15) || '_' || substr(u.id::text, 1, 4)
from auth.users u
where not exists (select 1 from public.bp_profiles p where p.id = u.id);

drop policy if exists "own profile insert" on public.bp_profiles;
create policy "own profile insert" on public.bp_profiles for insert to authenticated with check (id = (select auth.uid()));

-- 4. Followers
create table if not exists public.bp_follows (
  follower_id uuid not null default auth.uid() references public.bp_profiles(id) on delete cascade,
  following_id uuid not null references public.bp_profiles(id) on delete cascade,
  created_at timestamptz not null default now(),
  primary key (follower_id, following_id),
  check (follower_id <> following_id)
);
alter table public.bp_follows enable row level security;
drop policy if exists "follows readable" on public.bp_follows;
drop policy if exists "own follow insert" on public.bp_follows;
drop policy if exists "own follow delete" on public.bp_follows;
create policy "follows readable" on public.bp_follows for select using (true);
create policy "own follow insert" on public.bp_follows for insert to authenticated with check (follower_id = (select auth.uid()));
create policy "own follow delete" on public.bp_follows for delete to authenticated using (follower_id = (select auth.uid()));

-- 5. Profile photos (2 MB max)
insert into storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
values ('avatars', 'avatars', true, 2097152, array['image/jpeg','image/png','image/webp'])
on conflict (id) do nothing;
drop policy if exists "bp avatars read" on storage.objects;
drop policy if exists "bp avatars insert own" on storage.objects;
drop policy if exists "bp avatars update own" on storage.objects;
drop policy if exists "bp avatars delete own" on storage.objects;
create policy "bp avatars read" on storage.objects for select using (bucket_id = 'avatars');
create policy "bp avatars insert own" on storage.objects for insert to authenticated
  with check (bucket_id = 'avatars' and (storage.foldername(name))[1] = (select auth.uid())::text);
create policy "bp avatars update own" on storage.objects for update to authenticated
  using (bucket_id = 'avatars' and (storage.foldername(name))[1] = (select auth.uid())::text)
  with check (bucket_id = 'avatars' and (storage.foldername(name))[1] = (select auth.uid())::text);
create policy "bp avatars delete own" on storage.objects for delete to authenticated
  using (bucket_id = 'avatars' and (storage.foldername(name))[1] = (select auth.uid())::text);

-- 6. Accept any video format from phones (iPhone, Android, WebM)
update storage.buckets set allowed_mime_types = array['video/*'] where id = 'videos';

-- 7. Faster saved lists
create index if not exists bp_saves_user_idx on public.bp_saves (user_id, created_at desc);

-- 8. Photo posts with music
alter table public.bp_videos
  add column if not exists kind text not null default 'video' check (kind in ('video','photo')),
  add column if not exists image_paths text[],
  add column if not exists music_path text,
  add column if not exists music_title text;
alter table public.bp_videos alter column video_path drop not null;
alter table public.bp_videos drop constraint if exists bp_post_shape;
alter table public.bp_videos add constraint bp_post_shape check (
  (kind = 'video' and video_path is not null) or
  (kind = 'photo' and image_paths is not null and array_length(image_paths, 1) between 1 and 10));

insert into storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
values ('media', 'media', true, 15728640, array['image/*','audio/*'])
on conflict (id) do update set file_size_limit = 15728640, allowed_mime_types = array['image/*','audio/*'];
drop policy if exists "bp media read" on storage.objects;
drop policy if exists "bp media insert own" on storage.objects;
drop policy if exists "bp media delete own" on storage.objects;
create policy "bp media read" on storage.objects for select using (bucket_id = 'media');
create policy "bp media insert own" on storage.objects for insert to authenticated
  with check (bucket_id = 'media' and (storage.foldername(name))[1] = (select auth.uid())::text);
create policy "bp media delete own" on storage.objects for delete to authenticated
  using (bucket_id = 'media' and (storage.foldername(name))[1] = (select auth.uid())::text);

-- 9. Live broadcasting, notifications, profile views
alter table public.bp_lives add column if not exists last_seen timestamptz not null default now();
alter table public.bp_profiles add column if not exists share_views boolean not null default true;

create table if not exists public.bp_notifications (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references public.bp_profiles(id) on delete cascade,
  actor_id uuid references public.bp_profiles(id) on delete cascade,
  type text not null check (type in ('live','comment','follow','view')),
  video_id uuid references public.bp_videos(id) on delete cascade,
  live_id uuid references public.bp_lives(id) on delete cascade,
  body text,
  read boolean not null default false,
  created_at timestamptz not null default now()
);
create index if not exists bp_notes_user_idx on public.bp_notifications (user_id, created_at desc);
alter table public.bp_notifications enable row level security;
drop policy if exists "notes read own" on public.bp_notifications;
drop policy if exists "notes update own" on public.bp_notifications;
drop policy if exists "notes delete own" on public.bp_notifications;
create policy "notes read own" on public.bp_notifications for select to authenticated using (user_id = (select auth.uid()));
create policy "notes update own" on public.bp_notifications for update to authenticated using (user_id = (select auth.uid()));
create policy "notes delete own" on public.bp_notifications for delete to authenticated using (user_id = (select auth.uid()));

create table if not exists public.bp_profile_views (
  profile_id uuid not null references public.bp_profiles(id) on delete cascade,
  viewer_id uuid not null default auth.uid() references public.bp_profiles(id) on delete cascade,
  viewed_on date not null default current_date,
  created_at timestamptz not null default now(),
  primary key (profile_id, viewer_id, viewed_on),
  check (profile_id <> viewer_id)
);
alter table public.bp_profile_views enable row level security;
drop policy if exists "views insert" on public.bp_profile_views;
drop policy if exists "views read" on public.bp_profile_views;
create policy "views insert" on public.bp_profile_views for insert to authenticated
  with check (viewer_id = (select auth.uid()) and exists (select 1 from public.bp_profiles p where p.id = (select auth.uid()) and p.share_views));
create policy "views read" on public.bp_profile_views for select to authenticated
  using (profile_id = (select auth.uid()) or viewer_id = (select auth.uid()));

-- Notifications are created by triggers, never by the app
create or replace function public.bp_notify_live() returns trigger language plpgsql security definer set search_path = '' as $$
begin
  insert into public.bp_notifications (user_id, actor_id, type, live_id, body)
  select f.follower_id, new.host_id, 'live', new.id, new.title from public.bp_follows f where f.following_id = new.host_id;
  return new;
end $$;
drop trigger if exists bp_notify_live_t on public.bp_lives;
create trigger bp_notify_live_t after insert on public.bp_lives for each row execute function public.bp_notify_live();

create or replace function public.bp_notify_comment() returns trigger language plpgsql security definer set search_path = '' as $$
begin
  insert into public.bp_notifications (user_id, actor_id, type, video_id, body)
  select v.user_id, new.user_id, 'comment', new.video_id, left(new.body, 80)
  from public.bp_videos v where v.id = new.video_id and v.user_id <> new.user_id;
  return new;
end $$;
drop trigger if exists bp_notify_comment_t on public.bp_comments;
create trigger bp_notify_comment_t after insert on public.bp_comments for each row execute function public.bp_notify_comment();

create or replace function public.bp_notify_follow() returns trigger language plpgsql security definer set search_path = '' as $$
begin
  insert into public.bp_notifications (user_id, actor_id, type) values (new.following_id, new.follower_id, 'follow');
  return new;
end $$;
drop trigger if exists bp_notify_follow_t on public.bp_follows;
create trigger bp_notify_follow_t after insert on public.bp_follows for each row execute function public.bp_notify_follow();

create or replace function public.bp_notify_view() returns trigger language plpgsql security definer set search_path = '' as $$
begin
  insert into public.bp_notifications (user_id, actor_id, type) values (new.profile_id, new.viewer_id, 'view');
  return new;
end $$;
drop trigger if exists bp_notify_view_t on public.bp_profile_views;
create trigger bp_notify_view_t after insert on public.bp_profile_views for each row execute function public.bp_notify_view();

-- Instant notifications
do $$ begin alter publication supabase_realtime add table public.bp_notifications; exception when others then null; end $$;

-- 10. Private messages
alter table public.bp_profiles add column if not exists dm_policy text not null default 'mutual' check (dm_policy in ('mutual','anyone'));

create table if not exists public.bp_messages (
  id uuid primary key default gen_random_uuid(),
  sender_id uuid not null default auth.uid() references public.bp_profiles(id) on delete cascade,
  recipient_id uuid not null references public.bp_profiles(id) on delete cascade,
  body text not null check (char_length(body) between 1 and 1000),
  read_at timestamptz,
  created_at timestamptz not null default now(),
  check (sender_id <> recipient_id)
);
create index if not exists bp_msg_recipient_idx on public.bp_messages (recipient_id, created_at desc);
create index if not exists bp_msg_sender_idx on public.bp_messages (sender_id, created_at desc);

create table if not exists public.bp_blocks (
  blocker_id uuid not null default auth.uid() references public.bp_profiles(id) on delete cascade,
  blocked_id uuid not null references public.bp_profiles(id) on delete cascade,
  created_at timestamptz not null default now(),
  primary key (blocker_id, blocked_id),
  check (blocker_id <> blocked_id)
);

create table if not exists public.bp_reports (
  id uuid primary key default gen_random_uuid(),
  reporter_id uuid not null default auth.uid() references public.bp_profiles(id) on delete cascade,
  reported_id uuid not null references public.bp_profiles(id) on delete cascade,
  reason text not null check (char_length(reason) between 1 and 300),
  created_at timestamptz not null default now()
);

-- Who may message whom: not blocked, and (they allow anyone, or you follow each other, or they wrote to you first)
create or replace function public.bp_can_message(s uuid, r uuid) returns boolean
language sql stable security definer set search_path = '' as $$
  select s = (select auth.uid()) and s <> r
    and not exists (select 1 from public.bp_blocks b where (b.blocker_id = r and b.blocked_id = s) or (b.blocker_id = s and b.blocked_id = r))
    and exists (select 1 from public.bp_profiles p where p.id = r and (
      p.dm_policy = 'anyone'
      or (exists (select 1 from public.bp_follows f where f.follower_id = s and f.following_id = r)
          and exists (select 1 from public.bp_follows f where f.follower_id = r and f.following_id = s))
      or exists (select 1 from public.bp_messages m where m.sender_id = r and m.recipient_id = s)));
$$;

alter table public.bp_messages enable row level security;
alter table public.bp_blocks enable row level security;
alter table public.bp_reports enable row level security;

drop policy if exists "msgs read own" on public.bp_messages;
drop policy if exists "msgs send" on public.bp_messages;
drop policy if exists "msgs mark read" on public.bp_messages;
create policy "msgs read own" on public.bp_messages for select to authenticated
  using (sender_id = (select auth.uid()) or recipient_id = (select auth.uid()));
create policy "msgs send" on public.bp_messages for insert to authenticated
  with check (sender_id = (select auth.uid()) and public.bp_can_message(sender_id, recipient_id));
create policy "msgs mark read" on public.bp_messages for update to authenticated
  using (recipient_id = (select auth.uid()));
-- people can only change read_at, never the text
revoke update on public.bp_messages from authenticated, anon;
grant update (read_at) on public.bp_messages to authenticated;

drop policy if exists "blocks read own" on public.bp_blocks;
drop policy if exists "blocks add own" on public.bp_blocks;
drop policy if exists "blocks remove own" on public.bp_blocks;
create policy "blocks read own" on public.bp_blocks for select to authenticated using (blocker_id = (select auth.uid()));
create policy "blocks add own" on public.bp_blocks for insert to authenticated with check (blocker_id = (select auth.uid()));
create policy "blocks remove own" on public.bp_blocks for delete to authenticated using (blocker_id = (select auth.uid()));

drop policy if exists "reports add own" on public.bp_reports;
create policy "reports add own" on public.bp_reports for insert to authenticated with check (reporter_id = (select auth.uid()));

do $$ begin alter publication supabase_realtime add table public.bp_messages; exception when others then null; end $$;

-- 11. Safety, moderation, feed ranking, like notifications, account deletion
alter table public.bp_profiles
  add column if not exists banned boolean not null default false,
  add column if not exists terms_accepted_at timestamptz;

create table if not exists public.bp_admins (user_id uuid primary key references auth.users(id) on delete cascade);
alter table public.bp_admins enable row level security;
drop policy if exists "admins read self" on public.bp_admins;
create policy "admins read self" on public.bp_admins for select to authenticated using (user_id = (select auth.uid()));

create or replace function public.bp_is_admin() returns boolean language sql stable security definer set search_path = '' as $$
  select exists (select 1 from public.bp_admins where user_id = (select auth.uid())) $$;
create or replace function public.bp_ok() returns boolean language sql stable security definer set search_path = '' as $$
  select not exists (select 1 from public.bp_profiles where id = (select auth.uid()) and banned) $$;
create or replace function public.bp_set_ban(uid uuid, flag boolean) returns void language plpgsql security definer set search_path = '' as $$
begin
  if not public.bp_is_admin() then raise exception 'Not allowed'; end if;
  update public.bp_profiles set banned = flag where id = uid;
end $$;
create or replace function public.bp_delete_me() returns void language plpgsql security definer set search_path = '' as $$
begin delete from auth.users where id = (select auth.uid()); end $$;

-- People can edit their own profile details but never the ban flag
revoke update on public.bp_profiles from authenticated, anon;
grant update (username, display_name, bio, location, link, interests, avatar_url, share_views, dm_policy) on public.bp_profiles to authenticated;

-- New accounts record that they accepted the terms
create or replace function public.bp_handle_new_user() returns trigger language plpgsql security definer set search_path = '' as $$
begin
  insert into public.bp_profiles (id, username, terms_accepted_at)
  values (new.id, left(lower(regexp_replace(split_part(coalesce(new.email, 'user'), '@', 1), '[^a-zA-Z0-9_.]', '', 'g')), 15) || '_' || substr(new.id::text, 1, 4),
          case when (new.raw_user_meta_data ->> 'terms') = 'true' then now() end)
  on conflict (id) do nothing;
  return new;
end $$;

-- Reports: posts, comments and people
alter table public.bp_reports
  add column if not exists target_type text not null default 'user' check (target_type in ('user','post','comment')),
  add column if not exists video_id uuid references public.bp_videos(id) on delete set null,
  add column if not exists comment_id uuid references public.bp_comments(id) on delete set null,
  add column if not exists status text not null default 'open' check (status in ('open','actioned','dismissed')),
  add column if not exists handled_by uuid,
  add column if not exists handled_at timestamptz;
drop policy if exists "reports admin read" on public.bp_reports;
drop policy if exists "reports admin update" on public.bp_reports;
create policy "reports admin read" on public.bp_reports for select to authenticated using (public.bp_is_admin());
create policy "reports admin update" on public.bp_reports for update to authenticated using (public.bp_is_admin());

-- Admins can remove any post, comment and file; banned people cannot post, comment, message or go live
drop policy if exists "admin delete video" on public.bp_videos;
drop policy if exists "admin delete comment" on public.bp_comments;
drop policy if exists "bp admin delete files" on storage.objects;
create policy "admin delete video" on public.bp_videos for delete to authenticated using (public.bp_is_admin());
create policy "admin delete comment" on public.bp_comments for delete to authenticated using (public.bp_is_admin());
create policy "bp admin delete files" on storage.objects for delete to authenticated
  using (bucket_id in ('videos','media','avatars') and public.bp_is_admin());

drop policy if exists "own video insert" on public.bp_videos;
create policy "own video insert" on public.bp_videos for insert to authenticated with check (user_id = (select auth.uid()) and public.bp_ok());
drop policy if exists "own comment insert" on public.bp_comments;
create policy "own comment insert" on public.bp_comments for insert to authenticated with check (user_id = (select auth.uid()) and public.bp_ok());
drop policy if exists "own live insert" on public.bp_lives;
create policy "own live insert" on public.bp_lives for insert to authenticated with check (host_id = (select auth.uid()) and public.bp_ok());
drop policy if exists "msgs send" on public.bp_messages;
create policy "msgs send" on public.bp_messages for insert to authenticated
  with check (sender_id = (select auth.uid()) and public.bp_ok() and public.bp_can_message(sender_id, recipient_id));

-- Watch tracking and ranking stats
create table if not exists public.bp_views (
  id uuid primary key default gen_random_uuid(),
  video_id uuid not null references public.bp_videos(id) on delete cascade,
  viewer_id uuid not null default auth.uid() references public.bp_profiles(id) on delete cascade,
  watched_s int not null check (watched_s between 0 and 7200),
  completed boolean not null default false,
  created_at timestamptz not null default now()
);
create index if not exists bp_views_video_idx on public.bp_views (video_id);
create index if not exists bp_views_viewer_idx on public.bp_views (viewer_id, created_at desc);
alter table public.bp_views enable row level security;
drop policy if exists "views add own" on public.bp_views;
drop policy if exists "views read own" on public.bp_views;
create policy "views add own" on public.bp_views for insert to authenticated with check (viewer_id = (select auth.uid()));
create policy "views read own" on public.bp_views for select to authenticated using (viewer_id = (select auth.uid()));

create or replace function public.bp_stats(ids uuid[]) returns table (video_id uuid, views bigint, saves bigint)
language sql stable security definer set search_path = '' as $$
  select i.id, (select count(*) from public.bp_views v where v.video_id = i.id), (select count(*) from public.bp_saves s where s.video_id = i.id)
  from unnest(ids) as i(id);
$$;

-- Like notifications
alter table public.bp_notifications drop constraint if exists bp_notifications_type_check;
alter table public.bp_notifications add constraint bp_notifications_type_check check (type in ('live','comment','follow','view','like'));
create or replace function public.bp_notify_like() returns trigger language plpgsql security definer set search_path = '' as $$
begin
  insert into public.bp_notifications (user_id, actor_id, type, video_id)
  select v.user_id, new.user_id, 'like', new.video_id from public.bp_videos v where v.id = new.video_id and v.user_id <> new.user_id;
  return new;
end $$;
drop trigger if exists bp_notify_like_t on public.bp_likes;
create trigger bp_notify_like_t after insert on public.bp_likes for each row execute function public.bp_notify_like();

-- Make this account a moderator (it must already be signed up in the app):
insert into public.bp_admins (user_id)
select id from auth.users where lower(email) = lower('olatunbosunabi4@gmail.com')
on conflict do nothing;

-- To allow bigger videos (paid plan; also raise Storage > Settings > upload limit):
--   update storage.buckets set file_size_limit = 524288000 where id = 'videos';

-- 12. Downloads: creators can allow or block downloads of a post (default: allowed)
alter table public.bp_videos add column if not exists allow_download boolean not null default true;
drop policy if exists "own video update" on public.bp_videos;
create policy "own video update" on public.bp_videos for update to authenticated
  using (user_id = (select auth.uid())) with check (user_id = (select auth.uid()));
revoke update on public.bp_videos from authenticated, anon;
grant update (allow_download) on public.bp_videos to authenticated;

-- 13. Notification settings and phone alerts
create table if not exists public.bp_notif_prefs (
  user_id uuid primary key references public.bp_profiles(id) on delete cascade,
  likes boolean not null default true,
  comments boolean not null default true,
  follows boolean not null default true,
  lives boolean not null default true,
  messages boolean not null default true,
  views boolean not null default true,
  msg_preview boolean not null default false,
  updated_at timestamptz not null default now()
);
alter table public.bp_notif_prefs enable row level security;
drop policy if exists "prefs read own" on public.bp_notif_prefs;
drop policy if exists "prefs add own" on public.bp_notif_prefs;
drop policy if exists "prefs change own" on public.bp_notif_prefs;
create policy "prefs read own" on public.bp_notif_prefs for select to authenticated using (user_id = (select auth.uid()));
create policy "prefs add own" on public.bp_notif_prefs for insert to authenticated with check (user_id = (select auth.uid()));
create policy "prefs change own" on public.bp_notif_prefs for update to authenticated using (user_id = (select auth.uid()));

create or replace function public.bp_pref(uid uuid, kind text) returns boolean language sql stable security definer set search_path = '' as $$
  select coalesce((select case kind when 'like' then likes when 'comment' then comments when 'follow' then follows
                                    when 'live' then lives when 'message' then messages when 'view' then views else true end
                   from public.bp_notif_prefs where user_id = uid), true) $$;

-- Notifications now respect each person's choices
create or replace function public.bp_notify_live() returns trigger language plpgsql security definer set search_path = '' as $$
begin
  insert into public.bp_notifications (user_id, actor_id, type, live_id, body)
  select f.follower_id, new.host_id, 'live', new.id, new.title
  from public.bp_follows f where f.following_id = new.host_id and public.bp_pref(f.follower_id, 'live');
  return new;
end $$;
create or replace function public.bp_notify_comment() returns trigger language plpgsql security definer set search_path = '' as $$
begin
  insert into public.bp_notifications (user_id, actor_id, type, video_id, body)
  select v.user_id, new.user_id, 'comment', new.video_id, left(new.body, 80)
  from public.bp_videos v where v.id = new.video_id and v.user_id <> new.user_id and public.bp_pref(v.user_id, 'comment');
  return new;
end $$;
create or replace function public.bp_notify_follow() returns trigger language plpgsql security definer set search_path = '' as $$
begin
  insert into public.bp_notifications (user_id, actor_id, type) select new.following_id, new.follower_id, 'follow' where public.bp_pref(new.following_id, 'follow');
  return new;
end $$;
create or replace function public.bp_notify_view() returns trigger language plpgsql security definer set search_path = '' as $$
begin
  insert into public.bp_notifications (user_id, actor_id, type) select new.profile_id, new.viewer_id, 'view' where public.bp_pref(new.profile_id, 'view');
  return new;
end $$;
create or replace function public.bp_notify_like() returns trigger language plpgsql security definer set search_path = '' as $$
begin
  insert into public.bp_notifications (user_id, actor_id, type, video_id)
  select v.user_id, new.user_id, 'like', new.video_id from public.bp_videos v
  where v.id = new.video_id and v.user_id <> new.user_id and public.bp_pref(v.user_id, 'like');
  return new;
end $$;

-- Phone alert subscriptions (one per phone)
create table if not exists public.bp_push_subs (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null default auth.uid() references public.bp_profiles(id) on delete cascade,
  endpoint text not null unique,
  p256dh text not null,
  auth text not null,
  ua text,
  created_at timestamptz not null default now()
);
alter table public.bp_push_subs enable row level security;
drop policy if exists "push read own" on public.bp_push_subs;
drop policy if exists "push add own" on public.bp_push_subs;
drop policy if exists "push remove own" on public.bp_push_subs;
create policy "push read own" on public.bp_push_subs for select to authenticated using (user_id = (select auth.uid()));
create policy "push add own" on public.bp_push_subs for insert to authenticated with check (user_id = (select auth.uid()));
create policy "push remove own" on public.bp_push_subs for delete to authenticated using (user_id = (select auth.uid()));

-- Private settings for the alert sender (nobody can read this from the app)
create table if not exists public.bp_push_config (key text primary key, value text not null);
alter table public.bp_push_config enable row level security;
revoke all on public.bp_push_config from anon, authenticated;

do $$ begin create extension if not exists pg_net; exception when others then null; end $$;

-- When a notification or message is created, ask the send-push function to alert the person's phones.
-- It does nothing until bp_push_config has the url and secret, and it can never block a post or message.
create or replace function public.bp_push_notify() returns trigger language plpgsql security definer set search_path = '' as $$
declare u text; s text; target uuid; kind text;
begin
  begin
    if tg_table_name = 'bp_messages' then target := new.recipient_id; kind := 'message';
    else target := new.user_id; kind := new.type; end if;
    if not exists (select 1 from public.bp_push_subs where user_id = target) then return new; end if;
    select value into u from public.bp_push_config where key = 'url';
    select value into s from public.bp_push_config where key = 'secret';
    if u is null or s is null then return new; end if;
    if not public.bp_pref(target, kind) then return new; end if;
    perform net.http_post(url := u,
      headers := jsonb_build_object('Content-Type', 'application/json', 'x-webhook-secret', s),
      body := jsonb_build_object('table', tg_table_name, 'record', to_jsonb(new)));
  exception when others then null;
  end;
  return new;
end $$;
drop trigger if exists bp_push_notes_t on public.bp_notifications;
create trigger bp_push_notes_t after insert on public.bp_notifications for each row execute function public.bp_push_notify();
drop trigger if exists bp_push_msgs_t on public.bp_messages;
create trigger bp_push_msgs_t after insert on public.bp_messages for each row execute function public.bp_push_notify();

-- 14. Editor: Blueprint Sounds library and music attached to posts
alter table public.bp_videos
  add column if not exists music_url text,
  add column if not exists music_credit text,
  add column if not exists music_vol real not null default 0.8 check (music_vol between 0 and 1),
  add column if not exists orig_vol real not null default 1 check (orig_vol between 0 and 1),
  add column if not exists music_start real not null default 0 check (music_start >= 0);

create table if not exists public.bp_sounds (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null default auth.uid() references public.bp_profiles(id) on delete cascade,
  title text not null check (char_length(title) between 1 and 80),
  artist text not null check (char_length(artist) between 1 and 60),
  genre text not null default 'Other',
  audio_path text not null,
  duration_s int,
  allow_use boolean not null default true,
  created_at timestamptz not null default now()
);
create index if not exists bp_sounds_new_idx on public.bp_sounds (created_at desc);
alter table public.bp_sounds enable row level security;
drop policy if exists "sounds read" on public.bp_sounds;
drop policy if exists "sounds add own" on public.bp_sounds;
drop policy if exists "sounds delete own" on public.bp_sounds;
drop policy if exists "sounds admin delete" on public.bp_sounds;
create policy "sounds read" on public.bp_sounds for select using (allow_use or user_id = (select auth.uid()));
create policy "sounds add own" on public.bp_sounds for insert to authenticated with check (user_id = (select auth.uid()) and public.bp_ok());
create policy "sounds delete own" on public.bp_sounds for delete to authenticated using (user_id = (select auth.uid()));
create policy "sounds admin delete" on public.bp_sounds for delete to authenticated using (public.bp_is_admin());

insert into storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
values ('sounds', 'sounds', true, 15728640, array['audio/*'])
on conflict (id) do update set file_size_limit = 15728640, allowed_mime_types = array['audio/*'];
drop policy if exists "bp sounds read" on storage.objects;
drop policy if exists "bp sounds insert own" on storage.objects;
drop policy if exists "bp sounds delete own" on storage.objects;
create policy "bp sounds read" on storage.objects for select using (bucket_id = 'sounds');
create policy "bp sounds insert own" on storage.objects for insert to authenticated
  with check (bucket_id = 'sounds' and (storage.foldername(name))[1] = (select auth.uid())::text);
create policy "bp sounds delete own" on storage.objects for delete to authenticated
  using (bucket_id = 'sounds' and (storage.foldername(name))[1] = (select auth.uid())::text);
drop policy if exists "bp admin delete files" on storage.objects;
create policy "bp admin delete files" on storage.objects for delete to authenticated
  using (bucket_id in ('videos','media','avatars','sounds') and public.bp_is_admin());

-- 15. Original sounds: a video's own sound can be shared as an MP3 that others can use
alter table public.bp_videos add column if not exists sound_id uuid references public.bp_sounds(id) on delete set null;
create index if not exists bp_videos_sound_idx on public.bp_videos (sound_id);

-- 16. Fuller sign-up: private details (date of birth, country), age rules, full name, interests
create table if not exists public.bp_private (
  user_id uuid primary key references public.bp_profiles(id) on delete cascade,
  birth_date date,
  country text,
  parent_consent boolean not null default false,
  created_at timestamptz not null default now()
);
alter table public.bp_private enable row level security;
drop policy if exists "private read own" on public.bp_private;
create policy "private read own" on public.bp_private for select to authenticated using (user_id = (select auth.uid()));

create or replace function public.bp_handle_new_user() returns trigger language plpgsql security definer set search_path = '' as $$
declare md jsonb := coalesce(new.raw_user_meta_data, '{}'::jsonb); dob date; uname text; tags text[] := '{}';
begin
  begin dob := (md ->> 'dob')::date; exception when others then dob := null; end;
  if dob is null then raise exception 'Date of birth is required'; end if;
  if dob > (current_date - interval '16 years') then raise exception 'You must be at least 16 years old'; end if;
  if dob > (current_date - interval '18 years') and coalesce(md ->> 'parent_ok', 'false') <> 'true' then raise exception 'A parent or guardian must agree'; end if;
  uname := lower(coalesce(md ->> 'username', ''));
  if uname !~ '^[a-z0-9_.]{3,20}$' or exists (select 1 from public.bp_profiles where username = uname) then
    uname := left(lower(regexp_replace(split_part(coalesce(new.email, 'user'), '@', 1), '[^a-zA-Z0-9_.]', '', 'g')), 15) || '_' || substr(new.id::text, 1, 4);
  end if;
  begin tags := array(select lower(left(x, 20)) from jsonb_array_elements_text(coalesce(md -> 'interests', '[]'::jsonb)) x limit 5); exception when others then tags := '{}'; end;
  insert into public.bp_profiles (id, username, display_name, interests, terms_accepted_at)
  values (new.id, uname, left(nullif(trim(coalesce(md ->> 'display_name', '')), ''), 30), tags, case when (md ->> 'terms') = 'true' then now() end)
  on conflict (id) do nothing;
  insert into public.bp_private (user_id, birth_date, country, parent_consent)
  values (new.id, dob, left(nullif(md ->> 'country', ''), 60), coalesce(md ->> 'parent_ok', 'false') = 'true')
  on conflict (user_id) do nothing;
  return new;
end $$;

-- 17. Blueprints: remember which steps of a guide each person has finished
create table if not exists public.bp_progress (
  user_id uuid not null default auth.uid() references public.bp_profiles(id) on delete cascade,
  video_id uuid not null references public.bp_videos(id) on delete cascade,
  done int[] not null default '{}',
  updated_at timestamptz not null default now(),
  primary key (user_id, video_id)
);
alter table public.bp_progress enable row level security;
drop policy if exists "progress read own" on public.bp_progress;
drop policy if exists "progress add own" on public.bp_progress;
drop policy if exists "progress change own" on public.bp_progress;
drop policy if exists "progress delete own" on public.bp_progress;
create policy "progress read own" on public.bp_progress for select to authenticated using (user_id = (select auth.uid()));
create policy "progress add own" on public.bp_progress for insert to authenticated with check (user_id = (select auth.uid()));
create policy "progress change own" on public.bp_progress for update to authenticated using (user_id = (select auth.uid()));
create policy "progress delete own" on public.bp_progress for delete to authenticated using (user_id = (select auth.uid()));

-- 18. Verified badge (approved by admins) and the super admin gets it now
alter table public.bp_profiles add column if not exists verified boolean not null default false;
alter table public.bp_profiles drop constraint if exists bp_dn_no_badge;
alter table public.bp_profiles add constraint bp_dn_no_badge check (display_name is null or display_name !~ '[✓✔☑]') not valid;

-- people can never set their own badge or ban flag when creating a profile
drop policy if exists "own profile insert" on public.bp_profiles;
create policy "own profile insert" on public.bp_profiles for insert to authenticated
  with check (id = (select auth.uid()) and verified = false and banned = false);

create table if not exists public.bp_verify_requests (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null default auth.uid() references public.bp_profiles(id) on delete cascade,
  category text not null check (char_length(category) <= 40),
  reason text not null check (char_length(reason) between 10 and 300),
  links text check (char_length(links) <= 200),
  status text not null default 'pending' check (status in ('pending','approved','rejected')),
  note text,
  handled_by uuid,
  handled_at timestamptz,
  created_at timestamptz not null default now()
);
create unique index if not exists bp_verify_one_pending on public.bp_verify_requests (user_id) where status = 'pending';
alter table public.bp_verify_requests enable row level security;
drop policy if exists "verify read" on public.bp_verify_requests;
drop policy if exists "verify add own" on public.bp_verify_requests;
create policy "verify read" on public.bp_verify_requests for select to authenticated using (user_id = (select auth.uid()) or public.bp_is_admin());
create policy "verify add own" on public.bp_verify_requests for insert to authenticated with check (user_id = (select auth.uid()) and status = 'pending' and public.bp_ok());

create or replace function public.bp_set_verified(uid uuid, flag boolean) returns void language plpgsql security definer set search_path = '' as $$
begin
  if not public.bp_is_admin() then raise exception 'Not allowed'; end if;
  update public.bp_profiles set verified = flag where id = uid;
end $$;

create or replace function public.bp_review_verification(req uuid, approve boolean, p_note text default null) returns void language plpgsql security definer set search_path = '' as $$
declare r public.bp_verify_requests;
begin
  if not public.bp_is_admin() then raise exception 'Not allowed'; end if;
  select * into r from public.bp_verify_requests where id = req and status = 'pending';
  if not found then raise exception 'Request not found'; end if;
  update public.bp_verify_requests set status = case when approve then 'approved' else 'rejected' end,
    note = left(p_note, 200), handled_by = (select auth.uid()), handled_at = now() where id = req;
  if approve then update public.bp_profiles set verified = true where id = r.user_id; end if;
  insert into public.bp_notifications (user_id, actor_id, type, body)
  values (r.user_id, (select auth.uid()), 'verify',
    case when approve then 'Congratulations! Your account is now verified.' else 'Your verification request was not approved.' || coalesce(' ' || left(p_note, 120), '') end);
end $$;

alter table public.bp_notifications drop constraint if exists bp_notifications_type_check;
alter table public.bp_notifications add constraint bp_notifications_type_check check (type in ('live','comment','follow','view','like','verify'));

-- the super admin (everyone in bp_admins) is verified now
update public.bp_profiles set verified = true where id in (select user_id from public.bp_admins);

-- 19. Sponsored posts (ads), managed by admins
create table if not exists public.bp_ads (
  id uuid primary key default gen_random_uuid(),
  advertiser text not null check (char_length(advertiser) between 1 and 60),
  headline text not null check (char_length(headline) between 1 and 80),
  body text check (char_length(body) <= 200),
  cta text not null default 'Learn more' check (char_length(cta) <= 20),
  link_url text not null check (link_url ~ '^https://[^ ]+$' and char_length(link_url) <= 500),
  media_kind text not null check (media_kind in ('video','image')),
  media_path text not null,
  starts_at timestamptz not null default now(),
  ends_at timestamptz,
  status text not null default 'active' check (status in ('draft','active','paused','ended')),
  max_impressions int check (max_impressions is null or max_impressions > 0),
  every_n int not null default 6 check (every_n between 3 and 20),
  adult_only boolean not null default false,
  created_by uuid default auth.uid(),
  created_at timestamptz not null default now()
);
alter table public.bp_ads enable row level security;
drop policy if exists "ads admin all" on public.bp_ads;
create policy "ads admin all" on public.bp_ads for all to authenticated using (public.bp_is_admin()) with check (public.bp_is_admin());

create table if not exists public.bp_ad_events (
  id bigint generated always as identity primary key,
  ad_id uuid not null references public.bp_ads(id) on delete cascade,
  kind text not null check (kind in ('view','click')),
  viewer_key text not null check (char_length(viewer_key) between 4 and 64),
  bucket timestamptz not null default date_trunc('hour', now()),
  created_at timestamptz not null default now()
);
create unique index if not exists bp_ad_event_once on public.bp_ad_events (ad_id, kind, viewer_key, bucket);
alter table public.bp_ad_events enable row level security;
drop policy if exists "ad events insert" on public.bp_ad_events;
create policy "ad events insert" on public.bp_ad_events for insert to anon, authenticated
  with check (exists (select 1 from public.bp_ads a where a.id = ad_id and a.status = 'active'));

create or replace function public.bp_is_adult() returns boolean language sql stable security definer set search_path = '' as $$
  select coalesce((select birth_date <= (current_date - interval '18 years') from public.bp_private where user_id = (select auth.uid())), false) $$;

create or replace function public.bp_active_ads() returns setof public.bp_ads language sql stable security definer set search_path = '' as $$
  select a.* from public.bp_ads a
  where a.status = 'active' and a.starts_at <= now() and (a.ends_at is null or a.ends_at > now())
    and (not a.adult_only or public.bp_is_adult())
    and (a.max_impressions is null or (select count(*) from public.bp_ad_events e where e.ad_id = a.id and e.kind = 'view') < a.max_impressions)
  order by a.created_at desc limit 20 $$;

create or replace function public.bp_ad_stats() returns table (ad_id uuid, views bigint, clicks bigint) language plpgsql stable security definer set search_path = '' as $$
begin
  if not public.bp_is_admin() then raise exception 'Not allowed'; end if;
  return query select a.id, count(*) filter (where e.kind = 'view'), count(*) filter (where e.kind = 'click')
    from public.bp_ads a left join public.bp_ad_events e on e.ad_id = a.id group by a.id;
end $$;

insert into storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
values ('ads', 'ads', true, 31457280, array['video/*','image/*'])
on conflict (id) do update set file_size_limit = 31457280, allowed_mime_types = array['video/*','image/*'];
drop policy if exists "bp ads read" on storage.objects;
drop policy if exists "bp ads admin add" on storage.objects;
drop policy if exists "bp ads admin delete" on storage.objects;
create policy "bp ads read" on storage.objects for select using (bucket_id = 'ads');
create policy "bp ads admin add" on storage.objects for insert to authenticated with check (bucket_id = 'ads' and public.bp_is_admin());
create policy "bp ads admin delete" on storage.objects for delete to authenticated using (bucket_id = 'ads' and public.bp_is_admin());

-- 20. Coins, gifts, earnings and payouts (Paystack)
create table if not exists public.bp_money_config (key text primary key, value numeric not null);
insert into public.bp_money_config (key, value) values ('creator_share', 0.5), ('coin_value_kobo', 500), ('min_payout_kobo', 500000) on conflict (key) do nothing;
alter table public.bp_money_config enable row level security;
drop policy if exists "money config admin" on public.bp_money_config;
create policy "money config admin" on public.bp_money_config for all to authenticated using (public.bp_is_admin()) with check (public.bp_is_admin());

create table if not exists public.bp_wallets (
  user_id uuid primary key references public.bp_profiles(id) on delete cascade,
  coins bigint not null default 0 check (coins >= 0),
  earnings_kobo bigint not null default 0 check (earnings_kobo >= 0),
  updated_at timestamptz not null default now()
);
alter table public.bp_wallets enable row level security;
drop policy if exists "wallet read own" on public.bp_wallets;
create policy "wallet read own" on public.bp_wallets for select to authenticated using (user_id = (select auth.uid()));

create table if not exists public.bp_coin_packs (id text primary key, label text not null, coins int not null check (coins > 0), price_kobo int not null check (price_kobo >= 10000), active boolean not null default true);
insert into public.bp_coin_packs (id, label, coins, price_kobo) values
  ('p50', '50 coins', 50, 25000), ('p100', '100 coins', 100, 50000), ('p500', '500 coins + 25 bonus', 525, 250000),
  ('p1000', '1,000 coins + 100 bonus', 1100, 500000), ('p5000', '5,000 coins + 750 bonus', 5750, 2500000)
on conflict (id) do update set label = excluded.label, coins = excluded.coins, price_kobo = excluded.price_kobo;
alter table public.bp_coin_packs enable row level security;
drop policy if exists "packs read" on public.bp_coin_packs;
drop policy if exists "packs admin" on public.bp_coin_packs;
create policy "packs read" on public.bp_coin_packs for select using (active);
create policy "packs admin" on public.bp_coin_packs for all to authenticated using (public.bp_is_admin()) with check (public.bp_is_admin());

create table if not exists public.bp_gifts (id text primary key, name text not null, coins int not null check (coins > 0), emoji text not null, effect text not null, sort int not null default 0, active boolean not null default true);
insert into public.bp_gifts (id, name, coins, emoji, effect, sort) values
  ('rose', 'Rose', 1, '🌹', 'rose', 1), ('heart', 'Heart', 5, '❤️', 'heart', 2), ('drum', 'Talking Drum', 20, '🥁', 'drum', 3),
  ('fire', 'Fire', 30, '🔥', 'fire', 4), ('crown', 'Crown', 99, '👑', 'crown', 5), ('cash', 'Cash Blaster', 199, '🪙', 'cash', 6),
  ('lion', 'Lion', 499, '🦁', 'lion', 7), ('universe', 'Universe', 1999, '🌌', 'universe', 8)
on conflict (id) do update set name = excluded.name, coins = excluded.coins, emoji = excluded.emoji, effect = excluded.effect, sort = excluded.sort;
alter table public.bp_gifts enable row level security;
drop policy if exists "gifts read" on public.bp_gifts;
drop policy if exists "gifts admin" on public.bp_gifts;
create policy "gifts read" on public.bp_gifts for select using (active);
create policy "gifts admin" on public.bp_gifts for all to authenticated using (public.bp_is_admin()) with check (public.bp_is_admin());

create table if not exists public.bp_payments (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references public.bp_profiles(id) on delete cascade,
  reference text not null unique,
  pack_id text not null references public.bp_coin_packs(id),
  amount_kobo int not null,
  coins int not null,
  status text not null default 'pending' check (status in ('pending','paid','failed')),
  created_at timestamptz not null default now(),
  paid_at timestamptz
);
alter table public.bp_payments enable row level security;
drop policy if exists "payments read own" on public.bp_payments;
create policy "payments read own" on public.bp_payments for select to authenticated using (user_id = (select auth.uid()) or public.bp_is_admin());

create table if not exists public.bp_gift_log (
  id uuid primary key default gen_random_uuid(),
  sender_id uuid not null references public.bp_profiles(id) on delete cascade,
  receiver_id uuid not null references public.bp_profiles(id) on delete cascade,
  gift_id text not null references public.bp_gifts(id),
  qty int not null check (qty between 1 and 99),
  coins int not null,
  live_id uuid references public.bp_lives(id) on delete set null,
  created_at timestamptz not null default now()
);
create index if not exists bp_gift_live_idx on public.bp_gift_log (live_id, created_at desc);
alter table public.bp_gift_log enable row level security;
drop policy if exists "gift log read" on public.bp_gift_log;
create policy "gift log read" on public.bp_gift_log for select using (live_id is not null or sender_id = (select auth.uid()) or receiver_id = (select auth.uid()));
do $$ begin alter publication supabase_realtime add table public.bp_gift_log; exception when others then null; end $$;

create table if not exists public.bp_payout_requests (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references public.bp_profiles(id) on delete cascade,
  amount_kobo bigint not null check (amount_kobo > 0),
  bank text not null,
  account_number text not null check (account_number ~ '^[0-9]{10}$'),
  account_name text not null,
  status text not null default 'pending' check (status in ('pending','paid','rejected')),
  note text,
  handled_by uuid,
  handled_at timestamptz,
  created_at timestamptz not null default now()
);
alter table public.bp_payout_requests enable row level security;
drop policy if exists "payout read" on public.bp_payout_requests;
create policy "payout read" on public.bp_payout_requests for select to authenticated using (user_id = (select auth.uid()) or public.bp_is_admin());

alter table public.bp_notifications drop constraint if exists bp_notifications_type_check;
alter table public.bp_notifications add constraint bp_notifications_type_check check (type in ('live','comment','follow','view','like','verify','gift','payout'));

create or replace function public.bp_wallet_info() returns json language plpgsql stable security definer set search_path = '' as $$
declare w public.bp_wallets;
begin
  select * into w from public.bp_wallets where user_id = (select auth.uid());
  return json_build_object('coins', coalesce(w.coins, 0), 'earnings_kobo', coalesce(w.earnings_kobo, 0), 'adult', public.bp_is_adult(),
    'min_payout_kobo', (select value from public.bp_money_config where key = 'min_payout_kobo'), 'share', (select value from public.bp_money_config where key = 'creator_share'));
end $$;

create or replace function public.bp_start_purchase(pack text) returns json language plpgsql security definer set search_path = '' as $$
declare pk public.bp_coin_packs; ref text; em text; uid uuid := (select auth.uid());
begin
  if uid is null then raise exception 'Please sign in'; end if;
  if not public.bp_is_adult() then raise exception 'Buying coins is for people aged 18 and over'; end if;
  if not public.bp_ok() then raise exception 'Your account is restricted'; end if;
  select * into pk from public.bp_coin_packs where id = pack and active;
  if not found then raise exception 'That pack is not available'; end if;
  ref := 'bp_' || replace(gen_random_uuid()::text, '-', '');
  select email into em from auth.users where id = uid;
  insert into public.bp_payments (user_id, reference, pack_id, amount_kobo, coins) values (uid, ref, pk.id, pk.price_kobo, pk.coins);
  return json_build_object('reference', ref, 'amount_kobo', pk.price_kobo, 'coins', pk.coins, 'email', em);
end $$;

create or replace function public.bp_credit_payment(ref text, paid_kobo bigint, cur text) returns bigint language plpgsql security definer set search_path = '' as $$
declare p public.bp_payments;
begin
  select * into p from public.bp_payments where reference = ref for update;
  if not found then return -1; end if;
  if p.status = 'paid' then return p.coins; end if;
  if p.amount_kobo <> paid_kobo or upper(cur) <> 'NGN' then update public.bp_payments set status = 'failed' where id = p.id; return -1; end if;
  update public.bp_payments set status = 'paid', paid_at = now() where id = p.id;
  insert into public.bp_wallets (user_id, coins) values (p.user_id, p.coins)
  on conflict (user_id) do update set coins = public.bp_wallets.coins + excluded.coins, updated_at = now();
  return p.coins;
end $$;
revoke all on function public.bp_credit_payment(text, bigint, text) from public, anon, authenticated;
grant execute on function public.bp_credit_payment(text, bigint, text) to service_role;

create or replace function public.bp_send_gift(p_receiver uuid, p_gift text, p_live uuid default null, p_qty int default 1) returns json language plpgsql security definer set search_path = '' as $$
declare uid uuid := (select auth.uid()); gf public.bp_gifts; total int; share numeric; unit numeric; left_ bigint; gid uuid;
begin
  if uid is null then raise exception 'Please sign in'; end if;
  if uid = p_receiver then raise exception 'You can''t send a gift to yourself'; end if;
  if not public.bp_is_adult() then raise exception 'Gifts are for people aged 18 and over'; end if;
  if not public.bp_ok() then raise exception 'Your account is restricted'; end if;
  if p_qty < 1 or p_qty > 99 then raise exception 'Choose 1 to 99'; end if;
  select * into gf from public.bp_gifts where id = p_gift and active;
  if not found then raise exception 'That gift is not available'; end if;
  if not exists (select 1 from public.bp_profiles where id = p_receiver) then raise exception 'Unknown creator'; end if;
  if p_live is not null and not exists (select 1 from public.bp_lives where id = p_live and host_id = p_receiver and status = 'live') then raise exception 'This live has ended'; end if;
  if exists (select 1 from public.bp_blocks where blocker_id = p_receiver and blocked_id = uid) then raise exception 'You can''t send gifts to this person'; end if;
  total := gf.coins * p_qty;
  update public.bp_wallets set coins = coins - total, updated_at = now() where user_id = uid and coins >= total returning coins into left_;
  if not found then raise exception 'Not enough coins'; end if;
  select value into share from public.bp_money_config where key = 'creator_share';
  select value into unit from public.bp_money_config where key = 'coin_value_kobo';
  insert into public.bp_wallets (user_id, earnings_kobo) values (p_receiver, floor(total * unit * share)::bigint)
  on conflict (user_id) do update set earnings_kobo = public.bp_wallets.earnings_kobo + excluded.earnings_kobo, updated_at = now();
  insert into public.bp_gift_log (sender_id, receiver_id, gift_id, qty, coins, live_id) values (uid, p_receiver, gf.id, p_qty, total, p_live) returning id into gid;
  insert into public.bp_notifications (user_id, actor_id, type, body) select p_receiver, uid, 'gift', gf.name || ' x' || p_qty where public.bp_pref(p_receiver, 'gift');
  return json_build_object('coins_left', left_, 'id', gid);
end $$;

create or replace function public.bp_request_payout(p_amount bigint, p_bank text, p_account text, p_name text) returns uuid language plpgsql security definer set search_path = '' as $$
declare uid uuid := (select auth.uid()); minp numeric; rid uuid;
begin
  if uid is null then raise exception 'Please sign in'; end if;
  if not public.bp_is_adult() then raise exception 'Cash out is for people aged 18 and over'; end if;
  if not public.bp_ok() then raise exception 'Your account is restricted'; end if;
  select value into minp from public.bp_money_config where key = 'min_payout_kobo';
  if p_amount < minp then raise exception 'The minimum payout is % naira', (minp / 100)::int; end if;
  if p_account !~ '^[0-9]{10}$' then raise exception 'The account number must be 10 digits'; end if;
  if exists (select 1 from public.bp_payout_requests where user_id = uid and status = 'pending') then raise exception 'You already have a payout waiting'; end if;
  update public.bp_wallets set earnings_kobo = earnings_kobo - p_amount, updated_at = now() where user_id = uid and earnings_kobo >= p_amount;
  if not found then raise exception 'Not enough earnings'; end if;
  insert into public.bp_payout_requests (user_id, amount_kobo, bank, account_number, account_name) values (uid, p_amount, left(p_bank, 60), p_account, left(p_name, 80)) returning id into rid;
  return rid;
end $$;

create or replace function public.bp_finish_payout(p_id uuid, p_paid boolean, p_note text default null) returns void language plpgsql security definer set search_path = '' as $$
declare r public.bp_payout_requests;
begin
  if not public.bp_is_admin() then raise exception 'Not allowed'; end if;
  select * into r from public.bp_payout_requests where id = p_id and status = 'pending' for update;
  if not found then raise exception 'Request not found'; end if;
  if p_paid then
    update public.bp_payout_requests set status = 'paid', note = left(p_note, 200), handled_by = (select auth.uid()), handled_at = now() where id = p_id;
  else
    update public.bp_wallets set earnings_kobo = earnings_kobo + r.amount_kobo, updated_at = now() where user_id = r.user_id;
    update public.bp_payout_requests set status = 'rejected', note = left(p_note, 200), handled_by = (select auth.uid()), handled_at = now() where id = p_id;
  end if;
  insert into public.bp_notifications (user_id, actor_id, type, body) values (r.user_id, (select auth.uid()), 'payout',
    case when p_paid then 'Your payout has been sent.' else 'Your payout request was not approved and your earnings were returned.' || coalesce(' ' || left(p_note, 120), '') end);
end $$;

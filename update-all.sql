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

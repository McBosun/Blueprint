-- Blueprint database. Run once in Supabase: SQL Editor > New query > paste > Run.

create table public.bp_profiles (
  id uuid primary key references auth.users(id) on delete cascade,
  username text unique not null,
  created_at timestamptz not null default now()
);

create table public.bp_videos (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null default auth.uid() references public.bp_profiles(id) on delete cascade,
  title text not null,
  caption text,
  tags text[] not null default '{}',
  steps text[],
  video_path text not null,
  duration_s int not null check (duration_s between 1 and 7200),
  is_live_replay boolean not null default false,
  created_at timestamptz not null default now(),
  -- uploads max 20 minutes, live replays max 2 hours
  constraint bp_video_len check (is_live_replay or duration_s <= 1200)
);

create table public.bp_likes (
  video_id uuid not null references public.bp_videos(id) on delete cascade,
  user_id uuid not null default auth.uid() references public.bp_profiles(id) on delete cascade,
  created_at timestamptz not null default now(),
  primary key (video_id, user_id)
);

create table public.bp_saves (
  video_id uuid not null references public.bp_videos(id) on delete cascade,
  user_id uuid not null default auth.uid() references public.bp_profiles(id) on delete cascade,
  created_at timestamptz not null default now(),
  primary key (video_id, user_id)
);

create table public.bp_comments (
  id uuid primary key default gen_random_uuid(),
  video_id uuid not null references public.bp_videos(id) on delete cascade,
  user_id uuid not null default auth.uid() references public.bp_profiles(id) on delete cascade,
  body text not null check (char_length(body) between 1 and 500),
  created_at timestamptz not null default now()
);

create table public.bp_lives (
  id uuid primary key default gen_random_uuid(),
  host_id uuid not null default auth.uid() references public.bp_profiles(id) on delete cascade,
  title text not null,
  status text not null default 'live' check (status in ('live','ended')),
  started_at timestamptz not null default now(),
  ended_at timestamptz,
  constraint bp_live_len check (ended_at is null or ended_at - started_at <= interval '2 hours 1 minute')
);

create index on public.bp_videos (created_at desc);
create index on public.bp_comments (video_id, created_at);

alter table public.bp_profiles enable row level security;
alter table public.bp_videos   enable row level security;
alter table public.bp_likes    enable row level security;
alter table public.bp_saves    enable row level security;
alter table public.bp_comments enable row level security;
alter table public.bp_lives    enable row level security;

create policy "profiles readable" on public.bp_profiles for select using (true);
create policy "own profile update" on public.bp_profiles for update to authenticated using (id = (select auth.uid()));

create policy "videos readable" on public.bp_videos for select using (true);
create policy "own video insert" on public.bp_videos for insert to authenticated with check (user_id = (select auth.uid()));
create policy "own video delete" on public.bp_videos for delete to authenticated using (user_id = (select auth.uid()));

create policy "likes readable" on public.bp_likes for select using (true);
create policy "own like insert" on public.bp_likes for insert to authenticated with check (user_id = (select auth.uid()));
create policy "own like delete" on public.bp_likes for delete to authenticated using (user_id = (select auth.uid()));

create policy "own saves read" on public.bp_saves for select to authenticated using (user_id = (select auth.uid()));
create policy "own save insert" on public.bp_saves for insert to authenticated with check (user_id = (select auth.uid()));
create policy "own save delete" on public.bp_saves for delete to authenticated using (user_id = (select auth.uid()));

create policy "comments readable" on public.bp_comments for select using (true);
create policy "own comment insert" on public.bp_comments for insert to authenticated with check (user_id = (select auth.uid()));
create policy "own comment delete" on public.bp_comments for delete to authenticated using (user_id = (select auth.uid()));

create policy "lives readable" on public.bp_lives for select using (true);
create policy "own live insert" on public.bp_lives for insert to authenticated with check (host_id = (select auth.uid()));
create policy "own live update" on public.bp_lives for update to authenticated using (host_id = (select auth.uid()));

-- Create a profile automatically when someone signs up
create function public.bp_handle_new_user() returns trigger
language plpgsql security definer set search_path = '' as $$
begin
  insert into public.bp_profiles (id, username)
  values (new.id, split_part(new.email, '@', 1) || '_' || substr(new.id::text, 1, 4));
  return new;
end $$;

create trigger bp_on_auth_user_created after insert on auth.users
for each row execute function public.bp_handle_new_user();

-- Video storage (50 MB per file fits the free plan; raise it on a paid plan)
insert into storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
values ('videos', 'videos', true, 52428800, array['video/mp4','video/webm','video/quicktime'])
on conflict (id) do nothing;

create policy "bp videos public read" on storage.objects for select using (bucket_id = 'videos');
create policy "bp videos upload own folder" on storage.objects for insert to authenticated
  with check (bucket_id = 'videos' and (storage.foldername(name))[1] = (select auth.uid())::text);
create policy "bp videos delete own" on storage.objects for delete to authenticated
  using (bucket_id = 'videos' and (storage.foldername(name))[1] = (select auth.uid())::text);

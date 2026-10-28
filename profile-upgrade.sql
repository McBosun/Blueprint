-- Blueprint profile upgrade. Run once in Supabase: SQL Editor > New query > paste > Run.

alter table public.bp_profiles
  add column if not exists display_name text check (char_length(display_name) <= 30),
  add column if not exists bio text check (char_length(bio) <= 160),
  add column if not exists location text check (char_length(location) <= 40),
  add column if not exists link text check (char_length(link) <= 200),
  add column if not exists interests text[] not null default '{}',
  add column if not exists avatar_url text;

-- Tidy any older usernames, then enforce the format
update public.bp_profiles
set username = left(lower(regexp_replace(username, '[^a-zA-Z0-9_.]', '', 'g')), 15) || '_' || substr(id::text, 1, 4)
where username !~ '^[a-z0-9_.]{3,20}$';

alter table public.bp_profiles drop constraint if exists bp_username_format;
alter table public.bp_profiles add constraint bp_username_format check (username ~ '^[a-z0-9_.]{3,20}$');

-- New accounts get a clean username
create or replace function public.bp_handle_new_user() returns trigger
language plpgsql security definer set search_path = '' as $$
begin
  insert into public.bp_profiles (id, username)
  values (new.id, left(lower(regexp_replace(split_part(new.email, '@', 1), '[^a-zA-Z0-9_.]', '', 'g')), 15) || '_' || substr(new.id::text, 1, 4));
  return new;
end $$;

-- Followers
create table if not exists public.bp_follows (
  follower_id uuid not null default auth.uid() references public.bp_profiles(id) on delete cascade,
  following_id uuid not null references public.bp_profiles(id) on delete cascade,
  created_at timestamptz not null default now(),
  primary key (follower_id, following_id),
  check (follower_id <> following_id)
);
alter table public.bp_follows enable row level security;
create policy "follows readable" on public.bp_follows for select using (true);
create policy "own follow insert" on public.bp_follows for insert to authenticated with check (follower_id = (select auth.uid()));
create policy "own follow delete" on public.bp_follows for delete to authenticated using (follower_id = (select auth.uid()));

-- Profile photos (2 MB max)
insert into storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
values ('avatars', 'avatars', true, 2097152, array['image/jpeg','image/png','image/webp'])
on conflict (id) do nothing;

create policy "bp avatars read" on storage.objects for select using (bucket_id = 'avatars');
create policy "bp avatars insert own" on storage.objects for insert to authenticated
  with check (bucket_id = 'avatars' and (storage.foldername(name))[1] = (select auth.uid())::text);
create policy "bp avatars update own" on storage.objects for update to authenticated
  using (bucket_id = 'avatars' and (storage.foldername(name))[1] = (select auth.uid())::text)
  with check (bucket_id = 'avatars' and (storage.foldername(name))[1] = (select auth.uid())::text);
create policy "bp avatars delete own" on storage.objects for delete to authenticated
  using (bucket_id = 'avatars' and (storage.foldername(name))[1] = (select auth.uid())::text);

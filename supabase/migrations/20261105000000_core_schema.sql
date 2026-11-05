-- Football Coach AI core schema. Run this once in the Supabase SQL Editor.
create table if not exists public.profiles (
  id uuid primary key references auth.users(id) on delete cascade,
  display_name text,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create table if not exists public.video_analyses (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users(id) on delete cascade,
  storage_path text not null,
  original_filename text not null,
  mime_type text not null,
  file_size_bytes bigint not null default 0,
  skill_category text not null,
  status text not null default 'completed',
  score integer check (score between 0 and 100),
  analysis jsonb not null default '{}'::jsonb,
  created_at timestamptz not null default now()
);
create index if not exists video_analyses_user_created_idx
  on public.video_analyses (user_id, created_at desc);

create table if not exists public.training_plans (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users(id) on delete cascade,
  title text not null,
  focus text not null,
  content text not null,
  created_at timestamptz not null default now()
);
create index if not exists training_plans_user_created_idx
  on public.training_plans (user_id, created_at desc);

alter table public.profiles enable row level security;
alter table public.video_analyses enable row level security;
alter table public.training_plans enable row level security;

do $$
begin
  if not exists (select 1 from pg_policies where schemaname='public' and tablename='profiles' and policyname='profiles_select_own') then
    create policy profiles_select_own on public.profiles for select to authenticated using (auth.uid() = id);
  end if;
  if not exists (select 1 from pg_policies where schemaname='public' and tablename='profiles' and policyname='profiles_insert_own') then
    create policy profiles_insert_own on public.profiles for insert to authenticated with check (auth.uid() = id);
  end if;
  if not exists (select 1 from pg_policies where schemaname='public' and tablename='profiles' and policyname='profiles_update_own') then
    create policy profiles_update_own on public.profiles for update to authenticated using (auth.uid() = id) with check (auth.uid() = id);
  end if;
  if not exists (select 1 from pg_policies where schemaname='public' and tablename='video_analyses' and policyname='analyses_select_own') then
    create policy analyses_select_own on public.video_analyses for select to authenticated using (auth.uid() = user_id);
  end if;
  if not exists (select 1 from pg_policies where schemaname='public' and tablename='video_analyses' and policyname='analyses_insert_own') then
    create policy analyses_insert_own on public.video_analyses for insert to authenticated with check (auth.uid() = user_id);
  end if;
  if not exists (select 1 from pg_policies where schemaname='public' and tablename='video_analyses' and policyname='analyses_delete_own') then
    create policy analyses_delete_own on public.video_analyses for delete to authenticated using (auth.uid() = user_id);
  end if;
  if not exists (select 1 from pg_policies where schemaname='public' and tablename='training_plans' and policyname='training_plans_select_own') then
    create policy training_plans_select_own on public.training_plans for select to authenticated using (auth.uid() = user_id);
  end if;
  if not exists (select 1 from pg_policies where schemaname='public' and tablename='training_plans' and policyname='training_plans_insert_own') then
    create policy training_plans_insert_own on public.training_plans for insert to authenticated with check (auth.uid() = user_id);
  end if;
  if not exists (select 1 from pg_policies where schemaname='public' and tablename='training_plans' and policyname='training_plans_delete_own') then
    create policy training_plans_delete_own on public.training_plans for delete to authenticated using (auth.uid() = user_id);
  end if;
end $$;

grant select, insert, update on public.profiles to authenticated;
grant select, insert, delete on public.video_analyses to authenticated;
grant select, insert, delete on public.training_plans to authenticated;

insert into storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
values ('football-videos', 'football-videos', false, 12582912, array['video/mp4','video/quicktime','video/webm'])
on conflict (id) do update set
  public = false,
  file_size_limit = 12582912,
  allowed_mime_types = array['video/mp4','video/quicktime','video/webm'];

do $$
begin
  if not exists (select 1 from pg_policies where schemaname='storage' and tablename='objects' and policyname='football_videos_select_own') then
    create policy football_videos_select_own on storage.objects for select to authenticated
      using (bucket_id='football-videos' and (storage.foldername(name))[1]=auth.uid()::text);
  end if;
  if not exists (select 1 from pg_policies where schemaname='storage' and tablename='objects' and policyname='football_videos_insert_own') then
    create policy football_videos_insert_own on storage.objects for insert to authenticated
      with check (bucket_id='football-videos' and (storage.foldername(name))[1]=auth.uid()::text);
  end if;
  if not exists (select 1 from pg_policies where schemaname='storage' and tablename='objects' and policyname='football_videos_delete_own') then
    create policy football_videos_delete_own on storage.objects for delete to authenticated
      using (bucket_id='football-videos' and (storage.foldername(name))[1]=auth.uid()::text);
  end if;
end $$;

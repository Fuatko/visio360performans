-- Optional future migration. Do not run until the organization decides to persist
-- accessibility preferences in Supabase.
--
-- KVKK principle: store product preferences, not disability/health labels.

create table if not exists public.user_accessibility_preferences (
  user_id uuid primary key references public.users(id) on delete cascade,
  high_contrast boolean not null default false,
  large_text boolean not null default false,
  reduced_motion boolean not null default false,
  screen_reader_mode boolean not null default false,
  simple_language boolean not null default false,
  visual_cues boolean not null default true,
  updated_at timestamptz not null default now()
);

alter table public.user_accessibility_preferences enable row level security;

drop policy if exists "user_accessibility_preferences_select_own" on public.user_accessibility_preferences;
create policy "user_accessibility_preferences_select_own"
  on public.user_accessibility_preferences
  for select
  using (auth.uid() = user_id);

drop policy if exists "user_accessibility_preferences_upsert_own" on public.user_accessibility_preferences;
create policy "user_accessibility_preferences_upsert_own"
  on public.user_accessibility_preferences
  for all
  using (auth.uid() = user_id)
  with check (auth.uid() = user_id);

comment on table public.user_accessibility_preferences is
  'Stores user-controlled accessibility preferences only; does not store disability or health labels.';

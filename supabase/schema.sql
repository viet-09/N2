-- supabase/schema.sql
-- Multi-user schema for N2_web. Apply via:
--   psql "$SUPABASE_DB_URL" -f supabase/schema.sql
--   OR: paste into Supabase Dashboard → SQL Editor → Run.
--
-- Idempotent: every CREATE uses IF NOT EXISTS / CREATE OR REPLACE.

-- ---------------------------------------------------------------------------
-- 1. user_profiles — 1:1 with auth.users
-- ---------------------------------------------------------------------------
create table if not exists public.user_profiles (
  user_id              uuid primary key references auth.users(id) on delete cascade,
  display_name         text not null default '',
  avatar_type          text not null default 'preset' check (avatar_type in ('preset','upload')),
  avatar_data          text not null default 'neko',
  streak               integer not null default 0 check (streak >= 0),
  last_study_date      date,
  total_score          integer not null default 0 check (total_score >= 0),
  ai_level             text not null default 'N5' check (ai_level in ('N5','N4','N3','N2','N1')),
  ai_level_updated_at  timestamptz,
  tutor_memory         text not null default '',
  furigana             boolean not null default true,
  created_at           timestamptz not null default now(),
  updated_at           timestamptz not null default now()
);

-- Auto-create empty profile row on signup so the rest of the code can
-- always upsert against an existing row.
create or replace function public.handle_new_user() returns trigger
language plpgsql security definer set search_path = public as $$
begin
  insert into public.user_profiles (user_id)
  values (new.id)
  on conflict (user_id) do nothing;
  return new;
end;
$$;

drop trigger if exists on_auth_user_created on auth.users;
create trigger on_auth_user_created
  after insert on auth.users
  for each row execute function public.handle_new_user();

-- ---------------------------------------------------------------------------
-- 2. learning_progress — completed lessons per user
-- ---------------------------------------------------------------------------
create table if not exists public.learning_progress (
  user_id      uuid not null references auth.users(id) on delete cascade,
  lesson_id    text not null,
  category_id  text not null,
  completed_at timestamptz not null default now(),
  primary key (user_id, lesson_id)
);
create index if not exists learning_progress_user_completed_idx
  on public.learning_progress (user_id, completed_at desc);

-- ---------------------------------------------------------------------------
-- 3. lesson_content_cache — per-lesson AI explanations (tap-kanji glosses)
-- ---------------------------------------------------------------------------
create table if not exists public.lesson_content_cache (
  user_id    uuid not null references auth.users(id) on delete cascade,
  lesson_id  text not null,
  payload    jsonb not null,
  updated_at timestamptz not null default now(),
  primary key (user_id, lesson_id)
);

-- ---------------------------------------------------------------------------
-- 4. tutor_messages — chat history with AI tutor
-- ---------------------------------------------------------------------------
create table if not exists public.tutor_messages (
  id         bigserial primary key,
  user_id    uuid not null references auth.users(id) on delete cascade,
  role       text not null check (role in ('user','model')),
  text       text not null,
  created_at timestamptz not null default now()
);
create index if not exists tutor_messages_user_created_idx
  on public.tutor_messages (user_id, created_at);

-- ---------------------------------------------------------------------------
-- 5. voice_messages — voice conversation transcripts
-- ---------------------------------------------------------------------------
create table if not exists public.voice_messages (
  id         bigserial primary key,
  user_id    uuid not null references auth.users(id) on delete cascade,
  topic      text not null,
  role       text not null check (role in ('user','model')),
  text       text not null,
  created_at timestamptz not null default now()
);
create index if not exists voice_messages_user_topic_created_idx
  on public.voice_messages (user_id, topic, created_at);

-- ---------------------------------------------------------------------------
-- 6. kanji_gloss_cache — tap-kanji explanation cache
-- ---------------------------------------------------------------------------
create table if not exists public.kanji_gloss_cache (
  user_id    uuid not null references auth.users(id) on delete cascade,
  key        text not null,
  payload    jsonb not null,
  updated_at timestamptz not null default now(),
  primary key (user_id, key)
);

-- ---------------------------------------------------------------------------
-- 7. leaderboard view — public, ordered by total_score then streak
-- ---------------------------------------------------------------------------
create or replace view public.leaderboard as
  select
    up.user_id,
    up.display_name,
    up.avatar_type,
    up.avatar_data,
    up.streak,
    up.total_score,
    up.ai_level,
    row_number() over (
      order by up.total_score desc, up.streak desc, up.created_at asc
    ) as rank
  from public.user_profiles up
  where up.total_score > 0 or up.streak > 0
  order by up.total_score desc, up.streak desc, up.created_at asc;

grant select on public.leaderboard to anon, authenticated;

-- ---------------------------------------------------------------------------
-- 8. touch_user_streak — atomic day-bump streak (Asia/Tokyo timezone)
-- ---------------------------------------------------------------------------
create or replace function public.touch_user_streak(p_user_id uuid)
returns table(streak int, last_date date)
language plpgsql security definer set search_path = public as $$
declare
  v_today        date := (now() at time zone 'Asia/Tokyo')::date;
  v_yesterday    date := v_today - 1;
  v_cur_streak   int;
  v_cur_last     date;
begin
  select up.streak, up.last_study_date
    into v_cur_streak, v_cur_last
    from public.user_profiles up
    where up.user_id = p_user_id
    for update;

  if v_cur_last is null then
    update public.user_profiles
      set streak = 1, last_study_date = v_today, updated_at = now()
      where user_id = p_user_id;
    return query select 1, v_today;
  elsif v_cur_last = v_today then
    return query select v_cur_streak, v_cur_last;
  elsif v_cur_last = v_yesterday then
    update public.user_profiles
      set streak = v_cur_streak + 1, last_study_date = v_today, updated_at = now()
      where user_id = p_user_id;
    return query select v_cur_streak + 1, v_today;
  else
    update public.user_profiles
      set streak = 1, last_study_date = v_today, updated_at = now()
      where user_id = p_user_id;
    return query select 1, v_today;
  end if;
end;
$$;

grant execute on function public.touch_user_streak(uuid) to authenticated;

-- ---------------------------------------------------------------------------
-- 9. bump_score — atomic score increment
-- ---------------------------------------------------------------------------
create or replace function public.bump_score(p_user_id uuid, p_delta int)
returns int
language sql security definer set search_path = public as $$
  update public.user_profiles
    set total_score = greatest(total_score + p_delta, 0),
        updated_at = now()
    where user_id = p_user_id
    returning total_score;
$$;

grant execute on function public.bump_score(uuid, int) to authenticated;

-- ---------------------------------------------------------------------------
-- 10. Row Level Security
-- ---------------------------------------------------------------------------
alter table public.user_profiles        enable row level security;
alter table public.learning_progress    enable row level security;
alter table public.lesson_content_cache enable row level security;
alter table public.tutor_messages       enable row level security;
alter table public.voice_messages       enable row level security;
alter table public.kanji_gloss_cache    enable row level security;

-- user_profiles: leaderboard needs public read, but only self can write
drop policy if exists "profile read self or public" on public.user_profiles;
create policy "profile read self or public"
  on public.user_profiles for select using (true);

drop policy if exists "profile write self" on public.user_profiles;
create policy "profile write self"
  on public.user_profiles for insert with check (auth.uid() = user_id);

drop policy if exists "profile update self" on public.user_profiles;
create policy "profile update self"
  on public.user_profiles for update using (auth.uid() = user_id);

-- learning_progress: read/write/delete self
drop policy if exists "progress read self"   on public.learning_progress;
drop policy if exists "progress insert self" on public.learning_progress;
drop policy if exists "progress delete self" on public.learning_progress;
create policy "progress read self"
  on public.learning_progress for select using (auth.uid() = user_id);
create policy "progress insert self"
  on public.learning_progress for insert with check (auth.uid() = user_id);
create policy "progress delete self"
  on public.learning_progress for delete using (auth.uid() = user_id);

-- Per-row RLS via FOR ALL on the smaller tables
drop policy if exists "cache self"   on public.lesson_content_cache;
drop policy if exists "tutor read"   on public.tutor_messages;
drop policy if exists "tutor write"  on public.tutor_messages;
drop policy if exists "tutor delete" on public.tutor_messages;
drop policy if exists "voice read"   on public.voice_messages;
drop policy if exists "voice write"  on public.voice_messages;
drop policy if exists "voice delete" on public.voice_messages;
drop policy if exists "gloss self"   on public.kanji_gloss_cache;

create policy "cache self"
  on public.lesson_content_cache for all using (auth.uid() = user_id) with check (auth.uid() = user_id);

create policy "tutor read"
  on public.tutor_messages for select using (auth.uid() = user_id);
create policy "tutor write"
  on public.tutor_messages for insert with check (auth.uid() = user_id);
create policy "tutor delete"
  on public.tutor_messages for delete using (auth.uid() = user_id);

create policy "voice read"
  on public.voice_messages for select using (auth.uid() = user_id);
create policy "voice write"
  on public.voice_messages for insert with check (auth.uid() = user_id);
create policy "voice delete"
  on public.voice_messages for delete using (auth.uid() = user_id);

create policy "gloss self"
  on public.kanji_gloss_cache for all using (auth.uid() = user_id) with check (auth.uid() = user_id);
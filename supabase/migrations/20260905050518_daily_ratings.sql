create table if not exists public.daily_ratings (
  user_id uuid not null references auth.users(id) on delete cascade,
  rating_date date not null,
  score_hundredths smallint,
  reflection text not null default '',
  tags text[] not null default '{}',
  revision bigint not null default 1,
  created_at timestamptz not null default clock_timestamp(),
  updated_at timestamptz not null default clock_timestamp(),
  deleted_at timestamptz,
  primary key (user_id, rating_date),
  constraint daily_ratings_score_check check (
    (deleted_at is null and score_hundredths between 0 and 1000)
    or (deleted_at is not null and score_hundredths is null)
  ),
  constraint daily_ratings_reflection_length_check check (char_length(reflection) <= 1000),
  constraint daily_ratings_tags_count_check check (cardinality(tags) <= 8),
  constraint daily_ratings_revision_check check (revision > 0)
);

create index if not exists daily_ratings_user_date_idx
  on public.daily_ratings (user_id, rating_date desc);

alter table public.daily_ratings enable row level security;

revoke all on table public.daily_ratings from anon, authenticated;
grant select, insert, update on table public.daily_ratings to authenticated;

drop policy if exists "Users can read their daily ratings" on public.daily_ratings;
create policy "Users can read their daily ratings"
  on public.daily_ratings for select
  to authenticated
  using ((select auth.uid()) = user_id);

drop policy if exists "Users can create their daily ratings" on public.daily_ratings;
create policy "Users can create their daily ratings"
  on public.daily_ratings for insert
  to authenticated
  with check ((select auth.uid()) = user_id);

drop policy if exists "Users can update their daily ratings" on public.daily_ratings;
create policy "Users can update their daily ratings"
  on public.daily_ratings for update
  to authenticated
  using ((select auth.uid()) = user_id)
  with check ((select auth.uid()) = user_id);

create or replace function public.compare_and_swap_daily_rating(
  p_rating_date date,
  p_expected_revision bigint,
  p_score_hundredths smallint,
  p_reflection text,
  p_tags text[],
  p_deleted boolean default false
)
returns table (
  applied boolean,
  rating_date date,
  score_hundredths smallint,
  reflection text,
  tags text[],
  revision bigint,
  updated_at timestamptz,
  deleted_at timestamptz
)
language plpgsql
security invoker
set search_path = ''
as $$
declare
  v_user_id uuid := (select auth.uid());
  v_rating public.daily_ratings%rowtype;
begin
  if v_user_id is null then
    raise exception 'Authentication required' using errcode = '42501';
  end if;
  if p_expected_revision < 0 then
    raise exception 'Revision must be zero or greater' using errcode = '22023';
  end if;
  if not p_deleted and (p_score_hundredths is null or p_score_hundredths < 0 or p_score_hundredths > 1000) then
    raise exception 'Score must be between 0 and 1000 hundredths' using errcode = '22023';
  end if;
  if char_length(coalesce(p_reflection, '')) > 1000 then
    raise exception 'Reflection must be 1000 characters or fewer' using errcode = '22023';
  end if;
  if cardinality(coalesce(p_tags, '{}'::text[])) > 8 then
    raise exception 'A maximum of eight tags is allowed' using errcode = '22023';
  end if;

  if p_expected_revision = 0 then
    insert into public.daily_ratings as rating (
      user_id,
      rating_date,
      score_hundredths,
      reflection,
      tags,
      revision,
      updated_at,
      deleted_at
    ) values (
      v_user_id,
      p_rating_date,
      case when p_deleted then null else p_score_hundredths end,
      case when p_deleted then '' else coalesce(p_reflection, '') end,
      case when p_deleted then '{}'::text[] else coalesce(p_tags, '{}'::text[]) end,
      1,
      clock_timestamp(),
      case when p_deleted then clock_timestamp() else null end
    )
    on conflict (user_id, rating_date) do nothing
    returning rating.* into v_rating;
  else
    update public.daily_ratings as rating
    set score_hundredths = case when p_deleted then null else p_score_hundredths end,
        reflection = case when p_deleted then '' else coalesce(p_reflection, '') end,
        tags = case when p_deleted then '{}'::text[] else coalesce(p_tags, '{}'::text[]) end,
        revision = rating.revision + 1,
        updated_at = clock_timestamp(),
        deleted_at = case when p_deleted then clock_timestamp() else null end
    where rating.user_id = v_user_id
      and rating.rating_date = p_rating_date
      and rating.revision = p_expected_revision
    returning rating.* into v_rating;
  end if;

  if v_rating.user_id is not null then
    return query select true, v_rating.rating_date, v_rating.score_hundredths, v_rating.reflection,
      v_rating.tags, v_rating.revision, v_rating.updated_at, v_rating.deleted_at;
    return;
  end if;

  select rating.*
  into v_rating
  from public.daily_ratings as rating
  where rating.user_id = v_user_id
    and rating.rating_date = p_rating_date;

  if v_rating.user_id is not null then
    return query select false, v_rating.rating_date, v_rating.score_hundredths, v_rating.reflection,
      v_rating.tags, v_rating.revision, v_rating.updated_at, v_rating.deleted_at;
  else
    return query select false, p_rating_date, null::smallint, ''::text, '{}'::text[],
      0::bigint, clock_timestamp(), null::timestamptz;
  end if;
end;
$$;

revoke all on function public.compare_and_swap_daily_rating(date, bigint, smallint, text, text[], boolean) from public, anon;
grant execute on function public.compare_and_swap_daily_rating(date, bigint, smallint, text, text[], boolean) to authenticated;

comment on table public.daily_ratings is
  'Per-day subjective ratings stored separately from planner documents for backward-compatible sync.';
comment on function public.compare_and_swap_daily_rating(date, bigint, smallint, text, text[], boolean) is
  'Atomically creates, updates, or soft-deletes one authenticated user daily rating.';

do $$
begin
  if not exists (
    select 1 from pg_publication_tables
    where pubname = 'supabase_realtime'
      and schemaname = 'public'
      and tablename = 'daily_ratings'
  ) then
    alter publication supabase_realtime add table public.daily_ratings;
  end if;
end $$;

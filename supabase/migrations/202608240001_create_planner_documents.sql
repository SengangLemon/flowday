create table if not exists public.planner_documents (
  user_id uuid primary key references auth.users(id) on delete cascade,
  state jsonb not null,
  revision bigint not null default 1 check (revision > 0),
  updated_at timestamptz not null default timezone('utc', now())
);

alter table public.planner_documents enable row level security;

revoke all on table public.planner_documents from anon, authenticated;
grant select, insert, update, delete on table public.planner_documents to authenticated;

drop policy if exists "Users can read their planner" on public.planner_documents;
create policy "Users can read their planner"
  on public.planner_documents for select
  to authenticated
  using ((select auth.uid()) = user_id);

drop policy if exists "Users can create their planner" on public.planner_documents;
create policy "Users can create their planner"
  on public.planner_documents for insert
  to authenticated
  with check ((select auth.uid()) = user_id);

drop policy if exists "Users can update their planner" on public.planner_documents;
create policy "Users can update their planner"
  on public.planner_documents for update
  to authenticated
  using ((select auth.uid()) = user_id)
  with check ((select auth.uid()) = user_id);

drop policy if exists "Users can delete their planner" on public.planner_documents;
create policy "Users can delete their planner"
  on public.planner_documents for delete
  to authenticated
  using ((select auth.uid()) = user_id);

create index if not exists planner_documents_updated_at_idx
  on public.planner_documents (updated_at desc);

do $$
begin
  if not exists (
    select 1 from pg_publication_tables
    where pubname = 'supabase_realtime'
      and schemaname = 'public'
      and tablename = 'planner_documents'
  ) then
    alter publication supabase_realtime add table public.planner_documents;
  end if;
end $$;

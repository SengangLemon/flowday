create or replace function public.compare_and_swap_planner_document(
  p_expected_revision bigint,
  p_state jsonb
)
returns table (
  applied boolean,
  state jsonb,
  revision bigint,
  updated_at timestamptz
)
language plpgsql
security invoker
set search_path = ''
as $$
declare
  v_user_id uuid := (select auth.uid());
  v_document public.planner_documents%rowtype;
begin
  if v_user_id is null then
    raise exception 'Authentication required' using errcode = '42501';
  end if;
  if p_expected_revision < 0 then
    raise exception 'Revision must be zero or greater' using errcode = '22023';
  end if;

  if p_expected_revision = 0 then
    insert into public.planner_documents as document (user_id, state, revision, updated_at)
    values (v_user_id, p_state, 1, clock_timestamp())
    on conflict (user_id) do nothing
    returning document.* into v_document;
  else
    update public.planner_documents as document
    set state = p_state,
        revision = document.revision + 1,
        updated_at = clock_timestamp()
    where document.user_id = v_user_id
      and document.revision = p_expected_revision
    returning document.* into v_document;
  end if;

  if v_document.user_id is not null then
    return query select true, v_document.state, v_document.revision, v_document.updated_at;
    return;
  end if;

  select document.*
  into v_document
  from public.planner_documents as document
  where document.user_id = v_user_id;

  if v_document.user_id is not null then
    return query select false, v_document.state, v_document.revision, v_document.updated_at;
  else
    return query select false, null::jsonb, 0::bigint, clock_timestamp();
  end if;
end;
$$;

revoke all on function public.compare_and_swap_planner_document(bigint, jsonb) from public, anon;
grant execute on function public.compare_and_swap_planner_document(bigint, jsonb) to authenticated;

comment on function public.compare_and_swap_planner_document(bigint, jsonb) is
  'Atomically creates or updates the authenticated user planner document when the expected revision matches.';

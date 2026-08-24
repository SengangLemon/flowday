import { readFile } from 'node:fs/promises';
import { resolve } from 'node:path';
import postgres from 'postgres';

process.loadEnvFile(resolve('.env.local'));

const databaseUrl = process.env.POSTGRES_URL_NON_POOLING;
if (!databaseUrl) throw new Error('POSTGRES_URL_NON_POOLING is missing from .env.local');

const sql = postgres(databaseUrl, { max: 1, connect_timeout: 15 });
try {
  const migration = await readFile(resolve('supabase/migrations/202608240001_create_planner_documents.sql'), 'utf8');
  await sql.unsafe(migration);
  const [security] = await sql`
    select
      c.relrowsecurity as rls_enabled,
      (select count(*)::int from pg_policies where schemaname = 'public' and tablename = 'planner_documents') as policy_count,
      exists (
        select 1 from pg_publication_tables
        where pubname = 'supabase_realtime' and schemaname = 'public' and tablename = 'planner_documents'
      ) as realtime_enabled,
      has_table_privilege('authenticated', 'public.planner_documents', 'select,insert,update,delete') as authenticated_access
    from pg_class c
    join pg_namespace n on n.oid = c.relnamespace
    where n.nspname = 'public' and c.relname = 'planner_documents'
  `;
  if (!security?.rls_enabled || security.policy_count !== 4 || !security.realtime_enabled || !security.authenticated_access) {
    throw new Error('planner_documents security verification failed');
  }
  console.log('Applied and verified planner_documents migration (RLS: on, policies: 4, realtime: on).');
} finally {
  await sql.end();
}

import { readFile, readdir } from 'node:fs/promises';
import { resolve } from 'node:path';
import postgres from 'postgres';

process.loadEnvFile(resolve('.env.local'));

const databaseUrl = process.env.POSTGRES_URL_NON_POOLING;
if (!databaseUrl) throw new Error('POSTGRES_URL_NON_POOLING is missing from .env.local');

const sql = postgres(databaseUrl, { max: 1, connect_timeout: 15 });
try {
  const migrationDirectory = resolve('supabase/migrations');
  const migrationFiles = (await readdir(migrationDirectory)).filter((file) => file.endsWith('.sql')).sort();
  for (const file of migrationFiles) {
    const migration = await readFile(resolve(migrationDirectory, file), 'utf8');
    await sql.unsafe(migration);
  }
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
  const [ratingSecurity] = await sql`
    select
      c.relrowsecurity as rls_enabled,
      (select count(*)::int from pg_policies where schemaname = 'public' and tablename = 'daily_ratings') as policy_count,
      exists (
        select 1 from pg_publication_tables
        where pubname = 'supabase_realtime' and schemaname = 'public' and tablename = 'daily_ratings'
      ) as realtime_enabled,
      has_table_privilege('authenticated', 'public.daily_ratings', 'select,insert,update') as authenticated_access,
      not has_table_privilege('anon', 'public.daily_ratings', 'select') as anonymous_blocked
    from pg_class c
    join pg_namespace n on n.oid = c.relnamespace
    where n.nspname = 'public' and c.relname = 'daily_ratings'
  `;
  if (!ratingSecurity?.rls_enabled || ratingSecurity.policy_count !== 3 || !ratingSecurity.realtime_enabled || !ratingSecurity.authenticated_access || !ratingSecurity.anonymous_blocked) {
    throw new Error('daily_ratings security verification failed');
  }
  console.log(`Applied ${migrationFiles.length} migrations and verified planner and daily rating security.`);
} finally {
  await sql.end();
}

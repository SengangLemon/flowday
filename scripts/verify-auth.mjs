import { randomUUID } from 'node:crypto';
import { resolve } from 'node:path';
import { createClient } from '@supabase/supabase-js';

process.loadEnvFile(resolve('.env.local'));

const url = process.env.NEXT_PUBLIC_SUPABASE_URL;
const publishableKey = process.env.NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY;
const secretKey = process.env.SUPABASE_SECRET_KEY;
if (!url || !publishableKey || !secretKey) throw new Error('Supabase environment variables are incomplete');

const authOptions = { auth: { autoRefreshToken: false, persistSession: false, detectSessionInUrl: false } };
const admin = createClient(url, secretKey, authOptions);
const runId = randomUUID();
const password = `${randomUUID()}Aa1!`;
const createdUserIds = [];

function emptyState() {
  return {
    version: 7,
    tasks: [],
    goals: [],
    scheduleBlocks: [],
    theme: 'light',
    introducedViews: [],
    tombstones: { tasks: {}, goals: {}, scheduleBlocks: {} },
    metadata: { themeUpdatedAt: 0 },
  };
}

try {
  const users = [];
  for (const suffix of ['owner', 'stranger']) {
    const { data, error } = await admin.auth.admin.createUser({
      email: `flowday-${suffix}-${runId}@example.com`,
      password,
      email_confirm: true,
    });
    if (error || !data.user) throw error ?? new Error(`Could not create ${suffix} test user`);
    createdUserIds.push(data.user.id);
    users.push(data.user);
  }

  const owner = createClient(url, publishableKey, authOptions);
  const stranger = createClient(url, publishableKey, authOptions);
  const { error: ownerLoginError } = await owner.auth.signInWithPassword({ email: users[0].email, password });
  const { error: strangerLoginError } = await stranger.auth.signInWithPassword({ email: users[1].email, password });
  if (ownerLoginError || strangerLoginError) throw ownerLoginError ?? strangerLoginError;

  const firstState = emptyState();
  const { data: firstWrite, error: ownWriteError } = await owner
    .rpc('compare_and_swap_planner_document', { p_expected_revision: 0, p_state: firstState })
    .single();
  if (ownWriteError || !firstWrite?.applied || Number(firstWrite.revision) !== 1) {
    throw new Error(`Initial CAS write failed: ${ownWriteError?.message ?? 'unexpected result'}`);
  }

  const conflictingState = { ...emptyState(), theme: 'dark', metadata: { themeUpdatedAt: Date.now() } };
  const { data: staleWrite, error: staleWriteError } = await owner
    .rpc('compare_and_swap_planner_document', { p_expected_revision: 0, p_state: conflictingState })
    .single();
  if (staleWriteError || staleWrite?.applied || Number(staleWrite?.revision) !== 1 || staleWrite?.state?.theme !== 'light') {
    throw new Error(`Stale CAS was not rejected: ${staleWriteError?.message ?? 'unexpected result'}`);
  }

  const { data: secondWrite, error: secondWriteError } = await owner
    .rpc('compare_and_swap_planner_document', { p_expected_revision: 1, p_state: conflictingState })
    .single();
  if (secondWriteError || !secondWrite?.applied || Number(secondWrite.revision) !== 2 || secondWrite.state?.theme !== 'dark') {
    throw new Error(`Matching CAS update failed: ${secondWriteError?.message ?? 'unexpected result'}`);
  }

  const { data: ownRows, error: ownReadError } = await owner.from('planner_documents').select('user_id');
  if (ownReadError || ownRows?.length !== 1 || ownRows[0].user_id !== users[0].id) {
    throw new Error('Own-row read verification failed');
  }

  const { error: crossWriteError } = await owner.from('planner_documents').insert({
    user_id: users[1].id,
    state: emptyState(),
    revision: Date.now() + 1,
  });
  if (!crossWriteError) throw new Error('RLS allowed a cross-user write');

  const { data: crossRows, error: crossReadError } = await stranger
    .from('planner_documents')
    .select('user_id')
    .eq('user_id', users[0].id);
  if (crossReadError || crossRows?.length !== 0) throw new Error('RLS allowed a cross-user read');

  console.log('Verified Supabase Auth, planner RLS, and revision CAS conflict protection.');
} finally {
  for (const userId of createdUserIds) {
    await admin.auth.admin.deleteUser(userId);
  }
}

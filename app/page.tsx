import { PlannerApp } from './components/planner-app';
import { createClient } from './lib/supabase/server';
import { redirect } from 'next/navigation';

export default async function Home() {
  const supabase = await createClient();
  const { data } = await supabase.auth.getClaims();
  const userId = data?.claims?.sub;
  if (!userId) redirect('/login');

  return <PlannerApp userId={userId} userEmail={typeof data.claims.email === 'string' ? data.claims.email : ''} />;
}

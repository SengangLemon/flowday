import { redirect } from 'next/navigation';
import { LoginForm } from './login-form';
import { createClient } from '../lib/supabase/server';

export default async function LoginPage() {
  const supabase = await createClient();
  const { data } = await supabase.auth.getClaims();
  if (data?.claims?.sub) redirect('/');
  return <LoginForm />;
}

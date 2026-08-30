import { redirect } from 'next/navigation';
import { LoginForm } from './login-form';
import { createClient } from '../lib/supabase/server';

type LoginPageProps = {
  searchParams: Promise<{ error?: string; recovery?: string }>;
};

export default async function LoginPage({ searchParams }: LoginPageProps) {
  const query = await searchParams;
  const isRecovery = query.recovery === '1';
  const supabase = await createClient();
  const { data } = await supabase.auth.getClaims();
  if (data?.claims?.sub && !isRecovery) redirect('/');
  const initialError = query.error === 'callback'
    ? '인증 링크가 만료됐거나 이미 사용됐습니다. 새 링크를 요청해주세요.'
    : null;
  return <LoginForm initialMode={isRecovery ? 'reset' : 'login'} initialError={initialError} />;
}

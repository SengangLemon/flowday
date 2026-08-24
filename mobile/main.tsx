/* eslint-disable @next/next/no-img-element */
import { App } from '@capacitor/app';
import { Haptics, NotificationType } from '@capacitor/haptics';
import type { User } from '@supabase/supabase-js';
import { ArrowRight, CheckCircle2, Eye, EyeOff, LoaderCircle, LockKeyhole, Mail } from 'lucide-react';
import { FormEvent, lazy, Suspense, useEffect, useState } from 'react';
import { createRoot } from 'react-dom/client';
import '../app/globals.css';
import './mobile.css';
import { createClient } from './supabase-client';

const WEB_ORIGIN = 'https://flowday-livid.vercel.app';
const AUTH_CALLBACK = 'flowday://auth/callback';
const PlannerApp = lazy(() => import('../app/components/planner-app').then((module) => ({ default: module.PlannerApp })));

type Mode = 'login' | 'signup';

function MobileLogin() {
  const [mode, setMode] = useState<Mode>('login');
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [showPassword, setShowPassword] = useState(false);
  const [loading, setLoading] = useState(false);
  const [message, setMessage] = useState<{ tone: 'success' | 'error'; text: string } | null>(null);

  async function submit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (loading) return;
    setLoading(true);
    setMessage(null);
    const supabase = createClient();

    if (mode === 'login') {
      const { error } = await supabase.auth.signInWithPassword({ email: email.trim(), password });
      if (error) {
        setMessage({ tone: 'error', text: '이메일 또는 비밀번호를 확인해주세요.' });
        setLoading(false);
        return;
      }
      await Haptics.notification({ type: NotificationType.Success }).catch(() => undefined);
      return;
    }

    const { data, error } = await supabase.auth.signUp({
      email: email.trim(),
      password,
      options: { emailRedirectTo: AUTH_CALLBACK },
    });
    if (error) {
      setMessage({ tone: 'error', text: error.message.includes('Password') ? '비밀번호는 6자 이상 입력해주세요.' : '계정을 만들 수 없습니다. 이메일을 확인해주세요.' });
      setLoading(false);
      return;
    }
    if (!data.session) {
      setMessage({ tone: 'success', text: '확인 메일을 보냈습니다. 메일의 링크를 누른 뒤 Flowday로 돌아오세요.' });
      setLoading(false);
    }
  }

  return (
    <main className="auth-page native-auth-page">
      <section className="auth-panel" aria-labelledby="auth-title">
        <div className="auth-brand"><img src="/flowday-icon-192.png" width="52" height="52" alt="" /><div><strong>Flowday</strong><span>목표가 오늘이 되는 곳</span></div></div>
        <div className="auth-copy"><span className="overline">계정 동기화</span><h1 id="auth-title">{mode === 'login' ? '다시 만나 반가워요' : '나만의 Flowday 시작하기'}</h1><p>{mode === 'login' ? '로그인하면 어느 기기에서든 같은 계획을 이어갈 수 있어요.' : '계정을 만들면 계획과 완료 기록이 안전하게 동기화돼요.'}</p></div>
        <div className="auth-tabs" role="tablist" aria-label="계정 작업 선택"><button type="button" role="tab" aria-selected={mode === 'login'} className={mode === 'login' ? 'selected' : ''} onClick={() => { setMode('login'); setMessage(null); }}>로그인</button><button type="button" role="tab" aria-selected={mode === 'signup'} className={mode === 'signup' ? 'selected' : ''} onClick={() => { setMode('signup'); setMessage(null); }}>계정 만들기</button></div>
        <form className="auth-form" onSubmit={submit}>
          <label><span>이메일</span><div><Mail size={18} /><input type="email" inputMode="email" autoComplete="email" placeholder="name@example.com" value={email} onChange={(event) => setEmail(event.target.value)} required /></div></label>
          <label><span>비밀번호</span><div><LockKeyhole size={18} /><input type={showPassword ? 'text' : 'password'} autoComplete={mode === 'login' ? 'current-password' : 'new-password'} placeholder="6자 이상 입력" minLength={6} value={password} onChange={(event) => setPassword(event.target.value)} required /><button type="button" onClick={() => setShowPassword((current) => !current)} aria-label={showPassword ? '비밀번호 숨기기' : '비밀번호 보기'}>{showPassword ? <EyeOff size={18} /> : <Eye size={18} />}</button></div></label>
          {message ? <p className={`auth-message ${message.tone}`} role={message.tone === 'error' ? 'alert' : 'status'}>{message.tone === 'success' ? <CheckCircle2 size={17} /> : null}{message.text}</p> : null}
          <button className="auth-submit" type="submit" disabled={loading}>{loading ? <LoaderCircle className="spin" size={18} /> : null}<span>{mode === 'login' ? '로그인' : '계정 만들기'}</span>{!loading ? <ArrowRight size={18} /> : null}</button>
        </form>
        <p className="auth-trust"><LockKeyhole size={14} />데이터는 계정별로 분리되며 다른 사용자는 볼 수 없습니다.</p>
        <nav className="auth-legal" aria-label="정책과 고객지원"><a href={`${WEB_ORIGIN}/privacy`} target="_blank" rel="noreferrer">개인정보처리방침</a><a href={`${WEB_ORIGIN}/terms`} target="_blank" rel="noreferrer">이용약관</a><a href={`${WEB_ORIGIN}/support`} target="_blank" rel="noreferrer">고객지원</a></nav>
      </section>
    </main>
  );
}

function MobileRoot() {
  const [user, setUser] = useState<User | null>(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    const supabase = createClient();
    let active = true;
    void supabase.auth.getUser().then(({ data }) => {
      if (active) {
        setUser(data.user);
        setLoading(false);
      }
    });
    const { data: auth } = supabase.auth.onAuthStateChange((_event, session) => {
      setUser(session?.user ?? null);
      setLoading(false);
    });
    let removeDeepLink = () => undefined;
    void App.addListener('appUrlOpen', async ({ url }) => {
      if (!url.startsWith(AUTH_CALLBACK)) return;
      const code = new URL(url).searchParams.get('code');
      if (!code) return;
      const { error } = await supabase.auth.exchangeCodeForSession(code);
      if (error) setLoading(false);
    }).then((handle) => { removeDeepLink = () => { void handle.remove(); }; });
    return () => {
      active = false;
      auth.subscription.unsubscribe();
      removeDeepLink();
    };
  }, []);

  if (loading) return <div className="app-loading"><span><img src="/flowday-icon-192.png" width="48" height="48" alt="" /></span><strong>Flowday</strong><i /></div>;
  if (!user) return <MobileLogin />;
  return (
    <Suspense fallback={<div className="app-loading"><span><img src="/flowday-icon-192.png" width="48" height="48" alt="" /></span><strong>Flowday</strong><i /></div>}>
      <PlannerApp userId={user.id} userEmail={user.email ?? ''} accountApiUrl={`${WEB_ORIGIN}/api/account`} legalBaseUrl={WEB_ORIGIN} onAuthExit={() => setUser(null)} />
    </Suspense>
  );
}

createRoot(document.getElementById('root')!).render(<MobileRoot />);

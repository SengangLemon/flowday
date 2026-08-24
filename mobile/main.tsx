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
const AUTH_INTENT_KEY = 'flowday-native-auth-intent';
const PlannerApp = lazy(() => import('../app/components/planner-app').then((module) => ({ default: module.PlannerApp })));

type Mode = 'login' | 'signup' | 'forgot';
type AuthMessage = { tone: 'success' | 'error'; text: string };

function getAuthErrorMessage(error: { code?: string; message: string }, action: 'login' | 'signup' | 'reset' | 'update') {
  const value = `${error.code ?? ''} ${error.message}`.toLowerCase();
  if (value.includes('rate limit') || value.includes('over_email_send_rate_limit')) {
    return '요청이 너무 많습니다. 잠시 후 다시 시도해주세요.';
  }
  if (value.includes('email not confirmed')) {
    return '이메일 확인이 아직 완료되지 않았습니다. 받은편지함의 확인 링크를 눌러주세요.';
  }
  if (value.includes('password')) {
    return action === 'login' ? '비밀번호가 맞지 않습니다. 다시 입력하거나 재설정해주세요.' : '비밀번호는 6자 이상 입력해주세요.';
  }
  if (action === 'login') return '이메일 또는 비밀번호가 맞지 않습니다.';
  if (action === 'reset') return '재설정 메일을 보내지 못했습니다. 이메일을 확인하고 다시 시도해주세요.';
  if (action === 'update') return '새 비밀번호를 저장하지 못했습니다. 다시 시도해주세요.';
  return '계정을 만들지 못했습니다. 입력 내용을 확인해주세요.';
}

function MobileLogin({ initialMessage = null }: { initialMessage?: AuthMessage | null }) {
  const [mode, setMode] = useState<Mode>('login');
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [showPassword, setShowPassword] = useState(false);
  const [loading, setLoading] = useState(false);
  const [message, setMessage] = useState<AuthMessage | null>(initialMessage);

  async function submit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (loading) return;
    setLoading(true);
    setMessage(null);
    const supabase = createClient();

    if (mode === 'forgot') {
      window.localStorage.setItem(AUTH_INTENT_KEY, 'recovery');
      const { error } = await supabase.auth.resetPasswordForEmail(email.trim(), { redirectTo: AUTH_CALLBACK });
      if (error) {
        window.localStorage.removeItem(AUTH_INTENT_KEY);
        setMessage({ tone: 'error', text: getAuthErrorMessage(error, 'reset') });
        setLoading(false);
        return;
      }
      setMessage({ tone: 'success', text: '재설정 메일을 보냈습니다. 같은 기기에서 메일의 링크를 눌러 새 비밀번호를 정해주세요.' });
      setLoading(false);
      return;
    }

    if (mode === 'login') {
      const { error } = await supabase.auth.signInWithPassword({ email: email.trim(), password });
      if (error) {
        setMessage({ tone: 'error', text: getAuthErrorMessage(error, 'login') });
        setLoading(false);
        return;
      }
      window.localStorage.removeItem(AUTH_INTENT_KEY);
      await Haptics.notification({ type: NotificationType.Success }).catch(() => undefined);
      return;
    }

    const { data, error } = await supabase.auth.signUp({
      email: email.trim(),
      password,
      options: { emailRedirectTo: AUTH_CALLBACK },
    });
    if (error) {
      setMessage({ tone: 'error', text: getAuthErrorMessage(error, 'signup') });
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
        <div className="auth-copy"><span className="overline">계정 동기화</span><h1 id="auth-title">{mode === 'login' ? '다시 만나 반가워요' : mode === 'signup' ? '나만의 Flowday 시작하기' : '비밀번호 다시 만들기'}</h1><p>{mode === 'login' ? '로그인하면 어느 기기에서든 같은 계획을 이어갈 수 있어요.' : mode === 'signup' ? '계정을 만들면 계획과 완료 기록이 안전하게 동기화돼요.' : '가입한 이메일로 안전한 재설정 링크를 보내드릴게요.'}</p></div>
        {mode !== 'forgot' ? <div className="auth-tabs" role="tablist" aria-label="계정 작업 선택"><button type="button" role="tab" aria-selected={mode === 'login'} className={mode === 'login' ? 'selected' : ''} onClick={() => { setMode('login'); setMessage(null); }}>로그인</button><button type="button" role="tab" aria-selected={mode === 'signup'} className={mode === 'signup' ? 'selected' : ''} onClick={() => { setMode('signup'); setMessage(null); }}>계정 만들기</button></div> : null}
        <form className="auth-form" onSubmit={submit}>
          <label><span>이메일</span><div><Mail size={18} /><input type="email" inputMode="email" autoComplete="email" placeholder="name@example.com" value={email} onChange={(event) => setEmail(event.target.value)} required /></div></label>
          {mode !== 'forgot' ? <label><span>비밀번호</span><div><LockKeyhole size={18} /><input type={showPassword ? 'text' : 'password'} autoComplete={mode === 'login' ? 'current-password' : 'new-password'} placeholder="6자 이상 입력" minLength={6} value={password} onChange={(event) => setPassword(event.target.value)} required /><button type="button" onClick={() => setShowPassword((current) => !current)} aria-label={showPassword ? '비밀번호 숨기기' : '비밀번호 보기'}>{showPassword ? <EyeOff size={18} /> : <Eye size={18} />}</button></div></label> : null}
          {mode === 'login' ? <button className="native-auth-text-action" type="button" onClick={() => { setMode('forgot'); setPassword(''); setMessage(null); }}>비밀번호를 잊으셨나요?</button> : null}
          {message ? <p className={`auth-message ${message.tone}`} role={message.tone === 'error' ? 'alert' : 'status'}>{message.tone === 'success' ? <CheckCircle2 size={17} /> : null}{message.text}</p> : null}
          <button className="auth-submit" type="submit" disabled={loading}>{loading ? <LoaderCircle className="spin" size={18} /> : null}<span>{mode === 'login' ? '로그인' : mode === 'signup' ? '계정 만들기' : '재설정 메일 받기'}</span>{!loading ? <ArrowRight size={18} /> : null}</button>
          {mode === 'forgot' ? <button className="native-auth-back" type="button" onClick={() => { setMode('login'); setMessage(null); }}>로그인으로 돌아가기</button> : null}
        </form>
        <p className="auth-trust"><LockKeyhole size={14} />데이터는 계정별로 분리되며 다른 사용자는 볼 수 없습니다.</p>
        <nav className="auth-legal" aria-label="정책과 고객지원"><a href={`${WEB_ORIGIN}/privacy`} target="_blank" rel="noreferrer">개인정보처리방침</a><a href={`${WEB_ORIGIN}/terms`} target="_blank" rel="noreferrer">이용약관</a><a href={`${WEB_ORIGIN}/support`} target="_blank" rel="noreferrer">고객지원</a></nav>
      </section>
    </main>
  );
}

function MobilePasswordReset({ onComplete }: { onComplete: () => void }) {
  const [password, setPassword] = useState('');
  const [confirmation, setConfirmation] = useState('');
  const [showPassword, setShowPassword] = useState(false);
  const [loading, setLoading] = useState(false);
  const [message, setMessage] = useState<AuthMessage | null>(null);

  async function submit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (loading) return;
    if (password !== confirmation) {
      setMessage({ tone: 'error', text: '두 비밀번호가 서로 다릅니다.' });
      return;
    }
    setLoading(true);
    setMessage(null);
    const { error } = await createClient().auth.updateUser({ password });
    if (error) {
      setMessage({ tone: 'error', text: getAuthErrorMessage(error, 'update') });
      setLoading(false);
      return;
    }
    window.localStorage.removeItem(AUTH_INTENT_KEY);
    await Haptics.notification({ type: NotificationType.Success }).catch(() => undefined);
    onComplete();
  }

  return (
    <main className="auth-page native-auth-page">
      <section className="auth-panel" aria-labelledby="reset-title">
        <div className="auth-brand"><img src="/flowday-icon-192.png" width="52" height="52" alt="" /><div><strong>Flowday</strong><span>목표가 오늘이 되는 곳</span></div></div>
        <div className="auth-copy"><span className="overline">계정 복구</span><h1 id="reset-title">새 비밀번호 정하기</h1><p>앞으로 로그인할 때 사용할 비밀번호를 입력해주세요.</p></div>
        <form className="auth-form" onSubmit={submit}>
          <label><span>새 비밀번호</span><div><LockKeyhole size={18} /><input type={showPassword ? 'text' : 'password'} autoComplete="new-password" placeholder="6자 이상 입력" minLength={6} value={password} onChange={(event) => setPassword(event.target.value)} required /><button type="button" onClick={() => setShowPassword((current) => !current)} aria-label={showPassword ? '비밀번호 숨기기' : '비밀번호 보기'}>{showPassword ? <EyeOff size={18} /> : <Eye size={18} />}</button></div></label>
          <label><span>새 비밀번호 확인</span><div><LockKeyhole size={18} /><input type={showPassword ? 'text' : 'password'} autoComplete="new-password" placeholder="한 번 더 입력" minLength={6} value={confirmation} onChange={(event) => setConfirmation(event.target.value)} required /></div></label>
          {message ? <p className={`auth-message ${message.tone}`} role="alert">{message.text}</p> : null}
          <button className="auth-submit" type="submit" disabled={loading}>{loading ? <LoaderCircle className="spin" size={18} /> : null}<span>비밀번호 저장</span>{!loading ? <ArrowRight size={18} /> : null}</button>
        </form>
        <p className="auth-trust"><LockKeyhole size={14} />재설정 링크로 확인된 계정에만 적용됩니다.</p>
      </section>
    </main>
  );
}

function MobileRoot() {
  const [user, setUser] = useState<User | null>(null);
  const [loading, setLoading] = useState(true);
  const [passwordRecovery, setPasswordRecovery] = useState(false);
  const [authMessage, setAuthMessage] = useState<AuthMessage | null>(null);

  useEffect(() => {
    const supabase = createClient();
    let active = true;
    let handledUrl = '';

    async function handleAuthUrl(url: string) {
      if (!url.startsWith(AUTH_CALLBACK) || handledUrl === url) return;
      handledUrl = url;
      setLoading(true);
      const callback = new URL(url);
      const callbackError = callback.searchParams.get('error_description') ?? new URLSearchParams(callback.hash.slice(1)).get('error_description');
      if (callbackError) {
        setAuthMessage({ tone: 'error', text: '인증 링크가 만료되었거나 이미 사용되었습니다. 다시 요청해주세요.' });
        setLoading(false);
        return;
      }
      const code = callback.searchParams.get('code');
      if (!code) {
        setAuthMessage({ tone: 'error', text: '인증 정보를 확인하지 못했습니다. 링크를 다시 열어주세요.' });
        setLoading(false);
        return;
      }
      const recoveryRequested = window.localStorage.getItem(AUTH_INTENT_KEY) === 'recovery';
      const { error } = await supabase.auth.exchangeCodeForSession(code);
      if (error) {
        setAuthMessage({ tone: 'error', text: '인증 링크를 처리하지 못했습니다. 재설정 메일을 다시 요청해주세요.' });
        setLoading(false);
        return;
      }
      if (recoveryRequested) setPasswordRecovery(true);
      setLoading(false);
    }

    void supabase.auth.getUser().then(({ data }) => {
      if (active) {
        setUser(data.user);
        setLoading(false);
      }
    });
    const { data: auth } = supabase.auth.onAuthStateChange((event, session) => {
      setUser(session?.user ?? null);
      if (event === 'PASSWORD_RECOVERY') setPasswordRecovery(true);
      setLoading(false);
    });
    let removeDeepLink = () => undefined;
    void App.addListener('appUrlOpen', ({ url }) => { void handleAuthUrl(url); }).then((handle) => {
      removeDeepLink = () => { void handle.remove(); };
    });
    void App.getLaunchUrl().then((launch) => {
      if (launch?.url) void handleAuthUrl(launch.url);
    });
    return () => {
      active = false;
      auth.subscription.unsubscribe();
      removeDeepLink();
    };
  }, []);

  if (loading) return <div className="app-loading"><span><img src="/flowday-icon-192.png" width="48" height="48" alt="" /></span><strong>Flowday</strong><i /></div>;
  if (passwordRecovery) return <MobilePasswordReset onComplete={() => setPasswordRecovery(false)} />;
  if (!user) return <MobileLogin initialMessage={authMessage} />;
  return (
    <Suspense fallback={<div className="app-loading"><span><img src="/flowday-icon-192.png" width="48" height="48" alt="" /></span><strong>Flowday</strong><i /></div>}>
      <PlannerApp userId={user.id} userEmail={user.email ?? ''} accountApiUrl={`${WEB_ORIGIN}/api/account`} legalBaseUrl={WEB_ORIGIN} onAuthExit={() => setUser(null)} />
    </Suspense>
  );
}

createRoot(document.getElementById('root')!).render(<MobileRoot />);

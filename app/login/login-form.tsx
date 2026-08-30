'use client';

import Image from 'next/image';
import Link from 'next/link';
import { ArrowLeft, ArrowRight, CheckCircle2, Eye, EyeOff, LoaderCircle, LockKeyhole, Mail } from 'lucide-react';
import { FormEvent, useEffect, useRef, useState } from 'react';
import { installNativeUrlHandler, isNativeApp } from '../lib/native';
import { createClient } from '../lib/supabase/client';

type Mode = 'login' | 'signup' | 'forgot' | 'reset';
const NATIVE_AUTH_CALLBACK = 'flowday://auth/callback';

type LoginFormProps = {
  initialMode?: 'login' | 'reset';
  initialError?: string | null;
};

const MODE_COPY: Record<Mode, { title: string; description: string; submit: string }> = {
  login: { title: '다시 만나 반가워요', description: '로그인하면 어느 기기에서든 같은 계획을 이어갈 수 있어요.', submit: '로그인' },
  signup: { title: '나만의 Flowday 시작하기', description: '계정을 만들면 계획과 완료 기록이 안전하게 동기화돼요.', submit: '계정 만들기' },
  forgot: { title: '비밀번호를 다시 설정해요', description: '가입한 이메일로 안전한 재설정 링크를 보내드릴게요.', submit: '재설정 메일 보내기' },
  reset: { title: '새 비밀번호 정하기', description: '앞으로 사용할 새 비밀번호를 입력해주세요.', submit: '비밀번호 변경하기' },
};

export function LoginForm({ initialMode = 'login', initialError = null }: LoginFormProps) {
  const [mode, setMode] = useState<Mode>(initialMode);
  const modeRef = useRef<Mode>(initialMode);
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [passwordConfirm, setPasswordConfirm] = useState('');
  const [showPassword, setShowPassword] = useState(false);
  const [loading, setLoading] = useState(false);
  const [message, setMessage] = useState<{ tone: 'success' | 'error'; text: string } | null>(
    initialError ? { tone: 'error', text: initialError } : null,
  );

  useEffect(() => {
    modeRef.current = mode;
  }, [mode]);

  useEffect(() => {
    let cancelled = false;
    let cleanup: (() => void) | undefined;
    let handledUrl: string | undefined;

    void installNativeUrlHandler(async (url) => {
      if (cancelled || !url.startsWith(NATIVE_AUTH_CALLBACK) || handledUrl === url) return;
      handledUrl = url;
      setLoading(true);
      setMessage(null);

      const callback = new URL(url);
      const hash = new URLSearchParams(callback.hash.slice(1));
      const callbackError = callback.searchParams.get('error_description') ?? hash.get('error_description');
      const code = callback.searchParams.get('code');

      if (callbackError || !code) {
        setMessage({ tone: 'error', text: callbackError ? '확인 링크가 만료됐습니다. 확인 메일을 다시 요청해주세요.' : '확인 링크를 처리할 수 없습니다.' });
        setLoading(false);
        return;
      }

      const supabase = createClient();
      const { error } = await supabase.auth.exchangeCodeForSession(code);
      if (cancelled) return;
      if (error) {
        setMessage({ tone: 'error', text: '확인 링크가 만료됐습니다. 확인 메일을 다시 요청해주세요.' });
        setLoading(false);
        return;
      }

      const callbackType = callback.searchParams.get('type') ?? hash.get('type');
      if (callbackType === 'recovery' || modeRef.current === 'forgot') {
        modeRef.current = 'reset';
        setMode('reset');
        setLoading(false);
        return;
      }
      window.location.assign(new URL('/', window.location.origin));
    }).then((dispose) => {
      if (cancelled) dispose();
      else cleanup = dispose;
    });

    return () => {
      cancelled = true;
      cleanup?.();
    };
  }, []);

  async function submit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (loading) return;
    setLoading(true);
    setMessage(null);

    const supabase = createClient();
    if (mode === 'forgot') {
      const redirectTo = isNativeApp()
        ? NATIVE_AUTH_CALLBACK
        : (() => {
          const callback = new URL('/auth/callback', window.location.origin);
          callback.searchParams.set('next', '/login?recovery=1');
          return callback.toString();
        })();
      const { error } = await supabase.auth.resetPasswordForEmail(email.trim(), { redirectTo });
      setMessage(error
        ? { tone: 'error', text: '재설정 메일을 보내지 못했습니다. 잠시 후 다시 시도해주세요.' }
        : { tone: 'success', text: '재설정 메일을 보냈습니다. 메일의 링크를 열어주세요.' });
      setLoading(false);
      return;
    }

    if (mode === 'reset') {
      if (password !== passwordConfirm) {
        setMessage({ tone: 'error', text: '두 비밀번호가 서로 다릅니다.' });
        setLoading(false);
        return;
      }
      const { error } = await supabase.auth.updateUser({ password });
      if (error) {
        setMessage({ tone: 'error', text: '재설정 링크가 만료됐습니다. 새 링크를 다시 요청해주세요.' });
        setLoading(false);
        return;
      }
      setMessage({ tone: 'success', text: '비밀번호가 변경됐습니다. Flowday로 이동합니다.' });
      window.setTimeout(() => window.location.assign(new URL('/', window.location.origin)), 500);
      return;
    }

    if (mode === 'login') {
      const { error } = await supabase.auth.signInWithPassword({ email: email.trim(), password });
      if (error) {
        setMessage({ tone: 'error', text: '이메일 또는 비밀번호를 확인해주세요.' });
        setLoading(false);
        return;
      }
      window.location.assign(new URL('/', window.location.origin));
      return;
    }

    const { data, error } = await supabase.auth.signUp({
      email: email.trim(),
      password,
      options: { emailRedirectTo: isNativeApp() ? NATIVE_AUTH_CALLBACK : `${window.location.origin}/auth/callback` },
    });
    if (error) {
      setMessage({ tone: 'error', text: error.message.includes('Password') ? '비밀번호는 6자 이상 입력해주세요.' : '계정을 만들 수 없습니다. 이메일을 확인해주세요.' });
      setLoading(false);
      return;
    }
    if (data.session) {
      window.location.assign(new URL('/', window.location.origin));
      return;
    }
    setMessage({ tone: 'success', text: '확인 메일을 보냈습니다. 메일의 링크를 누르면 가입이 완료됩니다.' });
    setLoading(false);
  }

  function changeMode(next: Mode) {
    modeRef.current = next;
    setMode(next);
    setPassword('');
    setPasswordConfirm('');
    setMessage(null);
  }

  const copy = MODE_COPY[mode];
  const showEmail = mode !== 'reset';
  const showPasswordField = mode !== 'forgot';

  return (
    <main className="auth-page">
      <section className="auth-panel" aria-labelledby="auth-title">
        <div className="auth-brand">
          <Image src="/flowday-icon-192.png" width={52} height={52} alt="" priority />
          <div><strong>Flowday</strong><span>목표가 오늘이 되는 곳</span></div>
        </div>

        <div className="auth-copy">
          <span className="overline">계정 동기화</span>
          <h1 id="auth-title">{copy.title}</h1>
          <p>{copy.description}</p>
        </div>

        {mode === 'login' || mode === 'signup' ? (
          <div className="auth-tabs" role="tablist" aria-label="계정 작업 선택">
            <button type="button" role="tab" aria-selected={mode === 'login'} className={mode === 'login' ? 'selected' : ''} onClick={() => changeMode('login')}>로그인</button>
            <button type="button" role="tab" aria-selected={mode === 'signup'} className={mode === 'signup' ? 'selected' : ''} onClick={() => changeMode('signup')}>계정 만들기</button>
          </div>
        ) : (
          <button className="auth-back" type="button" onClick={() => changeMode('login')}><ArrowLeft size={16} />로그인으로 돌아가기</button>
        )}

        <form className="auth-form" onSubmit={submit}>
          {showEmail ? <label><span>이메일</span><div><Mail size={18} /><input type="email" inputMode="email" autoComplete="email" placeholder="name@example.com" value={email} onChange={(event) => setEmail(event.target.value)} required /></div></label> : null}
          {showPasswordField ? <label><span>{mode === 'reset' ? '새 비밀번호' : '비밀번호'}</span><div><LockKeyhole size={18} /><input type={showPassword ? 'text' : 'password'} autoComplete={mode === 'login' ? 'current-password' : 'new-password'} placeholder="6자 이상 입력" minLength={6} value={password} onChange={(event) => setPassword(event.target.value)} required /><button type="button" onClick={() => setShowPassword((current) => !current)} aria-label={showPassword ? '비밀번호 숨기기' : '비밀번호 보기'}>{showPassword ? <EyeOff size={18} /> : <Eye size={18} />}</button></div></label> : null}
          {mode === 'reset' ? <label><span>새 비밀번호 확인</span><div><LockKeyhole size={18} /><input type={showPassword ? 'text' : 'password'} autoComplete="new-password" placeholder="한 번 더 입력" minLength={6} value={passwordConfirm} onChange={(event) => setPasswordConfirm(event.target.value)} required /><span aria-hidden="true" /></div></label> : null}
          {mode === 'login' ? <button className="auth-forgot" type="button" onClick={() => changeMode('forgot')}>비밀번호를 잊으셨나요?</button> : null}
          {message ? <p className={`auth-message ${message.tone}`} role={message.tone === 'error' ? 'alert' : 'status'}>{message.tone === 'success' ? <CheckCircle2 size={17} /> : null}{message.text}</p> : null}
          <button className="auth-submit" type="submit" disabled={loading}>{loading ? <LoaderCircle className="spin" size={18} /> : null}<span>{copy.submit}</span>{!loading ? <ArrowRight size={18} /> : null}</button>
        </form>

        <p className="auth-trust"><LockKeyhole size={14} />데이터는 계정별로 분리되며 다른 사용자는 볼 수 없습니다.</p>
        <nav className="auth-legal" aria-label="정책과 고객지원">
          <Link href="/privacy">개인정보처리방침</Link>
          <Link href="/terms">이용약관</Link>
          <Link href="/support">고객지원</Link>
        </nav>
      </section>
    </main>
  );
}

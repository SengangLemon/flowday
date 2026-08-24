'use client';

import Image from 'next/image';
import { ArrowRight, CheckCircle2, Eye, EyeOff, LoaderCircle, LockKeyhole, Mail } from 'lucide-react';
import { FormEvent, useState } from 'react';
import { useRouter } from 'next/navigation';
import { createClient } from '../lib/supabase/client';

type Mode = 'login' | 'signup';

export function LoginForm() {
  const router = useRouter();
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
      router.replace('/');
      router.refresh();
      return;
    }

    const { data, error } = await supabase.auth.signUp({
      email: email.trim(),
      password,
      options: { emailRedirectTo: `${window.location.origin}/auth/callback` },
    });
    if (error) {
      setMessage({ tone: 'error', text: error.message.includes('Password') ? '비밀번호는 6자 이상 입력해주세요.' : '계정을 만들 수 없습니다. 이메일을 확인해주세요.' });
      setLoading(false);
      return;
    }

    if (data.session) {
      router.replace('/');
      router.refresh();
      return;
    }

    setMessage({ tone: 'success', text: '확인 메일을 보냈습니다. 메일의 링크를 누르면 가입이 완료됩니다.' });
    setLoading(false);
  }

  function changeMode(next: Mode) {
    setMode(next);
    setMessage(null);
  }

  return (
    <main className="auth-page">
      <section className="auth-panel" aria-labelledby="auth-title">
        <div className="auth-brand">
          <Image src="/flowday-icon-192.png" width={52} height={52} alt="" priority />
          <div><strong>Flowday</strong><span>목표가 오늘이 되는 곳</span></div>
        </div>

        <div className="auth-copy">
          <span className="overline">계정 동기화</span>
          <h1 id="auth-title">{mode === 'login' ? '다시 만나 반가워요' : '나만의 Flowday 시작하기'}</h1>
          <p>{mode === 'login' ? '로그인하면 어느 기기에서든 같은 계획을 이어갈 수 있어요.' : '계정을 만들면 계획과 완료 기록이 안전하게 동기화돼요.'}</p>
        </div>

        <div className="auth-tabs" role="tablist" aria-label="계정 작업 선택">
          <button type="button" role="tab" aria-selected={mode === 'login'} className={mode === 'login' ? 'selected' : ''} onClick={() => changeMode('login')}>로그인</button>
          <button type="button" role="tab" aria-selected={mode === 'signup'} className={mode === 'signup' ? 'selected' : ''} onClick={() => changeMode('signup')}>계정 만들기</button>
        </div>

        <form className="auth-form" onSubmit={submit}>
          <label><span>이메일</span><div><Mail size={18} /><input type="email" inputMode="email" autoComplete="email" placeholder="name@example.com" value={email} onChange={(event) => setEmail(event.target.value)} required /></div></label>
          <label><span>비밀번호</span><div><LockKeyhole size={18} /><input type={showPassword ? 'text' : 'password'} autoComplete={mode === 'login' ? 'current-password' : 'new-password'} placeholder="6자 이상 입력" minLength={6} value={password} onChange={(event) => setPassword(event.target.value)} required /><button type="button" onClick={() => setShowPassword((current) => !current)} aria-label={showPassword ? '비밀번호 숨기기' : '비밀번호 보기'}>{showPassword ? <EyeOff size={18} /> : <Eye size={18} />}</button></div></label>
          {message ? <p className={`auth-message ${message.tone}`} role={message.tone === 'error' ? 'alert' : 'status'}>{message.tone === 'success' ? <CheckCircle2 size={17} /> : null}{message.text}</p> : null}
          <button className="auth-submit" type="submit" disabled={loading}>{loading ? <LoaderCircle className="spin" size={18} /> : null}<span>{mode === 'login' ? '로그인' : '계정 만들기'}</span>{!loading ? <ArrowRight size={18} /> : null}</button>
        </form>

        <p className="auth-trust"><LockKeyhole size={14} />데이터는 계정별로 분리되며 다른 사용자는 볼 수 없습니다.</p>
      </section>
    </main>
  );
}

'use client';

import {
  Check,
  Cloud,
  CloudOff,
  DatabaseBackup,
  Download,
  FileUp,
  LoaderCircle,
  LogOut,
  MonitorSmartphone,
  Moon,
  RotateCcw,
  ShieldCheck,
  Sun,
  Trash2,
  UserRound,
  X,
} from 'lucide-react';
import { useEffect, useRef, useState } from 'react';
import type { ChangeEvent, KeyboardEvent as ReactKeyboardEvent } from 'react';
import type { Theme } from '../lib/planner';
import type { PlannerSyncStatus } from '../hooks/use-planner';

type OperationResult = { ok: boolean; message: string };

type SettingsSheetProps = {
  userEmail: string;
  theme: Theme;
  counts: { tasks: number; goals: number; blocks: number };
  lastSavedAt: number | null;
  saveError: boolean;
  syncStatus: PlannerSyncStatus;
  onThemeChange: (theme: Theme) => void;
  onExport: () => string;
  onImport: (raw: string) => OperationResult;
  onRestore: () => OperationResult;
  onReset: () => void;
  onSignOut: () => Promise<void>;
  onClose: () => void;
};

const THEMES: { id: Theme; label: string; description: string; icon: typeof Sun }[] = [
  { id: 'light', label: '밝게', description: '크림·아이보리', icon: Sun },
  { id: 'dim', label: '중간', description: '눈부심을 줄인 톤', icon: Cloud },
  { id: 'dark', label: '어둡게', description: '야간 집중', icon: Moon },
];

export function SettingsSheet({ userEmail, theme, counts, lastSavedAt, saveError, syncStatus, onThemeChange, onExport, onImport, onRestore, onReset, onSignOut, onClose }: SettingsSheetProps) {
  const dialogRef = useRef<HTMLElement>(null);
  const fileInputRef = useRef<HTMLInputElement>(null);
  const [pendingImport, setPendingImport] = useState<{ name: string; raw: string } | null>(null);
  const [message, setMessage] = useState<{ tone: 'success' | 'error'; text: string } | null>(null);
  const [resetConfirm, setResetConfirm] = useState(false);
  const [canRestore, setCanRestore] = useState(false);
  const [signingOut, setSigningOut] = useState(false);
  const savedTime = lastSavedAt ? new Intl.DateTimeFormat('ko-KR', { hour: 'numeric', minute: '2-digit' }).format(lastSavedAt) : null;
  const savedLabel = {
    loading: '클라우드 연결 중',
    saving: '변경사항 저장 중',
    synced: savedTime ? `${savedTime} 모든 기기에 저장됨` : '모든 기기와 동기화됨',
    offline: '오프라인 · 이 기기에 안전하게 보관 중',
    error: '클라우드 연결을 확인해주세요',
  }[syncStatus];

  useEffect(() => {
    const previousFocus = document.activeElement instanceof HTMLElement ? document.activeElement : null;
    const frame = window.requestAnimationFrame(() => dialogRef.current?.querySelector<HTMLElement>('button')?.focus());
    return () => {
      window.cancelAnimationFrame(frame);
      previousFocus?.focus();
    };
  }, []);

  function keepFocusInside(event: ReactKeyboardEvent<HTMLElement>) {
    if (event.key !== 'Tab') return;
    const focusable = Array.from(dialogRef.current?.querySelectorAll<HTMLElement>('a[href], button:not([disabled]), input:not([disabled]):not([type="hidden"]), select:not([disabled]), textarea:not([disabled]), [tabindex]:not([tabindex="-1"])') ?? []);
    if (!focusable.length) return;
    const first = focusable[0];
    const last = focusable[focusable.length - 1];
    if (event.shiftKey && document.activeElement === first) {
      event.preventDefault();
      last.focus();
    } else if (!event.shiftKey && document.activeElement === last) {
      event.preventDefault();
      first.focus();
    }
  }

  function handleExport() {
    const blob = new Blob([onExport()], { type: 'application/json' });
    const url = URL.createObjectURL(blob);
    const anchor = document.createElement('a');
    anchor.href = url;
    anchor.download = `flowday-backup-${new Date().toISOString().slice(0, 10)}.json`;
    document.body.append(anchor);
    anchor.click();
    anchor.remove();
    window.setTimeout(() => URL.revokeObjectURL(url), 0);
    setMessage({ tone: 'success', text: '백업 파일을 저장했습니다.' });
  }

  async function handleFile(event: ChangeEvent<HTMLInputElement>) {
    const file = event.target.files?.[0];
    event.target.value = '';
    if (!file) return;
    if (file.size > 5 * 1024 * 1024) {
      setMessage({ tone: 'error', text: '백업 파일은 5MB 이하만 가져올 수 있습니다.' });
      return;
    }
    try {
      setPendingImport({ name: file.name, raw: await file.text() });
      setMessage(null);
    } catch {
      setMessage({ tone: 'error', text: '선택한 파일을 읽을 수 없습니다.' });
    }
  }

  function confirmImport() {
    if (!pendingImport) return;
    const result = onImport(pendingImport.raw);
    setMessage({ tone: result.ok ? 'success' : 'error', text: result.message });
    setCanRestore(result.ok);
    if (result.ok) setPendingImport(null);
  }

  function restorePrevious() {
    const result = onRestore();
    setMessage({ tone: result.ok ? 'success' : 'error', text: result.message });
  }

  return (
    <div className="settings-backdrop" onMouseDown={(event) => { if (event.target === event.currentTarget) onClose(); }}>
      <section ref={dialogRef} className="settings-sheet" role="dialog" aria-modal="true" aria-labelledby="settings-title" onKeyDown={keepFocusInside}>
        <header className="settings-header">
          <div><span className="overline">설정</span><h2 id="settings-title">설정과 데이터</h2><p>내 계획을 안전하게 관리하고 앱 환경을 정리합니다.</p></div>
          <button className="icon-button ghost" type="button" onClick={onClose} aria-label="설정 닫기"><X size={20} /></button>
        </header>

        <div className="settings-scroll">
          <section className={`storage-status ${saveError ? 'error' : ''}`}>
            <span>{saveError || syncStatus === 'offline' ? <CloudOff size={19} /> : <ShieldCheck size={19} />}</span>
            <div><strong>{savedLabel}</strong><p>변경사항은 이 기기에 즉시 보관되고, 연결되면 로그인한 모든 기기에 자동으로 동기화됩니다.</p></div>
          </section>

          <section className="settings-section account-section">
            <header><div><strong>내 계정</strong><p>이 계정으로 계획과 완료 기록을 기기 간에 이어갑니다.</p></div><UserRound size={19} /></header>
            <div className="account-row"><span><UserRound size={17} /></span><div><small>로그인 이메일</small><strong>{userEmail || 'Flowday 사용자'}</strong></div><button type="button" disabled={signingOut} onClick={async () => { setSigningOut(true); await onSignOut(); }}>{signingOut ? <LoaderCircle className="spin" size={16} /> : <LogOut size={16} />}로그아웃</button></div>
          </section>

          <section className="settings-section">
            <header><div><strong>화면 테마</strong><p>앱 전체의 밝기를 선택합니다.</p></div></header>
            <div className="settings-theme-grid">
              {THEMES.map(({ id, label, description, icon: Icon }) => (
                <button type="button" className={theme === id ? 'selected' : ''} aria-pressed={theme === id} key={id} onClick={() => onThemeChange(id)}>
                  <Icon size={18} /><span><strong>{label}</strong><small>{description}</small></span>{theme === id ? <Check size={16} /> : null}
                </button>
              ))}
            </div>
          </section>

          <section className="settings-section">
            <header><div><strong>데이터 백업</strong><p>클라우드 동기화와 별도로 내 기록을 파일로 보관하고 복구할 수 있습니다.</p></div><DatabaseBackup size={19} /></header>
            <div className="data-counts"><span><b>{counts.tasks}</b>할 일</span><span><b>{counts.goals}</b>계획</span><span><b>{counts.blocks}</b>시간 블록</span></div>
            <div className="settings-actions">
              <button type="button" onClick={handleExport}><Download size={17} /><span><strong>백업 내보내기</strong><small>JSON 파일로 안전하게 보관</small></span></button>
              <button type="button" onClick={() => fileInputRef.current?.click()}><FileUp size={17} /><span><strong>백업 가져오기</strong><small>다른 기기나 이전 기록 복구</small></span></button>
              <input ref={fileInputRef} type="file" accept="application/json,.json" onChange={handleFile} hidden />
            </div>
            {pendingImport ? <div className="settings-confirm" role="alert"><div><strong>{pendingImport.name}</strong><p>현재 데이터는 복구용으로 보관한 뒤 이 백업으로 교체합니다.</p></div><button type="button" onClick={() => setPendingImport(null)}>취소</button><button className="primary" type="button" onClick={confirmImport}>가져오기</button></div> : null}
            {message ? <div className={`settings-message ${message.tone}`} role={message.tone === 'error' ? 'alert' : 'status'}>{message.text}{canRestore ? <button type="button" onClick={restorePrevious}><RotateCcw size={14} />직전 데이터 복구</button> : null}</div> : null}
          </section>

          <section className="settings-section install-guide">
            <header><div><strong>홈 화면에 설치</strong><p>브라우저 메뉴의 ‘홈 화면에 추가’ 또는 주소창 설치 아이콘을 사용하면 앱처럼 실행할 수 있습니다.</p></div><MonitorSmartphone size={19} /></header>
            <span>iPhone·iPad: 공유 버튼 → 홈 화면에 추가</span><span>Android·PC: 브라우저 메뉴 → 앱 설치</span>
          </section>

          <section className="settings-section danger-zone">
            <header><div><strong>데이터 초기화</strong><p>모든 할 일, 계획, 시간 블록과 완료 기록을 비웁니다.</p></div></header>
            {!resetConfirm ? <button type="button" onClick={() => setResetConfirm(true)}><Trash2 size={16} />모든 데이터 삭제</button> : <div className="settings-confirm" role="alert"><div><strong>정말 처음부터 시작할까요?</strong><p>삭제 직후에는 ‘직전 데이터 복구’로 한 번 되돌릴 수 있습니다.</p></div><button type="button" onClick={() => setResetConfirm(false)}>취소</button><button className="danger" type="button" onClick={() => { onReset(); setResetConfirm(false); setCanRestore(true); setMessage({ tone: 'success', text: '모든 데이터를 비웠습니다.' }); }}>전체 삭제</button></div>}
          </section>
        </div>
      </section>
    </div>
  );
}

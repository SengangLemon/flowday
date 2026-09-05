'use client';

import { BarChart3, Check, Cloud, CloudOff, Minus, PenLine, Plus, Sparkles, Trash2, X } from 'lucide-react';
import { FormEvent, useEffect, useMemo, useRef, useState } from 'react';
import type { DailyRatingSyncStatus } from '../hooks/use-daily-ratings';
import {
  clampRating,
  DAILY_RATING_TAGS,
  DailyRating,
  DailyRatingDraft,
  formatRating,
  MAX_RATING_REFLECTION_LENGTH,
  parseRatingInput,
  ratingWindowStats,
  ratingsByDate,
} from '../lib/daily-rating';
import { formatDateLabel, shiftDate } from '../lib/planner';

type DayRatingSummaryProps = {
  date: string;
  today: string;
  rating?: DailyRating;
  syncStatus: DailyRatingSyncStatus;
  onOpen: (date: string) => void;
};

export function DayRatingSummary({ date, today, rating, syncStatus, onOpen }: DayRatingSummaryProps) {
  const future = date > today;
  const SyncIcon = syncStatus === 'offline' || syncStatus === 'error' ? CloudOff : Cloud;
  const syncLabel = syncStatus === 'saving' ? '저장 중' : syncStatus === 'offline' ? '오프라인 보관' : syncStatus === 'error' ? '연결 확인' : '동기화됨';
  return (
    <button className={`day-rating-summary ${rating ? 'rated' : ''}`} type="button" disabled={future} onClick={() => onOpen(date)}>
      <span className="day-rating-icon"><Sparkles size={19} /></span>
      <span className="day-rating-copy">
        <small>{future ? '하루가 지난 뒤 평가할 수 있어요' : rating ? '나의 하루 점수' : '하루를 돌아보세요'}</small>
        {rating ? <strong><b>{formatRating(rating.scoreHundredths)}</b><i>/ 10</i></strong> : <strong>오늘의 감상을 남기기</strong>}
        {rating?.reflection ? <em>{rating.reflection}</em> : rating?.tags.length ? <em>{rating.tags.join(' · ')}</em> : null}
      </span>
      {!future ? <span className="day-rating-action"><SyncIcon size={13} /><small>{syncLabel}</small><PenLine size={17} /></span> : null}
    </button>
  );
}

type RatingTrendProps = {
  ratings: DailyRating[];
  selectedDate: string;
  today: string;
  onOpen: (date: string) => void;
};

export function RatingTrend({ ratings, selectedDate, today, onOpen }: RatingTrendProps) {
  const endDate = selectedDate > today ? today : selectedDate;
  const byDate = useMemo(() => ratingsByDate(ratings), [ratings]);
  const recentDates = useMemo(() => Array.from({ length: 14 }, (_, index) => shiftDate(endDate, index - 13)), [endDate]);
  const recent = recentDates.map((date, index) => ({ date, index, rating: byDate.get(date) })).filter((item) => item.rating);
  const seven = ratingWindowStats(ratings, endDate, 7);
  const thirty = ratingWindowStats(ratings, endDate, 30);
  const previousSeven = ratingWindowStats(ratings, shiftDate(endDate, -7), 7);
  const delta = seven.count >= 2 && previousSeven.count >= 2 && seven.averageHundredths !== null && previousSeven.averageHundredths !== null
    ? seven.averageHundredths - previousSeven.averageHundredths
    : null;
  const points = recent.map(({ index, rating }) => `${12 + index * (216 / 13)},${74 - (rating!.scoreHundredths / 1000) * 58}`).join(' ');
  const enoughForInsight = thirty.count >= 3;

  return (
    <section className="rating-trend-card" aria-labelledby="rating-trend-title">
      <header>
        <div><span className="overline">감상 흐름</span><h2 id="rating-trend-title">최근의 하루들</h2><p>평가한 날만 평균에 반영합니다.</p></div>
        <BarChart3 size={20} />
      </header>
      {enoughForInsight ? (
        <div className="rating-trend-content">
          <div className="rating-chart" aria-label={`최근 14일 중 ${recent.length}일 평가`}>
            <span className="chart-guide top">10</span><span className="chart-guide bottom">0</span>
            <svg viewBox="0 0 240 84" role="img" aria-label="최근 14일 하루 점수 추이">
              <line x1="12" y1="16" x2="228" y2="16" /><line x1="12" y1="45" x2="228" y2="45" /><line x1="12" y1="74" x2="228" y2="74" />
              {recent.length > 1 ? <polyline points={points} /> : null}
              {recent.map(({ date, index, rating }) => <circle key={date} cx={12 + index * (216 / 13)} cy={74 - (rating!.scoreHundredths / 1000) * 58} r="3.8" onClick={() => onOpen(date)}><title>{date} · {formatRating(rating!.scoreHundredths)}</title></circle>)}
            </svg>
          </div>
          <div className="rating-metrics">
            <article><span>최근 7일</span><strong>{seven.averageHundredths === null ? '—' : formatRating(seven.averageHundredths)}</strong><small>{seven.count}일 기록{delta === null ? '' : ` · ${delta >= 0 ? '+' : ''}${(delta / 100).toFixed(2)}`}</small></article>
            <article><span>최근 30일</span><strong>{thirty.averageHundredths === null ? '—' : formatRating(thirty.averageHundredths)}</strong><small>{thirty.count}일 기록</small></article>
          </div>
        </div>
      ) : (
        <button className="rating-trend-empty" type="button" onClick={() => onOpen(endDate)}>
          <span><Sparkles size={20} /></span><div><strong>3일을 기록하면 흐름이 보여요</strong><p>좋고 나쁨을 판단하기보다, 하루의 감상을 솔직하게 남겨보세요.</p></div><Plus size={18} />
        </button>
      )}
    </section>
  );
}

type DayRatingSheetProps = {
  date: string;
  today: string;
  rating?: DailyRating;
  syncStatus: DailyRatingSyncStatus;
  onSave: (draft: DailyRatingDraft) => void;
  onDelete: (date: string) => void;
  onClose: () => void;
};

export function DayRatingSheet({ date, today, rating, syncStatus, onSave, onDelete, onClose }: DayRatingSheetProps) {
  const dialogRef = useRef<HTMLElement>(null);
  const [score, setScore] = useState(rating?.scoreHundredths ?? 700);
  const [scoreInput, setScoreInput] = useState(rating ? formatRating(rating.scoreHundredths) : '7.00');
  const [reflection, setReflection] = useState(rating?.reflection ?? '');
  const [tags, setTags] = useState<string[]>(rating?.tags ?? []);
  const [error, setError] = useState('');
  const [confirmDelete, setConfirmDelete] = useState(false);
  const future = date > today;
  const SyncIcon = syncStatus === 'offline' || syncStatus === 'error' ? CloudOff : Cloud;

  useEffect(() => {
    const previousFocus = document.activeElement instanceof HTMLElement ? document.activeElement : null;
    const frame = window.requestAnimationFrame(() => dialogRef.current?.querySelector<HTMLInputElement>('input')?.focus());
    function closeOnEscape(event: KeyboardEvent) {
      if (event.key === 'Escape') onClose();
    }
    window.addEventListener('keydown', closeOnEscape);
    return () => {
      window.cancelAnimationFrame(frame);
      window.removeEventListener('keydown', closeOnEscape);
      previousFocus?.focus();
    };
  }, [onClose]);

  function updateScore(next: number) {
    const clamped = clampRating(next);
    setScore(clamped);
    setScoreInput(formatRating(clamped));
    setError('');
  }

  function submit(event: FormEvent) {
    event.preventDefault();
    const parsed = parseRatingInput(scoreInput);
    if (future) {
      setError('미래의 하루는 아직 평가할 수 없습니다.');
      return;
    }
    if (parsed === null) {
      setError('0.00부터 10.00까지, 소수점 둘째 자리로 입력해주세요.');
      return;
    }
    onSave({ date, scoreHundredths: parsed, reflection, tags });
    onClose();
  }

  function toggleTag(tag: string) {
    setTags((current) => current.includes(tag) ? current.filter((item) => item !== tag) : [...current, tag]);
  }

  const syncLabel = syncStatus === 'saving' ? '변경사항 저장 중' : syncStatus === 'offline' ? '오프라인 · 이 기기에 저장됨' : syncStatus === 'error' ? '클라우드 연결 확인' : '모든 기기와 동기화';
  return (
    <div className="rating-sheet-backdrop" onMouseDown={(event) => { if (event.target === event.currentTarget) onClose(); }}>
      <section ref={dialogRef} className="rating-sheet" role="dialog" aria-modal="true" aria-labelledby="rating-sheet-title">
        <div className="sheet-handle" aria-hidden="true" />
        <header className="rating-sheet-header">
          <div><span className="overline">Daily reflection</span><h2 id="rating-sheet-title">하루를 평가해볼까요?</h2><p>{formatDateLabel(date)} · 오직 나만의 감상입니다.</p></div>
          <button className="icon-button ghost" type="button" onClick={onClose} aria-label="하루 평가 닫기"><X size={20} /></button>
        </header>
        <form onSubmit={submit}>
          <div className="rating-score-editor">
            <div className="rating-score-number">
              <button type="button" onClick={() => updateScore(score - 1)} aria-label="0.01점 낮추기"><Minus size={18} /></button>
              <label><span>나의 하루 점수</span><span><input value={scoreInput} inputMode="decimal" pattern="(?:10(?:[.,]0{1,2})?|[0-9](?:[.,]\d{1,2})?)" aria-describedby="rating-score-help" onChange={(event) => { setScoreInput(event.target.value); const parsed = parseRatingInput(event.target.value); if (parsed !== null) setScore(parsed); }} onBlur={() => { const parsed = parseRatingInput(scoreInput); if (parsed !== null) updateScore(parsed); }} /><b>/ 10</b></span></label>
              <button type="button" onClick={() => updateScore(score + 1)} aria-label="0.01점 높이기"><Plus size={18} /></button>
            </div>
            <input className="rating-range" type="range" min="0" max="1000" step="1" value={score} aria-label="하루 점수 슬라이더" onChange={(event) => updateScore(Number(event.target.value))} />
            <div className="rating-scale"><span>힘들었어요</span><span id="rating-score-help">0.01점 단위</span><span>아주 좋았어요</span></div>
            <div className="rating-presets" aria-label="점수 빠른 선택">{[400, 600, 800, 1000].map((value) => <button type="button" key={value} onClick={() => updateScore(value)}>{formatRating(value)}</button>)}</div>
          </div>

          <fieldset className="rating-tags"><legend>오늘을 표현하는 단어</legend><div>{DAILY_RATING_TAGS.map((tag) => <button type="button" className={tags.includes(tag) ? 'selected' : ''} aria-pressed={tags.includes(tag)} key={tag} onClick={() => toggleTag(tag)}>{tags.includes(tag) ? <Check size={14} /> : null}{tag}</button>)}</div></fieldset>

          <label className="rating-reflection"><span>짧은 감상 <small>선택</small></span><textarea value={reflection} maxLength={MAX_RATING_REFLECTION_LENGTH} placeholder="오늘을 한 문장으로 남겨보세요." onChange={(event) => setReflection(event.target.value)} /><small>{reflection.length}/{MAX_RATING_REFLECTION_LENGTH}</small></label>
          {error ? <p className="rating-error" role="alert">{error}</p> : null}
          <div className="rating-sync-state"><SyncIcon size={14} /><span>{syncLabel}</span></div>

          <footer className="rating-sheet-footer">
            {rating ? (!confirmDelete ? <button className="rating-delete" type="button" onClick={() => setConfirmDelete(true)}><Trash2 size={16} />기록 삭제</button> : <button className="rating-delete confirm" type="button" onClick={() => { onDelete(date); onClose(); }}>한 번 더 눌러 삭제</button>) : <span />}
            <button className="rating-save" type="submit" disabled={future}><Check size={17} />{rating ? '평가 저장' : '하루 기록하기'}</button>
          </footer>
        </form>
      </section>
    </div>
  );
}

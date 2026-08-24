'use client';

import { Check, Clock3, Keyboard } from 'lucide-react';
import { useMemo, useRef, useState } from 'react';

type TimeChoiceProps = {
  value: string;
  onChange: (value: string) => void;
  label?: string;
  suggestedTimes?: string[];
};

const DEFAULT_TIMES = ['06:00', '09:00', '12:00', '15:00', '18:00', '21:00'];
const TIME_PATTERN = /^(?:[01]\d|2[0-3]):[0-5]\d$/;

function normalizeTimeInput(input: string) {
  const compact = input.trim().replace(/\s/g, '');
  if (!compact) return null;

  if (compact.includes(':')) {
    const match = compact.match(/^(\d{1,2}):(\d{1,2})$/);
    if (!match) return null;
    const hour = Number(match[1]);
    const minute = Number(match[2]);
    if (hour > 23 || minute > 59) return null;
    return `${String(hour).padStart(2, '0')}:${String(minute).padStart(2, '0')}`;
  }

  if (!/^\d{1,4}$/.test(compact)) return null;
  const hourDigits = compact.length <= 2 ? compact : compact.slice(0, -2);
  const minuteDigits = compact.length <= 2 ? '0' : compact.slice(-2);
  const hour = Number(hourDigits);
  const minute = Number(minuteDigits);
  if (hour > 23 || minute > 59) return null;
  return `${String(hour).padStart(2, '0')}:${String(minute).padStart(2, '0')}`;
}

function readableTime(value: string) {
  const [hourText = '0', minute = '00'] = value.split(':');
  const hour = Number(hourText);
  if (hour === 0) return `밤 12:${minute}`;
  if (hour === 12) return `낮 12:${minute}`;
  return `${hour < 12 ? '오전' : '오후'} ${hour % 12}:${minute}`;
}

export function TimeChoice({ value, onChange, label = '시간', suggestedTimes = [] }: TimeChoiceProps) {
  const [draft, setDraft] = useState(value);
  const [error, setError] = useState('');
  const inputRef = useRef<HTMLInputElement>(null);
  const quickTimes = useMemo(() => Array.from(new Set([
    value,
    ...suggestedTimes.filter((time) => TIME_PATTERN.test(time)),
    ...DEFAULT_TIMES,
  ])).slice(0, 9), [suggestedTimes, value]);

  function selectTime(nextValue: string) {
    setDraft(nextValue);
    setError('');
    inputRef.current?.setCustomValidity('');
    onChange(nextValue);
  }

  function commitDraft() {
    const normalized = normalizeTimeInput(draft);
    if (!normalized) {
      const message = '0:00부터 23:59 사이로 입력해주세요.';
      setError(message);
      inputRef.current?.setCustomValidity(message);
      return;
    }
    selectTime(normalized);
  }

  return (
    <div className="time-choice">
      <header>
        <span><Clock3 size={15} />{label}</span>
        <strong>{readableTime(value)}</strong>
      </header>

      <div className={`time-direct-entry ${error ? 'invalid' : ''}`}>
        <Keyboard size={18} aria-hidden="true" />
        <label>
          <span>숫자로 바로 입력</span>
          <input
            ref={inputRef}
            type="text"
            inputMode="numeric"
            enterKeyHint="done"
            value={draft}
            onChange={(event) => {
              setDraft(event.target.value);
              setError('');
              event.currentTarget.setCustomValidity('');
            }}
            onFocus={(event) => event.currentTarget.select()}
            onBlur={commitDraft}
            onKeyDown={(event) => {
              if (event.key === 'Enter') {
                event.preventDefault();
                commitDraft();
                event.currentTarget.blur();
              }
            }}
            aria-label={`${label} 직접 입력`}
            aria-invalid={Boolean(error)}
            aria-describedby={error ? 'time-choice-error' : 'time-choice-hint'}
            autoComplete="off"
          />
        </label>
        <button type="button" onMouseDown={(event) => event.preventDefault()} onClick={commitDraft} aria-label="입력한 시간 적용"><Check size={17} /></button>
      </div>
      <p id={error ? 'time-choice-error' : 'time-choice-hint'} className={error ? 'time-input-error' : 'time-input-hint'} role={error ? 'alert' : undefined}>
        {error || '예: 오전 9시 → 9 또는 900 · 오후 6시 30분 → 1830'}
      </p>

      <div className="time-quick-row">
        <span>{suggestedTimes.length ? '내 블록 · 추천' : '빠른 선택'}</span>
        <div role="group" aria-label={`${label} 빠른 선택`}>
          {quickTimes.map((time) => (
            <button type="button" aria-pressed={value === time} key={time} onClick={() => selectTime(time)}>{time}</button>
          ))}
        </div>
      </div>
    </div>
  );
}

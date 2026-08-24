'use client';

type TimeChoiceProps = {
  value: string;
  onChange: (value: string) => void;
  label?: string;
};

const BASE_MINUTES = ['00', '15', '30', '45'];

function parseTime(value: string) {
  const [rawHour = '09', rawMinute = '00'] = value.split(':');
  const hour = Math.min(23, Math.max(0, Number(rawHour) || 0));
  const minute = Math.min(59, Math.max(0, Number(rawMinute) || 0));
  return { hour, minute: String(minute).padStart(2, '0') };
}

function toTime(period: 'am' | 'pm', displayHour: number, minute: string) {
  const baseHour = displayHour % 12;
  const hour = period === 'pm' ? baseHour + 12 : baseHour;
  return `${String(hour).padStart(2, '0')}:${minute}`;
}

export function TimeChoice({ value, onChange, label = '시간' }: TimeChoiceProps) {
  const { hour, minute } = parseTime(value);
  const period: 'am' | 'pm' = hour < 12 ? 'am' : 'pm';
  const displayHour = hour % 12 || 12;
  const minutes = BASE_MINUTES.includes(minute)
    ? BASE_MINUTES
    : [...BASE_MINUTES, minute].sort((a, b) => Number(a) - Number(b));

  return (
    <div className="time-choice">
      <header>
        <span>{label}</span>
        <strong>15분 단위</strong>
      </header>
      <div className="time-choice-display">
        <div className="time-period-options" role="group" aria-label={`${label} 오전 오후`}>
          <button type="button" aria-pressed={period === 'am'} onClick={() => onChange(toTime('am', displayHour, minute))}>오전</button>
          <button type="button" aria-pressed={period === 'pm'} onClick={() => onChange(toTime('pm', displayHour, minute))}>오후</button>
        </div>
        <output aria-live="polite"><span>{String(displayHour).padStart(2, '0')}</span><i>:</i><span>{minute}</span></output>
      </div>
      <label className="time-hour-slider">
        <span>시간</span>
        <input type="range" min="1" max="12" step="1" value={displayHour} onChange={(event) => onChange(toTime(period, Number(event.target.value), minute))} aria-label={`${label} 시`} aria-valuetext={`${displayHour}시`} />
        <small><i>1</i><i>3</i><i>6</i><i>9</i><i>12</i></small>
      </label>
      <div className="time-minute-options" role="group" aria-label={`${label} 분`}>
        {minutes.map((option) => (
          <button type="button" aria-pressed={minute === option} key={option} onClick={() => onChange(toTime(period, displayHour, option))}>{option}분</button>
        ))}
      </div>
    </div>
  );
}

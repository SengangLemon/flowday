'use client';

type TimeChoiceProps = {
  value: string;
  onChange: (value: string) => void;
  label?: string;
};

const DISPLAY_HOURS = Array.from({ length: 12 }, (_, index) => index + 1);
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
        <strong>{period === 'am' ? '오전' : '오후'} {displayHour}:{minute}</strong>
      </header>
      <div className="time-period-options" role="group" aria-label={`${label} 오전 오후`}>
        <button type="button" aria-pressed={period === 'am'} onClick={() => onChange(toTime('am', displayHour, minute))}>오전</button>
        <button type="button" aria-pressed={period === 'pm'} onClick={() => onChange(toTime('pm', displayHour, minute))}>오후</button>
      </div>
      <div className="time-number-grid" role="group" aria-label={`${label} 시`}>
        {DISPLAY_HOURS.map((option) => (
          <button type="button" aria-pressed={displayHour === option} key={option} onClick={() => onChange(toTime(period, option, minute))}>{option}</button>
        ))}
      </div>
      <div className="time-minute-options" role="group" aria-label={`${label} 분`}>
        {minutes.map((option) => (
          <button type="button" aria-pressed={minute === option} key={option} onClick={() => onChange(toTime(period, displayHour, option))}>{option}분</button>
        ))}
      </div>
    </div>
  );
}

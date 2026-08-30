import { describe, expect, it } from 'vitest';
import { dateKey, millisecondsUntilNextLocalDay, taskOccursOn, createEmptyTask } from '../app/lib/planner';

describe('planner dates', () => {
  it('schedules the today refresh just after the next local midnight', () => {
    const now = new Date(2026, 7, 30, 23, 59, 59, 500);
    expect(millisecondsUntilNextLocalDay(now)).toBe(1_500);
    expect(dateKey(new Date(now.getTime() + millisecondsUntilNextLocalDay(now)))).toBe('2026-08-31');
  });

  it('handles daily, weekday, weekly, and monthly occurrences', () => {
    const base = createEmptyTask('2026-08-31');
    expect(taskOccursOn({ ...base, repeat: 'daily' }, '2026-09-02')).toBe(true);
    expect(taskOccursOn({ ...base, repeat: 'weekdays' }, '2026-09-05')).toBe(false);
    expect(taskOccursOn({ ...base, repeat: 'weekly' }, '2026-09-07')).toBe(true);
    expect(taskOccursOn({ ...base, repeat: 'monthly' }, '2026-09-30')).toBe(true);
  });
});

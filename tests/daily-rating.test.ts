import { createElement } from 'react';
import { renderToStaticMarkup } from 'react-dom/server';
import { describe, expect, it } from 'vitest';
import { DayRatingSummary } from '../app/components/day-rating';
import { CalendarView } from '../app/components/planner-app';
import {
  formatRating,
  parseRatingInput,
  ratingTier,
  ratingWindowStats,
  visibleDailyRatings,
} from '../app/lib/daily-rating';

const noop = () => undefined;
const rating = {
  date: '2026-09-05',
  scoreHundredths: 847,
  reflection: '차분하게 집중한 날',
  tags: ['몰입', '평온'],
  revision: 3,
  updatedAt: 1,
};

describe('daily rating domain', () => {
  it('accepts exactly 0.00 through 10.00 with up to two decimal places', () => {
    expect(parseRatingInput('0')).toBe(0);
    expect(parseRatingInput('8.47')).toBe(847);
    expect(parseRatingInput('8,47')).toBe(847);
    expect(parseRatingInput('10.00')).toBe(1000);
    expect(parseRatingInput('10.01')).toBeNull();
    expect(parseRatingInput('-1')).toBeNull();
    expect(parseRatingInput('8.471')).toBeNull();
    expect(parseRatingInput('1e1')).toBeNull();
    expect(formatRating(847)).toBe('8.47');
  });

  it('excludes deleted and unrated records from visible ratings', () => {
    const ratings = visibleDailyRatings({
      active: { ...rating, dirty: false, deletedAt: null },
      deleted: { ...rating, date: '2026-09-04', scoreHundredths: null, reflection: '', tags: [], dirty: false, deletedAt: 2 },
    });
    expect(ratings).toEqual([rating]);
  });

  it('calculates windows only from days the user actually rated', () => {
    const stats = ratingWindowStats([
      rating,
      { ...rating, date: '2026-09-03', scoreHundredths: 753 },
      { ...rating, date: '2026-08-01', scoreHundredths: 100 },
    ], '2026-09-05', 7);
    expect(stats).toEqual({ averageHundredths: 800, count: 2 });
    expect(ratingTier(399)).toBe(1);
    expect(ratingTier(800)).toBe(4);
  });
});

describe('daily rating interface', () => {
  it('shows the exact score and reflection on the day dashboard', () => {
    const html = renderToStaticMarkup(createElement(DayRatingSummary, {
      date: rating.date,
      today: rating.date,
      rating,
      syncStatus: 'synced',
      onOpen: noop,
    }));
    expect(html).toContain('8.47');
    expect(html).toContain('차분하게 집중한 날');
  });

  it('shows the rating in the weekly calendar', () => {
    const html = renderToStaticMarkup(createElement(CalendarView, {
      selectedDate: rating.date,
      today: rating.date,
      tasks: [],
      goals: [],
      ratings: [rating],
      onDateChange: noop,
      onNew: noop,
      onNewGoal: noop,
      onEdit: noop,
      onEditGoal: noop,
      onToggle: noop,
      onMove: noop,
      onMoveGoal: noop,
      onRateDay: noop,
    }));
    expect(html).toContain('8.47');
    expect(html).toContain('하루 평가');
  });
});

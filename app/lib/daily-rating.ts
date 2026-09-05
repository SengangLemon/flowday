import { shiftDate } from './planner';

export const DAILY_RATING_TAGS = ['몰입', '활력', '평온', '연결', '회복', '도전'] as const;
export const MAX_RATING_REFLECTION_LENGTH = 1000;

export type DailyRating = {
  date: string;
  scoreHundredths: number;
  reflection: string;
  tags: string[];
  revision: number;
  updatedAt: number;
};

export type DailyRatingDraft = Pick<DailyRating, 'date' | 'scoreHundredths' | 'reflection' | 'tags'>;

export type DailyRatingRecord = {
  date: string;
  scoreHundredths: number | null;
  reflection: string;
  tags: string[];
  /** Server revision this local intent was based on. */
  baseRevision?: number;
  /** Server `updated_at` observed with `baseRevision`. */
  baseUpdatedAt?: number;
  revision: number;
  updatedAt: number;
  deletedAt: number | null;
  dirty: boolean;
};

export type RatingWindowStats = {
  averageHundredths: number | null;
  count: number;
};

const RATING_INPUT_PATTERN = /^(?:10(?:[.,]0{1,2})?|[0-9](?:[.,]\d{1,2})?)$/;

export function parseRatingInput(value: string) {
  const trimmed = value.trim();
  if (!RATING_INPUT_PATTERN.test(trimmed)) return null;
  const score = Number(trimmed.replace(',', '.'));
  if (!Number.isFinite(score)) return null;
  return Math.round(score * 100);
}

export function formatRating(scoreHundredths: number) {
  return (scoreHundredths / 100).toFixed(2);
}

export function clampRating(scoreHundredths: number) {
  return Math.max(0, Math.min(1000, Math.round(scoreHundredths)));
}

export function visibleDailyRatings(records: Record<string, DailyRatingRecord>): DailyRating[] {
  return Object.values(records)
    .filter((record): record is DailyRatingRecord & { scoreHundredths: number } => record.deletedAt === null && record.scoreHundredths !== null)
    .map(({ date, scoreHundredths, reflection, tags, revision, updatedAt }) => ({ date, scoreHundredths, reflection, tags, revision, updatedAt }))
    .sort((a, b) => b.date.localeCompare(a.date));
}

export function ratingsByDate(ratings: DailyRating[]) {
  return new Map(ratings.map((rating) => [rating.date, rating]));
}

export function ratingWindowStats(ratings: DailyRating[], endDate: string, days: number): RatingWindowStats {
  const startDate = shiftDate(endDate, -(days - 1));
  let sum = 0;
  let count = 0;
  for (const rating of ratings) {
    if (rating.date < startDate || rating.date > endDate) continue;
    sum += rating.scoreHundredths;
    count += 1;
  }
  return { averageHundredths: count ? Math.round(sum / count) : null, count };
}

export function ratingTier(scoreHundredths: number | null | undefined) {
  if (scoreHundredths === null || scoreHundredths === undefined) return 0;
  if (scoreHundredths < 400) return 1;
  if (scoreHundredths < 650) return 2;
  if (scoreHundredths < 800) return 3;
  return 4;
}

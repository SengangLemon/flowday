import type { DailyRatingRecord } from './daily-rating';

export function replacementRatingRecords(
  current: Record<string, DailyRatingRecord>,
  desired: Record<string, DailyRatingRecord>,
  timestamp: number,
) {
  const next = { ...current };
  const dates = new Set([...Object.keys(current), ...Object.keys(desired)]);

  for (const date of dates) {
    const currentRecord = current[date];
    const desiredRecord = desired[date];
    const updatedAt = Math.max(timestamp, (currentRecord?.updatedAt ?? 0) + 1);
    const baseRevision = currentRecord?.baseRevision ?? currentRecord?.revision ?? 0;
    const baseUpdatedAt = currentRecord?.baseUpdatedAt ?? (currentRecord?.dirty ? 0 : currentRecord?.updatedAt ?? 0);

    if (desiredRecord?.deletedAt === null && desiredRecord.scoreHundredths !== null) {
      next[date] = {
        date,
        scoreHundredths: desiredRecord.scoreHundredths,
        reflection: desiredRecord.reflection,
        tags: [...desiredRecord.tags],
        baseRevision,
        baseUpdatedAt,
        revision: baseRevision,
        updatedAt,
        deletedAt: null,
        dirty: true,
      };
      continue;
    }

    if (currentRecord?.deletedAt === null) {
      next[date] = {
        ...currentRecord,
        scoreHundredths: null,
        reflection: '',
        tags: [],
        baseRevision,
        baseUpdatedAt,
        revision: baseRevision,
        updatedAt,
        deletedAt: updatedAt,
        dirty: true,
      };
    }
  }

  return next;
}

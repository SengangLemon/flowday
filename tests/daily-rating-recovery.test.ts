import { describe, expect, it } from 'vitest';
import { combineSyncStatuses } from '../app/components/planner-app';
import { replacementRatingRecords } from '../app/lib/daily-rating-recovery';
import type { DailyRatingRecord } from '../app/lib/daily-rating';

function record(date: string, scoreHundredths: number, revision: number): DailyRatingRecord {
  return {
    date,
    scoreHundredths,
    reflection: `${scoreHundredths}점 기록`,
    tags: ['몰입'],
    revision,
    updatedAt: 100,
    deletedAt: null,
    dirty: false,
  };
}

describe('daily rating recovery', () => {
  it('restores snapshot values while tombstoning ratings absent from the snapshot', () => {
    const current = {
      '2026-09-04': record('2026-09-04', 920, 7),
      '2026-09-05': record('2026-09-05', 840, 2),
    };
    const desired = {
      '2026-09-04': record('2026-09-04', 700, 1),
    };

    const restored = replacementRatingRecords(current, desired, 200);

    expect(restored['2026-09-04']).toMatchObject({
      scoreHundredths: 700,
      baseRevision: 7,
      baseUpdatedAt: 100,
      revision: 7,
      deletedAt: null,
      dirty: true,
    });
    expect(restored['2026-09-05']).toMatchObject({
      scoreHundredths: null,
      baseRevision: 2,
      baseUpdatedAt: 100,
      revision: 2,
      deletedAt: 200,
      dirty: true,
    });
  });
});

describe('combined planner sync status', () => {
  it('never reports synced while either data source is pending, offline, or failed', () => {
    expect(combineSyncStatuses('synced', 'saving')).toBe('saving');
    expect(combineSyncStatuses('synced', 'loading')).toBe('loading');
    expect(combineSyncStatuses('synced', 'offline')).toBe('offline');
    expect(combineSyncStatuses('saving', 'error')).toBe('error');
    expect(combineSyncStatuses('synced', 'synced')).toBe('synced');
  });
});

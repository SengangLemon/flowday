import { describe, expect, it } from 'vitest';
import type { DailyRatingRecord } from '../app/lib/daily-rating';
import {
  ratingIntentEquals,
  rebasePendingRating,
  reconcileDailyRatingRecord,
  resolveDailyRatingCasResult,
} from '../app/lib/daily-rating-sync';

function record(overrides: Partial<DailyRatingRecord> = {}): DailyRatingRecord {
  return {
    date: '2026-09-05',
    scoreHundredths: 700,
    reflection: '기준 기록',
    tags: ['평온'],
    baseRevision: 3,
    baseUpdatedAt: 3_000,
    revision: 3,
    updatedAt: 3_000,
    deletedAt: null,
    dirty: false,
    ...overrides,
  };
}

describe('daily rating conflict reconciliation', () => {
  it('keeps a pending edit only when the server is still at its observed base', () => {
    const local = record({
      scoreHundredths: 725,
      reflection: '로컬 수정',
      dirty: true,
      updatedAt: 4_000,
    });
    const remoteBase = record();

    expect(reconcileDailyRatingRecord(local, remoteBase)).toBe(local);
  });

  it('uses a newer remote revision instead of rebasing stale local content', () => {
    const local = record({
      scoreHundredths: 725,
      reflection: '오래된 로컬 수정',
      tags: ['몰입'],
      dirty: true,
      updatedAt: 4_000,
    });
    const remote = record({
      scoreHundredths: 930,
      reflection: '다른 기기의 최신 기록',
      tags: ['활력'],
      baseRevision: 4,
      revision: 4,
      baseUpdatedAt: 5_000,
      updatedAt: 5_000,
    });

    expect(reconcileDailyRatingRecord(local, remote)).toBe(remote);
  });

  it('prefers remote when a legacy dirty envelope has no trustworthy base timestamp', () => {
    const legacyLocal = record({
      scoreHundredths: 725,
      reflection: '출처를 확인할 수 없는 로컬 수정',
      baseUpdatedAt: undefined,
      dirty: true,
      updatedAt: 4_000,
    });
    const remote = record({
      scoreHundredths: 900,
      reflection: '서버 기록',
    });

    expect(reconcileDailyRatingRecord(legacyLocal, remote)).toBe(remote);
  });

  it('uses a same-revision server row changed after the recorded base timestamp', () => {
    const local = record({
      scoreHundredths: 725,
      reflection: '오래된 로컬 수정',
      dirty: true,
      updatedAt: 4_000,
    });
    const remote = record({
      scoreHundredths: 850,
      reflection: '서버에서 변경됨',
      baseUpdatedAt: 3_500,
      updatedAt: 3_500,
    });

    expect(reconcileDailyRatingRecord(local, remote)).toBe(remote);
  });

  it('recognizes a lost acknowledgement and treats delete timestamps as metadata', () => {
    const localDelete = record({
      scoreHundredths: null,
      reflection: '',
      tags: [],
      dirty: true,
      deletedAt: 4_000,
      updatedAt: 4_000,
    });
    const remoteDelete = record({
      scoreHundredths: null,
      reflection: '',
      tags: [],
      baseRevision: 4,
      revision: 4,
      baseUpdatedAt: 5_000,
      updatedAt: 5_000,
      deletedAt: 5_000,
    });

    expect(ratingIntentEquals(localDelete, remoteDelete)).toBe(true);
    expect(reconcileDailyRatingRecord(localDelete, remoteDelete)).toBe(remoteDelete);
  });

  it('rebases only a newer local intent after this client successfully writes', () => {
    const newerLocal = record({
      scoreHundredths: 875,
      reflection: '저장 중 다시 수정',
      dirty: true,
      updatedAt: 4_500,
    });
    const appliedRemote = record({
      scoreHundredths: 800,
      reflection: '첫 번째 수정',
      baseRevision: 4,
      revision: 4,
      baseUpdatedAt: 5_000,
      updatedAt: 5_000,
    });

    expect(rebasePendingRating(newerLocal, appliedRemote)).toMatchObject({
      scoreHundredths: 875,
      reflection: '저장 중 다시 수정',
      baseRevision: 4,
      baseUpdatedAt: 5_000,
      revision: 4,
      dirty: true,
    });
  });

  it('does not retry stale local content after a CAS conflict', () => {
    const snapshot = record({
      scoreHundredths: 725,
      reflection: '오래된 로컬 수정',
      dirty: true,
      updatedAt: 4_000,
    });
    const remote = record({
      scoreHundredths: 930,
      reflection: '다른 기기의 최신 기록',
      tags: ['활력'],
      baseRevision: 4,
      revision: 4,
      baseUpdatedAt: 5_000,
      updatedAt: 5_000,
    });

    expect(resolveDailyRatingCasResult(snapshot, snapshot, remote, false)).toEqual({
      record: remote,
      retry: false,
    });
  });

  it('retries a second local edit only after its own first intent was applied', () => {
    const snapshot = record({
      scoreHundredths: 800,
      reflection: '첫 번째 수정',
      dirty: true,
      updatedAt: 4_000,
    });
    const latest = record({
      scoreHundredths: 875,
      reflection: '저장 중 다시 수정',
      dirty: true,
      updatedAt: 4_500,
    });
    const appliedRemote = record({
      scoreHundredths: 800,
      reflection: '첫 번째 수정',
      baseRevision: 4,
      revision: 4,
      baseUpdatedAt: 5_000,
      updatedAt: 5_000,
    });

    const result = resolveDailyRatingCasResult(snapshot, latest, appliedRemote, true);
    expect(result.retry).toBe(true);
    expect(result.record).toMatchObject({
      scoreHundredths: 875,
      reflection: '저장 중 다시 수정',
      baseRevision: 4,
      revision: 4,
      dirty: true,
    });
  });
});

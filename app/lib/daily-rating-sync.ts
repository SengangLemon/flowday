import type { DailyRatingRecord } from './daily-rating';

export function ratingIntentEquals(left: DailyRatingRecord, right: DailyRatingRecord) {
  return left.scoreHundredths === right.scoreHundredths
    && left.reflection === right.reflection
    && (left.deletedAt === null) === (right.deletedAt === null)
    && left.tags.length === right.tags.length
    && left.tags.every((tag, index) => tag === right.tags[index]);
}

export function ratingBaseRevision(record: DailyRatingRecord) {
  return record.baseRevision ?? record.revision;
}

export function ratingBaseUpdatedAt(record: DailyRatingRecord) {
  return record.baseUpdatedAt ?? (record.dirty ? 0 : record.updatedAt);
}

export function rebasePendingRating(local: DailyRatingRecord, remote: DailyRatingRecord): DailyRatingRecord {
  return {
    ...local,
    baseRevision: remote.revision,
    baseUpdatedAt: remote.updatedAt,
    revision: remote.revision,
    dirty: true,
  };
}

export type DailyRatingCasResolution = {
  record: DailyRatingRecord;
  retry: boolean;
};

export function resolveDailyRatingCasResult(
  snapshot: DailyRatingRecord,
  latest: DailyRatingRecord,
  remote: DailyRatingRecord,
  applied: boolean,
): DailyRatingCasResolution {
  if (!latest.dirty) return { record: latest, retry: false };

  const changedWhileSaving = latest.updatedAt !== snapshot.updatedAt
    || !ratingIntentEquals(latest, snapshot);

  if (applied || ratingIntentEquals(snapshot, remote)) {
    return changedWhileSaving
      ? { record: rebasePendingRating(latest, remote), retry: true }
      : { record: remote, retry: false };
  }

  // A CAS rejection with different content is a real conflict. The remote row
  // wins; blindly retrying would overwrite an edit this client never observed.
  return { record: remote, retry: false };
}

/**
 * Resolves a full server read without allowing an old offline intent to become
 * a write based on a revision it never observed.
 */
export function reconcileDailyRatingRecord(
  local: DailyRatingRecord | undefined,
  remote: DailyRatingRecord | undefined,
): DailyRatingRecord | undefined {
  if (!local) return remote;
  if (!local.dirty) return remote;
  if (!remote) return local;

  const baseRevision = ratingBaseRevision(local);
  const baseUpdatedAt = ratingBaseUpdatedAt(local);

  // This is normally a response-lost acknowledgement of the same intent.
  if (ratingIntentEquals(local, remote) && remote.revision >= baseRevision) return remote;

  // Envelopes written before base metadata existed cannot prove that their
  // dirty value was derived from this server row. Prefer the server rather
  // than turning an unknown, possibly stale value into a destructive write.
  if (baseUpdatedAt === 0 && remote.revision >= baseRevision) return remote;

  // A higher revision is authoritative. For the same revision, a changed
  // server timestamp means the row was changed outside this local base.
  if (remote.revision > baseRevision) return remote;
  if (remote.revision === baseRevision
    && baseUpdatedAt > 0
    && remote.updatedAt > baseUpdatedAt) return remote;

  return local;
}

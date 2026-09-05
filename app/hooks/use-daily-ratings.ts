'use client';

import { useCallback, useEffect, useRef, useState, useSyncExternalStore } from 'react';
import type { SupabaseClient } from '@supabase/supabase-js';
import {
  clampRating,
  DailyRating,
  DailyRatingDraft,
  DailyRatingRecord,
  MAX_RATING_REFLECTION_LENGTH,
  visibleDailyRatings,
} from '../lib/daily-rating';
import { replacementRatingRecords } from '../lib/daily-rating-recovery';
import {
  ratingBaseRevision,
  ratingBaseUpdatedAt,
  reconcileDailyRatingRecord,
  resolveDailyRatingCasResult,
} from '../lib/daily-rating-sync';
import { createClient } from '../lib/supabase/client';

const STORAGE_KEY = 'flowday:daily-ratings:v1';
const RECOVERY_STORAGE_KEY = 'flowday:daily-ratings:recovery:v1';
const CLOUD_SAVE_DELAY = 450;
const subscribeToHydration = () => () => undefined;

export type DailyRatingSyncStatus = 'loading' | 'saving' | 'synced' | 'offline' | 'error';

type LocalEnvelope = {
  version: 1;
  records: Record<string, DailyRatingRecord>;
};

type DatabaseRating = {
  rating_date: string;
  score_hundredths: number | null;
  reflection: string;
  tags: string[];
  revision: number | string;
  updated_at: string;
  deleted_at: string | null;
};

type CasResult = DatabaseRating & { applied: boolean };

function storageKey(userId: string) {
  return `${STORAGE_KEY}:${userId}`;
}

function recoveryStorageKey(userId: string) {
  return `${RECOVERY_STORAGE_KEY}:${userId}`;
}

function normalizeTags(value: unknown) {
  if (!Array.isArray(value)) return [];
  return [...new Set(value.filter((tag): tag is string => typeof tag === 'string').map((tag) => tag.trim()).filter(Boolean))].slice(0, 8);
}

function normalizeRecord(value: unknown): DailyRatingRecord | null {
  if (!value || typeof value !== 'object') return null;
  const record = value as Partial<DailyRatingRecord>;
  if (!/^\d{4}-\d{2}-\d{2}$/.test(record.date ?? '')) return null;
  const deletedAt = typeof record.deletedAt === 'number' && Number.isFinite(record.deletedAt) ? record.deletedAt : null;
  const rawScore = typeof record.scoreHundredths === 'number' && Number.isFinite(record.scoreHundredths)
    ? clampRating(record.scoreHundredths)
    : null;
  if (deletedAt === null && rawScore === null) return null;
  const revision = typeof record.revision === 'number' && Number.isFinite(record.revision) ? Math.max(0, Math.floor(record.revision)) : 0;
  const updatedAt = typeof record.updatedAt === 'number' && Number.isFinite(record.updatedAt) ? record.updatedAt : 0;
  const dirty = Boolean(record.dirty);
  return {
    date: record.date!,
    scoreHundredths: deletedAt === null ? rawScore : null,
    reflection: typeof record.reflection === 'string' ? record.reflection.slice(0, MAX_RATING_REFLECTION_LENGTH) : '',
    tags: normalizeTags(record.tags),
    baseRevision: typeof record.baseRevision === 'number' && Number.isFinite(record.baseRevision)
      ? Math.max(0, Math.floor(record.baseRevision))
      : revision,
    baseUpdatedAt: typeof record.baseUpdatedAt === 'number' && Number.isFinite(record.baseUpdatedAt)
      ? Math.max(0, record.baseUpdatedAt)
      : dirty ? 0 : updatedAt,
    revision,
    updatedAt,
    deletedAt,
    dirty,
  };
}

function readStoredEnvelope(key: string) {
  if (typeof window === 'undefined') return {};
  try {
    const raw = window.localStorage.getItem(key);
    if (!raw) return null;
    const parsed = JSON.parse(raw) as Partial<LocalEnvelope>;
    if (parsed.version !== 1 || !parsed.records || typeof parsed.records !== 'object') return null;
    const records: Record<string, DailyRatingRecord> = {};
    for (const value of Object.values(parsed.records)) {
      const record = normalizeRecord(value);
      if (record) records[record.date] = record;
    }
    return records;
  } catch {
    return null;
  }
}

function readStoredRecords(userId: string) {
  return readStoredEnvelope(storageKey(userId)) ?? {};
}

function recordFromDatabase(row: DatabaseRating): DailyRatingRecord {
  const deletedAt = row.deleted_at ? new Date(row.deleted_at).getTime() : null;
  const revision = Math.max(0, Number(row.revision) || 0);
  const updatedAt = new Date(row.updated_at).getTime() || Date.now();
  return {
    date: row.rating_date,
    scoreHundredths: deletedAt === null && row.score_hundredths !== null ? clampRating(row.score_hundredths) : null,
    reflection: deletedAt === null ? (row.reflection ?? '').slice(0, MAX_RATING_REFLECTION_LENGTH) : '',
    tags: deletedAt === null ? normalizeTags(row.tags) : [],
    baseRevision: revision,
    baseUpdatedAt: updatedAt,
    revision,
    updatedAt,
    deletedAt,
    dirty: false,
  };
}

export function useDailyRatings(userId: string, client?: SupabaseClient) {
  const hydrated = useSyncExternalStore(subscribeToHydration, () => true, () => false);
  const [supabase] = useState(() => client ?? createClient());
  const [initialRecords] = useState<Record<string, DailyRatingRecord>>(() => readStoredRecords(userId));
  const recordsRef = useRef(initialRecords);
  const [ratings, setRatings] = useState<DailyRating[]>(() => visibleDailyRatings(initialRecords));
  const [ready, setReady] = useState(false);
  const readyRef = useRef(false);
  const [syncStatus, setSyncStatus] = useState<DailyRatingSyncStatus>('loading');
  const [localSaveError, setLocalSaveError] = useState(false);
  const timerRef = useRef<number | null>(null);
  const syncingRef = useRef(false);
  const reconcilingRef = useRef(false);
  const pendingFlushRef = useRef(false);

  const persist = useCallback((records: Record<string, DailyRatingRecord>) => {
    if (typeof window === 'undefined') return;
    try {
      const envelope: LocalEnvelope = { version: 1, records };
      window.localStorage.setItem(storageKey(userId), JSON.stringify(envelope));
      setLocalSaveError(false);
    } catch {
      setLocalSaveError(true);
      setSyncStatus('error');
    }
  }, [userId]);

  const applyRecords = useCallback((records: Record<string, DailyRatingRecord>) => {
    recordsRef.current = records;
    setRatings(visibleDailyRatings(records));
    persist(records);
  }, [persist]);

  const flush = useCallback(async function flush() {
    if (!readyRef.current) return;
    if (!navigator.onLine) {
      setSyncStatus('offline');
      return;
    }
    if (syncingRef.current) {
      pendingFlushRef.current = true;
      return;
    }
    if (reconcilingRef.current) {
      pendingFlushRef.current = true;
      return;
    }

    syncingRef.current = true;
    pendingFlushRef.current = false;
    setSyncStatus('saving');
    try {
      const dates = Object.values(recordsRef.current).filter((record) => record.dirty).map((record) => record.date);
      for (const date of dates) {
        for (let attempt = 0; attempt < 4; attempt += 1) {
          const snapshot = recordsRef.current[date];
          if (!snapshot?.dirty) break;
          const { data, error } = await supabase
            .rpc('compare_and_swap_daily_rating', {
              p_rating_date: snapshot.date,
              p_expected_revision: ratingBaseRevision(snapshot),
              p_score_hundredths: snapshot.scoreHundredths,
              p_reflection: snapshot.reflection,
              p_tags: snapshot.tags,
              p_deleted: snapshot.deletedAt !== null,
            })
            .single();
          if (error || !data) {
            setSyncStatus(navigator.onLine ? 'error' : 'offline');
            return;
          }

          const result = data as CasResult;
          const remote = recordFromDatabase(result);
          const latest = recordsRef.current[date];
          if (!latest) break;
          const resolution = resolveDailyRatingCasResult(snapshot, latest, remote, result.applied);
          applyRecords({ ...recordsRef.current, [date]: resolution.record });
          if (resolution.retry) continue;
          break;
        }
        if (recordsRef.current[date]?.dirty) {
          setSyncStatus('error');
          return;
        }
      }
      setSyncStatus('synced');
    } finally {
      syncingRef.current = false;
      if (pendingFlushRef.current) {
        pendingFlushRef.current = false;
        window.setTimeout(() => { void flush(); }, 0);
      }
    }
  }, [applyRecords, supabase]);

  const scheduleFlush = useCallback((delay = CLOUD_SAVE_DELAY) => {
    if (timerRef.current !== null) window.clearTimeout(timerRef.current);
    setSyncStatus(navigator.onLine ? 'saving' : 'offline');
    if (!readyRef.current || !navigator.onLine) return;
    timerRef.current = window.setTimeout(() => {
      timerRef.current = null;
      void flush();
    }, delay);
  }, [flush]);

  const reconcile = useCallback(async () => {
    if (!navigator.onLine) {
      setSyncStatus('offline');
      return;
    }
    if (reconcilingRef.current || syncingRef.current) return;
    reconcilingRef.current = true;
    try {
      setSyncStatus('loading');
      const { data, error } = await supabase
        .from('daily_ratings')
        .select('rating_date, score_hundredths, reflection, tags, revision, updated_at, deleted_at')
        .eq('user_id', userId);
      if (error) {
        setSyncStatus('error');
        return;
      }

      const remoteRecords: Record<string, DailyRatingRecord> = {};
      for (const row of data as DatabaseRating[]) {
        const record = recordFromDatabase(row);
        remoteRecords[record.date] = record;
      }
      const merged: Record<string, DailyRatingRecord> = {};
      const dates = new Set([...Object.keys(recordsRef.current), ...Object.keys(remoteRecords)]);
      for (const date of dates) {
        const resolved = reconcileDailyRatingRecord(recordsRef.current[date], remoteRecords[date]);
        if (resolved) merged[date] = resolved;
      }
      applyRecords(merged);
      readyRef.current = true;
      setReady(true);
      if (Object.values(merged).some((record) => record.dirty)) scheduleFlush(0);
      else setSyncStatus('synced');
    } finally {
      reconcilingRef.current = false;
      if (pendingFlushRef.current && Object.values(recordsRef.current).some((record) => record.dirty)) {
        pendingFlushRef.current = false;
        scheduleFlush(0);
      }
    }
  }, [applyRecords, scheduleFlush, supabase, userId]);

  useEffect(() => {
    let cancelled = false;
    async function initialize() {
      await reconcile();
      if (cancelled) return;
      readyRef.current = true;
      setReady(true);
    }
    void initialize();
    return () => {
      cancelled = true;
      readyRef.current = false;
      if (timerRef.current !== null) window.clearTimeout(timerRef.current);
    };
  }, [reconcile]);

  useEffect(() => {
    function syncFromAnotherTab(event: StorageEvent) {
      if (event.key !== storageKey(userId)) return;
      const incoming = readStoredRecords(userId);
      const merged = { ...recordsRef.current };
      for (const record of Object.values(incoming)) {
        const current = merged[record.date];
        if (!current || record.updatedAt > current.updatedAt) merged[record.date] = record;
      }
      applyRecords(merged);
      if (Object.values(merged).some((record) => record.dirty)) scheduleFlush();
    }
    window.addEventListener('storage', syncFromAnotherTab);
    return () => window.removeEventListener('storage', syncFromAnotherTab);
  }, [applyRecords, scheduleFlush, userId]);

  useEffect(() => {
    if (!ready || !navigator.onLine) return;
    const channel = supabase
      .channel(`daily-ratings-${userId}`)
      .on('postgres_changes', {
        event: '*',
        schema: 'public',
        table: 'daily_ratings',
        filter: `user_id=eq.${userId}`,
      }, (payload) => {
        const row = payload.new as Partial<DatabaseRating>;
        if (!row.rating_date || !row.updated_at) return;
        const remote = recordFromDatabase(row as DatabaseRating);
        const local = recordsRef.current[remote.date];
        if (local?.dirty) {
          // Keep the original base revision until CAS decides whether this is
          // our acknowledgement or another device's conflicting write.
          scheduleFlush(0);
          return;
        }
        if (!local
          || remote.revision > local.revision
          || (remote.revision === local.revision && remote.updatedAt > local.updatedAt)) {
          applyRecords({ ...recordsRef.current, [remote.date]: remote });
        }
      })
      .subscribe();
    return () => { void supabase.removeChannel(channel); };
  }, [applyRecords, ready, scheduleFlush, supabase, userId]);

  useEffect(() => {
    function online() { void reconcile(); }
    function offline() { setSyncStatus('offline'); }
    function visible() {
      if (document.visibilityState === 'visible' && navigator.onLine) void reconcile();
    }
    window.addEventListener('online', online);
    window.addEventListener('offline', offline);
    window.addEventListener('focus', online);
    document.addEventListener('visibilitychange', visible);
    return () => {
      window.removeEventListener('online', online);
      window.removeEventListener('offline', offline);
      window.removeEventListener('focus', online);
      document.removeEventListener('visibilitychange', visible);
    };
  }, [reconcile]);

  useEffect(() => {
    function flushBeforeSuspend() {
      if (navigator.onLine) void flush();
    }
    window.addEventListener('pagehide', flushBeforeSuspend);
    return () => window.removeEventListener('pagehide', flushBeforeSuspend);
  }, [flush]);

  const saveRating = useCallback((draft: DailyRatingDraft) => {
    const current = recordsRef.current[draft.date];
    const baseRevision = current ? ratingBaseRevision(current) : 0;
    const baseUpdatedAt = current ? ratingBaseUpdatedAt(current) : 0;
    const record: DailyRatingRecord = {
      date: draft.date,
      scoreHundredths: clampRating(draft.scoreHundredths),
      reflection: draft.reflection.trim().slice(0, MAX_RATING_REFLECTION_LENGTH),
      tags: normalizeTags(draft.tags),
      baseRevision,
      baseUpdatedAt,
      revision: baseRevision,
      updatedAt: Math.max(Date.now(), (current?.updatedAt ?? 0) + 1),
      deletedAt: null,
      dirty: true,
    };
    applyRecords({ ...recordsRef.current, [record.date]: record });
    scheduleFlush();
  }, [applyRecords, scheduleFlush]);

  const deleteRating = useCallback((date: string) => {
    const current = recordsRef.current[date];
    if (!current) return;
    const now = Math.max(Date.now(), current.updatedAt + 1);
    const baseRevision = ratingBaseRevision(current);
    const baseUpdatedAt = ratingBaseUpdatedAt(current);
    applyRecords({ ...recordsRef.current, [date]: {
      ...current,
      scoreHundredths: null,
      reflection: '',
      tags: [],
      baseRevision,
      baseUpdatedAt,
      revision: baseRevision,
      updatedAt: now,
      deletedAt: now,
      dirty: true,
    } });
    scheduleFlush();
  }, [applyRecords, scheduleFlush]);

  const captureRecovery = useCallback(() => {
    try {
      const envelope: LocalEnvelope = { version: 1, records: recordsRef.current };
      window.localStorage.setItem(recoveryStorageKey(userId), JSON.stringify(envelope));
      return true;
    } catch {
      return false;
    }
  }, [userId]);

  const resetRatings = useCallback(() => {
    captureRecovery();
    const now = Date.now();
    const next = { ...recordsRef.current };
    for (const record of Object.values(next)) {
      if (record.deletedAt !== null) continue;
      next[record.date] = { ...record, scoreHundredths: null, reflection: '', tags: [], updatedAt: Math.max(now, record.updatedAt + 1), deletedAt: now, dirty: true };
    }
    applyRecords(next);
    scheduleFlush(0);
  }, [applyRecords, captureRecovery, scheduleFlush]);

  const importRatings = useCallback((value: unknown) => {
    if (!Array.isArray(value)) return false;
    const now = Date.now();
    const desired: Record<string, DailyRatingRecord> = {};
    for (const item of value) {
      if (!item || typeof item !== 'object') continue;
      const rating = item as Partial<DailyRating>;
      if (!/^\d{4}-\d{2}-\d{2}$/.test(rating.date ?? '') || typeof rating.scoreHundredths !== 'number') continue;
      desired[rating.date!] = {
        date: rating.date!,
        scoreHundredths: clampRating(rating.scoreHundredths),
        reflection: typeof rating.reflection === 'string' ? rating.reflection.slice(0, MAX_RATING_REFLECTION_LENGTH) : '',
        tags: normalizeTags(rating.tags),
        revision: 0,
        updatedAt: 0,
        deletedAt: null,
        dirty: false,
      };
    }
    if (value.length > 0 && Object.keys(desired).length === 0) return false;
    if (!captureRecovery()) return false;
    const next = replacementRatingRecords(recordsRef.current, desired, now);
    applyRecords(next);
    scheduleFlush(0);
    return true;
  }, [applyRecords, captureRecovery, scheduleFlush]);

  const restoreRecovery = useCallback(() => {
    const previous = readStoredEnvelope(recoveryStorageKey(userId));
    if (!previous) return { ok: true as const, restored: false, message: '복구할 하루 감상 변경사항이 없습니다.' };
    try {
      const current: LocalEnvelope = { version: 1, records: recordsRef.current };
      window.localStorage.setItem(recoveryStorageKey(userId), JSON.stringify(current));
    } catch {
      return { ok: false as const, restored: false, message: '하루 감상 복구 저장소를 사용할 수 없습니다.' };
    }
    const next = replacementRatingRecords(recordsRef.current, previous, Date.now());
    applyRecords(next);
    scheduleFlush(0);
    return { ok: true as const, restored: true, message: '하루 감상을 직전 상태로 되돌렸습니다.' };
  }, [applyRecords, scheduleFlush, userId]);

  const clearLocalData = useCallback(() => {
    window.localStorage.removeItem(storageKey(userId));
    window.localStorage.removeItem(recoveryStorageKey(userId));
    recordsRef.current = {};
    setRatings([]);
  }, [userId]);

  return {
    ratings,
    ready: hydrated && ready,
    syncStatus: localSaveError ? 'error' as const : syncStatus,
    saveRating,
    deleteRating,
    resetRatings,
    importRatings,
    captureRecovery,
    restoreRecovery,
    clearLocalData,
  };
}

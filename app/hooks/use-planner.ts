'use client';

import { useCallback, useEffect, useMemo, useRef, useState, useSyncExternalStore } from 'react';
import { createClient } from '../lib/supabase/client';
import {
  dateKey,
  millisecondsUntilNextLocalDay,
  normalizeGoal,
  normalizeTask,
  PlanGoal,
  PlannerState,
  PlannerTask,
  PlannerView,
  ScheduleBlock,
  syncApplicationPreparationTasks,
  taskCompletedOn,
  tasksForDate,
  Theme,
} from '../lib/planner';
import {
  createLocalDocument,
  defaultPlannerState,
  mergePlannerStates,
  nextMutationTimestamp,
  parseLocalDocument,
  parsePlannerState,
  PlannerLocalDocument,
  plannerStatesEqual,
  plannerStateUpdatedAt,
  replacementPlannerState,
} from '../lib/planner-sync';

const STORAGE_KEY = 'flowday:planner:v7';
const BACKUP_STORAGE_KEY = 'flowday:planner:backup:v7';
const RECOVERY_STORAGE_KEY = 'flowday:planner:recovery:v7';
const LEGACY_V6_STORAGE_KEY = 'flowday:planner:v6';
const LEGACY_V6_BACKUP_STORAGE_KEY = 'flowday:planner:backup:v6';
const LEGACY_V5_STORAGE_KEY = 'flowday:planner:v5';
const LEGACY_V5_BACKUP_STORAGE_KEY = 'flowday:planner:backup:v5';
const LEGACY_V4_STORAGE_KEY = 'flowday:planner:v4';
const LEGACY_V3_STORAGE_KEY = 'flowday:planner:v3';
const LEGACY_V2_STORAGE_KEY = 'flowday:planner:v2';
const MIGRATION_OWNER_KEY = 'flowday:planner:migration-owner:v7';
const LEGACY_MIGRATION_OWNER_KEY = 'flowday:planner:migration-owner:v6';
const CLOUD_SAVE_DELAY = 650;
const subscribeToHydration = () => () => undefined;

export type PlannerSyncStatus = 'loading' | 'saving' | 'synced' | 'offline' | 'error';

type PlannerBackup = {
  format: 'flowday-backup';
  schemaVersion: 7;
  exportedAt: string;
  data: PlannerState;
};

type CloudDocument = {
  state: unknown;
  revision: number | string;
  updated_at: string;
};

type CasResult = CloudDocument & { applied: boolean };

function scopedKey(key: string, userId: string) {
  return `${key}:${userId}`;
}

function emptyLocalDocument() {
  return createLocalDocument(defaultPlannerState(), { dirty: false, revision: 0, updatedAt: 0 });
}

function readStoredDocument(userId: string): PlannerLocalDocument {
  const migrationOwner = window.localStorage.getItem(MIGRATION_OWNER_KEY)
    ?? window.localStorage.getItem(LEGACY_MIGRATION_OWNER_KEY);
  const legacyKeys = !migrationOwner || migrationOwner === userId ? [
    LEGACY_V6_STORAGE_KEY,
    LEGACY_V6_BACKUP_STORAGE_KEY,
    LEGACY_V5_STORAGE_KEY,
    LEGACY_V5_BACKUP_STORAGE_KEY,
    LEGACY_V4_STORAGE_KEY,
    LEGACY_V3_STORAGE_KEY,
    LEGACY_V2_STORAGE_KEY,
  ] : [];
  for (const key of [
    scopedKey(STORAGE_KEY, userId),
    scopedKey(BACKUP_STORAGE_KEY, userId),
    scopedKey(LEGACY_V6_STORAGE_KEY, userId),
    scopedKey(LEGACY_V6_BACKUP_STORAGE_KEY, userId),
    ...legacyKeys,
  ]) {
    try {
      const stored = window.localStorage.getItem(key);
      if (!stored) continue;
      const parsed = parseLocalDocument(JSON.parse(stored));
      if (parsed) return parsed;
    } catch {
      // Try the next recovery or legacy copy.
    }
  }
  return emptyLocalDocument();
}

export function usePlanner(userId: string) {
  const hydrated = useSyncExternalStore(subscribeToHydration, () => true, () => false);
  const [today, setToday] = useState(() => dateKey(new Date()));
  const [supabase] = useState(() => createClient());
  const [initialDocument] = useState<PlannerLocalDocument>(() => {
    if (typeof window === 'undefined') return emptyLocalDocument();
    return readStoredDocument(userId);
  });
  const [state, setState] = useState<PlannerState>(initialDocument.state);
  const stateRef = useRef(initialDocument.state);
  const [cloudReady, setCloudReady] = useState(false);
  const cloudReadyRef = useRef(false);
  const saveTimerRef = useRef<number | null>(null);
  const revisionRef = useRef(initialDocument.revision);
  const dirtyRef = useRef(initialDocument.dirty);
  const localUpdatedAtRef = useRef(initialDocument.updatedAt);
  const syncingRef = useRef(false);
  const pendingFlushRef = useRef(false);
  const pullingRef = useRef(false);
  const [lastSavedAt, setLastSavedAt] = useState<number | null>(null);
  const [localSaveError, setLocalSaveError] = useState(false);
  const [syncStatus, setSyncStatus] = useState<PlannerSyncStatus>('loading');
  const ready = hydrated && cloudReady;

  const persistLocal = useCallback((document: PlannerLocalDocument) => {
    if (typeof window === 'undefined') return;
    const serialized = JSON.stringify(document);
    try {
      window.localStorage.setItem(scopedKey(STORAGE_KEY, userId), serialized);
      window.localStorage.setItem(MIGRATION_OWNER_KEY, userId);
      setLocalSaveError(false);
      try {
        window.localStorage.setItem(scopedKey(BACKUP_STORAGE_KEY, userId), serialized);
      } catch {
        // The primary copy is already safe; backup remains best-effort.
      }
    } catch {
      setLocalSaveError(true);
    }
  }, [userId]);

  const applyDocument = useCallback((document: PlannerLocalDocument) => {
    stateRef.current = document.state;
    revisionRef.current = document.revision;
    dirtyRef.current = document.dirty;
    localUpdatedAtRef.current = document.updatedAt;
    setState(document.state);
    persistLocal(document);
  }, [persistLocal]);

  const flushCloudSave = useCallback(async function flushCloudSave() {
    if (!cloudReadyRef.current) return;
    if (!navigator.onLine) {
      setSyncStatus('offline');
      return;
    }
    if (!dirtyRef.current) {
      setSyncStatus('synced');
      return;
    }
    if (syncingRef.current) {
      pendingFlushRef.current = true;
      return;
    }

    syncingRef.current = true;
    pendingFlushRef.current = false;
    setSyncStatus('saving');
    try {
      for (let attempt = 0; attempt < 4; attempt += 1) {
        const snapshot = stateRef.current;
        const snapshotUpdatedAt = localUpdatedAtRef.current;
        const expectedRevision = revisionRef.current;
        const { data, error } = await supabase
          .rpc('compare_and_swap_planner_document', {
            p_expected_revision: expectedRevision,
            p_state: snapshot,
          })
          .single();

        if (error || !data) {
          setSyncStatus(navigator.onLine ? 'error' : 'offline');
          return;
        }

        const result = data as CasResult;
        const remoteRevision = Number(result.revision) || 0;
        const remoteState = parsePlannerState(result.state);
        if (result.applied) {
          revisionRef.current = remoteRevision;
          setLastSavedAt(new Date(result.updated_at).getTime());
          if (snapshotUpdatedAt === localUpdatedAtRef.current && plannerStatesEqual(snapshot, stateRef.current)) {
            applyDocument(createLocalDocument(stateRef.current, {
              dirty: false,
              revision: remoteRevision,
              updatedAt: localUpdatedAtRef.current,
            }));
            setSyncStatus('synced');
            return;
          }
          persistLocal(createLocalDocument(stateRef.current, {
            dirty: true,
            revision: remoteRevision,
            updatedAt: localUpdatedAtRef.current,
          }));
          continue;
        }

        if (!remoteState) {
          revisionRef.current = 0;
          continue;
        }
        const merged = mergePlannerStates(stateRef.current, remoteState);
        const stillDirty = !plannerStatesEqual(merged, remoteState);
        applyDocument(createLocalDocument(merged, {
          dirty: stillDirty,
          revision: remoteRevision,
          updatedAt: Math.max(localUpdatedAtRef.current, plannerStateUpdatedAt(merged)),
        }));
        setLastSavedAt(new Date(result.updated_at).getTime());
        if (!stillDirty) {
          setSyncStatus('synced');
          return;
        }
      }
      setSyncStatus('error');
    } finally {
      syncingRef.current = false;
      if (pendingFlushRef.current) {
        pendingFlushRef.current = false;
        window.setTimeout(() => { void flushCloudSave(); }, 0);
      }
    }
  }, [applyDocument, persistLocal, supabase]);

  const scheduleCloudSave = useCallback((delay = CLOUD_SAVE_DELAY) => {
    if (saveTimerRef.current !== null) window.clearTimeout(saveTimerRef.current);
    setSyncStatus(navigator.onLine ? 'saving' : 'offline');
    if (!cloudReadyRef.current || !navigator.onLine) return;
    saveTimerRef.current = window.setTimeout(() => {
      saveTimerRef.current = null;
      void flushCloudSave();
    }, delay);
  }, [flushCloudSave]);

  const commit = useCallback((update: (current: PlannerState) => PlannerState) => {
    const current = stateRef.current;
    const next = update(current);
    if (next === current || plannerStatesEqual(next, current)) return;
    const updatedAt = nextMutationTimestamp(localUpdatedAtRef.current, plannerStateUpdatedAt(next));
    applyDocument(createLocalDocument(next, {
      dirty: true,
      revision: revisionRef.current,
      updatedAt,
    }));
    scheduleCloudSave();
  }, [applyDocument, scheduleCloudSave]);

  useEffect(() => {
    let cancelled = false;
    async function loadCloudState() {
      setSyncStatus('loading');
      const { data, error } = await supabase
        .from('planner_documents')
        .select('state, revision, updated_at')
        .eq('user_id', userId)
        .maybeSingle();
      if (cancelled) return;
      if (error) {
        cloudReadyRef.current = true;
        setCloudReady(true);
        setSyncStatus(navigator.onLine ? 'error' : 'offline');
        return;
      }
      if (data) {
        const remote = data as CloudDocument;
        const remoteState = parsePlannerState(remote.state);
        if (!remoteState) {
          cloudReadyRef.current = true;
          setCloudReady(true);
          setSyncStatus('error');
          return;
        }
        const next = dirtyRef.current ? mergePlannerStates(stateRef.current, remoteState) : remoteState;
        const remainsDirty = dirtyRef.current && !plannerStatesEqual(next, remoteState);
        applyDocument(createLocalDocument(next, {
          dirty: remainsDirty,
          revision: Number(remote.revision) || 0,
          updatedAt: Math.max(localUpdatedAtRef.current, plannerStateUpdatedAt(next)),
        }));
        setLastSavedAt(new Date(remote.updated_at).getTime());
      } else {
        applyDocument(createLocalDocument(stateRef.current, {
          dirty: true,
          revision: 0,
          updatedAt: localUpdatedAtRef.current || Date.now(),
        }));
      }
      cloudReadyRef.current = true;
      setCloudReady(true);
      if (dirtyRef.current) scheduleCloudSave(0);
      else setSyncStatus('synced');
    }

    void loadCloudState();
    return () => {
      cancelled = true;
      cloudReadyRef.current = false;
      if (saveTimerRef.current !== null) window.clearTimeout(saveTimerRef.current);
    };
  }, [applyDocument, scheduleCloudSave, supabase, userId]);

  useEffect(() => {
    function syncFromAnotherTab(event: StorageEvent) {
      const keys = [scopedKey(STORAGE_KEY, userId), scopedKey(BACKUP_STORAGE_KEY, userId)];
      if (!event.key || !keys.includes(event.key)) return;
      const incoming = readStoredDocument(userId);
      const shouldMerge = dirtyRef.current || incoming.dirty;
      const next = shouldMerge ? mergePlannerStates(stateRef.current, incoming.state) : incoming.state;
      const dirty = shouldMerge && (dirtyRef.current || incoming.dirty);
      applyDocument(createLocalDocument(next, {
        dirty,
        revision: Math.max(revisionRef.current, incoming.revision),
        updatedAt: Math.max(localUpdatedAtRef.current, incoming.updatedAt),
      }));
      if (dirty) scheduleCloudSave();
    }
    window.addEventListener('storage', syncFromAnotherTab);
    return () => window.removeEventListener('storage', syncFromAnotherTab);
  }, [applyDocument, scheduleCloudSave, userId]);

  const reconcileWithCloud = useCallback(async () => {
    if (!navigator.onLine || pullingRef.current) return;
    pullingRef.current = true;
    setSyncStatus('loading');
    try {
      const { data, error } = await supabase
        .from('planner_documents')
        .select('state, revision, updated_at')
        .eq('user_id', userId)
        .maybeSingle();
      if (error) {
        setSyncStatus('error');
        return;
      }
      if (!data) {
        applyDocument(createLocalDocument(stateRef.current, {
          dirty: true,
          revision: 0,
          updatedAt: localUpdatedAtRef.current || Date.now(),
        }));
        await flushCloudSave();
        return;
      }
      const remote = data as CloudDocument;
      const remoteState = parsePlannerState(remote.state);
      if (!remoteState) {
        setSyncStatus('error');
        return;
      }
      const next = dirtyRef.current ? mergePlannerStates(stateRef.current, remoteState) : remoteState;
      const remainsDirty = dirtyRef.current && !plannerStatesEqual(next, remoteState);
      applyDocument(createLocalDocument(next, {
        dirty: remainsDirty,
        revision: Number(remote.revision) || 0,
        updatedAt: Math.max(localUpdatedAtRef.current, plannerStateUpdatedAt(next)),
      }));
      setLastSavedAt(new Date(remote.updated_at).getTime());
      if (remainsDirty) await flushCloudSave();
      else setSyncStatus('synced');
    } finally {
      pullingRef.current = false;
    }
  }, [applyDocument, flushCloudSave, supabase, userId]);

  useEffect(() => {
    function online() { void reconcileWithCloud(); }
    function offline() { setSyncStatus('offline'); }
    function visible() {
      if (document.visibilityState === 'visible' && navigator.onLine) void reconcileWithCloud();
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
  }, [reconcileWithCloud]);

  useEffect(() => {
    if (!cloudReady) return;
    const channel = supabase
      .channel(`planner-document-${userId}`)
      .on('postgres_changes', {
        event: '*',
        schema: 'public',
        table: 'planner_documents',
        filter: `user_id=eq.${userId}`,
      }, (payload) => {
        const remote = payload.new as Partial<CloudDocument>;
        const remoteRevision = Number(remote.revision) || 0;
        if (remoteRevision <= revisionRef.current) return;
        const remoteState = parsePlannerState(remote.state);
        if (!remoteState) return;
        const next = dirtyRef.current ? mergePlannerStates(stateRef.current, remoteState) : remoteState;
        const remainsDirty = dirtyRef.current && !plannerStatesEqual(next, remoteState);
        applyDocument(createLocalDocument(next, {
          dirty: remainsDirty,
          revision: remoteRevision,
          updatedAt: Math.max(localUpdatedAtRef.current, plannerStateUpdatedAt(next)),
        }));
        setLastSavedAt(remote.updated_at ? new Date(remote.updated_at).getTime() : Date.now());
        if (remainsDirty) scheduleCloudSave(0);
        else setSyncStatus('synced');
      })
      .subscribe();
    return () => { void supabase.removeChannel(channel); };
  }, [applyDocument, cloudReady, scheduleCloudSave, supabase, userId]);

  useEffect(() => {
    let timer: number | null = null;
    function refreshToday() {
      const now = new Date();
      setToday(dateKey(now));
      if (timer !== null) window.clearTimeout(timer);
      timer = window.setTimeout(refreshToday, millisecondsUntilNextLocalDay(now));
    }
    function visible() {
      if (document.visibilityState === 'visible') refreshToday();
    }
    refreshToday();
    window.addEventListener('focus', refreshToday);
    window.addEventListener('pageshow', refreshToday);
    document.addEventListener('visibilitychange', visible);
    return () => {
      if (timer !== null) window.clearTimeout(timer);
      window.removeEventListener('focus', refreshToday);
      window.removeEventListener('pageshow', refreshToday);
      document.removeEventListener('visibilitychange', visible);
    };
  }, []);

  useEffect(() => {
    function flushBeforeSuspend() {
      if (dirtyRef.current && navigator.onLine) void flushCloudSave();
    }
    window.addEventListener('pagehide', flushBeforeSuspend);
    return () => window.removeEventListener('pagehide', flushBeforeSuspend);
  }, [flushCloudSave]);

  const { tasks, goals, scheduleBlocks, theme } = state;

  const upsertTask = useCallback((task: PlannerTask) => {
    commit((current) => {
      const existing = current.tasks.find((item) => item.id === task.id);
      const updatedAt = nextMutationTimestamp(existing?.updatedAt, current.tombstones.tasks[task.id]);
      const normalized = normalizeTask({ ...task, updatedAt });
      const nextTasks = existing
        ? current.tasks.map((item) => item.id === normalized.id ? normalized : item)
        : [...current.tasks, normalized];
      return { ...current, tasks: nextTasks };
    });
  }, [commit]);

  const deleteTask = useCallback((taskId: string) => {
    commit((current) => {
      const task = current.tasks.find((item) => item.id === taskId);
      const deletedAt = nextMutationTimestamp(task?.updatedAt, current.tombstones.tasks[taskId]);
      return {
        ...current,
        tasks: current.tasks.filter((item) => item.id !== taskId),
        tombstones: { ...current.tombstones, tasks: { ...current.tombstones.tasks, [taskId]: deletedAt } },
      };
    });
  }, [commit]);

  const toggleTask = useCallback((taskId: string, occurrenceDate?: string) => {
    commit((current) => ({ ...current, tasks: current.tasks.map((task) => {
      if (task.id !== taskId) return task;
      const updatedAt = nextMutationTimestamp(task.updatedAt, current.tombstones.tasks[taskId]);
      if (task.repeat !== 'none') {
        const date = occurrenceDate ?? today;
        const checked = task.completionDates.includes(date);
        return {
          ...task,
          completionDates: checked
            ? task.completionDates.filter((item) => item !== date)
            : [...task.completionDates, date].sort(),
          updatedAt,
        };
      }
      return { ...task, completed: !task.completed, updatedAt };
    }) }));
  }, [commit, today]);

  const duplicateTask = useCallback((taskId: string) => {
    commit((current) => {
      const original = current.tasks.find((task) => task.id === taskId);
      if (!original) return current;
      const now = nextMutationTimestamp(original.updatedAt);
      return { ...current, tasks: [...current.tasks, {
        ...original,
        id: `task-${now}-${Math.random().toString(36).slice(2, 7)}`,
        title: `${original.title} 복사본`,
        completed: false,
        completionDates: [],
        occurrenceDate: undefined,
        generatedBy: undefined,
        generatedKey: undefined,
        createdAt: now,
        updatedAt: now,
      }] };
    });
  }, [commit]);

  const moveTask = useCallback((taskId: string, date: string, start?: string | null) => {
    commit((current) => ({ ...current, tasks: current.tasks.map((task) => task.id === taskId
      ? {
        ...task,
        date,
        start: start === undefined ? task.start : start,
        updatedAt: nextMutationTimestamp(task.updatedAt, current.tombstones.tasks[taskId]),
      }
      : task) }));
  }, [commit]);

  const upsertGoal = useCallback((goal: PlanGoal) => {
    commit((current) => {
      const existing = current.goals.find((item) => item.id === goal.id);
      const updatedAt = nextMutationTimestamp(existing?.updatedAt, current.tombstones.goals[goal.id]);
      const saved = normalizeGoal({ ...goal, updatedAt });
      const nextGoals = existing
        ? current.goals.map((item) => item.id === goal.id ? saved : item)
        : [...current.goals, saved];
      let nextTasks = current.tasks.map((task) => task.goalId === saved.id
        ? { ...task, goal: saved.title, updatedAt: nextMutationTimestamp(task.updatedAt) }
        : task);
      const deadlineChanged = !existing
        || existing.deadline !== saved.deadline
        || existing.deadlinePlan !== saved.deadlinePlan;
      const generatedDetailsChanged = saved.deadlinePlan === 'application' && (deadlineChanged
        || !existing
        || existing.title !== saved.title
        || existing.color !== saved.color);
      if (generatedDetailsChanged) {
        nextTasks = syncApplicationPreparationTasks(nextTasks, saved, updatedAt, deadlineChanged);
      }
      return { ...current, goals: nextGoals, tasks: nextTasks };
    });
  }, [commit]);

  const deleteGoal = useCallback((goalId: string) => {
    commit((current) => {
      const remove = new Set([goalId]);
      let changed = true;
      while (changed) {
        changed = false;
        for (const goal of current.goals) {
          if (goal.parentId && remove.has(goal.parentId) && !remove.has(goal.id)) {
            remove.add(goal.id);
            changed = true;
          }
        }
      }
      const goalTombstones = { ...current.tombstones.goals };
      for (const id of remove) {
        const goal = current.goals.find((item) => item.id === id);
        goalTombstones[id] = nextMutationTimestamp(goal?.updatedAt, goalTombstones[id]);
      }
      return {
        ...current,
        goals: current.goals.filter((goal) => !remove.has(goal.id)),
        tasks: current.tasks.map((task) => task.goalId && remove.has(task.goalId)
          ? { ...task, goalId: null, goal: '', updatedAt: nextMutationTimestamp(task.updatedAt) }
          : task),
        tombstones: { ...current.tombstones, goals: goalTombstones },
      };
    });
  }, [commit]);

  const toggleGoalCheck = useCallback((goalId: string, date: string) => {
    commit((current) => ({ ...current, goals: current.goals.map((goal) => {
      if (goal.id !== goalId) return goal;
      const checked = goal.checkins.includes(date);
      return {
        ...goal,
        checkins: checked ? goal.checkins.filter((item) => item !== date) : [...goal.checkins, date].sort(),
        updatedAt: nextMutationTimestamp(goal.updatedAt, current.tombstones.goals[goalId]),
      };
    }) }));
  }, [commit]);

  const upsertScheduleBlock = useCallback((block: ScheduleBlock) => {
    commit((current) => {
      const existing = current.scheduleBlocks.find((item) => item.id === block.id);
      const saved = {
        ...block,
        updatedAt: nextMutationTimestamp(existing?.updatedAt, current.tombstones.scheduleBlocks[block.id]),
      };
      const next = existing
        ? current.scheduleBlocks.map((item) => item.id === block.id ? saved : item)
        : [...current.scheduleBlocks, saved];
      return { ...current, scheduleBlocks: next.sort((a, b) => a.start.localeCompare(b.start)) };
    });
  }, [commit]);

  const deleteScheduleBlock = useCallback((blockId: string) => {
    commit((current) => {
      const block = current.scheduleBlocks.find((item) => item.id === blockId);
      const deletedAt = nextMutationTimestamp(block?.updatedAt, current.tombstones.scheduleBlocks[blockId]);
      return {
        ...current,
        scheduleBlocks: current.scheduleBlocks.filter((item) => item.id !== blockId),
        tombstones: {
          ...current.tombstones,
          scheduleBlocks: { ...current.tombstones.scheduleBlocks, [blockId]: deletedAt },
        },
      };
    });
  }, [commit]);

  const setTheme = useCallback((nextTheme: Theme) => {
    commit((current) => current.theme === nextTheme ? current : ({
        ...current,
        theme: nextTheme,
        metadata: { themeUpdatedAt: nextMutationTimestamp(current.metadata.themeUpdatedAt) },
      }));
  }, [commit]);

  const markViewIntroduced = useCallback((view: PlannerView) => {
    commit((current) => current.introducedViews.includes(view)
      ? current
      : { ...current, introducedViews: [...current.introducedViews, view] });
  }, [commit]);

  const exportBackup = useCallback(() => {
    const backup: PlannerBackup = {
      format: 'flowday-backup',
      schemaVersion: 7,
      exportedAt: new Date().toISOString(),
      data: stateRef.current,
    };
    return JSON.stringify(backup, null, 2);
  }, []);

  const importBackup = useCallback((raw: string) => {
    try {
      const imported = parsePlannerState(JSON.parse(raw));
      if (!imported) return { ok: false as const, message: 'Flowday 백업 파일 형식을 확인해주세요.' };
      try {
        window.localStorage.setItem(scopedKey(RECOVERY_STORAGE_KEY, userId), JSON.stringify(stateRef.current));
      } catch {
        // Import can continue in memory even when recovery storage is unavailable.
      }
      const timestamp = nextMutationTimestamp(localUpdatedAtRef.current, plannerStateUpdatedAt(imported));
      const next = replacementPlannerState(stateRef.current, imported, timestamp);
      commit(() => next);
      return { ok: true as const, message: `${next.tasks.length}개 할 일, ${next.goals.length}개 계획을 복구했습니다.` };
    } catch {
      return { ok: false as const, message: '파일을 읽을 수 없습니다. JSON 백업 파일인지 확인해주세요.' };
    }
  }, [commit, userId]);

  const restoreRecovery = useCallback(() => {
    try {
      const stored = window.localStorage.getItem(scopedKey(RECOVERY_STORAGE_KEY, userId));
      if (!stored) return { ok: false as const, message: '되돌릴 데이터가 없습니다.' };
      const previous = parsePlannerState(JSON.parse(stored));
      if (!previous) return { ok: false as const, message: '복구 데이터가 손상되었습니다.' };
      const current = stateRef.current;
      window.localStorage.setItem(scopedKey(RECOVERY_STORAGE_KEY, userId), JSON.stringify(current));
      const timestamp = nextMutationTimestamp(localUpdatedAtRef.current, plannerStateUpdatedAt(previous));
      commit(() => replacementPlannerState(current, previous, timestamp));
      return { ok: true as const, message: '직전 데이터로 되돌렸습니다.' };
    } catch {
      return { ok: false as const, message: '복구 저장소를 사용할 수 없습니다.' };
    }
  }, [commit, userId]);

  const clearLocalPlannerData = useCallback(() => {
    try {
      [STORAGE_KEY, BACKUP_STORAGE_KEY, RECOVERY_STORAGE_KEY, LEGACY_V6_STORAGE_KEY, LEGACY_V6_BACKUP_STORAGE_KEY]
        .map((key) => scopedKey(key, userId))
        .forEach((key) => window.localStorage.removeItem(key));
      const owner = window.localStorage.getItem(MIGRATION_OWNER_KEY)
        ?? window.localStorage.getItem(LEGACY_MIGRATION_OWNER_KEY);
      if (owner === userId) {
        [
          LEGACY_V6_STORAGE_KEY,
          LEGACY_V6_BACKUP_STORAGE_KEY,
          LEGACY_V5_STORAGE_KEY,
          LEGACY_V5_BACKUP_STORAGE_KEY,
          LEGACY_V4_STORAGE_KEY,
          LEGACY_V3_STORAGE_KEY,
          LEGACY_V2_STORAGE_KEY,
        ].forEach((key) => window.localStorage.removeItem(key));
        window.localStorage.removeItem(MIGRATION_OWNER_KEY);
        window.localStorage.removeItem(LEGACY_MIGRATION_OWNER_KEY);
      }
    } catch {
      // The server has already deleted the account; Clear-Site-Data remains the fallback.
    }
  }, [userId]);

  const resetPlanner = useCallback(() => {
    try {
      window.localStorage.setItem(scopedKey(RECOVERY_STORAGE_KEY, userId), JSON.stringify(stateRef.current));
    } catch {
      // Reset remains available even when recovery storage is unavailable.
    }
    const timestamp = nextMutationTimestamp(localUpdatedAtRef.current, plannerStateUpdatedAt(stateRef.current));
    commit((current) => replacementPlannerState(current, defaultPlannerState(), timestamp));
  }, [commit, userId]);

  const todayTasks = useMemo(() => tasksForDate(tasks, today), [tasks, today]);
  const completedToday = useMemo(
    () => todayTasks.filter((task) => taskCompletedOn(task, today)).length,
    [todayTasks, today],
  );

  return {
    ready,
    today,
    tasks,
    todayTasks,
    goals,
    scheduleBlocks,
    theme,
    introducedViews: state.introducedViews,
    lastSavedAt,
    saveError: localSaveError || syncStatus === 'error',
    syncStatus,
    completedToday,
    upsertTask,
    deleteTask,
    toggleTask,
    duplicateTask,
    moveTask,
    upsertGoal,
    deleteGoal,
    toggleGoalCheck,
    upsertScheduleBlock,
    deleteScheduleBlock,
    setTheme,
    markViewIntroduced,
    exportBackup,
    importBackup,
    restoreRecovery,
    clearLocalPlannerData,
    resetPlanner,
  };
}

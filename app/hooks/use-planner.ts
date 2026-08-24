'use client';

import { useCallback, useEffect, useMemo, useRef, useState, useSyncExternalStore } from 'react';
import { createClient } from '../lib/supabase/client';
import {
  dateKey,
  normalizeGoal,
  normalizeTask,
  PlanGoal,
  PlannerState,
  PlannerTask,
  ScheduleBlock,
  taskCompletedOn,
  tasksForDate,
  Theme,
} from '../lib/planner';

const STORAGE_KEY = 'flowday:planner:v6';
const BACKUP_STORAGE_KEY = 'flowday:planner:backup:v6';
const RECOVERY_STORAGE_KEY = 'flowday:planner:recovery:v6';
const LEGACY_V5_STORAGE_KEY = 'flowday:planner:v5';
const LEGACY_V5_BACKUP_STORAGE_KEY = 'flowday:planner:backup:v5';
const LEGACY_V4_STORAGE_KEY = 'flowday:planner:v4';
const LEGACY_V3_STORAGE_KEY = 'flowday:planner:v3';
const LEGACY_V2_STORAGE_KEY = 'flowday:planner:v2';
const MIGRATION_OWNER_KEY = 'flowday:planner:migration-owner:v6';
const subscribeToHydration = () => () => undefined;

export type PlannerSyncStatus = 'loading' | 'saving' | 'synced' | 'offline' | 'error';

type StoredPlannerState = Omit<PlannerState, 'version' | 'onboardingCompleted'> & {
  version: 5 | 6;
  onboardingCompleted?: boolean;
};

type PlannerBackup = {
  format: 'flowday-backup';
  schemaVersion: 6;
  exportedAt: string;
  data: PlannerState;
};

function defaultState(): PlannerState {
  return { version: 6, tasks: [], goals: [], scheduleBlocks: [], theme: 'light', onboardingCompleted: false };
}

function userCreatedTasks(tasks: PlannerTask[]) {
  return tasks.filter((task) => !task.id.startsWith('seed-')).map(normalizeTask);
}

function normalizeTheme(theme: unknown): Theme {
  return theme === 'dim' || theme === 'dark' ? theme : 'light';
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return Boolean(value) && typeof value === 'object';
}

function hasValidTaskShape(value: unknown) {
  return isRecord(value)
    && typeof value.id === 'string'
    && typeof value.title === 'string'
    && typeof value.date === 'string'
    && (value.start === null || typeof value.start === 'string')
    && typeof value.duration === 'number';
}

function hasValidGoalShape(value: unknown) {
  return isRecord(value) && typeof value.id === 'string' && typeof value.title === 'string';
}

function hasValidBlockShape(value: unknown) {
  return isRecord(value)
    && typeof value.id === 'string'
    && typeof value.name === 'string'
    && typeof value.start === 'string'
    && typeof value.end === 'string';
}

function upgradeState(state: StoredPlannerState): PlannerState {
  const goals = state.goals.map(normalizeGoal);
  const goalIds = new Set(goals.map((goal) => goal.id));
  const tasks = state.tasks.map(normalizeTask).map((task) => {
    const linkedGoal = task.goalId && goalIds.has(task.goalId)
      ? goals.find((goal) => goal.id === task.goalId)
      : goals.find((goal) => goal.title === task.goal);
    return {
      ...task,
      goalId: linkedGoal?.id ?? null,
      goal: linkedGoal?.title ?? task.goal,
    };
  });
  return {
    version: 6,
    tasks,
    goals,
    scheduleBlocks: state.scheduleBlocks,
    theme: normalizeTheme(state.theme),
    onboardingCompleted: Boolean(state.onboardingCompleted),
  };
}

function parsePlannerState(value: unknown): PlannerState | null {
  if (!value || typeof value !== 'object') return null;
  const envelope = value as Partial<PlannerBackup>;
  const candidate = envelope.format === 'flowday-backup' ? envelope.data : value;
  if (!candidate || typeof candidate !== 'object') return null;
  const state = candidate as Partial<StoredPlannerState>;

  if ((state.version === 5 || state.version === 6) && Array.isArray(state.tasks) && Array.isArray(state.goals) && Array.isArray(state.scheduleBlocks)) {
    if (!state.tasks.every(hasValidTaskShape) || !state.goals.every(hasValidGoalShape) || !state.scheduleBlocks.every(hasValidBlockShape)) return null;
    return upgradeState(state as StoredPlannerState);
  }

  const legacy = candidate as {
    version?: number;
    tasks?: PlannerTask[];
    goals?: PlanGoal[];
    theme?: Theme;
  };
  if (legacy.version === 4 && Array.isArray(legacy.tasks) && Array.isArray(legacy.goals)) {
    if (!legacy.tasks.every(hasValidTaskShape) || !legacy.goals.every(hasValidGoalShape)) return null;
    return upgradeState({
      version: 5,
      tasks: legacy.tasks,
      goals: legacy.goals,
      scheduleBlocks: [],
      theme: normalizeTheme(legacy.theme),
    });
  }
  if ((legacy.version === 2 || legacy.version === 3) && Array.isArray(legacy.tasks)) {
    if (!legacy.tasks.every(hasValidTaskShape)) return null;
    return upgradeState({
      version: 5,
      tasks: userCreatedTasks(legacy.tasks),
      goals: [],
      scheduleBlocks: [],
      theme: normalizeTheme(legacy.theme),
    });
  }
  return null;
}

function scopedKey(key: string, userId: string) {
  return `${key}:${userId}`;
}

function readStoredState(userId: string): PlannerState {
  const migrationOwner = window.localStorage.getItem(MIGRATION_OWNER_KEY);
  const legacyKeys = !migrationOwner || migrationOwner === userId ? [
    STORAGE_KEY,
    BACKUP_STORAGE_KEY,
    LEGACY_V5_STORAGE_KEY,
    LEGACY_V5_BACKUP_STORAGE_KEY,
    LEGACY_V4_STORAGE_KEY,
    LEGACY_V3_STORAGE_KEY,
    LEGACY_V2_STORAGE_KEY,
  ] : [];
  for (const key of [
    scopedKey(STORAGE_KEY, userId),
    scopedKey(BACKUP_STORAGE_KEY, userId),
    ...legacyKeys,
  ]) {
    try {
      const stored = window.localStorage.getItem(key);
      if (!stored) continue;
      const parsed = parsePlannerState(JSON.parse(stored));
      if (parsed) return parsed;
    } catch {
      // Try the next recovery or legacy copy.
    }
  }

  return defaultState();
}

export function usePlanner(userId: string) {
  const hydrated = useSyncExternalStore(subscribeToHydration, () => true, () => false);
  const [today] = useState(() => dateKey(new Date()));
  const [supabase] = useState(() => createClient());
  const [initialState] = useState<PlannerState>(() => {
    if (typeof window === 'undefined') return defaultState();
    return readStoredState(userId);
  });
  const [state, setState] = useState<PlannerState>(initialState);
  const stateRef = useRef(initialState);
  const [cloudReady, setCloudReady] = useState(false);
  const cloudReadyRef = useRef(false);
  const saveTimerRef = useRef<number | null>(null);
  const revisionRef = useRef(0);
  const dirtyRef = useRef(false);
  const pullingRef = useRef(false);
  const [lastSavedAt, setLastSavedAt] = useState<number | null>(null);
  const [localSaveError, setLocalSaveError] = useState(false);
  const [syncStatus, setSyncStatus] = useState<PlannerSyncStatus>('loading');
  const ready = hydrated && cloudReady;

  const persistLocal = useCallback((next: PlannerState) => {
    if (typeof window === 'undefined') return;
    const serialized = JSON.stringify(next);
    try {
      window.localStorage.setItem(scopedKey(STORAGE_KEY, userId), serialized);
      if (!window.localStorage.getItem(MIGRATION_OWNER_KEY)) {
        window.localStorage.setItem(MIGRATION_OWNER_KEY, userId);
      }
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

  const scheduleCloudSave = useCallback((next: PlannerState) => {
    if (!cloudReadyRef.current) return;
    dirtyRef.current = true;
    if (saveTimerRef.current !== null) window.clearTimeout(saveTimerRef.current);
    const revision = Math.max(Date.now(), revisionRef.current + 1);
    revisionRef.current = revision;
    setSyncStatus(navigator.onLine ? 'saving' : 'offline');

    saveTimerRef.current = window.setTimeout(async () => {
      saveTimerRef.current = null;
      if (!navigator.onLine) {
        setSyncStatus('offline');
        return;
      }
      const savedAt = new Date().toISOString();
      const { error } = await supabase.from('planner_documents').upsert({
        user_id: userId,
        state: next,
        revision,
        updated_at: savedAt,
      }, { onConflict: 'user_id' });

      if (error) {
        setSyncStatus('error');
        return;
      }
      if (revisionRef.current === revision) {
        dirtyRef.current = false;
        setSyncStatus('synced');
      }
      setLastSavedAt(new Date(savedAt).getTime());
    }, 650);
  }, [supabase, userId]);

  const commit = useCallback((update: (current: PlannerState) => PlannerState) => {
    const next = update(stateRef.current);
    stateRef.current = next;
    setState(next);
    persistLocal(next);
    scheduleCloudSave(next);
  }, [persistLocal, scheduleCloudSave]);

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
        const cloudState = parsePlannerState(data.state);
        if (cloudState) {
          stateRef.current = cloudState;
          setState(cloudState);
          persistLocal(cloudState);
          revisionRef.current = Number(data.revision) || 0;
          dirtyRef.current = false;
          setLastSavedAt(new Date(data.updated_at).getTime());
        } else {
          cloudReadyRef.current = true;
          setCloudReady(true);
          setSyncStatus('error');
          return;
        }
      } else {
        const revision = Date.now();
        const savedAt = new Date().toISOString();
        const { error: createError } = await supabase.from('planner_documents').insert({
          user_id: userId,
          state: stateRef.current,
          revision,
          updated_at: savedAt,
        });
        if (cancelled) return;
        if (createError) {
          cloudReadyRef.current = true;
          setCloudReady(true);
          setSyncStatus('error');
          return;
        }
        revisionRef.current = revision;
        dirtyRef.current = false;
        setLastSavedAt(new Date(savedAt).getTime());
      }

      cloudReadyRef.current = true;
      setCloudReady(true);
      setSyncStatus('synced');
    }

    void loadCloudState();
    return () => {
      cancelled = true;
      cloudReadyRef.current = false;
      if (saveTimerRef.current !== null) window.clearTimeout(saveTimerRef.current);
    };
  }, [persistLocal, supabase, userId]);

  useEffect(() => {
    function syncFromAnotherTab(event: StorageEvent) {
      const primaryKey = scopedKey(STORAGE_KEY, userId);
      const backupKey = scopedKey(BACKUP_STORAGE_KEY, userId);
      if (event.key !== primaryKey && event.key !== backupKey) return;
      const next = readStoredState(userId);
      stateRef.current = next;
      setState(next);
      setLocalSaveError(false);
      scheduleCloudSave(next);
    }
    window.addEventListener('storage', syncFromAnotherTab);
    return () => window.removeEventListener('storage', syncFromAnotherTab);
  }, [scheduleCloudSave, userId]);

  useEffect(() => {
    async function online() {
      if (dirtyRef.current) {
        scheduleCloudSave(stateRef.current);
        return;
      }
      if (pullingRef.current) return;

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
          scheduleCloudSave(stateRef.current);
          return;
        }
        const revision = Number(data.revision) || 0;
        const next = parsePlannerState(data.state);
        if (next && revision > revisionRef.current) {
          revisionRef.current = revision;
          stateRef.current = next;
          setState(next);
          persistLocal(next);
          setLastSavedAt(new Date(data.updated_at).getTime());
        }
        setSyncStatus('synced');
      } finally {
        pullingRef.current = false;
      }
    }
    function offline() {
      setSyncStatus('offline');
    }
    function visible() {
      if (document.visibilityState === 'visible' && navigator.onLine) void online();
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
  }, [persistLocal, scheduleCloudSave, supabase, userId]);

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
        const remote = payload.new as { state?: unknown; revision?: number; updated_at?: string };
        const revision = Number(remote.revision) || 0;
        if (revision <= revisionRef.current) return;
        const next = parsePlannerState(remote.state);
        if (!next) return;
        revisionRef.current = revision;
        dirtyRef.current = false;
        stateRef.current = next;
        setState(next);
        persistLocal(next);
        setLastSavedAt(remote.updated_at ? new Date(remote.updated_at).getTime() : Date.now());
        setSyncStatus('synced');
      })
      .subscribe();

    return () => { void supabase.removeChannel(channel); };
  }, [cloudReady, persistLocal, supabase, userId]);

  const { tasks, goals, scheduleBlocks, theme } = state;

  const upsertTask = useCallback((task: PlannerTask) => {
    commit((current) => {
      const normalized = normalizeTask({ ...task, updatedAt: Date.now() });
      const exists = current.tasks.some((item) => item.id === normalized.id);
      const nextTasks = exists
        ? current.tasks.map((item) => item.id === normalized.id ? normalized : item)
        : [...current.tasks, normalized];
      return { ...current, tasks: nextTasks };
    });
  }, [commit]);

  const deleteTask = useCallback((taskId: string) => {
    commit((current) => ({ ...current, tasks: current.tasks.filter((task) => task.id !== taskId) }));
  }, [commit]);

  const toggleTask = useCallback((taskId: string, occurrenceDate?: string) => {
    commit((current) => ({ ...current, tasks: current.tasks.map((task) => {
      if (task.id !== taskId) return task;
      if (task.repeat !== 'none') {
        const date = occurrenceDate ?? today;
        const checked = task.completionDates.includes(date);
        return {
          ...task,
          completionDates: checked
            ? task.completionDates.filter((item) => item !== date)
            : [...task.completionDates, date].sort(),
          updatedAt: Date.now(),
        };
      }
      return { ...task, completed: !task.completed, updatedAt: Date.now() };
    }) }));
  }, [commit, today]);

  const duplicateTask = useCallback((taskId: string) => {
    commit((current) => {
      const original = current.tasks.find((task) => task.id === taskId);
      if (!original) return current;
      const now = Date.now();
      return { ...current, tasks: [...current.tasks, {
        ...original,
        id: `task-${now}-${Math.random().toString(36).slice(2, 7)}`,
        title: `${original.title} 복사본`,
        completed: false,
        completionDates: [],
        occurrenceDate: undefined,
        createdAt: now,
        updatedAt: now,
      }] };
    });
  }, [commit]);

  const moveTask = useCallback((taskId: string, date: string, start?: string | null) => {
    commit((current) => ({ ...current, tasks: current.tasks.map((task) => task.id === taskId
      ? { ...task, date, start: start === undefined ? task.start : start, updatedAt: Date.now() }
      : task) }));
  }, [commit]);

  const upsertGoal = useCallback((goal: PlanGoal) => {
    commit((current) => {
      const saved = normalizeGoal({ ...goal, updatedAt: Date.now() });
      const exists = current.goals.some((item) => item.id === goal.id);
      const nextGoals = exists
        ? current.goals.map((item) => item.id === goal.id ? saved : item)
        : [...current.goals, saved];
      const nextTasks = current.tasks.map((task) => task.goalId === saved.id
        ? { ...task, goal: saved.title, updatedAt: Date.now() }
        : task);
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
      return {
        ...current,
        goals: current.goals.filter((goal) => !remove.has(goal.id)),
        tasks: current.tasks.map((task) => task.goalId && remove.has(task.goalId)
          ? { ...task, goalId: null, goal: '', updatedAt: Date.now() }
          : task),
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
        updatedAt: Date.now(),
      };
    }) }));
  }, [commit]);

  const upsertScheduleBlock = useCallback((block: ScheduleBlock) => {
    commit((current) => {
      const saved = { ...block, updatedAt: Date.now() };
      const exists = current.scheduleBlocks.some((item) => item.id === block.id);
      const next = exists
        ? current.scheduleBlocks.map((item) => item.id === block.id ? saved : item)
        : [...current.scheduleBlocks, saved];
      return { ...current, scheduleBlocks: next.sort((a, b) => a.start.localeCompare(b.start)) };
    });
  }, [commit]);

  const deleteScheduleBlock = useCallback((blockId: string) => {
    commit((current) => ({ ...current, scheduleBlocks: current.scheduleBlocks.filter((block) => block.id !== blockId) }));
  }, [commit]);

  const setTheme = useCallback((nextTheme: Theme) => {
    commit((current) => ({ ...current, theme: nextTheme }));
  }, [commit]);

  const setOnboardingCompleted = useCallback((completed: boolean) => {
    commit((current) => ({ ...current, onboardingCompleted: completed }));
  }, [commit]);

  const exportBackup = useCallback(() => {
    const backup: PlannerBackup = {
      format: 'flowday-backup',
      schemaVersion: 6,
      exportedAt: new Date().toISOString(),
      data: stateRef.current,
    };
    return JSON.stringify(backup, null, 2);
  }, []);

  const importBackup = useCallback((raw: string) => {
    try {
      const next = parsePlannerState(JSON.parse(raw));
      if (!next) return { ok: false as const, message: 'Flowday 백업 파일 형식을 확인해주세요.' };
      try {
        window.localStorage.setItem(scopedKey(RECOVERY_STORAGE_KEY, userId), JSON.stringify(stateRef.current));
      } catch {
        // Import can continue in memory even when recovery storage is unavailable.
      }
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
      commit(() => previous);
      return { ok: true as const, message: '직전 데이터로 되돌렸습니다.' };
    } catch {
      return { ok: false as const, message: '복구 저장소를 사용할 수 없습니다.' };
    }
  }, [commit, userId]);

  const resetPlanner = useCallback(() => {
    try {
      window.localStorage.setItem(scopedKey(RECOVERY_STORAGE_KEY, userId), JSON.stringify(stateRef.current));
    } catch {
      // Reset remains available even when recovery storage is unavailable.
    }
    commit(() => defaultState());
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
    onboardingCompleted: state.onboardingCompleted,
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
    setOnboardingCompleted,
    exportBackup,
    importBackup,
    restoreRecovery,
    resetPlanner,
  };
}

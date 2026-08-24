'use client';

import { useCallback, useEffect, useMemo, useRef, useState, useSyncExternalStore } from 'react';
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
const subscribeToHydration = () => () => undefined;

type StoredPlannerState = Omit<PlannerState, 'version'> & { version: 5 | 6 };

type PlannerBackup = {
  format: 'flowday-backup';
  schemaVersion: 6;
  exportedAt: string;
  data: PlannerState;
};

function defaultState(): PlannerState {
  return { version: 6, tasks: [], goals: [], scheduleBlocks: [], theme: 'light' };
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

function readStoredState(): PlannerState {
  for (const key of [STORAGE_KEY, BACKUP_STORAGE_KEY, LEGACY_V5_STORAGE_KEY, LEGACY_V5_BACKUP_STORAGE_KEY, LEGACY_V4_STORAGE_KEY, LEGACY_V3_STORAGE_KEY, LEGACY_V2_STORAGE_KEY]) {
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

export function usePlanner() {
  const ready = useSyncExternalStore(subscribeToHydration, () => true, () => false);
  const [today] = useState(() => dateKey(new Date()));
  const [initialState] = useState<PlannerState>(() => {
    if (typeof window === 'undefined') return defaultState();
    return readStoredState();
  });
  const [state, setState] = useState<PlannerState>(initialState);
  const stateRef = useRef(initialState);
  const [lastSavedAt, setLastSavedAt] = useState<number | null>(null);
  const [saveError, setSaveError] = useState(false);

  const persist = useCallback((next: PlannerState) => {
    if (typeof window === 'undefined') return;
    const serialized = JSON.stringify(next);
    try {
      window.localStorage.setItem(STORAGE_KEY, serialized);
      setLastSavedAt(Date.now());
      setSaveError(false);
      try {
        window.localStorage.setItem(BACKUP_STORAGE_KEY, serialized);
      } catch {
        // The primary copy is already safe; backup remains best-effort.
      }
    } catch {
      setSaveError(true);
    }
  }, []);

  const commit = useCallback((update: (current: PlannerState) => PlannerState) => {
    const next = update(stateRef.current);
    stateRef.current = next;
    setState(next);
    persist(next);
  }, [persist]);

  useEffect(() => {
    if (ready) persist(stateRef.current);
  }, [persist, ready]);

  useEffect(() => {
    function syncFromAnotherTab(event: StorageEvent) {
      if (event.key !== STORAGE_KEY && event.key !== BACKUP_STORAGE_KEY) return;
      const next = readStoredState();
      stateRef.current = next;
      setState(next);
      setSaveError(false);
    }
    window.addEventListener('storage', syncFromAnotherTab);
    return () => window.removeEventListener('storage', syncFromAnotherTab);
  }, []);

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
        window.localStorage.setItem(RECOVERY_STORAGE_KEY, JSON.stringify(stateRef.current));
      } catch {
        // Import can continue in memory even when recovery storage is unavailable.
      }
      commit(() => next);
      return { ok: true as const, message: `${next.tasks.length}개 할 일, ${next.goals.length}개 계획을 복구했습니다.` };
    } catch {
      return { ok: false as const, message: '파일을 읽을 수 없습니다. JSON 백업 파일인지 확인해주세요.' };
    }
  }, [commit]);

  const restoreRecovery = useCallback(() => {
    try {
      const stored = window.localStorage.getItem(RECOVERY_STORAGE_KEY);
      if (!stored) return { ok: false as const, message: '되돌릴 데이터가 없습니다.' };
      const previous = parsePlannerState(JSON.parse(stored));
      if (!previous) return { ok: false as const, message: '복구 데이터가 손상되었습니다.' };
      const current = stateRef.current;
      window.localStorage.setItem(RECOVERY_STORAGE_KEY, JSON.stringify(current));
      commit(() => previous);
      return { ok: true as const, message: '직전 데이터로 되돌렸습니다.' };
    } catch {
      return { ok: false as const, message: '복구 저장소를 사용할 수 없습니다.' };
    }
  }, [commit]);

  const resetPlanner = useCallback(() => {
    try {
      window.localStorage.setItem(RECOVERY_STORAGE_KEY, JSON.stringify(stateRef.current));
    } catch {
      // Reset remains available even when recovery storage is unavailable.
    }
    commit(() => defaultState());
  }, [commit]);

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
    lastSavedAt,
    saveError,
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
    exportBackup,
    importBackup,
    restoreRecovery,
    resetPlanner,
  };
}

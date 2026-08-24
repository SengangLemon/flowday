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

const STORAGE_KEY = 'flowday:planner:v5';
const BACKUP_STORAGE_KEY = 'flowday:planner:backup:v5';
const LEGACY_V4_STORAGE_KEY = 'flowday:planner:v4';
const LEGACY_V3_STORAGE_KEY = 'flowday:planner:v3';
const LEGACY_V2_STORAGE_KEY = 'flowday:planner:v2';
const subscribeToHydration = () => () => undefined;

type LegacyState = {
  version: 2 | 3;
  tasks: PlannerTask[];
  theme: Theme;
};

type LegacyV4State = {
  version: 4;
  tasks: PlannerTask[];
  goals: PlanGoal[];
  theme: Theme;
};

function defaultState(): PlannerState {
  return { version: 5, tasks: [], goals: [], scheduleBlocks: [], theme: 'light' };
}

function userCreatedTasks(tasks: PlannerTask[]) {
  return tasks.filter((task) => !task.id.startsWith('seed-')).map(normalizeTask);
}

function readStoredState(): PlannerState {
  try {
    for (const key of [STORAGE_KEY, BACKUP_STORAGE_KEY]) {
      const stored = window.localStorage.getItem(key);
      if (stored) {
        try {
          const parsed = JSON.parse(stored) as PlannerState;
          if (parsed.version === 5 && Array.isArray(parsed.tasks) && Array.isArray(parsed.goals) && Array.isArray(parsed.scheduleBlocks)) {
            return { ...parsed, tasks: parsed.tasks.map(normalizeTask), goals: parsed.goals.map(normalizeGoal) };
          }
        } catch {
          // Try the backup copy before falling back to legacy data.
        }
      }
    }

    const legacyV4Stored = window.localStorage.getItem(LEGACY_V4_STORAGE_KEY);
    if (legacyV4Stored) {
      const legacy = JSON.parse(legacyV4Stored) as LegacyV4State;
      if (legacy.version === 4 && Array.isArray(legacy.tasks) && Array.isArray(legacy.goals)) {
        return {
          version: 5,
          tasks: legacy.tasks.map(normalizeTask),
          goals: legacy.goals.map(normalizeGoal),
          scheduleBlocks: [],
          theme: legacy.theme ?? 'light',
        };
      }
    }

    for (const key of [LEGACY_V3_STORAGE_KEY, LEGACY_V2_STORAGE_KEY]) {
      const legacyStored = window.localStorage.getItem(key);
      if (legacyStored) {
        const legacy = JSON.parse(legacyStored) as LegacyState;
        if ((legacy.version === 2 || legacy.version === 3) && Array.isArray(legacy.tasks)) {
          return {
            version: 5,
            tasks: userCreatedTasks(legacy.tasks),
            goals: [],
            scheduleBlocks: [],
            theme: legacy.theme ?? 'light',
          };
        }
      }
    }
  } catch {
    // The app stays usable when storage is blocked or malformed.
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
      return { ...current, goals: nextGoals };
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
      return { ...current, goals: current.goals.filter((goal) => !remove.has(goal.id)) };
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
  };
}

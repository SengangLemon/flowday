'use client';

import { useCallback, useEffect, useMemo, useState, useSyncExternalStore } from 'react';
import {
  createSeedGoals,
  createSeedTasks,
  dateKey,
  normalizeTask,
  PlanGoal,
  PlannerState,
  PlannerTask,
  taskCompletedOn,
  tasksForDate,
  Theme,
} from '../lib/planner';

const STORAGE_KEY = 'flowday:planner:v3';
const LEGACY_STORAGE_KEY = 'flowday:planner:v2';
const subscribeToHydration = () => () => undefined;

type LegacyState = {
  version: 2;
  tasks: PlannerTask[];
  theme: Theme;
};

function defaultState(today: string): PlannerState {
  return { version: 3, tasks: createSeedTasks(today), goals: createSeedGoals(today), theme: 'light' };
}

function readStoredState(today: string): PlannerState {
  try {
    const stored = window.localStorage.getItem(STORAGE_KEY);
    if (stored) {
      const parsed = JSON.parse(stored) as PlannerState;
      if (parsed.version === 3 && Array.isArray(parsed.tasks) && Array.isArray(parsed.goals)) {
        return { ...parsed, tasks: parsed.tasks.map(normalizeTask) };
      }
    }

    const legacyStored = window.localStorage.getItem(LEGACY_STORAGE_KEY);
    if (legacyStored) {
      const legacy = JSON.parse(legacyStored) as LegacyState;
      if (legacy.version === 2 && Array.isArray(legacy.tasks)) {
        return {
          version: 3,
          tasks: legacy.tasks.map(normalizeTask),
          goals: createSeedGoals(today),
          theme: legacy.theme ?? 'light',
        };
      }
    }
  } catch {
    // The app stays usable when storage is blocked or malformed.
  }

  return defaultState(today);
}

export function usePlanner() {
  const ready = useSyncExternalStore(subscribeToHydration, () => true, () => false);
  const [today] = useState(() => dateKey(new Date()));
  const [initialState] = useState<PlannerState>(() => {
    if (typeof window === 'undefined') return defaultState(today);
    return readStoredState(today);
  });
  const [tasks, setTasks] = useState<PlannerTask[]>(initialState.tasks);
  const [goals, setGoals] = useState<PlanGoal[]>(initialState.goals);
  const [theme, setThemeState] = useState<Theme>(initialState.theme);

  useEffect(() => {
    if (!ready) return;
    const next: PlannerState = { version: 3, tasks, goals, theme };
    try {
      window.localStorage.setItem(STORAGE_KEY, JSON.stringify(next));
    } catch {
      // Saving is best-effort; interactions continue to work in-memory.
    }
  }, [goals, ready, tasks, theme]);

  const upsertTask = useCallback((task: PlannerTask) => {
    setTasks((current) => {
      const normalized = normalizeTask({ ...task, updatedAt: Date.now() });
      const exists = current.some((item) => item.id === normalized.id);
      return exists
        ? current.map((item) => item.id === normalized.id ? normalized : item)
        : [...current, normalized];
    });
  }, []);

  const deleteTask = useCallback((taskId: string) => {
    setTasks((current) => current.filter((task) => task.id !== taskId));
  }, []);

  const toggleTask = useCallback((taskId: string, occurrenceDate?: string) => {
    setTasks((current) => current.map((task) => {
      if (task.id !== taskId) return task;
      if (task.repeat === 'daily') {
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
    }));
  }, [today]);

  const duplicateTask = useCallback((taskId: string) => {
    setTasks((current) => {
      const original = current.find((task) => task.id === taskId);
      if (!original) return current;
      const now = Date.now();
      return [...current, {
        ...original,
        id: `task-${now}-${Math.random().toString(36).slice(2, 7)}`,
        title: `${original.title} 복사본`,
        completed: false,
        completionDates: [],
        occurrenceDate: undefined,
        createdAt: now,
        updatedAt: now,
      }];
    });
  }, []);

  const moveTask = useCallback((taskId: string, date: string, start?: string | null) => {
    setTasks((current) => current.map((task) => task.id === taskId
      ? { ...task, date, start: start === undefined ? task.start : start, updatedAt: Date.now() }
      : task));
  }, []);

  const upsertGoal = useCallback((goal: PlanGoal) => {
    setGoals((current) => {
      const saved = { ...goal, updatedAt: Date.now() };
      const exists = current.some((item) => item.id === goal.id);
      return exists
        ? current.map((item) => item.id === goal.id ? saved : item)
        : [...current, saved];
    });
  }, []);

  const deleteGoal = useCallback((goalId: string) => {
    setGoals((current) => {
      const remove = new Set([goalId]);
      let changed = true;
      while (changed) {
        changed = false;
        for (const goal of current) {
          if (goal.parentId && remove.has(goal.parentId) && !remove.has(goal.id)) {
            remove.add(goal.id);
            changed = true;
          }
        }
      }
      return current.filter((goal) => !remove.has(goal.id));
    });
  }, []);

  const toggleGoalCheck = useCallback((goalId: string, date: string) => {
    setGoals((current) => current.map((goal) => {
      if (goal.id !== goalId) return goal;
      const checked = goal.checkins.includes(date);
      return {
        ...goal,
        checkins: checked ? goal.checkins.filter((item) => item !== date) : [...goal.checkins, date].sort(),
        updatedAt: Date.now(),
      };
    }));
  }, []);

  const setTheme = useCallback((nextTheme: Theme) => {
    setThemeState(nextTheme);
  }, []);

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
    theme,
    completedToday,
    upsertTask,
    deleteTask,
    toggleTask,
    duplicateTask,
    moveTask,
    upsertGoal,
    deleteGoal,
    toggleGoalCheck,
    setTheme,
  };
}

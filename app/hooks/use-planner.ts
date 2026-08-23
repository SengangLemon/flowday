'use client';

import { useCallback, useEffect, useMemo, useState, useSyncExternalStore } from 'react';
import {
  createSeedTasks,
  dateKey,
  PlannerState,
  PlannerTask,
  Theme,
} from '../lib/planner';

const STORAGE_KEY = 'flowday:planner:v2';
const subscribeToHydration = () => () => undefined;

function readStoredState(today: string): PlannerState {
  try {
    const stored = window.localStorage.getItem(STORAGE_KEY);
    if (stored) {
      const parsed = JSON.parse(stored) as PlannerState;
      if (parsed.version === 2 && Array.isArray(parsed.tasks)) return parsed;
    }
  } catch {
    // The app stays usable when storage is blocked or malformed.
  }

  return { version: 2, tasks: createSeedTasks(today), theme: 'light' };
}

export function usePlanner() {
  const ready = useSyncExternalStore(subscribeToHydration, () => true, () => false);
  const [today] = useState(() => dateKey(new Date()));
  const [initialState] = useState<PlannerState>(() => {
    if (typeof window === 'undefined') {
      return { version: 2, tasks: createSeedTasks(today), theme: 'light' };
    }
    return readStoredState(today);
  });
  const [tasks, setTasks] = useState<PlannerTask[]>(initialState.tasks);
  const [theme, setThemeState] = useState<Theme>(initialState.theme);

  useEffect(() => {
    if (!ready) return;
    const next: PlannerState = { version: 2, tasks, theme };
    try {
      window.localStorage.setItem(STORAGE_KEY, JSON.stringify(next));
    } catch {
      // Saving is best-effort; interactions continue to work in-memory.
    }
  }, [ready, tasks, theme]);

  const upsertTask = useCallback((task: PlannerTask) => {
    setTasks((current) => {
      const exists = current.some((item) => item.id === task.id);
      const saved = { ...task, updatedAt: Date.now() };
      return exists
        ? current.map((item) => item.id === task.id ? saved : item)
        : [...current, saved];
    });
  }, []);

  const deleteTask = useCallback((taskId: string) => {
    setTasks((current) => current.filter((task) => task.id !== taskId));
  }, []);

  const toggleTask = useCallback((taskId: string) => {
    setTasks((current) => current.map((task) => task.id === taskId
      ? { ...task, completed: !task.completed, updatedAt: Date.now() }
      : task));
  }, []);

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

  const setTheme = useCallback((nextTheme: Theme) => {
    setThemeState(nextTheme);
  }, []);

  const completedToday = useMemo(
    () => tasks.filter((task) => task.date === today && task.completed).length,
    [tasks, today],
  );

  return {
    ready,
    today,
    tasks,
    theme,
    completedToday,
    upsertTask,
    deleteTask,
    toggleTask,
    duplicateTask,
    moveTask,
    setTheme,
  };
}

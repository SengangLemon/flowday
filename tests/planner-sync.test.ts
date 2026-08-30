import { describe, expect, it } from 'vitest';
import { createEmptyTask, PlannerState } from '../app/lib/planner';
import {
  createLocalDocument,
  defaultPlannerState,
  mergePlannerStates,
  parseLocalDocument,
  replacementPlannerState,
} from '../app/lib/planner-sync';

function task(id: string, title: string, updatedAt: number) {
  return {
    ...createEmptyTask('2026-08-30'),
    id,
    title,
    createdAt: 1,
    updatedAt,
  };
}

function withTasks(...tasks: ReturnType<typeof task>[]): PlannerState {
  return { ...defaultPlannerState(), tasks };
}

describe('planner local durability', () => {
  it('persists dirty and revision metadata in the local envelope', () => {
    const document = createLocalDocument(withTasks(task('a', 'local edit', 10)), {
      dirty: true,
      revision: 7,
      updatedAt: 11,
    });
    const restored = parseLocalDocument(JSON.parse(JSON.stringify(document)));
    expect(restored?.dirty).toBe(true);
    expect(restored?.revision).toBe(7);
    expect(restored?.updatedAt).toBe(11);
    expect(restored?.state.tasks[0].title).toBe('local edit');
  });

  it('upgrades a legacy local state and marks it dirty instead of discarding it', () => {
    const restored = parseLocalDocument({
      version: 6,
      tasks: [task('legacy', 'offline legacy edit', 20)],
      goals: [],
      scheduleBlocks: [],
      theme: 'dark',
      introducedViews: [],
    });
    expect(restored?.state.version).toBe(7);
    expect(restored?.dirty).toBe(true);
    expect(restored?.state.tasks[0].title).toBe('offline legacy edit');
    expect(restored?.state.metadata.themeUpdatedAt).toBeGreaterThan(0);
  });
});

describe('planner conflict merge', () => {
  it('keeps independent edits from two devices and the newest edit per item', () => {
    const left = withTasks(task('shared', 'newer local', 30), task('left', 'left only', 20));
    const right = withTasks(task('shared', 'older remote', 10), task('right', 'right only', 25));
    const merged = mergePlannerStates(left, right);
    expect(merged.tasks.map((item) => item.id)).toEqual(['left', 'right', 'shared']);
    expect(merged.tasks.find((item) => item.id === 'shared')?.title).toBe('newer local');
  });

  it('keeps a deletion tombstone from resurrecting an older item', () => {
    const deleted = {
      ...defaultPlannerState(),
      tombstones: { ...defaultPlannerState().tombstones, tasks: { removed: 200 } },
    };
    const staleDevice = withTasks(task('removed', 'stale copy', 150));
    expect(mergePlannerStates(deleted, staleDevice).tasks).toHaveLength(0);

    const intentionallyRestored = withTasks(task('removed', 'restored later', 250));
    expect(mergePlannerStates(deleted, intentionallyRestored).tasks[0].title).toBe('restored later');
  });

  it('records tombstones for items omitted by backup replacement or reset', () => {
    const current = withTasks(task('keep', 'current', 10), task('remove', 'current', 10));
    const incoming = withTasks(task('keep', 'backup', 5));
    const replaced = replacementPlannerState(current, incoming, 100);
    expect(replaced.tasks.map((item) => item.id)).toEqual(['keep']);
    expect(replaced.tasks[0].updatedAt).toBe(100);
    expect(replaced.tombstones.tasks.remove).toBe(100);
  });
});

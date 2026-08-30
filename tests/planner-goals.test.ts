import { describe, expect, it } from 'vitest';
import {
  applicationPreparationSchedule,
  createEmptyGoal,
  formatGoalNumericProgress,
  goalNumericProgress,
  goalsForDate,
  syncApplicationPreparationTasks,
} from '../app/lib/planner';

describe('numeric goal progress', () => {
  it.each([
    [69, 130, '학점', 53, '69/130학점'],
    [4, 5.5, '', 73, '4.0/5.5'],
    [3, 12, '회', 25, '3/12회'],
  ])('formats %s of %s and calculates a clamped percentage', (current, target, unit, percentage, label) => {
    const goal = { progressCurrent: current, progressTarget: target, progressUnit: unit };
    expect(goalNumericProgress(goal)).toBe(percentage);
    expect(formatGoalNumericProgress(goal)).toBe(label);
  });

  it('does not show an incomplete or invalid target', () => {
    expect(goalNumericProgress({ progressCurrent: 10, progressTarget: null })).toBeNull();
    expect(goalNumericProgress({ progressCurrent: 10, progressTarget: 0 })).toBeNull();
  });
});

describe('application deadline reverse schedule', () => {
  it('creates recommendation, SOP, and transcript dates from the deadline', () => {
    expect(applicationPreparationSchedule('2026-12-15').map(({ key, date }) => ({ key, date }))).toEqual([
      { key: 'recommendation', date: '2026-11-03' },
      { key: 'sop', date: '2026-11-17' },
      { key: 'transcript', date: '2026-12-01' },
    ]);
  });

  it('creates each generated task once and moves it when the deadline changes', () => {
    const goal = {
      ...createEmptyGoal(),
      id: 'graduate-school',
      title: '대학원 지원',
      deadline: '2026-12-15',
      deadlinePlan: 'application' as const,
    };
    const created = syncApplicationPreparationTasks([], goal, 100, true);
    expect(created).toHaveLength(3);
    expect(new Set(created.map((task) => task.id)).size).toBe(3);
    expect(created.every((task) => task.goalId === goal.id && task.start === '09:00')).toBe(true);

    const moved = syncApplicationPreparationTasks(created, { ...goal, deadline: '2026-12-31' }, 200, true);
    expect(moved).toHaveLength(3);
    expect(moved.map((task) => task.date)).toEqual(['2026-11-19', '2026-12-03', '2026-12-17']);
  });

  it('does not recreate a generated task the user deleted during an unrelated edit', () => {
    const goal = {
      ...createEmptyGoal(),
      id: 'graduate-school',
      title: '대학원 지원',
      deadline: '2026-12-15',
      deadlinePlan: 'application' as const,
    };
    const created = syncApplicationPreparationTasks([], goal, 100, true);
    const afterDeletion = created.filter((task) => task.generatedKey !== 'recommendation');
    expect(syncApplicationPreparationTasks(afterDeletion, { ...goal, detail: '설명 변경' }, 200, false)).toHaveLength(2);
  });

  it('keeps a normal dated goal free of application preparation tasks', () => {
    const goal = { ...createEmptyGoal(), title: '포트폴리오 완성', deadline: '2027-03-01' };
    expect(syncApplicationPreparationTasks([], goal, 100, true)).toEqual([]);
  });
});

describe('calendar goals', () => {
  it('returns only goals due on the selected date', () => {
    const older = { ...createEmptyGoal(), id: 'older', title: '논문 제출', deadline: '2027-03-01', updatedAt: 10 };
    const newer = { ...createEmptyGoal(), id: 'newer', title: '포트폴리오 완성', deadline: '2027-03-01', updatedAt: 20 };
    const other = { ...createEmptyGoal(), id: 'other', title: '다른 날짜', deadline: '2027-03-02' };
    expect(goalsForDate([older, other, newer], '2027-03-01').map((goal) => goal.id)).toEqual(['newer', 'older']);
  });
});

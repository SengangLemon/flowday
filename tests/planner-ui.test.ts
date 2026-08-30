import { createElement } from 'react';
import { renderToStaticMarkup } from 'react-dom/server';
import { describe, expect, it } from 'vitest';
import { GoalSheet } from '../app/components/goal-sheet';
import { CalendarView } from '../app/components/planner-app';
import { createEmptyGoal } from '../app/lib/planner';

const noop = () => undefined;

describe('dated goal interface', () => {
  it('shows a generic target date option separately from application planning', () => {
    const goal = { ...createEmptyGoal(), title: '포트폴리오 완성', deadline: '2027-03-01' };
    const html = renderToStaticMarkup(createElement(GoalSheet, {
      goal,
      goals: [goal],
      isNew: false,
      onClose: noop,
      onSave: noop,
      onDelete: noop,
    }));
    expect(html).toContain('목표 완료일');
    expect(html).toContain('날짜 목표');
    expect(html).toContain('지원 준비 역산');
  });

  it('renders a goal due on the selected week inside the calendar', () => {
    const goal = { ...createEmptyGoal(), title: '포트폴리오 완성', deadline: '2027-03-01' };
    const html = renderToStaticMarkup(createElement(CalendarView, {
      selectedDate: '2027-03-01',
      today: '2027-03-01',
      tasks: [],
      goals: [goal],
      onDateChange: noop,
      onNew: noop,
      onNewGoal: noop,
      onEdit: noop,
      onEditGoal: noop,
      onToggle: noop,
      onMove: noop,
      onMoveGoal: noop,
    }));
    expect(html).toContain('목표 완료일');
    expect(html).toContain('포트폴리오 완성');
    expect(html).toContain('1개 목표 · 0개 블록');
  });
});

'use client';

import Image from 'next/image';
import {
  ArrowRight,
  BarChart3,
  CalendarDays,
  CheckCircle2,
  Check,
  ChevronLeft,
  ChevronRight,
  Circle,
  Clock3,
  Cloud,
  CloudOff,
  Command,
  Edit3,
  Focus,
  GripVertical,
  GitBranch,
  Inbox,
  LayoutGrid,
  MoreHorizontal,
  Pencil,
  Plus,
  Repeat2,
  Search,
  Settings2,
  Sparkles,
  Sprout,
  Target,
  TimerReset,
  X,
} from 'lucide-react';
import { CSSProperties, FormEvent, useEffect, useMemo, useState } from 'react';
import { usePlanner } from '../hooks/use-planner';
import { createClient } from '../lib/supabase/client';
import {
  createEmptyGoal,
  createEmptyScheduleBlock,
  createEmptyTask,
  formatDateLabel,
  goalHorizon,
  GOAL_HORIZONS,
  minutesToTime,
  monthGridDates,
  parseQuickAdd,
  PlanGoal,
  PlannerTask,
  PlannerView,
  PROJECTS,
  Quadrant,
  repeatRuleLabel,
  ScheduleBlock,
  scheduleBlockDuration,
  shiftDate,
  shiftMonth,
  shiftYear,
  TaskColor,
  tasksForDate,
  timeToMinutes,
  weekDates,
} from '../lib/planner';
import { GoalSheet } from './goal-sheet';
import { MenuIntro } from './menu-intro';
import { SettingsSheet } from './settings-sheet';
import { TaskSheet } from './task-sheet';
import { TimeBlockSheet } from './time-block-sheet';

type EditorState = { task: PlannerTask; isNew: boolean } | null;
type GoalEditorState = { goal: PlanGoal; isNew: boolean } | null;
type TimeBlockEditorState = { block: ScheduleBlock; isNew: boolean } | null;

const NAV_ITEMS: { id: PlannerView; label: string; icon: typeof Inbox }[] = [
  { id: 'habit', label: '습관', icon: Repeat2 },
  { id: 'inbox', label: '인박스', icon: Inbox },
  { id: 'plan', label: '계획', icon: Target },
  { id: 'calendar', label: '캘린더', icon: CalendarDays },
  { id: 'focus', label: '집중', icon: Focus },
];

const VIEW_TITLES: Record<PlannerView, string> = {
  habit: '습관', inbox: '인박스', plan: '계획', calendar: '캘린더', focus: '집중',
};

const EISENHOWER_QUADRANTS: { id: Quadrant; title: string; hint: string; color: TaskColor }[] = [
  { id: 'do', title: '중요하고 긴급함', hint: '지금 실행', color: 'rose' },
  { id: 'schedule', title: '중요하고 여유 있음', hint: '시간 배치', color: 'sage' },
  { id: 'delegate', title: '긴급하지만 덜 중요함', hint: '위임', color: 'blue' },
  { id: 'delete', title: '중요하지 않음', hint: '보류·삭제', color: 'violet' },
];

type WeekStripProps = {
  selectedDate: string;
  today: string;
  tasks: PlannerTask[];
  onSelect: (date: string) => void;
};

function WeekStrip({ selectedDate, today, tasks, onSelect }: WeekStripProps) {
  const dates = weekDates(selectedDate);
  return (
    <nav className="week-strip" aria-label="주간 날짜 선택">
      {dates.map((date) => {
        const parts = formatDateLabel(date, { weekday: 'short', day: 'numeric' }).replace('.', '').split(' ');
        const taskCount = tasksForDate(tasks, date).filter((task) => !task.completed).length;
        return (
          <button className={`${selectedDate === date ? 'selected' : ''} ${today === date ? 'today' : ''}`} key={date} onClick={() => onSelect(date)}>
            <span>{parts[0]}</span><strong>{Number(date.slice(-2))}</strong><i className={taskCount ? 'has-tasks' : ''} />
          </button>
        );
      })}
    </nav>
  );
}

type QuickAddProps = {
  selectedDate: string;
  onAdd: (task: PlannerTask) => void;
  compact?: boolean;
};

function QuickAdd({ selectedDate, onAdd, compact = false }: QuickAddProps) {
  const [value, setValue] = useState('');
  function submit(event: FormEvent) {
    event.preventDefault();
    if (!value.trim()) return;
    onAdd(parseQuickAdd(value, selectedDate));
    setValue('');
  }
  return (
    <form className={`quick-capture ${compact ? 'compact' : ''}`} onSubmit={submit}>
      <Plus size={19} />
      <input value={value} onChange={(event) => setValue(event.target.value)} placeholder={compact ? '할 일 빠르게 추가' : '할 일을 입력하세요 · 14:00 #프로젝트 p1'} aria-label="빠른 할 일 추가" />
      <button type="submit" aria-label="추가"><ArrowRight size={17} /></button>
    </form>
  );
}

type TaskCardProps = {
  task: PlannerTask;
  onEdit: (task: PlannerTask) => void;
  onToggle: (taskId: string, occurrenceDate?: string) => void;
  onFocus?: (taskId: string) => void;
  draggable?: boolean;
  onDragStart?: (taskId: string) => void;
  layout?: 'timeline' | 'list' | 'calendar';
};

function TaskCard({ task, onEdit, onToggle, onFocus, draggable = false, onDragStart, layout = 'list' }: TaskCardProps) {
  return (
    <article
      className={`planner-task ${task.color} ${task.completed ? 'completed' : ''} ${layout}`}
      draggable={draggable}
      onDragStart={(event) => {
        event.dataTransfer.effectAllowed = 'move';
        event.dataTransfer.setData('text/plain', task.id);
        onDragStart?.(task.id);
      }}
      onClick={() => onEdit(task)}
      style={{ '--task-duration': `${Math.max(72, Math.min(126, task.duration * .72))}px` } as CSSProperties}
    >
      {layout === 'timeline' ? <GripVertical className="drag-grip" size={16} /> : null}
      <button className="task-circle" aria-label={task.completed ? '미완료로 변경' : '완료'} onClick={(event) => { event.stopPropagation(); onToggle(task.id, task.occurrenceDate); }}>{task.completed ? <Check size={13} /> : <Circle size={16} />}</button>
      <div className="task-copy">
        <div className="task-title-row"><strong>{task.title}</strong>{task.priority < 4 ? <span className={`priority-mark p${task.priority}`}>P{task.priority}</span> : null}</div>
        <span>{task.start ? `${task.start} · ${task.duration}분` : '시간 미정'}<i />{task.project}{task.repeat !== 'none' ? <><i /><Repeat2 size={11} />{repeatRuleLabel(task.repeat)}</> : null}</span>
        {layout === 'timeline' && task.notes ? <p>{task.notes}</p> : null}
      </div>
      {onFocus && !task.completed ? <button className="task-focus-button" aria-label="이 작업에 집중" onClick={(event) => { event.stopPropagation(); onFocus(task.id); }}><Focus size={15} /></button> : null}
      <button className="task-more" aria-label="작업 수정" onClick={(event) => { event.stopPropagation(); onEdit(task); }}><MoreHorizontal size={17} /></button>
    </article>
  );
}

type HabitViewProps = {
  selectedDate: string;
  today: string;
  tasks: PlannerTask[];
  onDateChange: (date: string) => void;
  onNew: (date: string, start?: string | null) => void;
  onEdit: (task: PlannerTask) => void;
  onToggle: (taskId: string, occurrenceDate?: string) => void;
  onFocus: (taskId: string) => void;
  onMove: (taskId: string, date: string, start?: string | null) => void;
  onSchedule: (task: PlannerTask, date: string) => void;
  scheduleBlocks: ScheduleBlock[];
  onNewScheduleBlock: () => void;
  onEditScheduleBlock: (block: ScheduleBlock) => void;
  onUseScheduleBlock: (block: ScheduleBlock) => void;
};

function HabitView({ selectedDate, today, tasks, onDateChange, onNew, onEdit, onToggle, onFocus, onMove, onSchedule, scheduleBlocks, onNewScheduleBlock, onEditScheduleBlock, onUseScheduleBlock }: HabitViewProps) {
  const timed = useMemo(() => tasksForDate(tasks, selectedDate).filter((task) => task.start).sort((a, b) => (a.start ?? '').localeCompare(b.start ?? '')), [tasks, selectedDate]);
  const inboxTasks = useMemo(() => tasks.filter((task) => !task.start && !task.completed).sort((a, b) => a.priority - b.priority), [tasks]);
  const completed = timed.filter((task) => task.completed).length;
  const completion = timed.length ? Math.round(completed / timed.length * 100) : 0;
  const [dragId, setDragId] = useState<string | null>(null);

  return (
    <div className="today-view habit-view">
      <WeekStrip selectedDate={selectedDate} today={today} tasks={tasks} onSelect={onDateChange} />
      <section className="day-hero">
        <div>
          <span className="overline">{selectedDate === today ? '오늘의 리듬' : '선택한 날짜'}</span>
          <h1>{formatDateLabel(selectedDate)}</h1>
          <p>{timed.length ? '오늘의 흐름을 하나씩 실행해보세요.' : '인박스의 할 일을 가져오거나 새 습관을 만들어보세요.'}</p>
          {timed.length ? <div className="day-progress"><span>오늘 진행</span><div><i style={{ width: `${completion}%` }} /></div><strong>{completed}/{timed.length}</strong></div> : null}
        </div>
      </section>

      <section className="habit-inbox-callout">
        <header><div><Inbox size={18} /><span><strong>인박스에서 가져오기</strong><small>할 일을 원하는 시간대의 블록으로 배치합니다.</small></span></div><b>{inboxTasks.length}</b></header>
        {inboxTasks.length ? <div className="habit-inbox-list">{inboxTasks.slice(0, 4).map((task) => <div key={task.id}><span className={`color-dot ${task.color}`} /><button onClick={() => onEdit(task)}><strong>{task.title}</strong><small>{task.project} · P{task.priority}</small></button><button onClick={() => onSchedule(task, selectedDate)}><Clock3 size={14} />배치</button></div>)}</div> : <p>인박스가 비어 있습니다. 먼저 할 일을 적어보세요.</p>}
      </section>

      <TimeBlockDesigner blocks={scheduleBlocks} onNew={onNewScheduleBlock} onEdit={onEditScheduleBlock} onUse={onUseScheduleBlock} />

      <section className="timeline-section">
        <header className="section-heading"><div><span className="overline">오늘 타임라인</span><h2>습관과 실행</h2></div><button onClick={() => onNew(selectedDate, '09:00')}><Plus size={16} />새 습관</button></header>
        <div className="timeline-list">
          {timed.length ? timed.map((task, index) => {
            const previous = timed[index - 1];
            const gap = previous?.start ? timeToMinutes(task.start ?? '00:00') - (timeToMinutes(previous.start) + previous.duration) : 0;
            return (
              <div className="timeline-item-wrap" key={task.id} onDragOver={(event) => event.preventDefault()} onDrop={(event) => {
                const taskId = event.dataTransfer.getData('text/plain') || dragId;
                if (!taskId || !task.start) return;
                onMove(taskId, selectedDate, task.start);
                setDragId(null);
              }}>
                {gap >= 30 ? <button className="timeline-gap" onClick={() => onNew(selectedDate, minutesToTime(timeToMinutes(previous.start ?? '09:00') + previous.duration))}><span>{gap}분 여유</span><Plus size={13} /></button> : null}
                <div className="timeline-time"><strong>{task.start}</strong><span>{minutesToTime(timeToMinutes(task.start ?? '00:00') + task.duration)}</span></div>
                <div className="timeline-rail"><i className={task.color} /></div>
                <TaskCard task={task} onEdit={onEdit} onToggle={onToggle} onFocus={onFocus} layout="timeline" draggable onDragStart={setDragId} />
              </div>
            );
          }) : <EmptyState icon={Repeat2} title="아직 습관 블록이 없어요" description="인박스 할 일을 배치하거나 반복 습관을 직접 만들어보세요." action="첫 습관 만들기" onAction={() => onNew(selectedDate, '09:00')} />}
          {timed.length ? <button className="timeline-add-row" onClick={() => onNew(selectedDate, '18:00')}><Plus size={16} />새 습관 블록</button> : null}
        </div>
      </section>
    </div>
  );
}

type EmptyStateProps = { icon: typeof Clock3; title: string; description: string; action: string; onAction: () => void };
function EmptyState({ icon: Icon, title, description, action, onAction }: EmptyStateProps) {
  return <div className="empty-state"><span><Icon size={22} /></span><strong>{title}</strong><p>{description}</p><button onClick={onAction}><Plus size={15} />{action}</button></div>;
}

type TaskListPanelProps = {
  tasks: PlannerTask[];
  emptyTitle: string;
  emptyDescription: string;
  emptyAction: string;
  onNew: () => void;
  onEdit: (task: PlannerTask) => void;
  onToggle: (taskId: string, occurrenceDate?: string) => void;
  onSchedule?: (task: PlannerTask) => void;
};

function TaskListPanel({ tasks, emptyTitle, emptyDescription, emptyAction, onNew, onEdit, onToggle, onSchedule }: TaskListPanelProps) {
  return (
    <section className="execution-task-list">
      {tasks.length ? tasks.map((task) => (
        <div className="execution-task-row" key={`${task.id}-${task.occurrenceDate ?? task.date}`}>
          <TaskCard task={task} onEdit={onEdit} onToggle={onToggle} layout="list" />
          {!task.start && onSchedule ? <button onClick={() => onSchedule(task)}><Clock3 size={15} />시간 배치</button> : null}
        </div>
      )) : <EmptyState icon={CheckCircle2} title={emptyTitle} description={emptyDescription} action={emptyAction} onAction={onNew} />}
    </section>
  );
}

type EisenhowerMatrixProps = {
  tasks: PlannerTask[];
  onEdit: (task: PlannerTask) => void;
  onToggle: (taskId: string, occurrenceDate?: string) => void;
  onMoveQuadrant: (taskId: string, quadrant: Quadrant) => void;
};

function EisenhowerMatrix({ tasks, onEdit, onToggle, onMoveQuadrant }: EisenhowerMatrixProps) {
  const [dragId, setDragId] = useState<string | null>(null);
  return (
    <div className="matrix-grid-v2 execution-matrix">
      {EISENHOWER_QUADRANTS.map((quadrant) => {
        const list = tasks.filter((task) => task.quadrant === quadrant.id);
        return (
          <section
            className={`matrix-quadrant ${quadrant.color}`}
            key={quadrant.id}
            onDragOver={(event) => event.preventDefault()}
            onDrop={(event) => {
              const taskId = event.dataTransfer.getData('text/plain') || dragId;
              if (taskId) onMoveQuadrant(taskId, quadrant.id);
              setDragId(null);
            }}
          >
            <header><div><i /><span>{quadrant.hint}</span><h2>{quadrant.title}</h2></div><b>{list.length}</b></header>
            <div>{list.map((task) => <TaskCard key={`${task.id}-${task.occurrenceDate ?? task.date}`} task={task} onEdit={onEdit} onToggle={onToggle} draggable onDragStart={setDragId} layout="list" />)}{!list.length ? <p className="matrix-empty">할 일을 여기에 놓으세요</p> : null}</div>
          </section>
        );
      })}
    </div>
  );
}

type InboxViewProps = {
  today: string;
  tasks: PlannerTask[];
  onAdd: (task: PlannerTask) => void;
  onNew: (date: string, start?: string | null) => void;
  onEdit: (task: PlannerTask) => void;
  onToggle: (taskId: string, occurrenceDate?: string) => void;
  onMoveQuadrant: (taskId: string, quadrant: Quadrant) => void;
  onSchedule: (task: PlannerTask, date: string) => void;
};

function InboxView({ today, tasks, onAdd, onNew, onEdit, onToggle, onMoveQuadrant, onSchedule }: InboxViewProps) {
  const [mode, setMode] = useState<'today' | 'inbox' | 'matrix'>('today');
  const [filter, setFilter] = useState('전체');
  const inboxTasks = useMemo(() => tasks.filter((task) => !task.start && !task.completed).sort((a, b) => a.priority - b.priority), [tasks]);
  const todayTasks = useMemo(() => tasksForDate(tasks, today).sort((a, b) => Number(a.completed) - Number(b.completed) || (a.start ?? '99:99').localeCompare(b.start ?? '99:99') || a.priority - b.priority), [tasks, today]);
  const activeTasks = useMemo(() => tasks.filter((task) => !task.completed).sort((a, b) => a.priority - b.priority), [tasks]);
  const baseTasks = mode === 'today' ? todayTasks : mode === 'inbox' ? inboxTasks : activeTasks;
  const filtered = filter === '전체' ? baseTasks : baseTasks.filter((task) => task.project === filter);
  return (
    <div className="content-view inbox-view">
      <header className="view-intro"><div><span className="overline">빠르게 기록하고 결정</span><h1>인박스</h1><p>오늘 할 일, 아직 배치하지 않은 할 일, 아이젠하워 우선순위를 한곳에서 관리합니다.</p></div><div className="inbox-header-actions"><div className="segmented-control inbox-mode-control"><button className={mode === 'today' ? 'active' : ''} onClick={() => setMode('today')}><CheckCircle2 size={15} />오늘 할 일</button><button className={mode === 'inbox' ? 'active' : ''} onClick={() => setMode('inbox')}><Inbox size={15} />인박스</button><button className={mode === 'matrix' ? 'active' : ''} onClick={() => setMode('matrix')}><LayoutGrid size={15} />아이젠하워</button></div><button className="primary-button desktop-only" onClick={() => onNew(today, null)}><Plus size={17} />할 일 추가</button></div></header>
      <QuickAdd selectedDate={today} onAdd={onAdd} />
      <div className="project-filter-row"><button className={filter === '전체' ? 'active' : ''} onClick={() => setFilter('전체')}>전체 <span>{baseTasks.length}</span></button>{PROJECTS.map((project) => <button className={filter === project.name ? 'active' : ''} onClick={() => setFilter(project.name)} key={project.name}><i className={project.color} />{project.name}</button>)}</div>
      {mode === 'today' ? <TaskListPanel tasks={filtered} emptyTitle="오늘 할 일이 없어요" emptyDescription="오늘 실행할 일을 추가하면 이곳과 계획 화면에 함께 표시됩니다." emptyAction="오늘 할 일 추가" onNew={() => onNew(today, null)} onEdit={onEdit} onToggle={onToggle} onSchedule={(task) => onSchedule(task, today)} /> : null}
      {mode === 'inbox' ? <TaskListPanel tasks={filtered} emptyTitle="인박스가 비었어요" emptyDescription="시간을 아직 정하지 않은 할 일이 이곳에 모입니다." emptyAction="할 일 추가" onNew={() => onNew(today, null)} onEdit={onEdit} onToggle={onToggle} onSchedule={(task) => onSchedule(task, today)} /> : null}
      {mode === 'matrix' ? <EisenhowerMatrix tasks={filtered} onEdit={onEdit} onToggle={onToggle} onMoveQuadrant={onMoveQuadrant} /> : null}
    </div>
  );
}

function goalScope(goals: PlanGoal[], rootId: string) {
  const ids = new Set([rootId]);
  let changed = true;
  while (changed) {
    changed = false;
    for (const goal of goals) {
      if (goal.parentId && ids.has(goal.parentId) && !ids.has(goal.id)) {
        ids.add(goal.id);
        changed = true;
      }
    }
  }
  return goals.filter((goal) => ids.has(goal.id));
}

function goalActivityDates(goals: PlanGoal[], goalId: string, today: string) {
  const dates = new Set<string>();
  for (const goal of goalScope(goals, goalId)) {
    if (!goal.daily) continue;
    for (const date of goal.checkins) if (date <= today) dates.add(date);
  }
  return [...dates].sort();
}

function goalProgress(goals: PlanGoal[], goalId: string, today: string): number | null {
  const dailyGoals = goalScope(goals, goalId).filter((goal) => goal.daily);
  const activity = goalActivityDates(goals, goalId, today);
  if (!dailyGoals.length || !activity.length) return null;
  const dates = Array.from({ length: 7 }, (_, index) => shiftDate(today, index - 6));
  const completed = dailyGoals.reduce((sum, goal) => sum + dates.filter((date) => goal.checkins.includes(date)).length, 0);
  return Math.round(completed / (dailyGoals.length * dates.length) * 100);
}

function levelLabel(depth: number) {
  let value = depth + 1;
  let label = '';
  while (value > 0) {
    value -= 1;
    label = String.fromCharCode(65 + value % 26) + label;
    value = Math.floor(value / 26);
  }
  return label;
}

function goalDepth(goal: PlanGoal, goals: PlanGoal[]) {
  let depth = 0;
  let current = goal;
  const visited = new Set([goal.id]);
  while (current.parentId) {
    const parent = goals.find((item) => item.id === current.parentId);
    if (!parent || visited.has(parent.id)) break;
    visited.add(parent.id);
    current = parent;
    depth += 1;
  }
  return depth;
}

function goalRootId(goal: PlanGoal, goals: PlanGoal[]) {
  let current = goal;
  const visited = new Set([goal.id]);
  while (current.parentId) {
    const parent = goals.find((item) => item.id === current.parentId);
    if (!parent || visited.has(parent.id)) break;
    visited.add(parent.id);
    current = parent;
  }
  return current.id;
}

function goalCode(goal: PlanGoal, goals: PlanGoal[], depth: number) {
  const rootId = goalRootId(goal, goals);
  const sameLevel = goals
    .filter((item) => goalRootId(item, goals) === rootId && goalDepth(item, goals) === depth)
    .sort((a, b) => a.createdAt - b.createdAt);
  const index = Math.max(0, sameLevel.findIndex((item) => item.id === goal.id));
  const level = levelLabel(depth);
  return depth === 0 ? level : `${level}${index + 1}`;
}

type GoalLawnProps = { goals: PlanGoal[]; goalId: string; today: string };
function GoalLawn({ goals, goalId, today }: GoalLawnProps) {
  const activity = goalActivityDates(goals, goalId, today);
  if (!activity.length) return null;
  const firstDate = activity[0] < shiftDate(today, -83) ? shiftDate(today, -83) : activity[0];
  const dates: string[] = [];
  for (let date = firstDate; date <= today && dates.length < 84; date = shiftDate(date, 1)) dates.push(date);
  const dailyGoals = goalScope(goals, goalId).filter((goal) => goal.daily);
  return (
    <div className="goal-lawn" role="img" aria-label="최근 12주 매일 체크 기록">
      <div className="lawn-weekdays" aria-hidden="true"><span>월</span><span>수</span><span>금</span></div>
      <div className="lawn-grid">{dates.map((date) => {
        const count = dailyGoals.filter((goal) => goal.checkins.includes(date)).length;
        const level = count ? Math.max(1, Math.ceil(count / Math.max(1, dailyGoals.length) * 4)) : 0;
        return <i className={`level-${level}`} key={date} title={`${date} · ${count}/${dailyGoals.length} 완료`} />;
      })}</div>
      <div className="lawn-legend"><span>{dates.length}일 기록</span><div><small>적게</small>{[0, 1, 2, 3, 4].map((level) => <i className={`level-${level}`} key={level} />)}<small>많이</small></div><span>오늘</span></div>
    </div>
  );
}

function goalHorizonLabel(goal: PlanGoal) {
  const horizon = goalHorizon(goal.period, goal.daily);
  return GOAL_HORIZONS.find((item) => item.id === horizon)?.label ?? '단기';
}

type DailyPlanTrackerProps = {
  goals: PlanGoal[];
  goalId: string;
  today: string;
  onToggle: (goalId: string, date: string) => void;
};

function DailyPlanTracker({ goals, goalId, today, onToggle }: DailyPlanTrackerProps) {
  const dailyGoals = goalScope(goals, goalId).filter((goal) => goal.daily);
  const activityCount = goalActivityDates(goals, goalId, today).length;
  if (!dailyGoals.length) {
    return <section className="plan-daily-empty"><Sprout size={19} /><div><strong>아직 매일 실행할 계획이 없어요</strong><p>가장 작은 하위 계획을 수정해 ‘매일 체크’를 켜면 오늘 체크와 잔디 기록이 시작됩니다.</p></div></section>;
  }
  return (
    <section className="goal-garden-card">
      <header><div><Sprout size={19} /><span><strong>오늘의 잔디</strong><small>매일 실행 계획만 체크하고 실제 기록만 쌓습니다.</small></span></div><b>{dailyGoals.filter((goal) => goal.checkins.includes(today)).length}/{dailyGoals.length}</b></header>
      <div className="daily-plan-list">{dailyGoals.map((goal) => {
        const checked = goal.checkins.includes(today);
        return <button className={checked ? 'checked' : ''} type="button" key={goal.id} onClick={() => onToggle(goal.id, today)}><span className={`color-dot ${goal.color}`} /><span><strong>{goal.title}</strong><small>{goal.period} · 오늘</small></span><CheckCircle2 size={18} /></button>;
      })}</div>
      {activityCount ? <GoalLawn goals={goals} goalId={goalId} today={today} /> : <p className="lawn-awaiting-copy">오늘 첫 체크를 하면 잔디가 나타납니다.</p>}
    </section>
  );
}

type GoalBranchProps = {
  goal: PlanGoal;
  goals: PlanGoal[];
  today: string;
  selectedId: string;
  depth?: number;
  onSelect: (goalId: string) => void;
  onEdit: (goal: PlanGoal) => void;
  onAddChild: (parentId: string) => void;
  onAddTask: (goal: PlanGoal) => void;
  onToggleCheck: (goalId: string, date: string) => void;
};

function GoalBranch({ goal, goals, today, selectedId, depth = 0, onSelect, onEdit, onAddChild, onAddTask, onToggleCheck }: GoalBranchProps) {
  const children = goals.filter((item) => item.parentId === goal.id);
  const checked = goal.checkins.includes(today);
  return (
    <div className="goal-branch" style={{ '--goal-depth': depth } as CSSProperties}>
      <article className={`goal-node ${goal.color} ${selectedId === goal.id ? 'selected' : ''}`}>
        <button className="goal-node-main" onClick={() => onSelect(goal.id)}><span>{goalCode(goal, goals, depth)} · {goalHorizonLabel(goal)}</span><strong>{goal.title}</strong><small>{goal.period || '기간 미정'} · {goal.detail || '완료 기준을 추가해보세요.'}</small></button>
        <div className="goal-node-actions">
          {goal.daily ? <button className={`daily-check ${checked ? 'checked' : ''}`} onClick={() => onToggleCheck(goal.id, today)} aria-label={`${goal.title} 오늘 체크`}><CheckCircle2 size={15} />{checked ? '오늘 완료' : '오늘 체크'}</button> : null}
          <button onClick={() => onAddTask(goal)} aria-label="실행 블록 추가"><CalendarDays size={15} /></button>
          <button onClick={() => onAddChild(goal.id)} aria-label="하위 계획 추가"><GitBranch size={15} /></button>
          <button onClick={() => onEdit(goal)} aria-label="계획 수정"><Pencil size={15} /></button>
        </div>
      </article>
      {children.length ? <div className="goal-children">{children.map((child) => <GoalBranch key={child.id} goal={child} goals={goals} today={today} selectedId={selectedId} depth={depth + 1} onSelect={onSelect} onEdit={onEdit} onAddChild={onAddChild} onAddTask={onAddTask} onToggleCheck={onToggleCheck} />)}</div> : null}
    </div>
  );
}

type TimeBlockDesignerProps = {
  blocks: ScheduleBlock[];
  onNew: () => void;
  onEdit: (block: ScheduleBlock) => void;
  onUse: (block: ScheduleBlock) => void;
};

function TimeBlockDesigner({ blocks, onNew, onEdit, onUse }: TimeBlockDesignerProps) {
  const ordered = [...blocks].sort((a, b) => a.start.localeCompare(b.start));
  return (
    <section className="time-block-designer">
      <header><div><span className="overline">나의 시간 시스템</span><h2>시간 블록</h2><p>05:00–08:00, 18:30–20:00처럼 반복해서 쓰는 시간대를 만들어두세요.</p></div>{!ordered.length ? <button onClick={onNew}><Plus size={15} />블록 추가</button> : null}</header>
      {ordered.length ? <div className="time-block-grid">{ordered.map((block) => {
        const minutes = scheduleBlockDuration(block);
        const hours = Math.floor(minutes / 60);
        const rest = minutes % 60;
        return (
          <article className={`time-block-card ${block.color}`} key={block.id}>
            <span className="time-block-color" />
            <button className="time-block-main" onClick={() => onUse(block)}>
              <small>{block.start} – {block.end}</small>
              <strong>{block.name}</strong>
              <span>{hours ? `${hours}시간${rest ? ` ${rest}분` : ''}` : `${rest}분`} · 눌러서 오늘 할 일 만들기</span>
            </button>
            <button className="time-block-edit" onClick={() => onEdit(block)} aria-label={`${block.name} 수정`}><Pencil size={15} /></button>
          </article>
        );
      })}<button className="time-block-add-card" onClick={onNew}><Plus size={18} /><span><strong>새 시간 블록</strong><small>자주 쓰는 시간대를 추가하세요</small></span></button></div> : <div className="time-block-empty"><Clock3 size={23} /><div><strong>아직 만든 시간 블록이 없어요</strong><p>처음부터 원하는 이름, 시작·종료 시간, 색상을 직접 정할 수 있습니다.</p></div><button onClick={onNew}><Plus size={15} />첫 블록 만들기</button></div>}
    </section>
  );
}

type PlanViewProps = {
  today: string;
  goals: PlanGoal[];
  focusGoalId: string;
  onNewGoalTask: (goal: PlanGoal) => void;
  onNewGoal: (parentId: string | null) => void;
  onEditGoal: (goal: PlanGoal) => void;
  onToggleGoalCheck: (goalId: string, date: string) => void;
};

function PlanView({ today, goals, focusGoalId, onNewGoalTask, onNewGoal, onEditGoal, onToggleGoalCheck }: PlanViewProps) {
  const [selectedGoalId, setSelectedGoalId] = useState(() => focusGoalId || goals[0]?.id || '');
  const roots = goals.filter((goal) => goal.parentId === null).sort((a, b) => b.updatedAt - a.updatedAt);
  const selectedGoal = goals.find((goal) => goal.id === selectedGoalId) ?? roots[0] ?? goals[0];
  const breadcrumb = selectedGoal ? (() => {
    const items: PlanGoal[] = [];
    let current: PlanGoal | undefined = selectedGoal;
    while (current) {
      items.unshift(current);
      current = current.parentId ? goals.find((goal) => goal.id === current?.parentId) : undefined;
    }
    return items;
  })() : [];
  const horizonCounts = GOAL_HORIZONS.map((horizon) => ({ ...horizon, count: goals.filter((goal) => goalHorizon(goal.period, goal.daily) === horizon.id).length }));
  const hasDailyPlans = selectedGoal ? goalScope(goals, selectedGoal.id).some((goal) => goal.daily) : false;
  return (
    <div className="content-view plan-view">
      <header className="view-intro"><div><span className="overline">계획 구조</span><h1>계획 설계</h1><p>장기 방향을 중기 목표, 단기 실행안, 매일 체크할 행동으로 차근차근 세분화합니다.</p></div>{goals.length ? <button className="primary-button" onClick={() => onNewGoal(null)}><Plus size={16} />장기 계획 추가</button> : null}</header>
      <section className="plan-ladder" aria-label="계획 단계">{horizonCounts.map((horizon, index) => <article className={horizon.id} key={horizon.id}><span>{String(index + 1).padStart(2, '0')}</span><div><strong>{horizon.label} 계획</strong><small>{horizon.description}</small></div><b>{horizon.count}</b>{index < horizonCounts.length - 1 ? <ChevronRight size={15} /> : null}</article>)}</section>
      {!goals.length ? <section className="plan-empty-card"><EmptyState icon={Target} title="첫 계획을 만들어보세요" description="예시 데이터 없이 완전히 빈 상태입니다. 기간을 자유롭게 정하고, 어느 단계에서든 하위 계획을 계속 추가할 수 있습니다." action="첫 계획 만들기" onAction={() => onNewGoal(null)} /></section> : <div className="plan-workspace">
        <section className="goal-root-section"><header><div><span className="overline">계획 목록</span><h2>나의 계획</h2></div><button onClick={() => onNewGoal(null)}><Plus size={15} />계획 추가</button></header><div className="goal-flow">{roots.map((goal) => {
          const progress = goalProgress(goals, goal.id, today);
          const childCount = goalScope(goals, goal.id).length - 1;
          return <article className={`goal-root-card ${goal.color} ${breadcrumb[0]?.id === goal.id ? 'selected' : ''}`} key={goal.id}><button className="goal-root-main" onClick={() => setSelectedGoalId(goal.id)}><span className="goal-root-period">{goalCode(goal, goals, 0)} · {goalHorizonLabel(goal)} · {goal.period || '기간 미정'}</span><strong className="goal-root-title">{goal.title}</strong><small>{goal.detail || '완료 기준을 추가해보세요.'}</small>{progress === null ? <span className="goal-progress-empty">매일 실행 연결 전</span> : <span className="goal-progress"><span><i style={{ width: `${progress}%` }} /></span><b>{progress}%</b></span>}</button><footer><button className="goal-manage-button" onClick={() => setSelectedGoalId(goal.id)}><GitBranch size={14} />세분화 관리 · {childCount}</button><button onClick={() => onEditGoal(goal)}><Pencil size={14} />수정</button></footer></article>;
        })}</div></section>
        {selectedGoal ? <section className={`goal-detail-panel ${hasDailyPlans ? '' : 'no-activity'}`}>
          <header className="goal-detail-header"><div><div className="goal-breadcrumb">{breadcrumb.map((goal, index) => <span key={goal.id}>{index ? <ChevronRight size={12} /> : null}<button onClick={() => setSelectedGoalId(goal.id)}>{goal.title}</button></span>)}</div><span className="goal-detail-period">{selectedGoal.period || '기간 미정'} 계획 관리</span><h2>{selectedGoal.title}</h2><p>{selectedGoal.detail || '완료 기준과 하위 계획을 추가해보세요.'}</p></div><div><button onClick={() => onNewGoal(selectedGoal.id)}><GitBranch size={15} />하위 계획 추가</button><button onClick={() => onEditGoal(selectedGoal)}><Pencil size={15} />수정</button></div></header>
          <div className="goal-tree-card"><header><div><GitBranch size={18} /><span><strong>계획 구조</strong><small>A→B1…→C12처럼 단계와 개수 제한 없이 세분화합니다.</small></span></div></header><GoalBranch goal={selectedGoal} goals={goals} today={today} selectedId={selectedGoal.id} depth={Math.max(0, breadcrumb.length - 1)} onSelect={setSelectedGoalId} onEdit={onEditGoal} onAddChild={onNewGoal} onAddTask={onNewGoalTask} onToggleCheck={onToggleGoalCheck} /></div>
          <DailyPlanTracker goals={goals} goalId={selectedGoal.id} today={today} onToggle={onToggleGoalCheck} />
        </section> : null}
      </div>}
    </div>
  );
}

type CalendarMode = 'week' | 'month' | 'year';
type CalendarViewProps = { selectedDate: string; today: string; tasks: PlannerTask[]; onDateChange: (date: string) => void; onNew: (date: string, start?: string | null) => void; onEdit: (task: PlannerTask) => void; onToggle: (id: string, occurrenceDate?: string) => void; onMove: (id: string, date: string, start?: string | null) => void };
type CalendarBodyProps = CalendarViewProps & { onOpenMonth?: (date: string) => void; onDragStartTask?: (taskId: string) => void };

const WEEKDAY_LABELS = ['일', '월', '화', '수', '목', '금', '토'];

function MonthCalendar({ selectedDate, today, tasks, onDateChange, onEdit, onMove, onDragStartTask }: CalendarBodyProps) {
  const dates = monthGridDates(selectedDate);
  const month = selectedDate.slice(0, 7);
  return <div className="month-calendar"><div className="month-weekdays">{WEEKDAY_LABELS.map((day) => <span key={day}>{day}</span>)}</div><div className="month-grid">{dates.map((date) => {
    const dayTasks = tasksForDate(tasks, date).filter((task) => task.start);
    return <article className={`${date.slice(0, 7) === month ? '' : 'outside'} ${date === today ? 'today' : ''} ${date === selectedDate ? 'selected' : ''}`} key={date} onDragOver={(event) => event.preventDefault()} onDrop={(event) => { const taskId = event.dataTransfer.getData('text/plain'); if (taskId) onMove(taskId, date); }}><button className="month-day-number" onClick={() => onDateChange(date)} aria-label={`${formatDateLabel(date)} 선택`}>{Number(date.slice(-2))}</button><div>{dayTasks.slice(0, 3).map((task) => <button className={`month-task-dot ${task.color}`} draggable onDragStart={(event) => { event.dataTransfer.effectAllowed = 'move'; event.dataTransfer.setData('text/plain', task.id); onDragStartTask?.(task.id); }} onClick={() => onEdit(task)} key={`${task.id}-${date}`}><i />{task.title}</button>)}{dayTasks.length > 3 ? <span>+{dayTasks.length - 3}</span> : null}</div></article>;
  })}</div></div>;
}

function YearCalendar({ selectedDate, today, tasks, onDateChange, onOpenMonth, onMove, onDragStartTask }: CalendarBodyProps) {
  const year = Number(selectedDate.slice(0, 4));
  return <div className="year-calendar">{Array.from({ length: 12 }, (_, monthIndex) => {
    const monthDate = `${year}-${String(monthIndex + 1).padStart(2, '0')}-01`;
    const dates = monthGridDates(monthDate);
    return <section className="year-month" key={monthDate}><button className="year-month-title" onClick={() => { onDateChange(monthDate); onOpenMonth?.(monthDate); }}>{monthIndex + 1}월 <ChevronRight size={14} /></button><span className="year-weekdays">{WEEKDAY_LABELS.map((day) => <i key={day}>{day}</i>)}</span><span className="year-days">{dates.map((date) => {
      const dayTasks = tasksForDate(tasks, date).filter((task) => task.start);
      return <button className={`year-day ${date.slice(0, 7) === monthDate.slice(0, 7) ? '' : 'outside'} ${date === today ? 'today' : ''} ${dayTasks.length ? 'has-task' : ''}`} key={date} onClick={() => { onDateChange(date); onOpenMonth?.(date); }} onDragOver={(event) => event.preventDefault()} onDrop={(event) => { event.preventDefault(); const taskId = event.dataTransfer.getData('text/plain'); if (taskId) onMove(taskId, date); }} aria-label={`${formatDateLabel(date)} · ${dayTasks.length}개 블록`}><span>{Number(date.slice(-2))}</span><span className="year-task-colors">{dayTasks.slice(0, 3).map((task) => <i className={task.color} key={`${task.id}-${date}`} title={task.title} draggable onDragStart={(event) => { event.stopPropagation(); event.dataTransfer.effectAllowed = 'move'; event.dataTransfer.setData('text/plain', task.id); onDragStartTask?.(task.id); }} />)}</span></button>;
    })}</span></section>;
  })}</div>;
}

function CalendarView({ selectedDate, today, tasks, onDateChange, onNew, onEdit, onToggle, onMove }: CalendarViewProps) {
  const [mode, setMode] = useState<CalendarMode>('week');
  const [dragId, setDragId] = useState<string | null>(null);
  const dates = weekDates(selectedDate);
  const title = mode === 'week'
    ? `${formatDateLabel(dates[0], { month: 'long', day: 'numeric' })} – ${formatDateLabel(dates[6], { month: 'long', day: 'numeric' })}`
    : mode === 'month'
      ? formatDateLabel(selectedDate, { year: 'numeric', month: 'long' })
      : `${selectedDate.slice(0, 4)}년`;
  function move(direction: -1 | 1) {
    onDateChange(mode === 'week' ? shiftDate(selectedDate, direction * 7) : mode === 'month' ? shiftMonth(selectedDate, direction) : shiftYear(selectedDate, direction));
  }
  return (
    <div className="content-view calendar-view-v2">
      <header className="view-intro calendar-intro"><div><span className="overline">일정</span><h1>{title}</h1><p>색상 실행 블록을 주·월·연 단위로 확인하고, 끌어서 날짜를 옮기거나 눌러 수정합니다.</p></div><div className="calendar-header-tools"><div className="segmented-control"><button className={mode === 'week' ? 'active' : ''} onClick={() => setMode('week')}>주간</button><button className={mode === 'month' ? 'active' : ''} onClick={() => setMode('month')}>월간</button><button className={mode === 'year' ? 'active' : ''} onClick={() => setMode('year')}>연간</button></div><div className="calendar-nav"><button onClick={() => move(-1)} aria-label="이전 기간"><ChevronLeft size={18} /></button><button onClick={() => onDateChange(today)}>오늘</button><button onClick={() => move(1)} aria-label="다음 기간"><ChevronRight size={18} /></button><button className="calendar-add" onClick={() => onNew(selectedDate, '09:00')} aria-label="선택한 날짜에 블록 추가"><Plus size={17} /></button></div></div></header>
      {mode === 'week' ? <><div className="calendar-week-desktop">{dates.map((date) => { const dayTasks = tasksForDate(tasks, date).filter((task) => task.start).sort((a, b) => (a.start ?? '').localeCompare(b.start ?? '')); return <section className={date === today ? 'today' : ''} key={date} onDragOver={(event) => event.preventDefault()} onDrop={(event) => { const taskId = event.dataTransfer.getData('text/plain') || dragId; if (taskId) onMove(taskId, date); setDragId(null); }}><header><span>{formatDateLabel(date, { weekday: 'short' })}</span><strong>{Number(date.slice(-2))}</strong></header><div>{dayTasks.map((task) => <TaskCard key={`${task.id}-${date}`} task={task} onEdit={onEdit} onToggle={onToggle} draggable onDragStart={setDragId} layout="calendar" />)}<button className="calendar-day-add" onClick={() => onNew(date, '09:00')} aria-label={`${date} 블록 추가`}><Plus size={15} /></button></div></section>; })}</div><div className="calendar-week-mobile"><WeekStrip selectedDate={selectedDate} today={today} tasks={tasks} onSelect={onDateChange} />{dates.map((date) => { const dayTasks = tasksForDate(tasks, date).filter((task) => task.start).sort((a, b) => (a.start ?? '').localeCompare(b.start ?? '')); return <section key={date} className={date === selectedDate ? 'selected' : ''} onDragOver={(event) => event.preventDefault()} onDrop={(event) => { const taskId = event.dataTransfer.getData('text/plain') || dragId; if (taskId) onMove(taskId, date); setDragId(null); }}><header><div><strong>{formatDateLabel(date, { weekday: 'long', month: 'short', day: 'numeric' })}</strong><span>{dayTasks.length}개 블록</span></div><button onClick={() => onNew(date, '09:00')} aria-label={`${date} 블록 추가`}><Plus size={17} /></button></header>{dayTasks.length ? dayTasks.map((task) => <TaskCard key={`${task.id}-${date}`} task={task} onEdit={onEdit} onToggle={onToggle} draggable onDragStart={setDragId} layout="list" />) : <p>비어 있는 날입니다.</p>}</section>; })}</div></> : null}
      {mode === 'month' ? <MonthCalendar selectedDate={selectedDate} today={today} tasks={tasks} onDateChange={onDateChange} onNew={onNew} onEdit={onEdit} onToggle={onToggle} onMove={onMove} onDragStartTask={setDragId} /> : null}
      {mode === 'year' ? <YearCalendar selectedDate={selectedDate} today={today} tasks={tasks} onDateChange={onDateChange} onNew={onNew} onEdit={onEdit} onToggle={onToggle} onMove={onMove} onDragStartTask={setDragId} onOpenMonth={() => setMode('month')} /> : null}
    </div>
  );
}

type FocusViewProps = { today: string; tasks: PlannerTask[]; selectedTaskId: string | null; onSelect: (id: string) => void; onComplete: (id: string, occurrenceDate?: string) => void };
function FocusView({ today, tasks, selectedTaskId, onSelect, onComplete }: FocusViewProps) {
  const todayScheduled = tasksForDate(tasks, today).filter((task) => task.start);
  const focusable = todayScheduled.filter((task) => !task.completed);
  const task = focusable.find((item) => item.id === selectedTaskId) ?? focusable[0];
  const completedToday = todayScheduled.filter((item) => item.completed);
  const weekCompleted = Array.from({ length: 7 }, (_, index) => shiftDate(today, index - 6)).flatMap((date) => tasksForDate(tasks, date).filter((item) => item.start && item.completed));
  const [seconds, setSeconds] = useState(25 * 60);
  const [running, setRunning] = useState(false);
  const [mode, setMode] = useState<'focus' | 'break'>('focus');
  useEffect(() => {
    if (!running) return;
    const timer = window.setInterval(() => setSeconds((value) => {
      if (value <= 1) {
        setRunning(false);
        return 0;
      }
      return value - 1;
    }), 1000);
    return () => window.clearInterval(timer);
  }, [running]);
  function setTimerMode(next: 'focus' | 'break') { setMode(next); setRunning(false); setSeconds(next === 'focus' ? 25 * 60 : 5 * 60); }
  function durationLabel(minutes: number) {
    const hours = Math.floor(minutes / 60);
    const rest = minutes % 60;
    return hours ? `${hours}시간 ${rest ? `${rest}분` : ''}`.trim() : `${rest}분`;
  }
  const total = mode === 'focus' ? 25 * 60 : 5 * 60;
  const progress = Math.round((total - seconds) / total * 360);
  return (
    <div className="content-view focus-view-v2">
      <header className="view-intro"><div><span className="overline">집중 모드</span><h1>집중</h1><p>지금 필요한 한 가지에만 조용히 몰입하세요.</p></div></header>
      <div className="focus-layout">
        <section className="focus-main-card">
          <div className="segmented-control"><button className={mode === 'focus' ? 'active' : ''} onClick={() => setTimerMode('focus')}>집중 25분</button><button className={mode === 'break' ? 'active' : ''} onClick={() => setTimerMode('break')}>휴식 5분</button></div>
          <div className="focus-timer" style={{ '--focus-progress': `${progress}deg` } as CSSProperties}><div><strong>{String(Math.floor(seconds / 60)).padStart(2, '0')}:{String(seconds % 60).padStart(2, '0')}</strong><span>{running ? '흐름을 유지하세요' : '준비되면 시작하세요'}</span></div></div>
          <div className="focus-task-picker">
            <header><i className={task?.color ?? 'sage'} /><span>집중할 실행</span></header>
            {focusable.length ? <div className="focus-task-options" role="group" aria-label="집중할 실행">{focusable.map((item) => <button type="button" aria-pressed={task?.id === item.id} key={item.id} onClick={() => onSelect(item.id)}>{item.title}</button>)}</div> : <p>오늘 배치된 실행이 없습니다.</p>}
          </div>
          <div className="focus-actions"><button className="icon-button" onClick={() => { setRunning(false); setSeconds(total); }} aria-label="타이머 초기화"><TimerReset size={18} /></button><button className="focus-start" onClick={() => setRunning((value) => !value)}>{running ? '잠시 멈춤' : '집중 시작'}</button>{task ? <button className="icon-button" onClick={() => onComplete(task.id, task.occurrenceDate)} aria-label="작업 완료"><Check size={18} /></button> : null}</div>
        </section>
        <aside className="focus-stats"><article><Sparkles size={19} /><span>오늘 완료 블록</span><strong>{durationLabel(completedToday.reduce((sum, item) => sum + item.duration, 0))}</strong><p>{completedToday.length}개의 실제 완료 기록</p></article><article><BarChart3 size={19} /><span>최근 7일 완료 블록</span><strong>{durationLabel(weekCompleted.reduce((sum, item) => sum + item.duration, 0))}</strong><p>{weekCompleted.length}개의 실제 완료 기록</p></article></aside>
      </div>
    </div>
  );
}

type SearchOverlayProps = {
  query: string;
  tasks: PlannerTask[];
  goals: PlanGoal[];
  blocks: ScheduleBlock[];
  onQueryChange: (query: string) => void;
  onClose: () => void;
  onOpenTask: (task: PlannerTask) => void;
  onOpenGoal: (goal: PlanGoal) => void;
  onOpenBlock: (block: ScheduleBlock) => void;
};

function SearchOverlay({ query, tasks, goals, blocks, onQueryChange, onClose, onOpenTask, onOpenGoal, onOpenBlock }: SearchOverlayProps) {
  const normalizedQuery = query.trim().toLocaleLowerCase('ko-KR');
  const matches = (...values: string[]) => values.join(' ').toLocaleLowerCase('ko-KR').includes(normalizedQuery);
  const taskResults = normalizedQuery ? tasks.filter((task) => matches(task.title, task.project, task.notes, task.goal)).sort((a, b) => b.updatedAt - a.updatedAt).slice(0, 6) : [];
  const goalResults = normalizedQuery ? goals.filter((goal) => matches(goal.title, goal.detail, goal.period)).sort((a, b) => b.updatedAt - a.updatedAt).slice(0, 4) : [];
  const blockResults = normalizedQuery ? blocks.filter((block) => matches(block.name, block.start, block.end)).sort((a, b) => b.updatedAt - a.updatedAt).slice(0, 4) : [];
  const hasResults = taskResults.length + goalResults.length + blockResults.length > 0;

  return <div className="search-overlay" onMouseDown={(event) => { if (event.target === event.currentTarget) onClose(); }}><div><header><Search size={18} /><input autoFocus value={query} aria-label="통합 검색어" placeholder="할 일, 계획, 시간 블록 검색" onChange={(event) => onQueryChange(event.target.value)} /><button type="button" onClick={onClose} aria-label="검색 닫기">ESC</button></header>{!normalizedQuery ? <p>제목, 프로젝트, 메모와 계획을 한 번에 검색할 수 있습니다.</p> : null}{normalizedQuery && !hasResults ? <p>일치하는 항목이 없습니다.</p> : null}{taskResults.length ? <div className="search-result-group"><strong>할 일</strong>{taskResults.map((task) => <button type="button" key={task.id} onClick={() => onOpenTask(task)}><i className={task.color} /><span><b>{task.title}</b><small>{task.project} · {task.date}</small></span><Edit3 size={15} /></button>)}</div> : null}{goalResults.length ? <div className="search-result-group"><strong>계획</strong>{goalResults.map((goal) => <button type="button" key={goal.id} onClick={() => onOpenGoal(goal)}><i className={goal.color} /><span><b>{goal.title}</b><small>{goal.period} · {goal.parentId ? '하위 계획' : '최상위 계획'}</small></span><Target size={15} /></button>)}</div> : null}{blockResults.length ? <div className="search-result-group"><strong>시간 블록</strong>{blockResults.map((block) => <button type="button" key={block.id} onClick={() => onOpenBlock(block)}><i className={block.color} /><span><b>{block.name}</b><small>{block.start}–{block.end}</small></span><Clock3 size={15} /></button>)}</div> : null}</div></div>;
}

type CreateHubProps = {
  onClose: () => void;
  onTask: () => void;
  onBlock: () => void;
  onGoal: () => void;
};

function CreateHub({ onClose, onTask, onBlock, onGoal }: CreateHubProps) {
  const actions = [
    { title: '실행 · 할 일', description: '인박스에 두거나 원하는 시간에 바로 배치', icon: CheckCircle2, action: onTask },
    { title: '시간 블록', description: '반복해서 쓰는 나만의 시간대 틀 만들기', icon: Clock3, action: onBlock },
    { title: '계획', description: '장기 목표와 하위 계획을 계층으로 연결', icon: Target, action: onGoal },
  ];

  return (
    <div className="create-hub-backdrop" onMouseDown={(event) => { if (event.target === event.currentTarget) onClose(); }}>
      <section className="create-hub" role="dialog" aria-modal="true" aria-labelledby="create-hub-title">
        <div className="sheet-handle" aria-hidden="true" />
        <header><div><span className="overline">빠른 만들기</span><h2 id="create-hub-title">무엇을 관리할까요?</h2><p>실행, 시간, 계획을 같은 흐름에서 연결합니다.</p></div><button className="icon-button ghost" type="button" onClick={onClose} aria-label="닫기"><X size={20} /></button></header>
        <div className="create-hub-actions">{actions.map(({ title, description, icon: Icon, action }) => <button type="button" key={title} onClick={action}><span><Icon size={20} /></span><div><strong>{title}</strong><small>{description}</small></div><ArrowRight size={17} /></button>)}</div>
      </section>
    </div>
  );
}

type BottomNavProps = { active: PlannerView; onChange: (view: PlannerView) => void; onAdd: () => void };
function BottomNav({ active, onChange, onAdd }: BottomNavProps) {
  return (
    <nav className="mobile-bottom-nav" aria-label="모바일 주요 메뉴">
      {NAV_ITEMS.map(({ id, label, icon: Icon }) => (
        <button className={active === id ? 'active' : ''} aria-current={active === id ? 'page' : undefined} key={id} onClick={() => onChange(id)}>
          <Icon size={20} /><span>{label}</span>
        </button>
      ))}
      <button className="mobile-fab" onClick={onAdd} aria-label="새로 만들기"><Plus size={24} /></button>
    </nav>
  );
}

type PlannerAppProps = { userId: string; userEmail: string };

export function PlannerApp({ userId, userEmail }: PlannerAppProps) {
  const planner = usePlanner(userId);
  const [active, setActive] = useState<PlannerView>('habit');
  const [selectedDate, setSelectedDate] = useState('');
  const [editor, setEditor] = useState<EditorState>(null);
  const [goalEditor, setGoalEditor] = useState<GoalEditorState>(null);
  const [timeBlockEditor, setTimeBlockEditor] = useState<TimeBlockEditorState>(null);
  const [settingsOpen, setSettingsOpen] = useState(false);
  const [createHubOpen, setCreateHubOpen] = useState(false);
  const [searchOpen, setSearchOpen] = useState(false);
  const [searchQuery, setSearchQuery] = useState('');
  const [focusTaskId, setFocusTaskId] = useState<string | null>(null);
  const [focusGoalId, setFocusGoalId] = useState('');
  const [closedIntroView, setClosedIntroView] = useState<PlannerView | null>(null);
  const [replayIntroView, setReplayIntroView] = useState<PlannerView | null>(null);
  const activeDate = selectedDate || planner.today;
  const automaticIntroView = planner.ready && !planner.introducedViews.includes(active) && closedIntroView !== active ? active : null;
  const introView = replayIntroView ?? automaticIntroView;
  const overlayOpen = Boolean(introView) || settingsOpen || createHubOpen || searchOpen || Boolean(editor || goalEditor || timeBlockEditor);

  useEffect(() => {
    function handleKeyboard(event: KeyboardEvent) {
      if (introView) return;
      if ((event.metaKey || event.ctrlKey) && event.key.toLocaleLowerCase() === 'k') {
        event.preventDefault();
        setSearchOpen(true);
      }
      if (event.key === 'Escape') {
        setCreateHubOpen(false);
        setSearchOpen(false);
        setSearchQuery('');
        setSettingsOpen(false);
        setEditor(null);
        setGoalEditor(null);
        setTimeBlockEditor(null);
      }
    }
    window.addEventListener('keydown', handleKeyboard);
    return () => window.removeEventListener('keydown', handleKeyboard);
  }, [introView]);

  useEffect(() => {
    if (!overlayOpen) return;
    const root = document.documentElement;
    const previousOverflow = document.body.style.overflow;
    const previousRootOverflow = root.style.overflow;
    const previousRootOverscroll = root.style.overscrollBehavior;
    document.body.style.overflow = 'hidden';
    root.style.overflow = 'hidden';
    root.style.overscrollBehavior = 'none';
    return () => {
      document.body.style.overflow = previousOverflow;
      root.style.overflow = previousRootOverflow;
      root.style.overscrollBehavior = previousRootOverscroll;
    };
  }, [overlayOpen]);

  function closeSearch() { setSearchOpen(false); setSearchQuery(''); }

  function completeMenuIntro() {
    if (!introView) return;
    planner.markViewIntroduced(introView);
    setClosedIntroView(introView);
    setReplayIntroView(null);
  }

  function showCurrentMenuIntro() {
    setSettingsOpen(false);
    setClosedIntroView(null);
    setReplayIntroView(active);
  }

  function openNew(date = activeDate, start: string | null = null, goal?: PlanGoal) {
    setCreateHubOpen(false);
    const task = createEmptyTask(date, start);
    setEditor({ task: goal ? { ...task, goalId: goal.id, goal: goal.title } : task, isNew: true });
  }
  function openEdit(task: PlannerTask) { setEditor({ task, isNew: false }); }
  function scheduleFromInbox(task: PlannerTask, date: string) { setEditor({ task: { ...task, date, start: '09:00' }, isNew: false }); }
  function openNewGoal(parentId: string | null) {
    setCreateHubOpen(false);
    const parent = parentId ? planner.goals.find((goal) => goal.id === parentId) : undefined;
    setGoalEditor({ goal: createEmptyGoal(parentId, parent?.period), isNew: true });
  }
  function openEditGoal(goal: PlanGoal) { setGoalEditor({ goal, isNew: false }); }
  function openNewScheduleBlock() {
    setCreateHubOpen(false);
    const ordered = [...planner.scheduleBlocks].sort((a, b) => a.end.localeCompare(b.end));
    const lastEnd = ordered.at(-1)?.end;
    const start = lastEnd && timeToMinutes(lastEnd) <= 20 * 60 + 45 ? lastEnd : '05:00';
    const end = minutesToTime(timeToMinutes(start) + 180);
    setTimeBlockEditor({ block: createEmptyScheduleBlock(start, end), isNew: true });
  }
  function openEditScheduleBlock(block: ScheduleBlock) { setTimeBlockEditor({ block, isNew: false }); }
  function useScheduleBlock(block: ScheduleBlock) {
    const task = createEmptyTask(activeDate, block.start);
    setEditor({ task: { ...task, title: block.name, duration: scheduleBlockDuration(block), color: block.color }, isNew: true });
  }
  function startFocus(taskId: string) { setFocusTaskId(taskId); setActive('focus'); }
  function moveQuadrant(taskId: string, quadrant: Quadrant) {
    const task = planner.tasks.find((item) => item.id === taskId);
    if (task) planner.upsertTask({ ...task, quadrant });
  }

  async function signOut() {
    const supabase = createClient();
    await supabase.auth.signOut();
    window.location.assign(new URL('/login', window.location.origin));
  }

  const syncLabel = {
    loading: '클라우드 연결 중',
    saving: '변경사항 저장 중',
    synced: '모든 기기와 동기화됨',
    offline: '오프라인 · 이 기기에 저장됨',
    error: '클라우드 연결을 확인해주세요',
  }[planner.syncStatus];
  const SyncIcon = planner.syncStatus === 'error' || planner.syncStatus === 'offline' ? CloudOff : Cloud;

  if (!planner.ready || !activeDate) return <div className="app-loading"><span><Image src="/flowday-icon-192.png" width={48} height={48} alt="" priority /></span><strong>Flowday</strong><i /></div>;

  return (
    <main className={`planner-shell theme-${planner.theme}`}>
      <aside className="desktop-sidebar">
        <button className="app-brand" onClick={() => setActive('habit')}><span><Image src="/flowday-icon-192.png" width={33} height={33} alt="" priority /></span><strong>Flowday</strong></button>
        <nav>{NAV_ITEMS.map(({ id, label, icon: Icon }) => <button className={active === id ? 'active' : ''} aria-current={active === id ? 'page' : undefined} key={id} onClick={() => setActive(id)}><Icon size={18} /><span>{label}</span>{id === 'inbox' ? <b>{planner.tasks.filter((task) => !task.start && !task.completed).length}</b> : null}</button>)}</nav>
        <section className="sidebar-projects"><header><span>프로젝트</span><Plus size={14} /></header>{PROJECTS.map((project) => <button key={project.name}><i className={project.color} />{project.name}<span>{planner.tasks.filter((task) => task.project === project.name && !task.completed).length}</span></button>)}</section>
        <footer><button onClick={() => setSettingsOpen(true)}><Settings2 size={18} />설정과 데이터</button><div className={`sync-state ${planner.saveError ? 'error' : ''}`}><SyncIcon size={15} /><span>{syncLabel}</span></div></footer>
      </aside>

      <section className="planner-main">
        <header className="mobile-header"><button className="mobile-logo" onClick={() => setActive('habit')} aria-label="습관으로 이동"><Image src="/flowday-icon-192.png" width={39} height={39} alt="" priority /></button><div className="mobile-header-copy"><span>{VIEW_TITLES[active]}</span><strong>Flowday</strong></div><div className="mobile-header-actions"><button className="icon-button ghost" onClick={() => setSearchOpen(true)} aria-label="통합 검색"><Search size={19} /></button><button className="icon-button ghost" onClick={() => setSettingsOpen(true)} aria-label="설정과 데이터"><Settings2 size={20} /></button></div></header>
        <header className="desktop-topbar"><div className="desktop-search"><Search size={16} /><input placeholder="검색" aria-label="검색" onFocus={() => setSearchOpen(true)} /><kbd><Command size={12} /> K</kbd></div><div><button className="icon-button ghost" onClick={() => setSettingsOpen(true)} aria-label={`동기화 상태: ${syncLabel}`}><SyncIcon size={18} /></button><button className="icon-button ghost" onClick={() => setSettingsOpen(true)} aria-label="설정과 데이터"><Settings2 size={18} /></button></div></header>

        <div className="view-container">
          {active === 'habit' ? <HabitView selectedDate={activeDate} today={planner.today} tasks={planner.tasks} onDateChange={setSelectedDate} onNew={openNew} onEdit={openEdit} onToggle={planner.toggleTask} onFocus={startFocus} onMove={planner.moveTask} onSchedule={scheduleFromInbox} scheduleBlocks={planner.scheduleBlocks} onNewScheduleBlock={openNewScheduleBlock} onEditScheduleBlock={openEditScheduleBlock} onUseScheduleBlock={useScheduleBlock} /> : null}
          {active === 'inbox' ? <InboxView today={planner.today} tasks={planner.tasks} onAdd={planner.upsertTask} onNew={openNew} onEdit={openEdit} onToggle={planner.toggleTask} onMoveQuadrant={moveQuadrant} onSchedule={scheduleFromInbox} /> : null}
          {active === 'plan' ? <PlanView key={focusGoalId || 'plan'} today={planner.today} goals={planner.goals} focusGoalId={focusGoalId} onNewGoalTask={(goal) => openNew(activeDate, null, goal)} onNewGoal={openNewGoal} onEditGoal={openEditGoal} onToggleGoalCheck={planner.toggleGoalCheck} /> : null}
          {active === 'calendar' ? <CalendarView selectedDate={activeDate} today={planner.today} tasks={planner.tasks} onDateChange={setSelectedDate} onNew={openNew} onEdit={openEdit} onToggle={planner.toggleTask} onMove={planner.moveTask} /> : null}
          {active === 'focus' ? <FocusView today={planner.today} tasks={planner.tasks} selectedTaskId={focusTaskId} onSelect={setFocusTaskId} onComplete={planner.toggleTask} /> : null}
        </div>
      </section>

      <button className="desktop-fab" onClick={() => setCreateHubOpen(true)}><Plus size={21} /><span>새로 만들기</span></button>
      <BottomNav active={active} onChange={setActive} onAdd={() => setCreateHubOpen(true)} />

      {createHubOpen ? <CreateHub onClose={() => setCreateHubOpen(false)} onTask={() => openNew()} onBlock={openNewScheduleBlock} onGoal={() => openNewGoal(null)} /> : null}
      {editor ? <TaskSheet key={`${editor.task.id}-${editor.isNew}`} task={editor.task} tasks={planner.tasks} goals={planner.goals} scheduleBlocks={planner.scheduleBlocks} isNew={editor.isNew} onClose={() => setEditor(null)} onSave={(task) => { planner.upsertTask(task); setEditor(null); }} onDelete={planner.deleteTask} onDuplicate={planner.duplicateTask} /> : null}
      {goalEditor ? <GoalSheet key={`${goalEditor.goal.id}-${goalEditor.isNew}`} goal={goalEditor.goal} goals={planner.goals} isNew={goalEditor.isNew} onClose={() => setGoalEditor(null)} onSave={(goal) => { planner.upsertGoal(goal); setFocusGoalId(goal.id); setActive('plan'); setGoalEditor(null); }} onDelete={planner.deleteGoal} /> : null}
      {timeBlockEditor ? <TimeBlockSheet key={`${timeBlockEditor.block.id}-${timeBlockEditor.isNew}`} block={timeBlockEditor.block} isNew={timeBlockEditor.isNew} onClose={() => setTimeBlockEditor(null)} onSave={(block) => { planner.upsertScheduleBlock(block); setTimeBlockEditor(null); }} onDelete={planner.deleteScheduleBlock} /> : null}
      {settingsOpen ? <SettingsSheet userEmail={userEmail} theme={planner.theme} counts={{ tasks: planner.tasks.length, goals: planner.goals.length, blocks: planner.scheduleBlocks.length }} lastSavedAt={planner.lastSavedAt} saveError={planner.saveError} syncStatus={planner.syncStatus} onThemeChange={planner.setTheme} onExport={planner.exportBackup} onImport={planner.importBackup} onRestore={planner.restoreRecovery} onReset={planner.resetPlanner} onShowMenuIntro={showCurrentMenuIntro} onSignOut={signOut} onClose={() => setSettingsOpen(false)} /> : null}
      {searchOpen ? <SearchOverlay query={searchQuery} tasks={planner.tasks} goals={planner.goals} blocks={planner.scheduleBlocks} onQueryChange={setSearchQuery} onClose={closeSearch} onOpenTask={(task) => { openEdit(task); closeSearch(); }} onOpenGoal={(goal) => { openEditGoal(goal); closeSearch(); }} onOpenBlock={(block) => { openEditScheduleBlock(block); closeSearch(); }} /> : null}
      {introView ? <MenuIntro key={introView} view={introView} onComplete={completeMenuIntro} /> : null}
    </main>
  );
}

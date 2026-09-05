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
import { CSSProperties, FormEvent, useEffect, useMemo, useRef, useState } from 'react';
import { type DailyRatingSyncStatus, useDailyRatings } from '../hooks/use-daily-ratings';
import { type PlannerSyncStatus, usePlanner } from '../hooks/use-planner';
import {
  DailyRating,
  formatRating,
  ratingTier,
  ratingsByDate,
} from '../lib/daily-rating';
import {
  cancelFocusNotification,
  configureNativeShell,
  currentTimestamp,
  installNativeEventBridge,
  nativeImpact,
  nativeSuccess,
  scheduleFocusNotification,
} from '../lib/native';
import { createClient } from '../lib/supabase/client';
import {
  createEmptyGoal,
  createEmptyScheduleBlock,
  createEmptyTask,
  formatDateLabel,
  formatGoalNumericProgress,
  goalHorizon,
  goalNumericProgress,
  goalsForDate,
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
import { DayRatingSheet, DayRatingSummary, RatingTrend } from './day-rating';
import { MenuIntro } from './menu-intro';
import { SettingsSheet } from './settings-sheet';
import { TaskSheet } from './task-sheet';
import { TimeBlockSheet } from './time-block-sheet';

type EditorState = { task: PlannerTask; isNew: boolean } | null;
type GoalEditorState = { goal: PlanGoal; isNew: boolean; returnView?: PlannerView } | null;
type TimeBlockEditorState = { block: ScheduleBlock; isNew: boolean } | null;
type RatingEditorState = { date: string } | null;

export function combineSyncStatuses(plannerStatus: PlannerSyncStatus, ratingStatus: DailyRatingSyncStatus): PlannerSyncStatus {
  if (plannerStatus === 'error' || ratingStatus === 'error') return 'error';
  if (plannerStatus === 'offline' || ratingStatus === 'offline') return 'offline';
  if (plannerStatus === 'saving' || ratingStatus === 'saving') return 'saving';
  if (plannerStatus === 'loading' || ratingStatus === 'loading') return 'loading';
  return 'synced';
}

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
  ratings?: DailyRating[];
  onSelect: (date: string) => void;
};

function WeekStrip({ selectedDate, today, tasks, ratings = [], onSelect }: WeekStripProps) {
  const dates = weekDates(selectedDate);
  const ratingMap = ratingsByDate(ratings);
  return (
    <nav className="week-strip" aria-label="주간 날짜 선택">
      {dates.map((date) => {
        const parts = formatDateLabel(date, { weekday: 'short', day: 'numeric' }).replace('.', '').split(' ');
        const taskCount = tasksForDate(tasks, date).filter((task) => !task.completed).length;
        const rating = ratingMap.get(date);
        return (
          <button className={`${selectedDate === date ? 'selected' : ''} ${today === date ? 'today' : ''}`} key={date} onClick={() => onSelect(date)}>
            <span>{parts[0]}</span><strong>{Number(date.slice(-2))}</strong>{rating ? <small>{formatRating(rating.scoreHundredths)}</small> : <i className={taskCount ? 'has-tasks' : ''} />}
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
  ratings: DailyRating[];
  ratingSyncStatus: ReturnType<typeof useDailyRatings>['syncStatus'];
  onRate: (date: string) => void;
};

function HabitView({ selectedDate, today, tasks, onDateChange, onNew, onEdit, onToggle, onFocus, onMove, onSchedule, scheduleBlocks, onNewScheduleBlock, onEditScheduleBlock, onUseScheduleBlock, ratings, ratingSyncStatus, onRate }: HabitViewProps) {
  const timed = useMemo(() => tasksForDate(tasks, selectedDate).filter((task) => task.start).sort((a, b) => (a.start ?? '').localeCompare(b.start ?? '')), [tasks, selectedDate]);
  const inboxTasks = useMemo(() => tasks.filter((task) => !task.start && !task.completed).sort((a, b) => a.priority - b.priority), [tasks]);
  const completed = timed.filter((task) => task.completed).length;
  const completion = timed.length ? Math.round(completed / timed.length * 100) : 0;
  const [dragId, setDragId] = useState<string | null>(null);
  const rating = ratings.find((item) => item.date === selectedDate);

  return (
    <div className="today-view habit-view">
      <WeekStrip selectedDate={selectedDate} today={today} tasks={tasks} ratings={ratings} onSelect={onDateChange} />
      <section className="day-hero day-dashboard">
        <div className="day-hero-copy">
          <span className="overline">{selectedDate === today ? '오늘의 리듬' : '선택한 날짜'}</span>
          <h1>{formatDateLabel(selectedDate)}</h1>
          <p>{timed.length ? '오늘의 흐름을 하나씩 실행해보세요.' : '인박스의 할 일을 가져오거나 새 습관을 만들어보세요.'}</p>
          {timed.length ? <div className="day-progress"><span>오늘 진행</span><div><i style={{ width: `${completion}%` }} /></div><strong>{completed}/{timed.length}</strong></div> : null}
        </div>
        <DayRatingSummary date={selectedDate} today={today} rating={rating} syncStatus={ratingSyncStatus} onOpen={onRate} />
      </section>

      <nav className="day-quick-actions" aria-label="선택한 날짜 빠른 실행">
        <button onClick={() => onNew(selectedDate, '09:00')}><Plus size={17} /><span><strong>일정 추가</strong><small>시간을 정해 실행하기</small></span></button>
        <button onClick={() => document.getElementById('habit-inbox')?.scrollIntoView({ behavior: 'smooth', block: 'center' })}><Inbox size={17} /><span><strong>인박스 배치</strong><small>{inboxTasks.length}개 기다리는 중</small></span></button>
        <button disabled={selectedDate > today} onClick={() => onRate(selectedDate)}><Sparkles size={17} /><span><strong>하루 평가</strong><small>{rating ? `${formatRating(rating.scoreHundredths)}점 수정` : '감상 기록하기'}</small></span></button>
      </nav>

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

      <RatingTrend ratings={ratings} selectedDate={selectedDate} today={today} onOpen={onRate} />

      <div className="day-support-grid">
        <section className="habit-inbox-callout" id="habit-inbox">
          <header><div><Inbox size={18} /><span><strong>인박스에서 가져오기</strong><small>할 일을 원하는 시간대의 블록으로 배치합니다.</small></span></div><b>{inboxTasks.length}</b></header>
          {inboxTasks.length ? <div className="habit-inbox-list">{inboxTasks.slice(0, 4).map((task) => <div key={task.id}><span className={`color-dot ${task.color}`} /><button onClick={() => onEdit(task)}><strong>{task.title}</strong><small>{task.project} · P{task.priority}</small></button><button onClick={() => onSchedule(task, selectedDate)}><Clock3 size={14} />배치</button></div>)}</div> : <p>인박스가 비어 있습니다. 먼저 할 일을 적어보세요.</p>}
        </section>
        <div id="habit-time-blocks"><TimeBlockDesigner blocks={scheduleBlocks} onNew={onNewScheduleBlock} onEdit={onEditScheduleBlock} onUse={onUseScheduleBlock} /></div>
      </div>
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

function goalProgressSummary(goals: PlanGoal[], goal: PlanGoal, today: string) {
  const numericProgress = goalNumericProgress(goal);
  const numericLabel = formatGoalNumericProgress(goal);
  if (numericProgress !== null && numericLabel) return { percent: numericProgress, label: numericLabel };
  const habitProgress = goalProgress(goals, goal.id, today);
  return habitProgress === null ? null : { percent: habitProgress, label: `최근 7일 ${habitProgress}%` };
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
  const numericProgress = formatGoalNumericProgress(goal);
  const deadline = goal.deadline ? formatDateLabel(goal.deadline, { month: 'short', day: 'numeric' }) : null;
  return (
    <div className="goal-branch" style={{ '--goal-depth': depth } as CSSProperties}>
      <article className={`goal-node ${goal.color} ${selectedId === goal.id ? 'selected' : ''}`}>
        <button className="goal-node-main" onClick={() => onSelect(goal.id)}><span>{goalCode(goal, goals, depth)} · {goalHorizonLabel(goal)}</span><strong>{goal.title}</strong><small>{goal.period || '기간 미정'} · {numericProgress ?? (goal.detail || '완료 기준을 추가해보세요.')}{deadline ? ` · 마감 ${deadline}` : ''}</small></button>
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
          const progress = goalProgressSummary(goals, goal, today);
          const childCount = goalScope(goals, goal.id).length - 1;
          return <article className={`goal-root-card ${goal.color} ${breadcrumb[0]?.id === goal.id ? 'selected' : ''}`} key={goal.id}><button className="goal-root-main" onClick={() => setSelectedGoalId(goal.id)}><span className="goal-root-period">{goalCode(goal, goals, 0)} · {goalHorizonLabel(goal)} · {goal.period || '기간 미정'}</span><strong className="goal-root-title">{goal.title}</strong><small>{goal.detail || '완료 기준을 추가해보세요.'}</small>{progress === null ? <span className="goal-progress-empty">진행률 또는 매일 실행 설정 전</span> : <span className="goal-progress"><span><i style={{ width: `${progress.percent}%` }} /></span><b>{progress.label}</b></span>}</button><footer><button className="goal-manage-button" onClick={() => setSelectedGoalId(goal.id)}><GitBranch size={14} />세분화 관리 · {childCount}</button><button onClick={() => onEditGoal(goal)}><Pencil size={14} />수정</button></footer></article>;
        })}</div></section>
        {selectedGoal ? <section className={`goal-detail-panel ${hasDailyPlans ? '' : 'no-activity'}`}>
          <header className="goal-detail-header"><div><div className="goal-breadcrumb">{breadcrumb.map((goal, index) => <span key={goal.id}>{index ? <ChevronRight size={12} /> : null}<button onClick={() => setSelectedGoalId(goal.id)}>{goal.title}</button></span>)}</div><span className="goal-detail-period">{selectedGoal.period || '기간 미정'} 계획 관리</span><h2>{selectedGoal.title}</h2><p>{selectedGoal.detail || '완료 기준과 하위 계획을 추가해보세요.'}</p>{formatGoalNumericProgress(selectedGoal) || selectedGoal.deadline ? <div className="goal-detail-metrics">{formatGoalNumericProgress(selectedGoal) ? <span><BarChart3 size={13} />{formatGoalNumericProgress(selectedGoal)} · {goalNumericProgress(selectedGoal)}%</span> : null}{selectedGoal.deadline ? <span><CalendarDays size={13} />마감 {formatDateLabel(selectedGoal.deadline, { year: 'numeric', month: 'short', day: 'numeric' })}</span> : null}</div> : null}</div><div><button onClick={() => onNewGoal(selectedGoal.id)}><GitBranch size={15} />하위 계획 추가</button><button onClick={() => onEditGoal(selectedGoal)}><Pencil size={15} />수정</button></div></header>
          <div className="goal-tree-card"><header><div><GitBranch size={18} /><span><strong>계획 구조</strong><small>A→B1…→C12처럼 단계와 개수 제한 없이 세분화합니다.</small></span></div></header><GoalBranch goal={selectedGoal} goals={goals} today={today} selectedId={selectedGoal.id} depth={Math.max(0, breadcrumb.length - 1)} onSelect={setSelectedGoalId} onEdit={onEditGoal} onAddChild={onNewGoal} onAddTask={onNewGoalTask} onToggleCheck={onToggleGoalCheck} /></div>
          <DailyPlanTracker goals={goals} goalId={selectedGoal.id} today={today} onToggle={onToggleGoalCheck} />
        </section> : null}
      </div>}
    </div>
  );
}

type CalendarMode = 'week' | 'month' | 'year';
type CalendarViewProps = {
  selectedDate: string;
  today: string;
  tasks: PlannerTask[];
  goals: PlanGoal[];
  ratings?: DailyRating[];
  onDateChange: (date: string) => void;
  onNew: (date: string, start?: string | null) => void;
  onNewGoal: (date: string) => void;
  onEdit: (task: PlannerTask) => void;
  onEditGoal: (goal: PlanGoal) => void;
  onToggle: (id: string, occurrenceDate?: string) => void;
  onMove: (id: string, date: string, start?: string | null) => void;
  onMoveGoal: (id: string, date: string) => void;
  onRateDay?: (date: string) => void;
};
type CalendarBodyProps = CalendarViewProps & { onOpenMonth?: (date: string) => void; onDragStartTask?: (taskId: string) => void };

const WEEKDAY_LABELS = ['일', '월', '화', '수', '목', '금', '토'];

function CalendarGoalCard({ goal, onEdit, layout = 'week' }: { goal: PlanGoal; onEdit: (goal: PlanGoal) => void; layout?: 'week' | 'list' }) {
  return (
    <button
      className={`calendar-goal-card ${goal.color} ${layout}`}
      draggable
      onDragStart={(event) => {
        event.dataTransfer.effectAllowed = 'move';
        event.dataTransfer.setData('application/x-flowday-goal', goal.id);
      }}
      onClick={() => onEdit(goal)}
    >
      <Target size={15} />
      <span><small>목표 완료일</small><strong>{goal.title}</strong></span>
    </button>
  );
}

function MonthCalendar({ selectedDate, today, tasks, goals, ratings = [], onDateChange, onEdit, onEditGoal, onMove, onMoveGoal, onRateDay, onDragStartTask }: CalendarBodyProps) {
  const dates = monthGridDates(selectedDate);
  const month = selectedDate.slice(0, 7);
  const ratingMap = ratingsByDate(ratings);
  return <div className="month-calendar"><div className="month-weekdays">{WEEKDAY_LABELS.map((day) => <span key={day}>{day}</span>)}</div><div className="month-grid">{dates.map((date) => {
    const dayTasks = tasksForDate(tasks, date).filter((task) => task.start);
    const dayGoals = goalsForDate(goals, date);
    const visibleGoals = dayGoals.slice(0, 2);
    const visibleTasks = dayTasks.slice(0, Math.max(0, 3 - visibleGoals.length));
    const hiddenCount = dayGoals.length + dayTasks.length - visibleGoals.length - visibleTasks.length;
    const rating = ratingMap.get(date);
    return <article className={`${date.slice(0, 7) === month ? '' : 'outside'} ${date === today ? 'today' : ''} ${date === selectedDate ? 'selected' : ''} rating-tier-${ratingTier(rating?.scoreHundredths)}`} key={date} onDragOver={(event) => event.preventDefault()} onDrop={(event) => { event.preventDefault(); const goalId = event.dataTransfer.getData('application/x-flowday-goal'); const taskId = event.dataTransfer.getData('text/plain'); if (goalId) onMoveGoal(goalId, date); else if (taskId) onMove(taskId, date); }}><header className="month-day-header"><button className="month-day-number" onClick={() => onDateChange(date)} aria-label={`${formatDateLabel(date)} 선택`}>{Number(date.slice(-2))}</button>{date <= today ? <button className={`calendar-rating-pill ${rating ? 'has-rating' : ''}`} onClick={() => onRateDay?.(date)} aria-label={`${formatDateLabel(date)} 하루 평가`}>{rating ? formatRating(rating.scoreHundredths) : '평가'}</button> : null}</header><div>{visibleGoals.map((goal) => <button className={`month-goal-dot ${goal.color}`} draggable onDragStart={(event) => { event.dataTransfer.effectAllowed = 'move'; event.dataTransfer.setData('application/x-flowday-goal', goal.id); }} onClick={() => onEditGoal(goal)} key={`${goal.id}-${date}`}><Target size={8} />{goal.title}</button>)}{visibleTasks.map((task) => <button className={`month-task-dot ${task.color}`} draggable onDragStart={(event) => { event.dataTransfer.effectAllowed = 'move'; event.dataTransfer.setData('text/plain', task.id); onDragStartTask?.(task.id); }} onClick={() => onEdit(task)} key={`${task.id}-${date}`}><i />{task.title}</button>)}{hiddenCount > 0 ? <span>+{hiddenCount}</span> : null}</div></article>;
  })}</div></div>;
}

function YearCalendar({ selectedDate, today, tasks, goals, ratings = [], onDateChange, onOpenMonth, onMove, onMoveGoal, onDragStartTask }: CalendarBodyProps) {
  const year = Number(selectedDate.slice(0, 4));
  const ratingMap = ratingsByDate(ratings);
  return <div className="year-calendar">{Array.from({ length: 12 }, (_, monthIndex) => {
    const monthDate = `${year}-${String(monthIndex + 1).padStart(2, '0')}-01`;
    const dates = monthGridDates(monthDate);
    return <section className="year-month" key={monthDate}><button className="year-month-title" onClick={() => { onDateChange(monthDate); onOpenMonth?.(monthDate); }}>{monthIndex + 1}월 <ChevronRight size={14} /></button><span className="year-weekdays">{WEEKDAY_LABELS.map((day) => <i key={day}>{day}</i>)}</span><span className="year-days">{dates.map((date) => {
      const dayTasks = tasksForDate(tasks, date).filter((task) => task.start);
      const dayGoals = goalsForDate(goals, date);
      const rating = ratingMap.get(date);
      const markers = [
        ...dayGoals.map((goal) => ({ id: goal.id, title: goal.title, color: goal.color, type: 'goal' as const })),
        ...dayTasks.map((task) => ({ id: task.id, title: task.title, color: task.color, type: 'task' as const })),
      ];
      return <button className={`year-day ${date.slice(0, 7) === monthDate.slice(0, 7) ? '' : 'outside'} ${date === today ? 'today' : ''} ${markers.length ? 'has-task' : ''} rating-tier-${ratingTier(rating?.scoreHundredths)}`} key={date} onClick={() => { onDateChange(date); onOpenMonth?.(date); }} onDragOver={(event) => event.preventDefault()} onDrop={(event) => { event.preventDefault(); const goalId = event.dataTransfer.getData('application/x-flowday-goal'); const taskId = event.dataTransfer.getData('text/plain'); if (goalId) onMoveGoal(goalId, date); else if (taskId) onMove(taskId, date); }} aria-label={`${formatDateLabel(date)} · ${rating ? `${formatRating(rating.scoreHundredths)}점, ` : ''}${dayGoals.length}개 목표, ${dayTasks.length}개 블록`}><span>{Number(date.slice(-2))}</span><span className="year-task-colors">{markers.slice(0, 3).map((marker) => <i className={`${marker.color} ${marker.type === 'goal' ? 'goal-marker' : ''}`} key={`${marker.type}-${marker.id}-${date}`} title={marker.title} draggable onDragStart={(event) => { event.stopPropagation(); event.dataTransfer.effectAllowed = 'move'; if (marker.type === 'goal') event.dataTransfer.setData('application/x-flowday-goal', marker.id); else { event.dataTransfer.setData('text/plain', marker.id); onDragStartTask?.(marker.id); } }} />)}</span></button>;
    })}</span></section>;
  })}</div>;
}

export function CalendarView({ selectedDate, today, tasks, goals, ratings = [], onDateChange, onNew, onNewGoal, onEdit, onEditGoal, onToggle, onMove, onMoveGoal, onRateDay }: CalendarViewProps) {
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
      <header className="view-intro calendar-intro"><div><span className="overline">일정과 목표</span><h1>{title}</h1><p>실행 블록과 날짜 목표를 함께 확인하고, 눌러 수정하거나 끌어서 날짜를 옮깁니다.</p></div><div className="calendar-header-tools"><div className="segmented-control"><button className={mode === 'week' ? 'active' : ''} onClick={() => setMode('week')}>주간</button><button className={mode === 'month' ? 'active' : ''} onClick={() => setMode('month')}>월간</button><button className={mode === 'year' ? 'active' : ''} onClick={() => setMode('year')}>연간</button></div><div className="calendar-nav"><button onClick={() => move(-1)} aria-label="이전 기간"><ChevronLeft size={18} /></button><button onClick={() => onDateChange(today)}>오늘</button><button onClick={() => move(1)} aria-label="다음 기간"><ChevronRight size={18} /></button><button className="calendar-goal-add" onClick={() => onNewGoal(selectedDate)} aria-label="선택한 날짜에 목표 추가"><Target size={15} /><span>목표</span></button><button className="calendar-add" onClick={() => onNew(selectedDate, '09:00')} aria-label="선택한 날짜에 블록 추가"><Plus size={17} /></button></div></div></header>
      {mode === 'week' ? <>
        <div className="calendar-week-desktop">{dates.map((date) => {
          const dayTasks = tasksForDate(tasks, date).filter((task) => task.start).sort((a, b) => (a.start ?? '').localeCompare(b.start ?? ''));
          const dayGoals = goalsForDate(goals, date);
          const rating = ratings.find((item) => item.date === date);
          return <section className={`${date === today ? 'today' : ''} rating-tier-${ratingTier(rating?.scoreHundredths)}`} key={date} onDragOver={(event) => event.preventDefault()} onDrop={(event) => { event.preventDefault(); const goalId = event.dataTransfer.getData('application/x-flowday-goal'); const taskId = event.dataTransfer.getData('text/plain') || dragId; if (goalId) onMoveGoal(goalId, date); else if (taskId) onMove(taskId, date); setDragId(null); }}>
            <header><span>{formatDateLabel(date, { weekday: 'short' })}</span><strong>{Number(date.slice(-2))}</strong>{date <= today ? <button className={`calendar-rating-pill ${rating ? 'has-rating' : ''}`} aria-label={`${formatDateLabel(date)} 하루 평가`} onClick={() => onRateDay?.(date)}>{rating ? formatRating(rating.scoreHundredths) : '평가'}</button> : null}</header>
            <div>{dayGoals.map((goal) => <CalendarGoalCard key={goal.id} goal={goal} onEdit={onEditGoal} />)}{dayTasks.map((task) => <TaskCard key={`${task.id}-${date}`} task={task} onEdit={onEdit} onToggle={onToggle} draggable onDragStart={setDragId} layout="calendar" />)}<div className="calendar-day-adds"><button onClick={() => onNewGoal(date)} aria-label={`${date} 목표 추가`}><Target size={14} /></button><button onClick={() => onNew(date, '09:00')} aria-label={`${date} 블록 추가`}><Plus size={15} /></button></div></div>
          </section>;
        })}</div>
        <div className="calendar-week-mobile">
          <WeekStrip selectedDate={selectedDate} today={today} tasks={tasks} ratings={ratings} onSelect={onDateChange} />
          {dates.map((date) => {
            const dayTasks = tasksForDate(tasks, date).filter((task) => task.start).sort((a, b) => (a.start ?? '').localeCompare(b.start ?? ''));
            const dayGoals = goalsForDate(goals, date);
            const rating = ratings.find((item) => item.date === date);
            return <section key={date} className={`${date === selectedDate ? 'selected' : ''} rating-tier-${ratingTier(rating?.scoreHundredths)}`}><header><div><strong>{formatDateLabel(date, { weekday: 'long', month: 'short', day: 'numeric' })}</strong><span>{dayGoals.length}개 목표 · {dayTasks.length}개 블록</span></div><div className="calendar-mobile-day-actions">{date <= today ? <button className={`calendar-rating-pill ${rating ? 'has-rating' : ''}`} aria-label={`${formatDateLabel(date)} 하루 평가`} onClick={() => onRateDay?.(date)}>{rating ? formatRating(rating.scoreHundredths) : '평가'}</button> : null}<button onClick={() => onNewGoal(date)} aria-label={`${date} 목표 추가`}><Target size={16} /></button><button onClick={() => onNew(date, '09:00')} aria-label={`${date} 블록 추가`}><Plus size={17} /></button></div></header>{dayGoals.length || dayTasks.length ? <>{dayGoals.map((goal) => <CalendarGoalCard key={goal.id} goal={goal} onEdit={onEditGoal} layout="list" />)}{dayTasks.map((task) => <TaskCard key={`${task.id}-${date}`} task={task} onEdit={onEdit} onToggle={onToggle} draggable onDragStart={setDragId} layout="list" />)}</> : <p>비어 있는 날입니다.</p>}</section>;
          })}
        </div>
      </> : null}
      {mode === 'month' ? <MonthCalendar selectedDate={selectedDate} today={today} tasks={tasks} goals={goals} ratings={ratings} onDateChange={onDateChange} onNew={onNew} onNewGoal={onNewGoal} onEdit={onEdit} onEditGoal={onEditGoal} onToggle={onToggle} onMove={onMove} onMoveGoal={onMoveGoal} onRateDay={onRateDay} onDragStartTask={setDragId} /> : null}
      {mode === 'year' ? <YearCalendar selectedDate={selectedDate} today={today} tasks={tasks} goals={goals} ratings={ratings} onDateChange={onDateChange} onNew={onNew} onNewGoal={onNewGoal} onEdit={onEdit} onEditGoal={onEditGoal} onToggle={onToggle} onMove={onMove} onMoveGoal={onMoveGoal} onRateDay={onRateDay} onDragStartTask={setDragId} onOpenMonth={() => setMode('month')} /> : null}
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
  const [endsAt, setEndsAt] = useState<number | null>(null);
  const finishedRef = useRef(false);
  useEffect(() => {
    if (!running || !endsAt) return;
    const targetTime = endsAt;
    function updateRemaining() {
      const remaining = Math.max(0, Math.ceil((targetTime - currentTimestamp()) / 1000));
      setSeconds(remaining);
      if (remaining === 0 && !finishedRef.current) {
        finishedRef.current = true;
        setRunning(false);
        setEndsAt(null);
        void nativeSuccess().catch(() => undefined);
      }
    }
    updateRemaining();
    const timer = window.setInterval(updateRemaining, 250);
    return () => window.clearInterval(timer);
  }, [endsAt, running]);
  useEffect(() => () => { void cancelFocusNotification().catch(() => undefined); }, []);
  function setTimerMode(next: 'focus' | 'break') {
    setMode(next);
    setRunning(false);
    setEndsAt(null);
    setSeconds(next === 'focus' ? 25 * 60 : 5 * 60);
    finishedRef.current = false;
    void cancelFocusNotification().catch(() => undefined);
    void nativeImpact().catch(() => undefined);
  }
  function durationLabel(minutes: number) {
    const hours = Math.floor(minutes / 60);
    const rest = minutes % 60;
    return hours ? `${hours}시간 ${rest ? `${rest}분` : ''}`.trim() : `${rest}분`;
  }
  const total = mode === 'focus' ? 25 * 60 : 5 * 60;
  const progress = Math.round((total - seconds) / total * 360);
  async function toggleTimer() {
    if (running) {
      const remaining = endsAt ? Math.max(0, Math.ceil((endsAt - currentTimestamp()) / 1000)) : seconds;
      setSeconds(remaining);
      setRunning(false);
      setEndsAt(null);
      await cancelFocusNotification().catch(() => undefined);
      await nativeImpact().catch(() => undefined);
      return;
    }
    const nextSeconds = seconds > 0 ? seconds : total;
    if (seconds <= 0) setSeconds(nextSeconds);
    finishedRef.current = false;
    setEndsAt(currentTimestamp() + nextSeconds * 1000);
    setRunning(true);
    await nativeImpact('medium').catch(() => undefined);
    await scheduleFocusNotification(nextSeconds, mode, task?.title).catch(() => undefined);
  }
  function resetTimer() {
    setRunning(false);
    setEndsAt(null);
    setSeconds(total);
    finishedRef.current = false;
    void cancelFocusNotification().catch(() => undefined);
    void nativeImpact().catch(() => undefined);
  }
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
          <div className="focus-actions"><button className="icon-button" onClick={resetTimer} aria-label="타이머 초기화"><TimerReset size={18} /></button><button className="focus-start" onClick={() => { void toggleTimer(); }}>{running ? '잠시 멈춤' : '집중 시작'}</button>{task ? <button className="icon-button" onClick={() => onComplete(task.id, task.occurrenceDate)} aria-label="작업 완료"><Check size={18} /></button> : null}</div>
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
  ratings: DailyRating[];
  onQueryChange: (query: string) => void;
  onClose: () => void;
  onOpenTask: (task: PlannerTask) => void;
  onOpenGoal: (goal: PlanGoal) => void;
  onOpenBlock: (block: ScheduleBlock) => void;
  onOpenRating: (rating: DailyRating) => void;
};

function SearchOverlay({ query, tasks, goals, blocks, ratings, onQueryChange, onClose, onOpenTask, onOpenGoal, onOpenBlock, onOpenRating }: SearchOverlayProps) {
  const normalizedQuery = query.trim().toLocaleLowerCase('ko-KR');
  const matches = (...values: string[]) => values.join(' ').toLocaleLowerCase('ko-KR').includes(normalizedQuery);
  const taskResults = normalizedQuery ? tasks.filter((task) => matches(task.title, task.project, task.notes, task.goal)).sort((a, b) => b.updatedAt - a.updatedAt).slice(0, 6) : [];
  const goalResults = normalizedQuery ? goals.filter((goal) => matches(goal.title, goal.detail, goal.period)).sort((a, b) => b.updatedAt - a.updatedAt).slice(0, 4) : [];
  const blockResults = normalizedQuery ? blocks.filter((block) => matches(block.name, block.start, block.end)).sort((a, b) => b.updatedAt - a.updatedAt).slice(0, 4) : [];
  const ratingResults = normalizedQuery ? ratings.filter((rating) => matches(rating.reflection, rating.tags.join(' '), rating.date, formatRating(rating.scoreHundredths))).sort((a, b) => b.date.localeCompare(a.date)).slice(0, 5) : [];
  const hasResults = taskResults.length + goalResults.length + blockResults.length + ratingResults.length > 0;

  return (
    <div className="search-overlay" onMouseDown={(event) => { if (event.target === event.currentTarget) onClose(); }}>
      <div>
        <header><Search size={18} /><input autoFocus value={query} aria-label="통합 검색어" placeholder="할 일, 계획, 하루 감상 검색" onChange={(event) => onQueryChange(event.target.value)} /><button type="button" onClick={onClose} aria-label="검색 닫기">ESC</button></header>
        {!normalizedQuery ? <p>제목, 프로젝트, 메모, 계획과 하루 감상을 한 번에 검색할 수 있습니다.</p> : null}
        {normalizedQuery && !hasResults ? <p>일치하는 항목이 없습니다.</p> : null}
        {taskResults.length ? <div className="search-result-group"><strong>할 일</strong>{taskResults.map((task) => <button type="button" key={task.id} onClick={() => onOpenTask(task)}><i className={task.color} /><span><b>{task.title}</b><small>{task.project} · {task.date}</small></span><Edit3 size={15} /></button>)}</div> : null}
        {goalResults.length ? <div className="search-result-group"><strong>계획</strong>{goalResults.map((goal) => <button type="button" key={goal.id} onClick={() => onOpenGoal(goal)}><i className={goal.color} /><span><b>{goal.title}</b><small>{goal.period} · {goal.parentId ? '하위 계획' : '최상위 계획'}</small></span><Target size={15} /></button>)}</div> : null}
        {ratingResults.length ? <div className="search-result-group rating-results"><strong>하루 감상</strong>{ratingResults.map((rating) => <button type="button" key={rating.date} onClick={() => onOpenRating(rating)}><i className={`rating-tier-${ratingTier(rating.scoreHundredths)}`} /><span><b>{rating.reflection || rating.tags.join(' · ') || '하루 평가'}</b><small>{rating.date} · {formatRating(rating.scoreHundredths)}점</small></span><Sparkles size={15} /></button>)}</div> : null}
        {blockResults.length ? <div className="search-result-group"><strong>시간 블록</strong>{blockResults.map((block) => <button type="button" key={block.id} onClick={() => onOpenBlock(block)}><i className={block.color} /><span><b>{block.name}</b><small>{block.start}–{block.end}</small></span><Clock3 size={15} /></button>)}</div> : null}
      </div>
    </div>
  );
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

type BottomNavProps = { active: PlannerView; onChange: (view: PlannerView) => void };
function BottomNav({ active, onChange }: BottomNavProps) {
  return (
    <nav className="mobile-bottom-nav" aria-label="모바일 주요 메뉴">
      {NAV_ITEMS.map(({ id, label, icon: Icon }) => (
        <button className={active === id ? 'active' : ''} aria-current={active === id ? 'page' : undefined} key={id} onClick={() => onChange(id)}>
          <Icon size={20} /><span>{label}</span>
        </button>
      ))}
    </nav>
  );
}

type PlannerAppProps = {
  userId: string;
  userEmail: string;
  accountApiUrl?: string;
  legalBaseUrl?: string;
  onAuthExit?: () => void;
};

export function PlannerApp({ userId, userEmail, accountApiUrl, legalBaseUrl, onAuthExit }: PlannerAppProps) {
  const [supabase] = useState(() => createClient());
  const planner = usePlanner(userId, supabase);
  const dailyRatings = useDailyRatings(userId, supabase);
  const [active, setActive] = useState<PlannerView>('habit');
  const [selectedDate, setSelectedDate] = useState('');
  const [editor, setEditor] = useState<EditorState>(null);
  const [goalEditor, setGoalEditor] = useState<GoalEditorState>(null);
  const [timeBlockEditor, setTimeBlockEditor] = useState<TimeBlockEditorState>(null);
  const [ratingEditor, setRatingEditor] = useState<RatingEditorState>(null);
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
  const overlayOpen = Boolean(introView) || settingsOpen || createHubOpen || searchOpen || Boolean(editor || goalEditor || timeBlockEditor || ratingEditor);

  useEffect(() => {
    void configureNativeShell(planner.theme);
  }, [planner.theme]);

  useEffect(() => {
    let removeBridge: () => void = () => undefined;
    void installNativeEventBridge().then((remove) => { removeBridge = remove; });
    return () => removeBridge();
  }, []);

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
        setRatingEditor(null);
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
  function openRating(date: string) { setRatingEditor({ date }); }

  function exportAllData() {
    const plannerBackup = JSON.parse(planner.exportBackup()) as Record<string, unknown>;
    return JSON.stringify({
      ...plannerBackup,
      dailyRatings: { version: 1, ratings: dailyRatings.ratings },
    }, null, 2);
  }

  function importAllData(raw: string) {
    let ratingBackup: { version?: number; ratings?: unknown } | undefined;
    try {
      const parsed = JSON.parse(raw) as { dailyRatings?: { version?: number; ratings?: unknown } };
      ratingBackup = parsed.dailyRatings;
      if (ratingBackup?.version === 1 && !Array.isArray(ratingBackup.ratings)) {
        return { ok: false as const, message: '하루 감상 백업 형식을 확인해주세요.' };
      }
    } catch {
      return { ok: false as const, message: '파일을 읽을 수 없습니다. JSON 백업 파일인지 확인해주세요.' };
    }
    const result = planner.importBackup(raw);
    if (!result.ok) return result;
    if (ratingBackup?.version === 1) {
      if (!dailyRatings.importRatings(ratingBackup.ratings)) {
        planner.restoreRecovery();
        return { ok: false as const, message: '하루 감상 백업이 손상되어 가져오기를 취소했습니다.' };
      }
    } else {
      // Keep ratings unchanged for an older planner-only backup, but align the undo snapshot.
      dailyRatings.captureRecovery();
    }
    return result;
  }

  function resetAllData() {
    planner.resetPlanner();
    dailyRatings.resetRatings();
  }

  function restoreAllData() {
    const plannerResult = planner.restoreRecovery();
    if (!plannerResult.ok) return plannerResult;
    const ratingResult = dailyRatings.restoreRecovery();
    if (!ratingResult.ok) {
      planner.restoreRecovery();
      return ratingResult;
    }
    return {
      ok: true as const,
      message: ratingResult.restored ? '직전 계획과 하루 감상으로 되돌렸습니다.' : plannerResult.message,
    };
  }

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
  function openNewGoal(parentId: string | null, deadline?: string, returnView: PlannerView = 'plan') {
    setCreateHubOpen(false);
    const parent = parentId ? planner.goals.find((goal) => goal.id === parentId) : undefined;
    const goal = createEmptyGoal(parentId, parent?.period);
    setGoalEditor({ goal: deadline ? { ...goal, deadline } : goal, isNew: true, returnView });
  }
  function openEditGoal(goal: PlanGoal, returnView: PlannerView = 'plan') { setGoalEditor({ goal, isNew: false, returnView }); }
  function moveGoalDeadline(goalId: string, deadline: string) {
    const goal = planner.goals.find((item) => item.id === goalId);
    if (goal) planner.upsertGoal({ ...goal, deadline });
  }
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
    await supabase.auth.signOut();
    if (onAuthExit) {
      onAuthExit();
      return;
    }
    window.location.assign(new URL('/login', window.location.origin));
  }

  async function deleteAccount() {
    try {
      const { data: { session } } = await supabase.auth.getSession();
      const response = await fetch(accountApiUrl ?? '/api/account', {
        method: 'DELETE',
        credentials: accountApiUrl ? 'omit' : 'same-origin',
        headers: {
          Accept: 'application/json',
          ...(accountApiUrl && session?.access_token ? { Authorization: `Bearer ${session.access_token}` } : {}),
        },
      });
      const result = await response.json() as { error?: string };
      if (!response.ok) {
        return { ok: false, message: result.error || '계정을 삭제하지 못했습니다.' };
      }

      planner.clearLocalPlannerData();
      dailyRatings.clearLocalData();
      await supabase.auth.signOut({ scope: 'local' });
      if (onAuthExit) {
        onAuthExit();
        return { ok: true, message: '계정과 모든 계획 데이터를 삭제했습니다.' };
      }
      window.location.replace(new URL('/login', window.location.origin));
      return { ok: true, message: '계정과 모든 계획 데이터를 삭제했습니다.' };
    } catch {
      return { ok: false, message: '네트워크 연결을 확인한 뒤 다시 시도해주세요.' };
    }
  }

  const combinedSyncStatus = planner.saveError
    ? 'error'
    : combineSyncStatuses(planner.syncStatus, dailyRatings.syncStatus);
  const combinedSaveError = combinedSyncStatus === 'error';
  const syncLabel = {
    loading: '클라우드 연결 중',
    saving: '변경사항 저장 중',
    synced: '모든 기기와 동기화됨',
    offline: '오프라인 · 이 기기에 저장됨',
    error: '클라우드 연결을 확인해주세요',
  }[combinedSyncStatus];
  const SyncIcon = combinedSyncStatus === 'error' || combinedSyncStatus === 'offline' ? CloudOff : Cloud;

  if (!planner.ready || !dailyRatings.ready || !activeDate) return <div className="app-loading"><span><Image src="/flowday-icon-192.png" width={48} height={48} alt="" priority /></span><strong>Flowday</strong><i /></div>;

  return (
    <main className={`planner-shell theme-${planner.theme}`}>
      <aside className="desktop-sidebar">
        <button className="app-brand" onClick={() => setActive('habit')}><span><Image src="/flowday-icon-192.png" width={33} height={33} alt="" priority /></span><strong>Flowday</strong></button>
        <nav>{NAV_ITEMS.map(({ id, label, icon: Icon }) => <button className={active === id ? 'active' : ''} aria-current={active === id ? 'page' : undefined} key={id} onClick={() => setActive(id)}><Icon size={18} /><span>{label}</span>{id === 'inbox' ? <b>{planner.tasks.filter((task) => !task.start && !task.completed).length}</b> : null}</button>)}</nav>
        <section className="sidebar-projects"><header><span>프로젝트</span><Plus size={14} /></header>{PROJECTS.map((project) => <button key={project.name}><i className={project.color} />{project.name}<span>{planner.tasks.filter((task) => task.project === project.name && !task.completed).length}</span></button>)}</section>
        <footer><button onClick={() => setSettingsOpen(true)}><Settings2 size={18} />설정과 데이터</button><div className={`sync-state ${combinedSaveError ? 'error' : ''}`}><SyncIcon size={15} /><span>{syncLabel}</span></div></footer>
      </aside>

      <section className="planner-main">
        <header className="mobile-header"><button className="mobile-logo" onClick={() => setActive('habit')} aria-label="습관으로 이동"><Image src="/flowday-icon-192.png" width={39} height={39} alt="" priority /></button><div className="mobile-header-copy"><span>{VIEW_TITLES[active]}</span><strong>Flowday</strong></div><div className="mobile-header-actions"><button className="icon-button ghost" onClick={() => setSearchOpen(true)} aria-label="통합 검색"><Search size={19} /></button><button className="icon-button mobile-create" onClick={() => setCreateHubOpen(true)} aria-label="새로 만들기"><Plus size={20} /></button><button className="icon-button ghost" onClick={() => setSettingsOpen(true)} aria-label="설정과 데이터"><Settings2 size={20} /></button></div></header>
        <header className="desktop-topbar"><div className="desktop-search"><Search size={16} /><input placeholder="검색" aria-label="검색" onFocus={() => setSearchOpen(true)} /><kbd><Command size={12} /> K</kbd></div><div><button className="icon-button ghost" onClick={() => setSettingsOpen(true)} aria-label={`동기화 상태: ${syncLabel}`}><SyncIcon size={18} /></button><button className="icon-button ghost" onClick={() => setSettingsOpen(true)} aria-label="설정과 데이터"><Settings2 size={18} /></button></div></header>

        <div className="view-container">
          {active === 'habit' ? <HabitView selectedDate={activeDate} today={planner.today} tasks={planner.tasks} onDateChange={setSelectedDate} onNew={openNew} onEdit={openEdit} onToggle={planner.toggleTask} onFocus={startFocus} onMove={planner.moveTask} onSchedule={scheduleFromInbox} scheduleBlocks={planner.scheduleBlocks} onNewScheduleBlock={openNewScheduleBlock} onEditScheduleBlock={openEditScheduleBlock} onUseScheduleBlock={useScheduleBlock} ratings={dailyRatings.ratings} ratingSyncStatus={dailyRatings.syncStatus} onRate={openRating} /> : null}
          {active === 'inbox' ? <InboxView today={planner.today} tasks={planner.tasks} onAdd={planner.upsertTask} onNew={openNew} onEdit={openEdit} onToggle={planner.toggleTask} onMoveQuadrant={moveQuadrant} onSchedule={scheduleFromInbox} /> : null}
          {active === 'plan' ? <PlanView key={focusGoalId || 'plan'} today={planner.today} goals={planner.goals} focusGoalId={focusGoalId} onNewGoalTask={(goal) => openNew(activeDate, null, goal)} onNewGoal={openNewGoal} onEditGoal={openEditGoal} onToggleGoalCheck={planner.toggleGoalCheck} /> : null}
          {active === 'calendar' ? <CalendarView selectedDate={activeDate} today={planner.today} tasks={planner.tasks} goals={planner.goals} ratings={dailyRatings.ratings} onDateChange={setSelectedDate} onNew={openNew} onNewGoal={(date) => openNewGoal(null, date, 'calendar')} onEdit={openEdit} onEditGoal={(goal) => openEditGoal(goal, 'calendar')} onToggle={planner.toggleTask} onMove={planner.moveTask} onMoveGoal={moveGoalDeadline} onRateDay={openRating} /> : null}
          {active === 'focus' ? <FocusView today={planner.today} tasks={planner.tasks} selectedTaskId={focusTaskId} onSelect={setFocusTaskId} onComplete={planner.toggleTask} /> : null}
        </div>
      </section>

      <button className="desktop-fab" onClick={() => setCreateHubOpen(true)}><Plus size={21} /><span>새로 만들기</span></button>
      <BottomNav active={active} onChange={setActive} />

      {createHubOpen ? <CreateHub onClose={() => setCreateHubOpen(false)} onTask={() => openNew()} onBlock={openNewScheduleBlock} onGoal={() => openNewGoal(null)} /> : null}
      {editor ? <TaskSheet key={`${editor.task.id}-${editor.isNew}`} task={editor.task} tasks={planner.tasks} goals={planner.goals} scheduleBlocks={planner.scheduleBlocks} isNew={editor.isNew} onClose={() => setEditor(null)} onSave={(task) => { planner.upsertTask(task); setEditor(null); }} onDelete={planner.deleteTask} onDuplicate={planner.duplicateTask} /> : null}
      {goalEditor ? <GoalSheet key={`${goalEditor.goal.id}-${goalEditor.isNew}`} goal={goalEditor.goal} goals={planner.goals} isNew={goalEditor.isNew} onClose={() => setGoalEditor(null)} onSave={(goal) => { planner.upsertGoal(goal); setFocusGoalId(goal.id); setActive(goalEditor.returnView ?? 'plan'); setGoalEditor(null); }} onDelete={planner.deleteGoal} /> : null}
      {timeBlockEditor ? <TimeBlockSheet key={`${timeBlockEditor.block.id}-${timeBlockEditor.isNew}`} block={timeBlockEditor.block} isNew={timeBlockEditor.isNew} onClose={() => setTimeBlockEditor(null)} onSave={(block) => { planner.upsertScheduleBlock(block); setTimeBlockEditor(null); }} onDelete={planner.deleteScheduleBlock} /> : null}
      {ratingEditor ? <DayRatingSheet key={ratingEditor.date} date={ratingEditor.date} today={planner.today} rating={dailyRatings.ratings.find((item) => item.date === ratingEditor.date)} syncStatus={dailyRatings.syncStatus} onSave={dailyRatings.saveRating} onDelete={dailyRatings.deleteRating} onClose={() => setRatingEditor(null)} /> : null}
      {settingsOpen ? <SettingsSheet userEmail={userEmail} theme={planner.theme} counts={{ tasks: planner.tasks.length, goals: planner.goals.length, blocks: planner.scheduleBlocks.length, ratings: dailyRatings.ratings.length }} lastSavedAt={planner.lastSavedAt} saveError={combinedSaveError} syncStatus={combinedSyncStatus} legalBaseUrl={legalBaseUrl} onThemeChange={planner.setTheme} onExport={exportAllData} onImport={importAllData} onRestore={restoreAllData} onReset={resetAllData} onShowMenuIntro={showCurrentMenuIntro} onSignOut={signOut} onDeleteAccount={deleteAccount} onClose={() => setSettingsOpen(false)} /> : null}
      {searchOpen ? <SearchOverlay query={searchQuery} tasks={planner.tasks} goals={planner.goals} blocks={planner.scheduleBlocks} ratings={dailyRatings.ratings} onQueryChange={setSearchQuery} onClose={closeSearch} onOpenTask={(task) => { openEdit(task); closeSearch(); }} onOpenGoal={(goal) => { openEditGoal(goal); closeSearch(); }} onOpenBlock={(block) => { openEditScheduleBlock(block); closeSearch(); }} onOpenRating={(rating) => { openRating(rating.date); closeSearch(); }} /> : null}
      {introView ? <MenuIntro key={introView} view={introView} onComplete={completeMenuIntro} /> : null}
    </main>
  );
}

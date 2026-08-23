'use client';

import {
  ArrowRight,
  BarChart3,
  CalendarDays,
  Check,
  ChevronLeft,
  ChevronRight,
  Circle,
  Clock3,
  Cloud,
  Command,
  Edit3,
  Focus,
  GripVertical,
  Home,
  Inbox,
  LayoutGrid,
  Moon,
  MoreHorizontal,
  Plus,
  Search,
  Settings2,
  Sparkles,
  Sun,
  Target,
  TimerReset,
} from 'lucide-react';
import { CSSProperties, FormEvent, useEffect, useMemo, useState } from 'react';
import { usePlanner } from '../hooks/use-planner';
import {
  createEmptyTask,
  formatDateLabel,
  GOALS,
  minutesToTime,
  parseQuickAdd,
  PlannerTask,
  PlannerView,
  PROJECTS,
  Quadrant,
  shiftDate,
  TaskColor,
  Theme,
  timeToMinutes,
  weekDates,
} from '../lib/planner';
import { TaskSheet } from './task-sheet';

type EditorState = { task: PlannerTask; isNew: boolean } | null;

const NAV_ITEMS: { id: PlannerView; label: string; icon: typeof Home }[] = [
  { id: 'today', label: '오늘', icon: Home },
  { id: 'inbox', label: '인박스', icon: Inbox },
  { id: 'plan', label: '계획', icon: Target },
  { id: 'calendar', label: '캘린더', icon: CalendarDays },
  { id: 'focus', label: '집중', icon: Focus },
];

const VIEW_TITLES: Record<PlannerView, string> = {
  today: '오늘', inbox: '인박스', plan: '계획', calendar: '캘린더', focus: '집중',
};

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
        const taskCount = tasks.filter((task) => task.date === date && !task.completed).length;
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
      <input value={value} onChange={(event) => setValue(event.target.value)} placeholder={compact ? '할 일 빠르게 추가' : '할 일 추가 · 14:00 #프로젝트 p1'} aria-label="빠른 할 일 추가" />
      <button type="submit" aria-label="추가"><ArrowRight size={17} /></button>
    </form>
  );
}

type TaskCardProps = {
  task: PlannerTask;
  onEdit: (task: PlannerTask) => void;
  onToggle: (taskId: string) => void;
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
      <button className="task-circle" aria-label={task.completed ? '미완료로 변경' : '완료'} onClick={(event) => { event.stopPropagation(); onToggle(task.id); }}>{task.completed ? <Check size={13} /> : <Circle size={16} />}</button>
      <div className="task-copy">
        <div className="task-title-row"><strong>{task.title}</strong>{task.priority < 4 ? <span className={`priority-mark p${task.priority}`}>P{task.priority}</span> : null}</div>
        <span>{task.start ? `${task.start} · ${task.duration}분` : '시간 미정'}<i />{task.project}</span>
        {layout === 'timeline' && task.notes ? <p>{task.notes}</p> : null}
      </div>
      {onFocus && !task.completed ? <button className="task-focus-button" aria-label="이 작업에 집중" onClick={(event) => { event.stopPropagation(); onFocus(task.id); }}><Focus size={15} /></button> : null}
      <button className="task-more" aria-label="작업 수정" onClick={(event) => { event.stopPropagation(); onEdit(task); }}><MoreHorizontal size={17} /></button>
    </article>
  );
}

type TodayViewProps = {
  selectedDate: string;
  today: string;
  tasks: PlannerTask[];
  onDateChange: (date: string) => void;
  onAdd: (task: PlannerTask) => void;
  onNew: (date: string, start?: string | null) => void;
  onEdit: (task: PlannerTask) => void;
  onToggle: (taskId: string) => void;
  onFocus: (taskId: string) => void;
  onMove: (taskId: string, date: string, start?: string | null) => void;
};

function TodayView({ selectedDate, today, tasks, onDateChange, onAdd, onNew, onEdit, onToggle, onFocus, onMove }: TodayViewProps) {
  const dayTasks = useMemo(() => tasks.filter((task) => task.date === selectedDate), [tasks, selectedDate]);
  const timed = useMemo(() => dayTasks.filter((task) => task.start).sort((a, b) => (a.start ?? '').localeCompare(b.start ?? '')), [dayTasks]);
  const unscheduled = dayTasks.filter((task) => !task.start && !task.completed);
  const completed = dayTasks.filter((task) => task.completed).length;
  const completion = dayTasks.length ? Math.round(completed / dayTasks.length * 100) : 0;
  const [dragId, setDragId] = useState<string | null>(null);

  return (
    <div className="today-view">
      <WeekStrip selectedDate={selectedDate} today={today} tasks={tasks} onSelect={onDateChange} />
      <section className="day-hero">
        <div><span className="overline">{selectedDate === today ? 'TODAY' : 'SELECTED DAY'}</span><h1>{formatDateLabel(selectedDate)}</h1><p>{dayTasks.length ? `${dayTasks.length}개의 계획 중 ${completed}개를 마쳤어요.` : '비어 있는 하루에 좋은 흐름을 만들어보세요.'}</p></div>
        <div className="day-score"><strong>{completion}%</strong><span>완료</span><div><i style={{ width: `${completion}%` }} /></div></div>
      </section>
      <QuickAdd selectedDate={selectedDate} onAdd={onAdd} />

      {unscheduled.length ? (
        <section className="unscheduled-section">
          <header><div><Inbox size={17} /><strong>오늘 할 일</strong></div><span>{unscheduled.length}</span></header>
          <div>{unscheduled.map((task) => <TaskCard key={task.id} task={task} onEdit={onEdit} onToggle={onToggle} layout="list" />)}</div>
        </section>
      ) : null}

      <section className="timeline-section">
        <header className="section-heading"><div><span className="overline">DAY TIMELINE</span><h2>하루 타임라인</h2></div><button onClick={() => onNew(selectedDate, '09:00')}><Plus size={16} />블록 추가</button></header>
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
          }) : <EmptyState icon={Clock3} title="아직 시간 블록이 없어요" description="첫 블록을 추가해 하루의 흐름을 만들어보세요." action="시간 블록 추가" onAction={() => onNew(selectedDate, '09:00')} />}
          {timed.length ? <button className="timeline-add-row" onClick={() => onNew(selectedDate, '18:00')}><Plus size={16} />새 시간 블록</button> : null}
        </div>
      </section>
    </div>
  );
}

type EmptyStateProps = { icon: typeof Clock3; title: string; description: string; action: string; onAction: () => void };
function EmptyState({ icon: Icon, title, description, action, onAction }: EmptyStateProps) {
  return <div className="empty-state"><span><Icon size={22} /></span><strong>{title}</strong><p>{description}</p><button onClick={onAction}><Plus size={15} />{action}</button></div>;
}

type InboxViewProps = Pick<TodayViewProps, 'selectedDate' | 'tasks' | 'onAdd' | 'onNew' | 'onEdit' | 'onToggle'>;
function InboxView({ selectedDate, tasks, onAdd, onNew, onEdit, onToggle }: InboxViewProps) {
  const inboxTasks = tasks.filter((task) => !task.start && !task.completed).sort((a, b) => a.priority - b.priority);
  return (
    <div className="content-view inbox-view">
      <header className="view-intro"><div><span className="overline">CAPTURE FIRST</span><h1>인박스</h1><p>시간을 정하지 못한 생각과 할 일을 먼저 모아두세요.</p></div><button className="primary-button desktop-only" onClick={() => onNew(selectedDate, null)}><Plus size={17} />할 일 추가</button></header>
      <QuickAdd selectedDate={selectedDate} onAdd={onAdd} />
      <div className="project-filter-row"><button className="active">전체 <span>{inboxTasks.length}</span></button>{PROJECTS.map((project) => <button key={project.name}><i className={project.color} />{project.name}</button>)}</div>
      <section className="inbox-list-card">
        {inboxTasks.length ? inboxTasks.map((task) => <TaskCard key={task.id} task={task} onEdit={onEdit} onToggle={onToggle} layout="list" />) : <EmptyState icon={Inbox} title="인박스가 비었어요" description="모든 할 일이 시간표에 배치됐습니다." action="할 일 추가" onAction={() => onNew(selectedDate, null)} />}
      </section>
    </div>
  );
}

type PlanViewProps = { selectedDate: string; tasks: PlannerTask[]; onNewGoalTask: (goal: string) => void; onEdit: (task: PlannerTask) => void; onToggle: (id: string) => void; onMoveQuadrant: (id: string, quadrant: Quadrant) => void };
function PlanView({ tasks, onNewGoalTask, onEdit, onToggle, onMoveQuadrant }: PlanViewProps) {
  const [mode, setMode] = useState<'goals' | 'matrix'>('goals');
  const [dragId, setDragId] = useState<string | null>(null);
  const quadrants: { id: Quadrant; title: string; hint: string; color: TaskColor }[] = [
    { id: 'do', title: '중요하고 긴급함', hint: '오늘 실행', color: 'rose' },
    { id: 'schedule', title: '중요하고 여유 있음', hint: '시간 확보', color: 'sage' },
    { id: 'delegate', title: '긴급하지만 덜 중요함', hint: '위임·최소화', color: 'blue' },
    { id: 'delete', title: '나중에 검토', hint: '삭제·보류', color: 'violet' },
  ];
  return (
    <div className="content-view plan-view">
      <header className="view-intro"><div><span className="overline">GOAL SYSTEM</span><h1>계획</h1><p>긴 시간을 오늘 실행할 수 있는 크기로 차근차근 나눕니다.</p></div><div className="segmented-control"><button className={mode === 'goals' ? 'active' : ''} onClick={() => setMode('goals')}><Target size={15} />목표 흐름</button><button className={mode === 'matrix' ? 'active' : ''} onClick={() => setMode('matrix')}><LayoutGrid size={15} />매트릭스</button></div></header>
      {mode === 'goals' ? <div className="goal-flow">{GOALS.map((goal, index) => <div className="goal-flow-item" key={goal.period}><article className={goal.color}><header><span>{goal.period}</span><MoreHorizontal size={17} /></header><h2>{goal.title}</h2><p>{goal.detail}</p><div className="goal-progress"><div><i style={{ width: `${goal.progress}%` }} /></div><strong>{goal.progress}%</strong></div><footer><span>{index + 2}개 하위 계획</span><button onClick={() => onNewGoalTask(goal.title)}><Plus size={14} />실행 추가</button></footer></article>{index < GOALS.length - 1 ? <ArrowRight className="goal-arrow" size={18} /> : null}</div>)}</div> : (
        <div className="matrix-grid-v2">{quadrants.map((quadrant) => {
          const list = tasks.filter((task) => !task.completed && task.quadrant === quadrant.id);
          return <section className={`matrix-quadrant ${quadrant.color}`} key={quadrant.id} onDragOver={(event) => event.preventDefault()} onDrop={(event) => { const taskId = event.dataTransfer.getData('text/plain') || dragId; if (taskId) onMoveQuadrant(taskId, quadrant.id); setDragId(null); }}><header><div><i /><span>{quadrant.hint}</span><h2>{quadrant.title}</h2></div><b>{list.length}</b></header><div>{list.map((task) => <TaskCard key={task.id} task={task} onEdit={onEdit} onToggle={onToggle} draggable onDragStart={setDragId} layout="list" />)}{!list.length ? <p className="matrix-empty">카드를 여기에 놓으세요</p> : null}</div></section>;
        })}</div>
      )}
    </div>
  );
}

type CalendarViewProps = { selectedDate: string; today: string; tasks: PlannerTask[]; onDateChange: (date: string) => void; onNew: (date: string, start?: string | null) => void; onEdit: (task: PlannerTask) => void; onToggle: (id: string) => void; onMove: (id: string, date: string, start?: string | null) => void };
function CalendarView({ selectedDate, today, tasks, onDateChange, onNew, onEdit, onToggle, onMove }: CalendarViewProps) {
  const dates = weekDates(selectedDate);
  const [dragId, setDragId] = useState<string | null>(null);
  return (
    <div className="content-view calendar-view-v2">
      <header className="view-intro calendar-intro"><div><span className="overline">WEEK PLANNER</span><h1>{formatDateLabel(dates[0], { month: 'long', day: 'numeric' })} – {formatDateLabel(dates[6], { month: 'long', day: 'numeric' })}</h1><p>빈 시간과 중요한 일을 한눈에 보고 배치하세요.</p></div><div className="calendar-nav"><button onClick={() => onDateChange(shiftDate(selectedDate, -7))} aria-label="이전 주"><ChevronLeft size={18} /></button><button onClick={() => onDateChange(today)}>오늘</button><button onClick={() => onDateChange(shiftDate(selectedDate, 7))} aria-label="다음 주"><ChevronRight size={18} /></button></div></header>
      <div className="calendar-week-desktop">{dates.map((date) => { const dayTasks = tasks.filter((task) => task.date === date).sort((a, b) => (a.start ?? '').localeCompare(b.start ?? '')); return <section className={date === today ? 'today' : ''} key={date} onDragOver={(event) => event.preventDefault()} onDrop={(event) => { const taskId = event.dataTransfer.getData('text/plain') || dragId; if (taskId) onMove(taskId, date); setDragId(null); }}><header><span>{formatDateLabel(date, { weekday: 'short' })}</span><strong>{Number(date.slice(-2))}</strong></header><div>{dayTasks.map((task) => <TaskCard key={task.id} task={task} onEdit={onEdit} onToggle={onToggle} draggable onDragStart={setDragId} layout="calendar" />)}<button className="calendar-day-add" onClick={() => onNew(date, '09:00')}><Plus size={15} /></button></div></section>; })}</div>
      <div className="calendar-week-mobile"><WeekStrip selectedDate={selectedDate} today={today} tasks={tasks} onSelect={onDateChange} />{dates.map((date) => { const dayTasks = tasks.filter((task) => task.date === date).sort((a, b) => (a.start ?? '').localeCompare(b.start ?? '')); return <section key={date} className={date === selectedDate ? 'selected' : ''}><header><div><strong>{formatDateLabel(date, { weekday: 'long', month: 'short', day: 'numeric' })}</strong><span>{dayTasks.length}개 계획</span></div><button onClick={() => onNew(date, '09:00')}><Plus size={17} /></button></header>{dayTasks.length ? dayTasks.map((task) => <TaskCard key={task.id} task={task} onEdit={onEdit} onToggle={onToggle} layout="list" />) : <p>비어 있는 날입니다.</p>}</section>; })}</div>
    </div>
  );
}

type FocusViewProps = { tasks: PlannerTask[]; selectedTaskId: string | null; onSelect: (id: string) => void; onComplete: (id: string) => void };
function FocusView({ tasks, selectedTaskId, onSelect, onComplete }: FocusViewProps) {
  const focusable = tasks.filter((task) => !task.completed);
  const task = focusable.find((item) => item.id === selectedTaskId) ?? focusable[0];
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
  const total = mode === 'focus' ? 25 * 60 : 5 * 60;
  const progress = Math.round((total - seconds) / total * 360);
  return (
    <div className="content-view focus-view-v2">
      <header className="view-intro"><div><span className="overline">FOCUS MODE</span><h1>집중</h1><p>지금 필요한 한 가지에만 조용히 몰입하세요.</p></div></header>
      <div className="focus-layout"><section className="focus-main-card"><div className="segmented-control"><button className={mode === 'focus' ? 'active' : ''} onClick={() => setTimerMode('focus')}>집중 25분</button><button className={mode === 'break' ? 'active' : ''} onClick={() => setTimerMode('break')}>휴식 5분</button></div><div className="focus-timer" style={{ '--focus-progress': `${progress}deg` } as CSSProperties}><div><strong>{String(Math.floor(seconds / 60)).padStart(2, '0')}:{String(seconds % 60).padStart(2, '0')}</strong><span>{running ? '흐름을 유지하세요' : '준비되면 시작하세요'}</span></div></div><label className="focus-task-picker"><i className={task?.color ?? 'sage'} /><span>집중할 작업</span><select value={task?.id ?? ''} onChange={(event) => onSelect(event.target.value)}>{focusable.map((item) => <option value={item.id} key={item.id}>{item.title}</option>)}</select></label><div className="focus-actions"><button className="icon-button" onClick={() => { setRunning(false); setSeconds(total); }}><TimerReset size={18} /></button><button className="focus-start" onClick={() => setRunning((value) => !value)}>{running ? '잠시 멈춤' : '집중 시작'}</button>{task ? <button className="icon-button" onClick={() => onComplete(task.id)} aria-label="작업 완료"><Check size={18} /></button> : null}</div></section><aside className="focus-stats"><article><Sparkles size={19} /><span>오늘의 집중</span><strong>2h 25m</strong><p>5번의 집중 세션을 마쳤어요.</p></article><article><BarChart3 size={19} /><span>이번 주</span><strong>8h 10m</strong><p>지난주보다 12% 더 집중했어요.</p></article></aside></div>
    </div>
  );
}

type ThemeMenuProps = { theme: Theme; onChange: (theme: Theme) => void; onClose: () => void };
function ThemeMenu({ theme, onChange, onClose }: ThemeMenuProps) {
  const themes: { id: Theme; label: string; icon: typeof Sun }[] = [{ id: 'light', label: '밝게', icon: Sun }, { id: 'dim', label: '중간', icon: Cloud }, { id: 'dark', label: '어둡게', icon: Moon }];
  return <div className="theme-menu"><header><strong>화면 테마</strong><button onClick={onClose}><MoreHorizontal size={16} /></button></header>{themes.map(({ id, label, icon: Icon }) => <button className={theme === id ? 'selected' : ''} key={id} onClick={() => { onChange(id); onClose(); }}><Icon size={17} /><span>{label}</span>{theme === id ? <Check size={15} /> : null}</button>)}</div>;
}

type BottomNavProps = { active: PlannerView; onChange: (view: PlannerView) => void; onAdd: () => void };
function BottomNav({ active, onChange, onAdd }: BottomNavProps) {
  return <nav className="mobile-bottom-nav" aria-label="모바일 주요 메뉴">{NAV_ITEMS.slice(0, 3).map(({ id, label, icon: Icon }) => <button className={active === id ? 'active' : ''} key={id} onClick={() => onChange(id)}><Icon size={20} /><span>{label}</span></button>)}<button className="mobile-fab" onClick={onAdd} aria-label="새 계획 추가"><Plus size={23} /></button>{NAV_ITEMS.slice(3).map(({ id, label, icon: Icon }) => <button className={active === id ? 'active' : ''} key={id} onClick={() => onChange(id)}><Icon size={20} /><span>{label}</span></button>)}</nav>;
}

export function PlannerApp() {
  const planner = usePlanner();
  const [active, setActive] = useState<PlannerView>('today');
  const [selectedDate, setSelectedDate] = useState('');
  const [editor, setEditor] = useState<EditorState>(null);
  const [themeMenu, setThemeMenu] = useState(false);
  const [searchOpen, setSearchOpen] = useState(false);
  const [focusTaskId, setFocusTaskId] = useState<string | null>(null);
  const activeDate = selectedDate || planner.today;

  function openNew(date = activeDate, start: string | null = null, goal?: string) {
    const task = createEmptyTask(date, start);
    setEditor({ task: goal ? { ...task, goal } : task, isNew: true });
  }
  function openEdit(task: PlannerTask) { setEditor({ task, isNew: false }); }
  function startFocus(taskId: string) { setFocusTaskId(taskId); setActive('focus'); }
  function moveQuadrant(taskId: string, quadrant: Quadrant) {
    const task = planner.tasks.find((item) => item.id === taskId);
    if (task) planner.upsertTask({ ...task, quadrant });
  }

  if (!planner.ready || !activeDate) return <div className="app-loading"><span>F</span><strong>Flowday</strong><i /></div>;

  return (
    <main className={`planner-shell theme-${planner.theme}`}>
      <aside className="desktop-sidebar">
        <button className="app-brand" onClick={() => setActive('today')}><span>F</span><strong>Flowday</strong></button>
        <nav>{NAV_ITEMS.map(({ id, label, icon: Icon }) => <button className={active === id ? 'active' : ''} key={id} onClick={() => setActive(id)}><Icon size={18} /><span>{label}</span>{id === 'inbox' ? <b>{planner.tasks.filter((task) => !task.start && !task.completed).length}</b> : null}</button>)}</nav>
        <section className="sidebar-projects"><header><span>프로젝트</span><Plus size={14} /></header>{PROJECTS.map((project) => <button key={project.name}><i className={project.color} />{project.name}<span>{planner.tasks.filter((task) => task.project === project.name && !task.completed).length}</span></button>)}</section>
        <footer><button onClick={() => setThemeMenu((value) => !value)}><Settings2 size={18} />설정</button><div className="sync-state"><Cloud size={15} /><span>이 기기에 저장됨</span></div></footer>
      </aside>

      <section className="planner-main">
        <header className="mobile-header"><button className="mobile-logo" onClick={() => setActive('today')}>F</button><div><span>{VIEW_TITLES[active]}</span><strong>Flowday</strong></div><button className="icon-button ghost" onClick={() => setThemeMenu((value) => !value)} aria-label="설정"><Settings2 size={20} /></button></header>
        <header className="desktop-topbar"><div className="desktop-search"><Search size={16} /><input placeholder="검색" aria-label="검색" onFocus={() => setSearchOpen(true)} /><kbd><Command size={12} /> K</kbd></div><div><button className="icon-button ghost" aria-label="동기화 상태"><Cloud size={18} /></button><button className="avatar-button">SP</button></div></header>

        <div className="view-container">
          {active === 'today' ? <TodayView selectedDate={activeDate} today={planner.today} tasks={planner.tasks} onDateChange={setSelectedDate} onAdd={planner.upsertTask} onNew={openNew} onEdit={openEdit} onToggle={planner.toggleTask} onFocus={startFocus} onMove={planner.moveTask} /> : null}
          {active === 'inbox' ? <InboxView selectedDate={activeDate} tasks={planner.tasks} onAdd={planner.upsertTask} onNew={openNew} onEdit={openEdit} onToggle={planner.toggleTask} /> : null}
          {active === 'plan' ? <PlanView selectedDate={activeDate} tasks={planner.tasks} onNewGoalTask={(goal) => openNew(activeDate, null, goal)} onEdit={openEdit} onToggle={planner.toggleTask} onMoveQuadrant={moveQuadrant} /> : null}
          {active === 'calendar' ? <CalendarView selectedDate={activeDate} today={planner.today} tasks={planner.tasks} onDateChange={setSelectedDate} onNew={openNew} onEdit={openEdit} onToggle={planner.toggleTask} onMove={planner.moveTask} /> : null}
          {active === 'focus' ? <FocusView tasks={planner.tasks} selectedTaskId={focusTaskId} onSelect={setFocusTaskId} onComplete={planner.toggleTask} /> : null}
        </div>
      </section>

      <button className="desktop-fab" onClick={() => openNew()}><Plus size={21} /><span>새 계획</span></button>
      <BottomNav active={active} onChange={setActive} onAdd={() => openNew()} />

      {editor ? <TaskSheet key={`${editor.task.id}-${editor.isNew}`} task={editor.task} isNew={editor.isNew} onClose={() => setEditor(null)} onSave={(task) => { planner.upsertTask(task); setEditor(null); }} onDelete={planner.deleteTask} onDuplicate={planner.duplicateTask} /> : null}
      {themeMenu ? <ThemeMenu theme={planner.theme} onChange={planner.setTheme} onClose={() => setThemeMenu(false)} /> : null}
      {searchOpen ? <div className="search-overlay" onMouseDown={(event) => { if (event.target === event.currentTarget) setSearchOpen(false); }}><div><header><Search size={18} /><input autoFocus placeholder="계획 검색" onChange={() => undefined} /><button onClick={() => setSearchOpen(false)}>ESC</button></header><p>제목, 프로젝트, 메모를 검색할 수 있습니다.</p>{planner.tasks.slice(0, 4).map((task) => <button key={task.id} onClick={() => { openEdit(task); setSearchOpen(false); }}><i className={task.color} /><span><strong>{task.title}</strong><small>{task.project} · {task.date}</small></span><Edit3 size={15} /></button>)}</div></div> : null}
    </main>
  );
}

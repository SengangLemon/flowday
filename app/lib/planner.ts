export type PlannerView = 'habit' | 'inbox' | 'plan' | 'calendar' | 'focus';
export type Theme = 'light' | 'dim' | 'dark';
export type TaskColor = 'sage' | 'violet' | 'amber' | 'blue' | 'rose';
export type Priority = 1 | 2 | 3 | 4;
export type Quadrant = 'do' | 'schedule' | 'delegate' | 'delete';
export type RepeatRule = 'none' | 'daily' | 'weekdays' | 'weekly' | 'monthly';
export type GoalPeriod = string;

export type ScheduleBlock = {
  id: string;
  name: string;
  start: string;
  end: string;
  color: TaskColor;
  createdAt: number;
  updatedAt: number;
};

export type PlannerTask = {
  id: string;
  title: string;
  notes: string;
  date: string;
  start: string | null;
  duration: number;
  project: string;
  color: TaskColor;
  priority: Priority;
  quadrant: Quadrant;
  completed: boolean;
  repeat: RepeatRule;
  completionDates: string[];
  occurrenceDate?: string;
  goal: string;
  createdAt: number;
  updatedAt: number;
};

export type PlanGoal = {
  id: string;
  parentId: string | null;
  title: string;
  detail: string;
  period: GoalPeriod;
  color: TaskColor;
  daily: boolean;
  checkins: string[];
  createdAt: number;
  updatedAt: number;
};

export type PlannerState = {
  version: 5;
  tasks: PlannerTask[];
  goals: PlanGoal[];
  scheduleBlocks: ScheduleBlock[];
  theme: Theme;
};

export const PROJECTS: { name: string; color: TaskColor }[] = [
  { name: '프로젝트', color: 'violet' },
  { name: '기획', color: 'sage' },
  { name: '건강', color: 'amber' },
  { name: '성장', color: 'blue' },
  { name: '생활', color: 'rose' },
];

export const GOAL_PERIODS: GoalPeriod[] = ['오늘', '3일', '이번 주', '2주', '4주', '3개월', '6개월', '1년', '3년+'];

export const REPEAT_RULES: { value: RepeatRule; label: string; hint: string }[] = [
  { value: 'none', label: '반복 안 함', hint: '선택한 날짜에 한 번만 표시됩니다.' },
  { value: 'daily', label: '매일', hint: '시작일 이후 매일 표시되고 완료 기록은 날짜별로 저장됩니다.' },
  { value: 'weekdays', label: '평일', hint: '시작일 이후 월요일부터 금요일까지 표시됩니다.' },
  { value: 'weekly', label: '매주', hint: '시작일과 같은 요일에 매주 표시됩니다.' },
  { value: 'monthly', label: '매월', hint: '시작일과 같은 날짜에 매월 표시됩니다.' },
];

export function repeatRuleLabel(rule: RepeatRule) {
  return REPEAT_RULES.find((item) => item.value === rule)?.label ?? '반복 안 함';
}

export function dateKey(date: Date) {
  const year = date.getFullYear();
  const month = String(date.getMonth() + 1).padStart(2, '0');
  const day = String(date.getDate()).padStart(2, '0');
  return `${year}-${month}-${day}`;
}

export function shiftDate(key: string, amount: number) {
  const [year, month, day] = key.split('-').map(Number);
  const date = new Date(year, month - 1, day);
  date.setDate(date.getDate() + amount);
  return dateKey(date);
}

export function formatDateLabel(key: string, options?: Intl.DateTimeFormatOptions) {
  const [year, month, day] = key.split('-').map(Number);
  return new Intl.DateTimeFormat('ko-KR', options ?? { month: 'long', day: 'numeric', weekday: 'long' }).format(new Date(year, month - 1, day));
}

export function weekDates(selectedDate: string) {
  const [year, month, day] = selectedDate.split('-').map(Number);
  const selected = new Date(year, month - 1, day);
  const start = new Date(selected);
  start.setDate(selected.getDate() - selected.getDay());
  return Array.from({ length: 7 }, (_, index) => {
    const date = new Date(start);
    date.setDate(start.getDate() + index);
    return dateKey(date);
  });
}

export function shiftMonth(key: string, amount: number) {
  const [year, month, day] = key.split('-').map(Number);
  const target = new Date(year, month - 1 + amount, 1);
  const lastDay = new Date(target.getFullYear(), target.getMonth() + 1, 0).getDate();
  target.setDate(Math.min(day, lastDay));
  return dateKey(target);
}

export function shiftYear(key: string, amount: number) {
  const [year, month, day] = key.split('-').map(Number);
  const lastDay = new Date(year + amount, month, 0).getDate();
  return dateKey(new Date(year + amount, month - 1, Math.min(day, lastDay)));
}

export function monthGridDates(selectedDate: string) {
  const [year, month] = selectedDate.split('-').map(Number);
  const first = new Date(year, month - 1, 1);
  const start = new Date(first);
  start.setDate(1 - first.getDay());
  return Array.from({ length: 42 }, (_, index) => {
    const date = new Date(start);
    date.setDate(start.getDate() + index);
    return dateKey(date);
  });
}

export function taskOccursOn(task: PlannerTask, date: string) {
  if (date < task.date) return false;
  if (task.repeat === 'none') return task.date === date;
  if (task.repeat === 'daily') return true;

  const [startYear, startMonth, startDay] = task.date.split('-').map(Number);
  const [year, month, day] = date.split('-').map(Number);
  const target = new Date(year, month - 1, day);

  if (task.repeat === 'weekdays') {
    const weekday = target.getDay();
    return weekday >= 1 && weekday <= 5;
  }

  if (task.repeat === 'weekly') {
    const startUtc = Date.UTC(startYear, startMonth - 1, startDay);
    const targetUtc = Date.UTC(year, month - 1, day);
    return Math.floor((targetUtc - startUtc) / 86_400_000) % 7 === 0;
  }

  const lastDayOfMonth = new Date(year, month, 0).getDate();
  return day === Math.min(startDay, lastDayOfMonth);
}

export function taskCompletedOn(task: PlannerTask, date: string) {
  return task.repeat !== 'none' ? task.completionDates.includes(date) : task.completed;
}

export function tasksForDate(tasks: PlannerTask[], date: string) {
  return tasks
    .filter((task) => taskOccursOn(task, date))
    .map((task) => ({
      ...task,
      completed: taskCompletedOn(task, date),
      occurrenceDate: task.repeat !== 'none' ? date : undefined,
    }));
}

export function normalizeTask(task: PlannerTask): PlannerTask {
  const repeatRules: RepeatRule[] = ['none', 'daily', 'weekdays', 'weekly', 'monthly'];
  return {
    ...task,
    repeat: repeatRules.includes(task.repeat) ? task.repeat : 'none',
    completionDates: Array.isArray(task.completionDates) ? task.completionDates : [],
    occurrenceDate: undefined,
  };
}

export function timeToMinutes(time: string) {
  const [hour, minute] = time.split(':').map(Number);
  return hour * 60 + minute;
}

export function minutesToTime(minutes: number) {
  const normalized = Math.max(0, Math.min(23 * 60 + 45, minutes));
  return `${String(Math.floor(normalized / 60)).padStart(2, '0')}:${String(normalized % 60).padStart(2, '0')}`;
}

export function scheduleBlockDuration(block: Pick<ScheduleBlock, 'start' | 'end'>) {
  return Math.max(15, timeToMinutes(block.end) - timeToMinutes(block.start));
}

export function createEmptyScheduleBlock(start = '05:00', end = '08:00'): ScheduleBlock {
  const now = Date.now();
  return {
    id: `block-${now}-${Math.random().toString(36).slice(2, 7)}`,
    name: '',
    start,
    end,
    color: 'sage',
    createdAt: now,
    updatedAt: now,
  };
}

export function createEmptyGoal(parentId: string | null = null): PlanGoal {
  const now = Date.now();
  return {
    id: `goal-${now}-${Math.random().toString(36).slice(2, 7)}`,
    parentId,
    title: '',
    detail: '',
    period: parentId ? '이번 주' : '1년',
    color: 'sage',
    daily: false,
    checkins: [],
    createdAt: now,
    updatedAt: now,
  };
}

export function createEmptyTask(date: string, start: string | null = null): PlannerTask {
  const now = Date.now();
  return {
    id: `task-${now}-${Math.random().toString(36).slice(2, 7)}`,
    title: '',
    notes: '',
    date,
    start,
    duration: 30,
    project: '프로젝트',
    color: 'violet',
    priority: 4,
    quadrant: 'schedule',
    completed: false,
    repeat: 'none',
    completionDates: [],
    goal: '',
    createdAt: now,
    updatedAt: now,
  };
}

export function parseQuickAdd(input: string, selectedDate: string): PlannerTask {
  const task = createEmptyTask(selectedDate);
  let title = input.trim();

  const priorityMatch = title.match(/(?:^|\s)p([1-4])(?:\s|$)/i);
  if (priorityMatch) {
    task.priority = Number(priorityMatch[1]) as Priority;
    title = title.replace(priorityMatch[0], ' ').trim();
  }

  const timeMatch = title.match(/(?:^|\s)([01]?\d|2[0-3]):([0-5]\d)(?:\s|$)/);
  if (timeMatch) {
    task.start = `${String(Number(timeMatch[1])).padStart(2, '0')}:${timeMatch[2]}`;
    title = title.replace(timeMatch[0], ' ').trim();
  }

  const projectMatch = title.match(/#(프로젝트|기획|건강|성장|생활)/);
  if (projectMatch) {
    task.project = projectMatch[1];
    task.color = PROJECTS.find((project) => project.name === task.project)?.color ?? 'violet';
    title = title.replace(projectMatch[0], '').trim();
  }

  if (/\b내일\b/.test(title)) {
    task.date = shiftDate(selectedDate, 1);
    title = title.replace(/\b내일\b/, '').trim();
  } else {
    title = title.replace(/\b오늘\b/, '').trim();
  }

  task.title = title || '새로운 할 일';
  return task;
}

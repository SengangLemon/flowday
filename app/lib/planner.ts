export type PlannerView = 'today' | 'inbox' | 'plan' | 'calendar' | 'focus';
export type Theme = 'light' | 'dim' | 'dark';
export type TaskColor = 'sage' | 'violet' | 'amber' | 'blue' | 'rose';
export type Priority = 1 | 2 | 3 | 4;
export type Quadrant = 'do' | 'schedule' | 'delegate' | 'delete';
export type RepeatRule = 'none' | 'daily';
export type GoalPeriod = '오늘' | '이번 주' | '4주' | '3개월' | '1년' | '3년+';

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
  version: 3;
  tasks: PlannerTask[];
  goals: PlanGoal[];
  theme: Theme;
};

export const PROJECTS: { name: string; color: TaskColor }[] = [
  { name: '프로젝트', color: 'violet' },
  { name: '기획', color: 'sage' },
  { name: '건강', color: 'amber' },
  { name: '성장', color: 'blue' },
  { name: '생활', color: 'rose' },
];

export const GOAL_PERIODS: GoalPeriod[] = ['오늘', '이번 주', '4주', '3개월', '1년', '3년+'];

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

export function lawnDates(today: string, days = 84) {
  return Array.from({ length: days }, (_, index) => shiftDate(today, index - days + 1));
}

export function taskOccursOn(task: PlannerTask, date: string) {
  return task.repeat === 'daily' ? date >= task.date : task.date === date;
}

export function taskCompletedOn(task: PlannerTask, date: string) {
  return task.repeat === 'daily' ? task.completionDates.includes(date) : task.completed;
}

export function tasksForDate(tasks: PlannerTask[], date: string) {
  return tasks
    .filter((task) => taskOccursOn(task, date))
    .map((task) => ({
      ...task,
      completed: taskCompletedOn(task, date),
      occurrenceDate: task.repeat === 'daily' ? date : undefined,
    }));
}

export function normalizeTask(task: PlannerTask): PlannerTask {
  return {
    ...task,
    repeat: task.repeat ?? 'none',
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

export function createSeedGoals(today: string): PlanGoal[] {
  const now = Date.now();
  const recent = (offsets: number[]) => offsets.map((offset) => shiftDate(today, offset));
  const make = (goal: Omit<PlanGoal, 'createdAt' | 'updatedAt'>, index: number): PlanGoal => ({
    ...goal,
    createdAt: now + index,
    updatedAt: now + index,
  });

  return [
    make({ id: 'goal-product', parentId: null, title: '나만의 디지털 제품으로 독립하기', detail: '지속 가능한 수익을 만드는 제품 3개 출시', period: '3년+', color: 'sage', daily: false, checkins: [] }, 1),
    make({ id: 'goal-launch', parentId: 'goal-product', title: '첫 번째 제품 정식 출시', detail: '사용자 1,000명과 첫 유료 고객 확보', period: '1년', color: 'blue', daily: false, checkins: [] }, 2),
    make({ id: 'goal-mvp', parentId: 'goal-launch', title: '생활 관리 앱 MVP 완성', detail: '핵심 경험 검증과 베타 테스트', period: '3개월', color: 'violet', daily: false, checkins: [] }, 3),
    make({ id: 'goal-build', parentId: 'goal-mvp', title: '계획과 실행 화면 구현', detail: '오늘 · 계획 · 캘린더 · 집중 경험 완성', period: '4주', color: 'amber', daily: false, checkins: [] }, 4),
    make({ id: 'goal-mobile', parentId: 'goal-build', title: '모바일 핵심 흐름 완성', detail: '생성 · 수정 · 이동 · 완료 경험 안정화', period: '이번 주', color: 'rose', daily: true, checkins: recent([-6, -5, -3, -2, 0]) }, 5),
    make({ id: 'goal-feedback', parentId: 'goal-mvp', title: '사용자 피드백 1건 기록', detail: '매일 한 명의 불편과 기대를 기록', period: '이번 주', color: 'sage', daily: true, checkins: recent([-8, -7, -6, -4, -2, -1]) }, 6),
    make({ id: 'goal-health', parentId: null, title: '건강한 생활 리듬 만들기', detail: '집중과 회복이 지속되는 기본 체력 만들기', period: '1년', color: 'amber', daily: false, checkins: [] }, 7),
    make({ id: 'goal-walk', parentId: 'goal-health', title: '30분 걷기', detail: '점심 또는 저녁에 가볍게 걷기', period: '3개월', color: 'amber', daily: true, checkins: recent([-12, -11, -9, -8, -7, -5, -4, -2, 0]) }, 8),
    make({ id: 'goal-growth', parentId: null, title: '매일 성장하는 시스템 만들기', detail: '작은 학습을 기록하고 다음 실행으로 연결', period: '3개월', color: 'blue', daily: false, checkins: [] }, 9),
    make({ id: 'goal-read', parentId: 'goal-growth', title: '20분 읽고 한 줄 기록', detail: '읽은 내용을 한 문장으로 남기기', period: '이번 주', color: 'blue', daily: true, checkins: recent([-6, -4, -3, -2, -1]) }, 10),
  ];
}

export function createEmptyGoal(parentId: string | null = null): PlanGoal {
  const now = Date.now();
  return {
    id: `goal-${now}-${Math.random().toString(36).slice(2, 7)}`,
    parentId,
    title: '',
    detail: '',
    period: parentId ? '이번 주' : '3개월',
    color: 'sage',
    daily: false,
    checkins: [],
    createdAt: now,
    updatedAt: now,
  };
}

export function createSeedTasks(today: string): PlannerTask[] {
  const now = Date.now();
  const make = (task: Omit<PlannerTask, 'id' | 'createdAt' | 'updatedAt' | 'repeat' | 'completionDates' | 'occurrenceDate'>, index: number): PlannerTask => ({
    ...task,
    id: `seed-${index}`,
    repeat: 'none',
    completionDates: [],
    createdAt: now + index,
    updatedAt: now + index,
  });

  return [
    make({ title: '주간 계획 정리', notes: '이번 주 가장 중요한 결과 3가지를 정리합니다.', date: today, start: '08:30', duration: 45, project: '기획', color: 'sage', priority: 2, quadrant: 'schedule', completed: true, goal: '모바일 핵심 흐름 완성' }, 1),
    make({ title: 'MVP 모바일 화면 설계', notes: '한 손 조작과 편집 흐름을 우선해서 점검합니다.', date: today, start: '10:00', duration: 90, project: '프로젝트', color: 'violet', priority: 1, quadrant: 'do', completed: false, goal: '생활 관리 앱 MVP 완성' }, 2),
    make({ title: '점심과 산책', notes: '화면에서 벗어나 가볍게 걷기.', date: today, start: '12:30', duration: 60, project: '건강', color: 'amber', priority: 3, quadrant: 'schedule', completed: false, goal: '지속 가능한 생활 리듬' }, 3),
    make({ title: '블록 편집 기능 구현', notes: '생성, 수정, 복제, 삭제를 모두 확인합니다.', date: today, start: '14:30', duration: 120, project: '프로젝트', color: 'blue', priority: 1, quadrant: 'do', completed: false, goal: '생활 관리 앱 MVP 완성' }, 4),
    make({ title: '출시 체크리스트 정리', notes: '', date: today, start: null, duration: 30, project: '기획', color: 'sage', priority: 2, quadrant: 'schedule', completed: false, goal: '첫 번째 제품 정식 출시' }, 5),
    make({ title: '사용자 피드백 요청', notes: '', date: shiftDate(today, 1), start: '11:00', duration: 45, project: '프로젝트', color: 'rose', priority: 2, quadrant: 'delegate', completed: false, goal: '생활 관리 앱 MVP 완성' }, 6),
    make({ title: '운동 루틴', notes: '', date: shiftDate(today, 2), start: '19:00', duration: 60, project: '건강', color: 'amber', priority: 3, quadrant: 'schedule', completed: false, goal: '지속 가능한 생활 리듬' }, 7),
  ];
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
    goal: '모바일 핵심 흐름 완성',
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

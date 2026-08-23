export type PlannerView = 'today' | 'inbox' | 'plan' | 'calendar' | 'focus';
export type Theme = 'light' | 'dim' | 'dark';
export type TaskColor = 'sage' | 'violet' | 'amber' | 'blue' | 'rose';
export type Priority = 1 | 2 | 3 | 4;
export type Quadrant = 'do' | 'schedule' | 'delegate' | 'delete';

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
  goal: string;
  createdAt: number;
  updatedAt: number;
};

export type PlannerState = {
  version: 2;
  tasks: PlannerTask[];
  theme: Theme;
};

export const PROJECTS: { name: string; color: TaskColor }[] = [
  { name: '프로젝트', color: 'violet' },
  { name: '기획', color: 'sage' },
  { name: '건강', color: 'amber' },
  { name: '성장', color: 'blue' },
  { name: '생활', color: 'rose' },
];

export const GOALS = [
  { period: '3년+', title: '나만의 디지털 제품으로 독립하기', detail: '지속 가능한 수익을 만드는 제품 3개 출시', progress: 42, color: 'sage' as TaskColor },
  { period: '1년', title: '첫 번째 제품 정식 출시', detail: '사용자 1,000명과 첫 유료 고객 확보', progress: 48, color: 'blue' as TaskColor },
  { period: '3개월', title: '생활 관리 앱 MVP 완성', detail: '핵심 경험 검증과 베타 테스트', progress: 65, color: 'violet' as TaskColor },
  { period: '4주', title: '계획과 실행 화면 구현', detail: '오늘 · 계획 · 캘린더 · 집중', progress: 74, color: 'amber' as TaskColor },
  { period: '이번 주', title: '모바일 핵심 흐름 완성', detail: '생성 · 수정 · 이동 · 완료 경험 안정화', progress: 68, color: 'rose' as TaskColor },
];

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

export function timeToMinutes(time: string) {
  const [hour, minute] = time.split(':').map(Number);
  return hour * 60 + minute;
}

export function minutesToTime(minutes: number) {
  const normalized = Math.max(0, Math.min(23 * 60 + 45, minutes));
  return `${String(Math.floor(normalized / 60)).padStart(2, '0')}:${String(normalized % 60).padStart(2, '0')}`;
}

export function createSeedTasks(today: string): PlannerTask[] {
  const now = Date.now();
  const make = (task: Omit<PlannerTask, 'id' | 'createdAt' | 'updatedAt'>, index: number): PlannerTask => ({
    ...task,
    id: `seed-${index}`,
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

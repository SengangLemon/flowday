import {
  normalizeGoal,
  normalizeTask,
  PlanGoal,
  PlannerState,
  PlannerTask,
  PlannerTombstones,
  PlannerView,
  ScheduleBlock,
  Theme,
} from './planner';

export const PLANNER_VIEWS: PlannerView[] = ['habit', 'inbox', 'plan', 'calendar', 'focus'];

export type PlannerLocalDocument = {
  format: 'flowday-local-document';
  schemaVersion: 1;
  state: PlannerState;
  dirty: boolean;
  revision: number;
  updatedAt: number;
};

type PlannerBackup = {
  format: 'flowday-backup';
  schemaVersion: 6 | 7;
  exportedAt: string;
  data: PlannerState;
};

type StoredPlannerState = {
  version: 5 | 6 | 7;
  tasks: PlannerTask[];
  goals: PlanGoal[];
  scheduleBlocks: ScheduleBlock[];
  theme?: Theme;
  onboardingCompleted?: boolean;
  introducedViews?: PlannerView[];
  tombstones?: Partial<PlannerTombstones>;
  metadata?: { themeUpdatedAt?: number };
};

function emptyTombstones(): PlannerTombstones {
  return { tasks: {}, goals: {}, scheduleBlocks: {} };
}

export function defaultPlannerState(): PlannerState {
  return {
    version: 7,
    tasks: [],
    goals: [],
    scheduleBlocks: [],
    theme: 'light',
    introducedViews: [],
    tombstones: emptyTombstones(),
    metadata: { themeUpdatedAt: 0 },
  };
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return Boolean(value) && typeof value === 'object' && !Array.isArray(value);
}

function finiteTimestamp(value: unknown) {
  return typeof value === 'number' && Number.isFinite(value) && value >= 0 ? value : 0;
}

function normalizeTheme(theme: unknown): Theme {
  return theme === 'dim' || theme === 'dark' ? theme : 'light';
}

function hasValidTaskShape(value: unknown) {
  return isRecord(value)
    && typeof value.id === 'string'
    && typeof value.title === 'string'
    && typeof value.date === 'string'
    && (value.start === null || typeof value.start === 'string')
    && typeof value.duration === 'number';
}

function hasValidGoalShape(value: unknown) {
  return isRecord(value) && typeof value.id === 'string' && typeof value.title === 'string';
}

function hasValidBlockShape(value: unknown) {
  return isRecord(value)
    && typeof value.id === 'string'
    && typeof value.name === 'string'
    && typeof value.start === 'string'
    && typeof value.end === 'string';
}

function normalizeTombstoneRecord(value: unknown) {
  if (!isRecord(value)) return {};
  return Object.fromEntries(Object.entries(value)
    .map(([id, timestamp]) => [id, finiteTimestamp(timestamp)] as const)
    .filter(([, timestamp]) => timestamp > 0));
}

function normalizeTaskTimestamps(task: PlannerTask): PlannerTask {
  const updatedAt = finiteTimestamp(task.updatedAt);
  const createdAt = finiteTimestamp(task.createdAt) || updatedAt;
  return normalizeTask({ ...task, createdAt, updatedAt: updatedAt || createdAt });
}

function normalizeGoalTimestamps(goal: PlanGoal): PlanGoal {
  const updatedAt = finiteTimestamp(goal.updatedAt);
  const createdAt = finiteTimestamp(goal.createdAt) || updatedAt;
  return normalizeGoal({ ...goal, createdAt, updatedAt: updatedAt || createdAt });
}

function normalizeBlockTimestamps(block: ScheduleBlock): ScheduleBlock {
  const updatedAt = finiteTimestamp(block.updatedAt);
  const createdAt = finiteTimestamp(block.createdAt) || updatedAt;
  return { ...block, createdAt, updatedAt: updatedAt || createdAt };
}

function upgradeState(state: StoredPlannerState): PlannerState {
  const goals = state.goals.map(normalizeGoalTimestamps);
  const goalIds = new Set(goals.map((goal) => goal.id));
  const tasks = state.tasks.map(normalizeTaskTimestamps).map((task) => {
    const linkedGoal = task.goalId && goalIds.has(task.goalId)
      ? goals.find((goal) => goal.id === task.goalId)
      : goals.find((goal) => goal.title === task.goal);
    return {
      ...task,
      goalId: linkedGoal?.id ?? null,
      goal: linkedGoal?.title ?? task.goal,
    };
  });

  return {
    version: 7,
    tasks: tasks.sort(sortByCreatedAt),
    goals: goals.sort(sortByCreatedAt),
    scheduleBlocks: state.scheduleBlocks.map(normalizeBlockTimestamps).sort(sortScheduleBlocks),
    theme: normalizeTheme(state.theme),
    introducedViews: state.onboardingCompleted
      ? PLANNER_VIEWS
      : PLANNER_VIEWS.filter((view) => state.introducedViews?.includes(view)),
    tombstones: {
      tasks: normalizeTombstoneRecord(state.tombstones?.tasks),
      goals: normalizeTombstoneRecord(state.tombstones?.goals),
      scheduleBlocks: normalizeTombstoneRecord(state.tombstones?.scheduleBlocks),
    },
    metadata: { themeUpdatedAt: finiteTimestamp(state.metadata?.themeUpdatedAt) },
  };
}

export function parsePlannerState(value: unknown): PlannerState | null {
  if (!isRecord(value)) return null;
  const backup = value as Partial<PlannerBackup>;
  const candidate = backup.format === 'flowday-backup' ? backup.data : value;
  if (!isRecord(candidate)) return null;
  const state = candidate as Partial<StoredPlannerState>;

  if ((state.version === 5 || state.version === 6 || state.version === 7)
    && Array.isArray(state.tasks)
    && Array.isArray(state.goals)
    && Array.isArray(state.scheduleBlocks)) {
    if (!state.tasks.every(hasValidTaskShape)
      || !state.goals.every(hasValidGoalShape)
      || !state.scheduleBlocks.every(hasValidBlockShape)) return null;
    return upgradeState(state as StoredPlannerState);
  }

  const legacy = candidate as {
    version?: number;
    tasks?: PlannerTask[];
    goals?: PlanGoal[];
    theme?: Theme;
  };
  if (legacy.version === 4 && Array.isArray(legacy.tasks) && Array.isArray(legacy.goals)) {
    if (!legacy.tasks.every(hasValidTaskShape) || !legacy.goals.every(hasValidGoalShape)) return null;
    return upgradeState({
      version: 5,
      tasks: legacy.tasks,
      goals: legacy.goals,
      scheduleBlocks: [],
      theme: legacy.theme,
    });
  }
  if ((legacy.version === 2 || legacy.version === 3) && Array.isArray(legacy.tasks)) {
    if (!legacy.tasks.every(hasValidTaskShape)) return null;
    return upgradeState({
      version: 5,
      tasks: legacy.tasks.filter((task) => !task.id.startsWith('seed-')),
      goals: [],
      scheduleBlocks: [],
      theme: legacy.theme,
    });
  }
  return null;
}

export function plannerStateUpdatedAt(state: PlannerState) {
  const itemTimes = [
    ...state.tasks.map((item) => finiteTimestamp(item.updatedAt)),
    ...state.goals.map((item) => finiteTimestamp(item.updatedAt)),
    ...state.scheduleBlocks.map((item) => finiteTimestamp(item.updatedAt)),
    ...Object.values(state.tombstones.tasks),
    ...Object.values(state.tombstones.goals),
    ...Object.values(state.tombstones.scheduleBlocks),
    finiteTimestamp(state.metadata.themeUpdatedAt),
  ];
  let latest = 0;
  for (const timestamp of itemTimes) latest = Math.max(latest, timestamp);
  return latest;
}

export function parseLocalDocument(value: unknown): PlannerLocalDocument | null {
  if (isRecord(value) && value.format === 'flowday-local-document') {
    const state = parsePlannerState(value.state);
    if (!state) return null;
    return {
      format: 'flowday-local-document',
      schemaVersion: 1,
      state,
      dirty: Boolean(value.dirty),
      revision: finiteTimestamp(value.revision),
      updatedAt: finiteTimestamp(value.updatedAt) || plannerStateUpdatedAt(state),
    };
  }

  const state = parsePlannerState(value);
  if (!state) return null;
  const updatedAt = plannerStateUpdatedAt(state) || Date.now();
  return {
    format: 'flowday-local-document',
    schemaVersion: 1,
    state: {
      ...state,
      metadata: { themeUpdatedAt: state.metadata.themeUpdatedAt || updatedAt },
    },
    dirty: true,
    revision: 0,
    updatedAt,
  };
}

export function createLocalDocument(
  state: PlannerState,
  options: { dirty: boolean; revision: number; updatedAt?: number },
): PlannerLocalDocument {
  return {
    format: 'flowday-local-document',
    schemaVersion: 1,
    state,
    dirty: options.dirty,
    revision: options.revision,
    updatedAt: options.updatedAt ?? plannerStateUpdatedAt(state),
  };
}

function sortByCreatedAt<T extends { id: string; createdAt: number }>(left: T, right: T) {
  return left.createdAt - right.createdAt || left.id.localeCompare(right.id);
}

function sortScheduleBlocks(left: ScheduleBlock, right: ScheduleBlock) {
  return left.start.localeCompare(right.start) || left.id.localeCompare(right.id);
}

function stableSerialize(value: unknown): string {
  if (Array.isArray(value)) return `[${value.map(stableSerialize).join(',')}]`;
  if (isRecord(value)) {
    return `{${Object.keys(value).sort().map((key) => `${JSON.stringify(key)}:${stableSerialize(value[key])}`).join(',')}}`;
  }
  return JSON.stringify(value);
}

export function plannerStatesEqual(left: PlannerState, right: PlannerState) {
  return stableSerialize(left) === stableSerialize(right);
}

function laterItem<T extends { updatedAt: number }>(left?: T, right?: T): T | undefined {
  if (!left) return right;
  if (!right) return left;
  const leftAt = finiteTimestamp(left.updatedAt);
  const rightAt = finiteTimestamp(right.updatedAt);
  if (leftAt !== rightAt) return leftAt > rightAt ? left : right;
  return stableSerialize(left) >= stableSerialize(right) ? left : right;
}

function mergeTombstones(left: Record<string, number>, right: Record<string, number>) {
  const result: Record<string, number> = {};
  for (const id of new Set([...Object.keys(left), ...Object.keys(right)])) {
    result[id] = Math.max(finiteTimestamp(left[id]), finiteTimestamp(right[id]));
  }
  return result;
}

function mergeCollection<T extends { id: string; updatedAt: number }>(
  left: T[],
  right: T[],
  tombstones: Record<string, number>,
) {
  const leftById = new Map(left.map((item) => [item.id, item]));
  const rightById = new Map(right.map((item) => [item.id, item]));
  const result: T[] = [];
  for (const id of new Set([...leftById.keys(), ...rightById.keys(), ...Object.keys(tombstones)])) {
    const item = laterItem(leftById.get(id), rightById.get(id));
    if (item && finiteTimestamp(item.updatedAt) > finiteTimestamp(tombstones[id])) result.push(item);
  }
  return result;
}

export function mergePlannerStates(left: PlannerState, right: PlannerState): PlannerState {
  const tombstones = {
    tasks: mergeTombstones(left.tombstones.tasks, right.tombstones.tasks),
    goals: mergeTombstones(left.tombstones.goals, right.tombstones.goals),
    scheduleBlocks: mergeTombstones(left.tombstones.scheduleBlocks, right.tombstones.scheduleBlocks),
  };
  const leftThemeAt = finiteTimestamp(left.metadata.themeUpdatedAt);
  const rightThemeAt = finiteTimestamp(right.metadata.themeUpdatedAt);
  const theme = leftThemeAt === rightThemeAt
    ? ([left.theme, right.theme].sort().at(-1) ?? left.theme)
    : leftThemeAt > rightThemeAt ? left.theme : right.theme;

  return {
    version: 7,
    tasks: mergeCollection(left.tasks, right.tasks, tombstones.tasks).sort(sortByCreatedAt),
    goals: mergeCollection(left.goals, right.goals, tombstones.goals).sort(sortByCreatedAt),
    scheduleBlocks: mergeCollection(left.scheduleBlocks, right.scheduleBlocks, tombstones.scheduleBlocks).sort(sortScheduleBlocks),
    theme,
    introducedViews: PLANNER_VIEWS.filter((view) => left.introducedViews.includes(view) || right.introducedViews.includes(view)),
    tombstones,
    metadata: { themeUpdatedAt: Math.max(leftThemeAt, rightThemeAt) },
  };
}

export function nextMutationTimestamp(...timestamps: Array<number | undefined>) {
  return Math.max(Date.now(), ...timestamps.map((value) => finiteTimestamp(value) + 1));
}

export function replacementPlannerState(current: PlannerState, incoming: PlannerState, timestamp: number): PlannerState {
  const incomingTaskIds = new Set(incoming.tasks.map((item) => item.id));
  const incomingGoalIds = new Set(incoming.goals.map((item) => item.id));
  const incomingBlockIds = new Set(incoming.scheduleBlocks.map((item) => item.id));
  const tombstones: PlannerTombstones = {
    tasks: mergeTombstones(current.tombstones.tasks, incoming.tombstones.tasks),
    goals: mergeTombstones(current.tombstones.goals, incoming.tombstones.goals),
    scheduleBlocks: mergeTombstones(current.tombstones.scheduleBlocks, incoming.tombstones.scheduleBlocks),
  };
  current.tasks.forEach((item) => { if (!incomingTaskIds.has(item.id)) tombstones.tasks[item.id] = Math.max(tombstones.tasks[item.id] ?? 0, timestamp); });
  current.goals.forEach((item) => { if (!incomingGoalIds.has(item.id)) tombstones.goals[item.id] = Math.max(tombstones.goals[item.id] ?? 0, timestamp); });
  current.scheduleBlocks.forEach((item) => { if (!incomingBlockIds.has(item.id)) tombstones.scheduleBlocks[item.id] = Math.max(tombstones.scheduleBlocks[item.id] ?? 0, timestamp); });

  return {
    ...incoming,
    version: 7,
    tasks: incoming.tasks.map((item) => ({ ...item, updatedAt: timestamp })).sort(sortByCreatedAt),
    goals: incoming.goals.map((item) => ({ ...item, updatedAt: timestamp })).sort(sortByCreatedAt),
    scheduleBlocks: incoming.scheduleBlocks.map((item) => ({ ...item, updatedAt: timestamp })).sort(sortScheduleBlocks),
    tombstones,
    metadata: { themeUpdatedAt: timestamp },
  };
}

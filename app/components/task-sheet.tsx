'use client';

import {
  CalendarDays,
  Check,
  Clock3,
  Copy,
  Flag,
  Folder,
  Goal,
  Repeat2,
  StickyNote,
  X,
} from 'lucide-react';
import { FormEvent, useMemo, useState } from 'react';
import {
  PlanGoal,
  PlannerTask,
  Priority,
  PROJECTS,
  Quadrant,
  REPEAT_RULES,
  ScheduleBlock,
  TaskColor,
  tasksForDate,
  timeToMinutes,
} from '../lib/planner';
import { TimeChoice } from './time-choice';
import { ConfirmDeleteButton } from './confirm-delete-button';

type TaskSheetProps = {
  task: PlannerTask;
  tasks: PlannerTask[];
  goals: PlanGoal[];
  scheduleBlocks: ScheduleBlock[];
  isNew: boolean;
  onClose: () => void;
  onSave: (task: PlannerTask) => void;
  onDelete: (taskId: string) => void;
  onDuplicate: (taskId: string) => void;
};

const COLORS: { id: TaskColor; label: string }[] = [
  { id: 'sage', label: '세이지' },
  { id: 'violet', label: '바이올렛' },
  { id: 'amber', label: '앰버' },
  { id: 'blue', label: '블루' },
  { id: 'rose', label: '로즈' },
];

const QUADRANT_OPTIONS: { value: Quadrant; label: string; hint: string }[] = [
  { value: 'do', label: '지금 실행', hint: '중요 · 긴급' },
  { value: 'schedule', label: '시간 배치', hint: '중요 · 여유' },
  { value: 'delegate', label: '위임', hint: '긴급 · 덜 중요' },
  { value: 'delete', label: '보류', hint: '나중에 검토' },
];

const DURATION_OPTIONS = [15, 25, 30, 45, 60, 90, 120, 180, 240, 360, 480];

function durationLabel(minutes: number) {
  const hours = Math.floor(minutes / 60);
  const rest = minutes % 60;
  if (!hours) return `${rest}분`;
  return `${hours}시간${rest ? ` ${rest}분` : ''}`;
}

function clockTimeLabel(totalMinutes: number) {
  const normalized = ((totalMinutes % (24 * 60)) + (24 * 60)) % (24 * 60);
  return `${String(Math.floor(normalized / 60)).padStart(2, '0')}:${String(normalized % 60).padStart(2, '0')}`;
}

export function TaskSheet({ task: initialTask, tasks, goals, scheduleBlocks, isNew, onClose, onSave, onDelete, onDuplicate }: TaskSheetProps) {
  const [task, setTask] = useState(initialTask);
  const [timed, setTimed] = useState(initialTask.start !== null);
  const durationOptions = useMemo(() => DURATION_OPTIONS.includes(task.duration)
    ? DURATION_OPTIONS
    : [...DURATION_OPTIONS, task.duration].sort((a, b) => a - b), [task.duration]);
  const repeatOption = REPEAT_RULES.find((item) => item.value === task.repeat) ?? REPEAT_RULES[0];
  const linkedGoal = goals.find((goal) => goal.id === task.goalId);
  const endMinutes = timeToMinutes(task.start ?? '09:00') + task.duration;
  const endLabel = `${endMinutes >= 24 * 60 ? '다음 날 ' : ''}${clockTimeLabel(endMinutes)}`;
  const conflictingTasks = useMemo(() => {
    if (!timed || !task.start) return [];
    const start = timeToMinutes(task.start);
    const end = start + task.duration;
    return tasksForDate(tasks, task.date).filter((candidate) => {
      if (candidate.id === task.id || !candidate.start) return false;
      const candidateStart = timeToMinutes(candidate.start);
      const candidateEnd = candidateStart + candidate.duration;
      return start < candidateEnd && end > candidateStart;
    });
  }, [task.date, task.duration, task.id, task.start, tasks, timed]);

  function update<K extends keyof PlannerTask>(key: K, value: PlannerTask[K]) {
    setTask((current) => ({ ...current, [key]: value }));
  }

  function handleProject(projectName: string) {
    const project = PROJECTS.find((item) => item.name === projectName);
    setTask((current) => ({
      ...current,
      project: projectName,
      color: project?.color ?? current.color,
    }));
  }

  function handleGoal(goal: PlanGoal | null) {
    setTask((current) => ({
      ...current,
      goalId: goal?.id ?? null,
      goal: goal?.title ?? '',
    }));
  }

  function handleSubmit(event: FormEvent) {
    event.preventDefault();
    const title = task.title.trim();
    if (!title) return;
    onSave({ ...task, title, start: timed ? task.start ?? '09:00' : null });
  }

  return (
    <div className="sheet-backdrop" onMouseDown={(event) => {
      if (event.target === event.currentTarget) onClose();
    }}>
      <form className="task-sheet" role="dialog" aria-modal="true" aria-labelledby="task-sheet-title" onSubmit={handleSubmit}>
        <div className="sheet-handle" aria-hidden="true" />
        <header className="sheet-header">
          <button className="icon-button ghost" type="button" onClick={onClose} aria-label="닫기"><X size={20} /></button>
          <div>
            <span className="overline">{isNew ? '새 실행' : '실행 상세'}</span>
            <h2 id="task-sheet-title">{isNew ? '새 실행 만들기' : '실행 수정하기'}</h2>
          </div>
          <button className="save-icon-button" type="submit" aria-label="저장"><Check size={19} /></button>
        </header>

        <div className="sheet-scroll">
          <label className="title-field">
            <span className={`color-dot ${task.color}`} />
            <input
              autoFocus
              value={task.title}
              onChange={(event) => update('title', event.target.value)}
              placeholder="무엇을 실행할까요?"
              aria-label="실행 제목"
            />
          </label>

          <section className="sheet-section">
            <h3>언제 실행하나요</h3>
            <label className="schedule-date-choice">
              <span><CalendarDays size={17} />날짜</span>
              <input type="date" value={task.date} onChange={(event) => update('date', event.target.value)} />
            </label>
            <div className="field-row field-row-toggle">
              <Clock3 size={18} />
              <div><strong>타임라인에 배치</strong><small>끄면 인박스 할 일로 저장됩니다.</small></div>
              <button className={`switch ${timed ? 'on' : ''}`} type="button" role="switch" aria-label="타임라인에 배치" aria-checked={timed} onClick={() => setTimed((value) => !value)}><i /></button>
            </div>
            {timed ? (
              <div className="schedule-choice-panel">
                <TimeChoice value={task.start ?? '09:00'} onChange={(value) => update('start', value)} label="시작 시간" suggestedTimes={scheduleBlocks.map((block) => block.start)} />
                <div className="choice-block">
                  <header><span>실행 길이</span><strong>{durationLabel(task.duration)}</strong></header>
                  <div className="choice-scroll" role="group" aria-label="실행 길이">
                    {durationOptions.map((minutes) => <button type="button" aria-pressed={task.duration === minutes} key={minutes} onClick={() => update('duration', minutes)}>{durationLabel(minutes)}</button>)}
                  </div>
                </div>
                <p className="time-end-preview"><Clock3 size={13} />{task.start ?? '09:00'} 시작 · {endLabel} 종료 예정</p>
                {conflictingTasks.length ? <p className="schedule-warning" role="status"><Clock3 size={13} />같은 시간에 {conflictingTasks.slice(0, 2).map((item) => item.title).join(', ')} 일정이 있습니다.</p> : null}
              </div>
            ) : null}
            <div className="choice-block repeat-choice-block">
              <header><span><Repeat2 size={16} />반복</span><strong>{repeatOption.label}</strong></header>
              <div className="choice-scroll" role="group" aria-label="반복">
                {REPEAT_RULES.map((option) => <button type="button" aria-pressed={task.repeat === option.value} key={option.value} onClick={() => update('repeat', option.value)}>{option.label}</button>)}
              </div>
              {task.repeat !== 'none' ? <p className="repeat-hint"><Repeat2 size={13} />{repeatOption.hint}</p> : null}
            </div>
          </section>

          <section className="sheet-section">
            <h3>어디에 두나요</h3>
            <div className="choice-block">
              <header><span><Folder size={16} />프로젝트</span><strong>{task.project}</strong></header>
              <div className="project-choice-grid" role="group" aria-label="프로젝트">
                {PROJECTS.map((project) => <button type="button" aria-pressed={task.project === project.name} key={project.name} onClick={() => handleProject(project.name)}><i className={project.color} />{project.name}</button>)}
              </div>
            </div>
            <div className="field-row priority-field">
              <Flag size={18} />
              <div><strong>우선순위</strong><div className="priority-options">{([1, 2, 3, 4] as Priority[]).map((priority) => <button className={task.priority === priority ? `p${priority} selected` : `p${priority}`} aria-pressed={task.priority === priority} key={priority} type="button" onClick={() => update('priority', priority)}>P{priority}</button>)}</div></div>
            </div>
            <div className="choice-block matrix-choice-block">
              <header><span><Goal size={16} />아이젠하워</span></header>
              <div className="matrix-choice-grid" role="group" aria-label="아이젠하워 매트릭스">
                {QUADRANT_OPTIONS.map((option) => <button type="button" aria-pressed={task.quadrant === option.value} key={option.value} onClick={() => update('quadrant', option.value)}><strong>{option.label}</strong><small>{option.hint}</small></button>)}
              </div>
            </div>
          </section>

          <section className="sheet-section">
            <h3>계획과 실행 기준</h3>
            <div className="choice-block goal-choice-block">
              <header><span><Goal size={16} />연결 계획</span><strong>{linkedGoal?.title || task.goal || '연결 안 함'}</strong></header>
              {goals.length ? (
                <div className="goal-choice-list" role="group" aria-label="연결 계획">
                  <button type="button" aria-pressed={!task.goalId && !task.goal} onClick={() => handleGoal(null)}>연결 안 함</button>
                  {goals.map((goal) => <button type="button" aria-pressed={task.goalId === goal.id || (!task.goalId && task.goal === goal.title)} key={goal.id} onClick={() => handleGoal(goal)}><i className={goal.color} /><span><strong>{goal.title}</strong><small>{goal.period}{goal.parentId ? ' · 하위 계획' : ''}</small></span></button>)}
                </div>
              ) : <p className="empty-choice-copy">계획을 만들면 여기서 실행 항목과 바로 연결할 수 있습니다.</p>}
            </div>
            <label className="notes-field"><StickyNote size={18} /><textarea value={task.notes} onChange={(event) => update('notes', event.target.value)} placeholder="메모, 완료 기준, 다음 행동을 적어보세요" rows={3} /></label>
            <div className="color-picker"><span>색상</span><div>{COLORS.map((color) => <button className={`${color.id} ${task.color === color.id ? 'selected' : ''}`} key={color.id} type="button" onClick={() => update('color', color.id)} aria-label={color.label}><Check size={13} /></button>)}</div></div>
          </section>

          {!isNew ? (
            <section className="sheet-secondary-actions">
              <button type="button" onClick={() => { onDuplicate(task.id); onClose(); }}><Copy size={17} />복제</button>
              <ConfirmDeleteButton label="삭제" warning="완료 기록을 포함한 이 실행이 삭제됩니다." onConfirm={() => { onDelete(task.id); onClose(); }} />
            </section>
          ) : null}
        </div>

        <footer className="sheet-footer">
          <button className="sheet-save-button" type="submit">{isNew ? '실행 추가' : '변경사항 저장'}</button>
        </footer>
      </form>
    </div>
  );
}

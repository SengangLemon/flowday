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
  Trash2,
  X,
} from 'lucide-react';
import { FormEvent, useMemo, useState } from 'react';
import {
  PlannerTask,
  Priority,
  PROJECTS,
  Quadrant,
  REPEAT_RULES,
  RepeatRule,
  shiftDate,
  TaskColor,
  tasksForDate,
  timeToMinutes,
} from '../lib/planner';

type TaskSheetProps = {
  task: PlannerTask;
  tasks: PlannerTask[];
  today: string;
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

const QUADRANT_OPTIONS: { value: Quadrant; label: string }[] = [
  { value: 'do', label: '중요 · 긴급' },
  { value: 'schedule', label: '중요 · 여유' },
  { value: 'delegate', label: '긴급 · 위임' },
  { value: 'delete', label: '나중에 검토' },
];

const DURATION_OPTIONS = [15, 25, 30, 45, 60, 90, 120, 180, 240, 360, 480];
const HOUR_OPTIONS = Array.from({ length: 24 }, (_, hour) => String(hour).padStart(2, '0'));
const DEFAULT_MINUTE_OPTIONS = ['00', '15', '30', '45'];

function durationLabel(minutes: number) {
  const hours = Math.floor(minutes / 60);
  const rest = minutes % 60;
  if (!hours) return `${rest}분`;
  return `${hours}시간${rest ? ` ${rest}분` : ''}`;
}

function hourLabel(value: string) {
  const hour = Number(value);
  return `${hour < 12 ? '오전' : '오후'} ${hour % 12 || 12}시`;
}

function clockTimeLabel(totalMinutes: number) {
  const normalized = ((totalMinutes % (24 * 60)) + (24 * 60)) % (24 * 60);
  return `${String(Math.floor(normalized / 60)).padStart(2, '0')}:${String(normalized % 60).padStart(2, '0')}`;
}

export function TaskSheet({ task: initialTask, tasks, today, isNew, onClose, onSave, onDelete, onDuplicate }: TaskSheetProps) {
  const [task, setTask] = useState(initialTask);
  const [timed, setTimed] = useState(initialTask.start !== null);
  const [startHour, startMinute] = (task.start ?? '09:00').split(':');
  const durationOptions = useMemo(() => DURATION_OPTIONS.includes(task.duration)
    ? DURATION_OPTIONS
    : [...DURATION_OPTIONS, task.duration].sort((a, b) => a - b), [task.duration]);
  const minuteOptions = useMemo(() => DEFAULT_MINUTE_OPTIONS.includes(startMinute)
    ? DEFAULT_MINUTE_OPTIONS
    : [...DEFAULT_MINUTE_OPTIONS, startMinute].sort(), [startMinute]);
  const repeatOption = REPEAT_RULES.find((item) => item.value === task.repeat) ?? REPEAT_RULES[0];
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

  function updateStart(nextHour: string, nextMinute: string) {
    update('start', `${nextHour}:${nextMinute}`);
  }

  function handleProject(projectName: string) {
    const project = PROJECTS.find((item) => item.name === projectName);
    setTask((current) => ({
      ...current,
      project: projectName,
      color: project?.color ?? current.color,
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
            <span className="overline">{isNew ? 'NEW TASK' : 'TASK DETAILS'}</span>
            <h2 id="task-sheet-title">{isNew ? '새 할 일 만들기' : '할 일 수정하기'}</h2>
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
              placeholder="무엇을 할까요?"
              aria-label="할 일 제목"
            />
          </label>

          <section className="sheet-section">
            <h3>일정</h3>
            <div className="field-row">
              <CalendarDays size={18} />
              <label><span>날짜</span><input type="date" value={task.date} onChange={(event) => update('date', event.target.value)} /></label>
            </div>
            <div className="date-shortcuts" aria-label="빠른 날짜 선택">
              {[{ label: '오늘', date: today }, { label: '내일', date: shiftDate(today, 1) }, { label: '일주일 뒤', date: shiftDate(today, 7) }].map((item) => (
                <button className={task.date === item.date ? 'selected' : ''} type="button" key={item.label} onClick={() => update('date', item.date)}>{item.label}</button>
              ))}
            </div>
            <div className="field-row field-row-toggle">
              <Clock3 size={18} />
              <div><strong>시간 블록</strong><small>시간표에 배치하기</small></div>
              <button className={`switch ${timed ? 'on' : ''}`} type="button" role="switch" aria-checked={timed} onClick={() => setTimed((value) => !value)}><i /></button>
            </div>
            {timed ? (
              <>
                <div className="field-pair">
                  <div className="time-choice-field"><span>시작 시간</span><div><select aria-label="시작 시" value={startHour} onChange={(event) => updateStart(event.target.value, startMinute)}>{HOUR_OPTIONS.map((hour) => <option value={hour} key={hour}>{hourLabel(hour)}</option>)}</select><b>:</b><select aria-label="시작 분" value={startMinute} onChange={(event) => updateStart(startHour, event.target.value)}>{minuteOptions.map((minute) => <option value={minute} key={minute}>{minute}분</option>)}</select></div></div>
                  <label><span>길이 선택</span><select aria-label="작업 길이" value={task.duration} onChange={(event) => update('duration', Number(event.target.value))}>{durationOptions.map((minutes) => <option value={minutes} key={minutes}>{durationLabel(minutes)}</option>)}</select></label>
                </div>
                <p className="time-end-preview"><Clock3 size={13} />{task.start ?? '09:00'} 시작 · {endLabel} 종료 예정</p>
                {conflictingTasks.length ? <p className="schedule-warning" role="status"><Clock3 size={13} />같은 시간에 {conflictingTasks.slice(0, 2).map((item) => item.title).join(', ')} 일정이 있습니다.</p> : null}
              </>
            ) : null}
            <div className="field-row">
              <Repeat2 size={18} />
              <label><span>반복</span><select aria-label="반복" value={task.repeat} onChange={(event) => update('repeat', event.target.value as RepeatRule)}>{REPEAT_RULES.map((option) => <option value={option.value} key={option.value}>{option.label}</option>)}</select></label>
            </div>
            {task.repeat !== 'none' ? <p className="repeat-hint"><Repeat2 size={13} />{repeatOption.hint}</p> : null}
          </section>

          <section className="sheet-section">
            <h3>분류</h3>
            <div className="field-row">
              <Folder size={18} />
              <label><span>프로젝트</span><select value={task.project} onChange={(event) => handleProject(event.target.value)}>{PROJECTS.map((project) => <option key={project.name}>{project.name}</option>)}</select></label>
            </div>
            <div className="field-row priority-field">
              <Flag size={18} />
              <div><strong>우선순위</strong><div className="priority-options">{([1, 2, 3, 4] as Priority[]).map((priority) => <button className={task.priority === priority ? `p${priority} selected` : `p${priority}`} key={priority} type="button" onClick={() => update('priority', priority)}>P{priority}</button>)}</div></div>
            </div>
            <div className="field-row">
              <Goal size={18} />
              <label><span>아이젠하워</span><select value={task.quadrant} onChange={(event) => update('quadrant', event.target.value as Quadrant)}>{QUADRANT_OPTIONS.map((option) => <option value={option.value} key={option.value}>{option.label}</option>)}</select></label>
            </div>
          </section>

          <section className="sheet-section">
            <h3>세부 정보</h3>
            <label className="notes-field"><StickyNote size={18} /><textarea value={task.notes} onChange={(event) => update('notes', event.target.value)} placeholder="메모나 실행 기준을 적어보세요" rows={3} /></label>
            <label className="goal-field"><Goal size={18} /><input value={task.goal} onChange={(event) => update('goal', event.target.value)} placeholder="연결할 계획 이름" /></label>
            <div className="color-picker"><span>색상</span><div>{COLORS.map((color) => <button className={`${color.id} ${task.color === color.id ? 'selected' : ''}`} key={color.id} type="button" onClick={() => update('color', color.id)} aria-label={color.label}><Check size={13} /></button>)}</div></div>
          </section>

          {!isNew ? (
            <section className="sheet-secondary-actions">
              <button type="button" onClick={() => { onDuplicate(task.id); onClose(); }}><Copy size={17} />복제</button>
              <button className="danger" type="button" onClick={() => { onDelete(task.id); onClose(); }}><Trash2 size={17} />삭제</button>
            </section>
          ) : null}
        </div>

        <footer className="sheet-footer">
          <button className="sheet-save-button" type="submit">{isNew ? '할 일 추가' : '변경사항 저장'}</button>
        </footer>
      </form>
    </div>
  );
}

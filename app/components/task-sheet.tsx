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
import { FormEvent, useState } from 'react';
import {
  PlannerTask,
  Priority,
  PROJECTS,
  Quadrant,
  RepeatRule,
  TaskColor,
} from '../lib/planner';

type TaskSheetProps = {
  task: PlannerTask;
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

export function TaskSheet({ task: initialTask, isNew, onClose, onSave, onDelete, onDuplicate }: TaskSheetProps) {
  const [task, setTask] = useState(initialTask);
  const [timed, setTimed] = useState(initialTask.start !== null);

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
            <h2 id="task-sheet-title">{isNew ? '새 계획 만들기' : '계획 수정하기'}</h2>
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
            <div className="field-row field-row-toggle">
              <Clock3 size={18} />
              <div><strong>시간 블록</strong><small>시간표에 배치하기</small></div>
              <button className={`switch ${timed ? 'on' : ''}`} type="button" role="switch" aria-checked={timed} onClick={() => setTimed((value) => !value)}><i /></button>
            </div>
            {timed ? (
              <div className="field-pair">
                <label><span>시작</span><input type="time" value={task.start ?? '09:00'} step="900" onChange={(event) => update('start', event.target.value)} /></label>
                <label><span>길이</span><select value={task.duration} onChange={(event) => update('duration', Number(event.target.value))}>
                  <option value="15">15분</option><option value="25">25분</option><option value="30">30분</option><option value="45">45분</option><option value="60">1시간</option><option value="90">1시간 30분</option><option value="120">2시간</option><option value="180">3시간</option>
                </select></label>
              </div>
            ) : null}
            <div className="field-row">
              <Repeat2 size={18} />
              <label><span>Repeat</span><select aria-label="반복" value={task.repeat} onChange={(event) => update('repeat', event.target.value as RepeatRule)}><option value="none">반복 안 함</option><option value="daily">매일</option></select></label>
            </div>
            {task.repeat === 'daily' ? <p className="repeat-hint"><Repeat2 size={13} />시작일 이후 매일 타임라인에 표시되며 완료 기록은 날짜별로 저장됩니다.</p> : null}
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
            <label className="goal-field"><Goal size={18} /><input value={task.goal} onChange={(event) => update('goal', event.target.value)} placeholder="연결할 상위 목표" /></label>
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
          <button className="sheet-save-button" type="submit">{isNew ? '계획 추가' : '변경사항 저장'}</button>
        </footer>
      </form>
    </div>
  );
}

'use client';

import { AlignLeft, Check, GitBranch, Repeat2, Target, Trash2, X } from 'lucide-react';
import { FormEvent, useMemo, useState } from 'react';
import { GOAL_PERIODS, GoalPeriod, PlanGoal, TaskColor } from '../lib/planner';

type GoalSheetProps = {
  goal: PlanGoal;
  goals: PlanGoal[];
  isNew: boolean;
  onClose: () => void;
  onSave: (goal: PlanGoal) => void;
  onDelete: (goalId: string) => void;
};

const COLORS: { id: TaskColor; label: string }[] = [
  { id: 'sage', label: '세이지' },
  { id: 'violet', label: '바이올렛' },
  { id: 'amber', label: '앰버' },
  { id: 'blue', label: '블루' },
  { id: 'rose', label: '로즈' },
];

export function GoalSheet({ goal: initialGoal, goals, isNew, onClose, onSave, onDelete }: GoalSheetProps) {
  const [goal, setGoal] = useState(initialGoal);
  const parentOptions = useMemo(() => {
    const descendants = new Set<string>();
    let changed = true;
    while (changed) {
      changed = false;
      for (const item of goals) {
        if (item.parentId && (item.parentId === goal.id || descendants.has(item.parentId)) && !descendants.has(item.id)) {
          descendants.add(item.id);
          changed = true;
        }
      }
    }
    return goals.filter((item) => item.id !== goal.id && !descendants.has(item.id));
  }, [goal.id, goals]);

  function update<K extends keyof PlanGoal>(key: K, value: PlanGoal[K]) {
    setGoal((current) => ({ ...current, [key]: value }));
  }

  function handleSubmit(event: FormEvent) {
    event.preventDefault();
    const title = goal.title.trim();
    if (!title) return;
    onSave({ ...goal, title, detail: goal.detail.trim() });
  }

  return (
    <div className="sheet-backdrop" onMouseDown={(event) => {
      if (event.target === event.currentTarget) onClose();
    }}>
      <form className="task-sheet goal-sheet" role="dialog" aria-modal="true" aria-labelledby="goal-sheet-title" onSubmit={handleSubmit}>
        <div className="sheet-handle" aria-hidden="true" />
        <header className="sheet-header">
          <button className="icon-button ghost" type="button" onClick={onClose} aria-label="닫기"><X size={20} /></button>
          <div><span className="overline">{isNew ? 'NEW PLAN' : 'PLAN DETAILS'}</span><h2 id="goal-sheet-title">{isNew ? '하위 계획 만들기' : '계획 수정하기'}</h2></div>
          <button className="save-icon-button" type="submit" aria-label="저장"><Check size={19} /></button>
        </header>

        <div className="sheet-scroll">
          <label className="title-field">
            <span className={`color-dot ${goal.color}`} />
            <input autoFocus value={goal.title} onChange={(event) => update('title', event.target.value)} placeholder="이 계획으로 무엇을 이루나요?" aria-label="계획 제목" />
          </label>

          <section className="sheet-section">
            <h3>계획 구조</h3>
            <div className="field-row"><Target size={18} /><label><span>기간</span><select value={goal.period} onChange={(event) => update('period', event.target.value as GoalPeriod)}>{GOAL_PERIODS.map((period) => <option key={period}>{period}</option>)}</select></label></div>
            <div className="field-row"><GitBranch size={18} /><label><span>상위 계획</span><select value={goal.parentId ?? ''} onChange={(event) => update('parentId', event.target.value || null)}><option value="">최상위 계획</option>{parentOptions.map((item) => <option value={item.id} key={item.id}>{item.title}</option>)}</select></label></div>
            <div className="field-row field-row-toggle"><Repeat2 size={18} /><div><strong>매일 체크</strong><small>잔디 기록에 매일 쌓기</small></div><button className={`switch ${goal.daily ? 'on' : ''}`} type="button" role="switch" aria-checked={goal.daily} onClick={() => update('daily', !goal.daily)}><i /></button></div>
          </section>

          <section className="sheet-section">
            <h3>설명과 색상</h3>
            <label className="notes-field"><AlignLeft size={18} /><textarea value={goal.detail} onChange={(event) => update('detail', event.target.value)} placeholder="완료 기준이나 다음 행동을 적어보세요" rows={4} /></label>
            <div className="color-picker"><span>색상</span><div>{COLORS.map((color) => <button className={`${color.id} ${goal.color === color.id ? 'selected' : ''}`} key={color.id} type="button" onClick={() => update('color', color.id)} aria-label={color.label}><Check size={13} /></button>)}</div></div>
          </section>

          {!isNew ? <section className="sheet-secondary-actions one-action"><button className="danger" type="button" onClick={() => { onDelete(goal.id); onClose(); }}><Trash2 size={17} />이 계획과 하위 계획 삭제</button></section> : null}
        </div>

        <footer className="sheet-footer"><button className="sheet-save-button" type="submit">{isNew ? '하위 계획 추가' : '변경사항 저장'}</button></footer>
      </form>
    </div>
  );
}

'use client';

import { Check, Clock3, Trash2, X } from 'lucide-react';
import { FormEvent, useState } from 'react';
import { ScheduleBlock, scheduleBlockDuration, TaskColor, timeToMinutes } from '../lib/planner';
import { TimeChoice } from './time-choice';

type TimeBlockSheetProps = {
  block: ScheduleBlock;
  isNew: boolean;
  onClose: () => void;
  onSave: (block: ScheduleBlock) => void;
  onDelete: (blockId: string) => void;
};

const COLORS: { id: TaskColor; label: string }[] = [
  { id: 'sage', label: '세이지' },
  { id: 'violet', label: '바이올렛' },
  { id: 'amber', label: '앰버' },
  { id: 'blue', label: '블루' },
  { id: 'rose', label: '로즈' },
];

function durationLabel(minutes: number) {
  const hours = Math.floor(minutes / 60);
  const rest = minutes % 60;
  if (!hours) return `${rest}분`;
  return `${hours}시간${rest ? ` ${rest}분` : ''}`;
}

export function TimeBlockSheet({ block: initialBlock, isNew, onClose, onSave, onDelete }: TimeBlockSheetProps) {
  const [block, setBlock] = useState(initialBlock);
  const [error, setError] = useState('');
  const [activeTime, setActiveTime] = useState<'start' | 'end'>('start');

  function update<K extends keyof ScheduleBlock>(key: K, value: ScheduleBlock[K]) {
    setBlock((current) => ({ ...current, [key]: value }));
    setError('');
  }

  function handleSubmit(event: FormEvent) {
    event.preventDefault();
    const name = block.name.trim();
    if (!name) {
      setError('이 시간 블록의 이름을 입력해주세요.');
      return;
    }
    if (timeToMinutes(block.end) <= timeToMinutes(block.start)) {
      setError('종료 시간은 시작 시간보다 늦어야 합니다.');
      return;
    }
    onSave({ ...block, name });
  }

  return (
    <div className="sheet-backdrop" onMouseDown={(event) => {
      if (event.target === event.currentTarget) onClose();
    }}>
      <form className="task-sheet time-block-sheet" role="dialog" aria-modal="true" aria-labelledby="time-block-sheet-title" onSubmit={handleSubmit}>
        <div className="sheet-handle" aria-hidden="true" />
        <header className="sheet-header">
          <button className="icon-button ghost" type="button" onClick={onClose} aria-label="닫기"><X size={20} /></button>
          <div><span className="overline">TIME BLOCK</span><h2 id="time-block-sheet-title">{isNew ? '나의 시간 블록 만들기' : '시간 블록 수정하기'}</h2></div>
          <button className="save-icon-button" type="submit" aria-label="저장"><Check size={19} /></button>
        </header>

        <div className="sheet-scroll">
          <label className="title-field">
            <span className={`color-dot ${block.color}`} />
            <input autoFocus value={block.name} onChange={(event) => update('name', event.target.value)} placeholder="예: 새벽 몰입, 오전 업무" aria-label="시간 블록 이름" />
          </label>

          <section className="sheet-section">
            <h3>시간 범위</h3>
            <div className="time-range-tabs" role="tablist" aria-label="시간 범위 선택">
              <button type="button" role="tab" aria-selected={activeTime === 'start'} onClick={() => setActiveTime('start')}><span>시작</span><strong>{block.start}</strong></button>
              <i aria-hidden="true" />
              <button type="button" role="tab" aria-selected={activeTime === 'end'} onClick={() => setActiveTime('end')}><span>종료</span><strong>{block.end}</strong></button>
            </div>
            <TimeChoice value={block[activeTime]} onChange={(value) => update(activeTime, value)} label={activeTime === 'start' ? '시작 시간' : '종료 시간'} />
            <p className="time-block-duration"><Clock3 size={14} />{timeToMinutes(block.end) > timeToMinutes(block.start) ? durationLabel(scheduleBlockDuration(block)) : '시간 범위를 확인해주세요'}</p>
          </section>

          <section className="sheet-section">
            <h3>블록 색상</h3>
            <div className="color-picker block-color-picker"><span>캘린더에서도 같은 색으로 표시됩니다.</span><div>{COLORS.map((color) => <button className={`${color.id} ${block.color === color.id ? 'selected' : ''}`} key={color.id} type="button" onClick={() => update('color', color.id)} aria-label={color.label}><Check size={13} /></button>)}</div></div>
          </section>

          {error ? <p className="form-error" role="alert">{error}</p> : null}
          {!isNew ? <section className="sheet-secondary-actions one-action"><button className="danger" type="button" onClick={() => { onDelete(block.id); onClose(); }}><Trash2 size={17} />이 시간 블록 삭제</button></section> : null}
        </div>

        <footer className="sheet-footer"><button className="sheet-save-button" type="submit">{isNew ? '시간 블록 만들기' : '변경사항 저장'}</button></footer>
      </form>
    </div>
  );
}

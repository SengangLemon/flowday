'use client';

import {
  ArrowDown,
  ArrowRight,
  CalendarDays,
  Check,
  Clock3,
  Focus,
  Inbox,
  Repeat2,
  Target,
  X,
  type LucideIcon,
} from 'lucide-react';
import { useRef } from 'react';
import type { KeyboardEvent as ReactKeyboardEvent } from 'react';
import type { PlannerView } from '../lib/planner';

type MenuIntroContent = {
  menu: string;
  title: string;
  caption: string;
  visualLabel: string;
  icon: LucideIcon;
};

const MENU_INTROS: Record<PlannerView, MenuIntroContent> = {
  habit: {
    menu: '습관',
    title: '시간 블록으로 하루를 배치해요',
    caption: '블록을 눌러 습관과 할 일을 채워보세요.',
    visualLabel: '새벽부터 저녁까지 시간대별로 배치된 세 개의 습관 블록',
    icon: Repeat2,
  },
  inbox: {
    menu: '인박스',
    title: '모으고, 우선순위를 나눠요',
    caption: '할 일을 매트릭스로 옮겨 결정합니다.',
    visualLabel: '인박스에 모인 할 일이 네 구역의 아이젠하워 매트릭스로 이동하는 모습',
    icon: Inbox,
  },
  plan: {
    menu: '계획',
    title: '큰 목표를 오늘까지 연결해요',
    caption: '목표를 쪼개고 매일 실행을 기록합니다.',
    visualLabel: '3년 목표가 1년, 3개월, 오늘 계획으로 나뉘고 잔디 기록으로 이어지는 모습',
    icon: Target,
  },
  calendar: {
    menu: '캘린더',
    title: '계획을 색으로 한눈에 봐요',
    caption: '주간·월간·연간 흐름을 살펴봅니다.',
    visualLabel: '여러 날짜에 색상 일정 블록이 배치된 월간 달력',
    icon: CalendarDays,
  },
  focus: {
    menu: '집중',
    title: '지금 할 한 가지에 집중해요',
    caption: '25분 집중과 완료를 바로 연결합니다.',
    visualLabel: '25분 뽀모도로 타이머와 선택된 하나의 할 일',
    icon: Focus,
  },
};

const LAWN_CELLS = [0, 1, 0, 2, 0, 1, 2, 0, 1, 0, 2, 2, 1, 0, 1, 2, 0, 1, 2, 2, 1, 0, 2, 1, 0, 2, 1, 2];
const CALENDAR_CELLS = Array.from({ length: 35 }, (_, index) => index);

function MenuIntroVisual({ view, label }: { view: PlannerView; label: string }) {
  if (view === 'habit') {
    return (
      <div className="menu-intro-visual habit-visual" role="img" aria-label={label}>
        <div className="intro-habit-board">
          <span>05</span><div className="intro-time-block sage"><Repeat2 size={13} /><i /><small>3h</small></div>
          <span>09</span><div className="intro-time-block violet"><Focus size={13} /><i /><small>3h</small></div>
          <span>13</span><div className="intro-time-block amber"><Check size={13} /><i /><small>3h</small></div>
        </div>
      </div>
    );
  }

  if (view === 'inbox') {
    return (
      <div className="menu-intro-visual inbox-visual" role="img" aria-label={label}>
        <div className="intro-note-stack"><i /><i /><i /><span><Inbox size={18} /><b>3</b></span></div>
        <ArrowRight className="intro-flow-arrow" size={23} />
        <div className="intro-mini-matrix"><i className="rose" /><i className="sage" /><i className="blue" /><i className="violet" /><span><Check size={15} /></span></div>
      </div>
    );
  }

  if (view === 'plan') {
    return (
      <div className="menu-intro-visual plan-visual" role="img" aria-label={label}>
        <div className="intro-goal-chain">
          <span className="root">3Y</span><i /><span>1Y</span><i /><span>3M</span><i /><span className="today">TODAY</span>
        </div>
        <ArrowDown className="intro-plan-down" size={18} />
        <div className="intro-lawn">{LAWN_CELLS.map((level, index) => <i className={`level-${level}`} key={`${level}-${index}`} />)}</div>
      </div>
    );
  }

  if (view === 'calendar') {
    return (
      <div className="menu-intro-visual calendar-visual" role="img" aria-label={label}>
        <div className="intro-calendar-card">
          <header><span /><strong>AUG</strong><CalendarDays size={15} /></header>
          <div className="intro-calendar-grid">{CALENDAR_CELLS.map((cell) => <i key={cell} />)}</div>
          <b className="calendar-event event-one" /><b className="calendar-event event-two" /><b className="calendar-event event-three" />
        </div>
      </div>
    );
  }

  return (
    <div className="menu-intro-visual focus-visual" role="img" aria-label={label}>
      <div className="intro-focus-ring"><div><Clock3 size={15} /><strong>25:00</strong></div></div>
      <div className="intro-focus-task"><span><Check size={15} /></span><i /><b>1</b></div>
    </div>
  );
}

type MenuIntroProps = {
  view: PlannerView;
  onComplete: () => void;
};

export function MenuIntro({ view, onComplete }: MenuIntroProps) {
  const dialogRef = useRef<HTMLElement>(null);
  const intro = MENU_INTROS[view];
  const Icon = intro.icon;

  function handleKeyDown(event: ReactKeyboardEvent<HTMLElement>) {
    if (event.key === 'Escape') {
      event.preventDefault();
      onComplete();
      return;
    }
    if (event.key !== 'Tab') return;
    const focusable = Array.from(dialogRef.current?.querySelectorAll<HTMLElement>('button') ?? []);
    if (!focusable.length) return;
    const first = focusable[0];
    const last = focusable[focusable.length - 1];
    if (event.shiftKey && document.activeElement === first) {
      event.preventDefault();
      last.focus();
    } else if (!event.shiftKey && document.activeElement === last) {
      event.preventDefault();
      first.focus();
    }
  }

  return (
    <div className="onboarding-backdrop">
      <section
        ref={dialogRef}
        className="onboarding-card visual-intro-card"
        role="dialog"
        aria-modal="true"
        aria-labelledby="menu-intro-title"
        aria-describedby="menu-intro-caption"
        tabIndex={-1}
        autoFocus
        onKeyDown={handleKeyDown}
      >
        <header className="onboarding-header">
          <div className="onboarding-step-icon"><Icon size={23} /></div>
          <div className="onboarding-progress-copy"><span>{intro.menu}</span><strong>처음 보는 화면</strong></div>
          <button type="button" onClick={onComplete} aria-label="안내 닫기"><X size={17} /></button>
        </header>

        <div className="visual-intro-copy">
          <h2 id="menu-intro-title">{intro.title}</h2>
        </div>

        <MenuIntroVisual view={view} label={intro.visualLabel} />
        <p className="visual-intro-caption" id="menu-intro-caption">{intro.caption}</p>

        <footer className="onboarding-actions single">
          <button className="onboarding-next" type="button" onClick={onComplete}>바로 사용하기</button>
        </footer>
      </section>
    </div>
  );
}

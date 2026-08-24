'use client';

import {
  CalendarDays,
  Check,
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
  eyebrow: string;
  title: string;
  description: string;
  points: [string, string];
  icon: LucideIcon;
};

const MENU_INTROS: Record<PlannerView, MenuIntroContent> = {
  habit: {
    menu: '습관',
    eyebrow: '오늘의 실행 화면',
    title: '시간 블록으로 오늘을 설계하세요',
    description: '자주 쓰는 시간대를 블록으로 만들고, 인박스의 할 일을 원하는 시간에 배치하는 화면입니다.',
    points: ['반복 습관은 날짜별로 따로 체크', '내 생활에 맞는 시간 블록을 자유롭게 구성'],
    icon: Repeat2,
  },
  inbox: {
    menu: '인박스',
    eyebrow: '생각을 놓치지 않는 곳',
    title: '할 일을 먼저 모으고 나중에 정리하세요',
    description: '해야 할 일을 빠르게 적어두고 프로젝트와 우선순위를 정한 뒤 일정으로 보낼 수 있습니다.',
    points: ['아이젠하워 매트릭스로 중요도 판단', '시간이 정해지지 않은 할 일을 한곳에서 관리'],
    icon: Inbox,
  },
  plan: {
    menu: '계획',
    eyebrow: '방향을 실행으로 바꾸는 곳',
    title: '큰 목표를 오늘 할 일까지 나누세요',
    description: '3년 이상의 장기계획 아래에 기간이 다른 하위계획을 원하는 만큼 연결할 수 있습니다.',
    points: ['장기 → 중기 → 단기 → 매일 계획으로 세분화', '매일 실행한 기록은 잔디 형태로 확인'],
    icon: Target,
  },
  calendar: {
    menu: '캘린더',
    eyebrow: '계획의 전체 흐름',
    title: '주간·월간·연간 일정을 한눈에 보세요',
    description: '색상 블록으로 계획이 몰린 시기와 빈 시간을 확인하고 날짜를 옮겨 다시 배치할 수 있습니다.',
    points: ['주간·월간·연간 보기 전환', '색상으로 프로젝트와 일정 흐름 파악'],
    icon: CalendarDays,
  },
  focus: {
    menu: '집중',
    eyebrow: '계획을 끝내는 마지막 단계',
    title: '한 번에 하나의 일에 집중하세요',
    description: '지금 실행할 할 일을 고르고 뽀모도로 타이머를 시작해 실제 행동으로 연결합니다.',
    points: ['집중할 할 일을 선택하고 바로 시작', '완료 기록을 오늘의 계획에 반영'],
    icon: Focus,
  },
};

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
        className="onboarding-card"
        role="dialog"
        aria-modal="true"
        aria-labelledby="menu-intro-title"
        aria-describedby="menu-intro-description"
        tabIndex={-1}
        autoFocus
        onKeyDown={handleKeyDown}
      >
        <header className="onboarding-header">
          <div className="onboarding-step-icon"><Icon size={23} /></div>
          <div className="onboarding-progress-copy"><span>{intro.menu}</span><strong>이 메뉴를 처음 열었어요</strong></div>
          <button type="button" onClick={onComplete} aria-label="안내 닫기"><X size={17} /></button>
        </header>

        <div className="onboarding-copy">
          <span className="overline">{intro.eyebrow}</span>
          <h2 id="menu-intro-title">{intro.title}</h2>
          <p id="menu-intro-description">{intro.description}</p>
        </div>

        <ul className="onboarding-points">
          {intro.points.map((point) => <li key={point}><span><Check size={13} /></span>{point}</li>)}
        </ul>

        <footer className="onboarding-actions single">
          <button className="onboarding-next" type="button" onClick={onComplete}>확인했어요</button>
        </footer>
      </section>
    </div>
  );
}

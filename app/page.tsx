'use client';

import { DragEvent, FormEvent, useEffect, useMemo, useRef, useState } from 'react';

type View = 'today' | 'plan' | 'calendar' | 'matrix' | 'focus' | 'review' | 'settings';
type Theme = 'light' | 'dim' | 'dark';
type Quadrant = 'do' | 'schedule' | 'delegate' | 'delete';

type Block = {
  id: number;
  title: string;
  start: string;
  duration: number;
  category: string;
  tone: 'mint' | 'purple' | 'orange' | 'blue';
  date: string;
  completed: boolean;
  goal: string;
};

type MatrixTask = { id: number; title: string; quadrant: Quadrant; category: string; done: boolean };

const TODAY = '2026-08-23';
const NAV: { id: View; label: string; icon: string }[] = [
  { id: 'today', label: '오늘', icon: '◫' },
  { id: 'plan', label: '계획', icon: '↗' },
  { id: 'calendar', label: '캘린더', icon: '□' },
  { id: 'matrix', label: '매트릭스', icon: '⊞' },
  { id: 'focus', label: '집중', icon: '◎' },
  { id: 'review', label: '리뷰', icon: '⌁' },
];

const INITIAL_BLOCKS: Block[] = [
  { id: 1, title: '주간 계획 정리', start: '09:00', duration: 45, category: '기획', tone: 'mint', date: TODAY, completed: true, goal: '핵심 화면 완성' },
  { id: 2, title: 'MVP 화면 설계', start: '11:00', duration: 90, category: '프로젝트', tone: 'purple', date: TODAY, completed: false, goal: '생활 관리 앱 MVP' },
  { id: 3, title: '운동과 산책', start: '14:30', duration: 60, category: '건강', tone: 'orange', date: TODAY, completed: false, goal: '지속 가능한 생활 리듬' },
  { id: 4, title: '사용자 흐름 점검', start: '16:00', duration: 60, category: '프로젝트', tone: 'blue', date: TODAY, completed: false, goal: '생활 관리 앱 MVP' },
  { id: 5, title: '독서 30분', start: '20:00', duration: 30, category: '성장', tone: 'mint', date: '2026-08-24', completed: false, goal: '전문성 강화' },
  { id: 6, title: '인터랙션 구현', start: '10:00', duration: 120, category: '프로젝트', tone: 'purple', date: '2026-08-25', completed: false, goal: '생활 관리 앱 MVP' },
];

const INITIAL_MATRIX: MatrixTask[] = [
  { id: 1, title: 'MVP 핵심 화면 마무리', quadrant: 'do', category: '프로젝트', done: false },
  { id: 2, title: '이번 주 일정 재조정', quadrant: 'do', category: '기획', done: false },
  { id: 3, title: '운동 루틴 설계', quadrant: 'schedule', category: '건강', done: false },
  { id: 4, title: '3개월 목표 리뷰', quadrant: 'schedule', category: '성장', done: false },
  { id: 5, title: '반복 이메일 정리', quadrant: 'delegate', category: '생활', done: false },
  { id: 6, title: '불필요한 알림 끄기', quadrant: 'delete', category: '생활', done: false },
];

const GOALS = [
  { period: '3년+', title: '나만의 디지털 제품으로 독립하기', detail: '수익이 발생하는 제품 3개 출시', progress: 42, tone: 'forest' },
  { period: '12개월', title: '첫 번째 제품 정식 출시', detail: '사용자 1,000명과 유료 고객 확보', progress: 48, tone: 'sage' },
  { period: '3개월', title: '생활 관리 앱 MVP 완성', detail: '핵심 경험 검증과 베타 테스트', progress: 65, tone: 'purple' },
  { period: '4주', title: '계획과 실행 화면 구현', detail: '오늘 · 계획 · 캘린더 · 집중', progress: 74, tone: 'orange' },
  { period: '이번 주', title: '핵심 화면 완성', detail: '인터랙션과 반응형 레이아웃', progress: 68, tone: 'blue' },
];

const DAYS = [
  { date: '2026-08-23', day: '일', number: 23 }, { date: '2026-08-24', day: '월', number: 24 },
  { date: '2026-08-25', day: '화', number: 25 }, { date: '2026-08-26', day: '수', number: 26 },
  { date: '2026-08-27', day: '목', number: 27 }, { date: '2026-08-28', day: '금', number: 28 },
  { date: '2026-08-29', day: '토', number: 29 },
];

const QUADRANTS: { id: Quadrant; number: string; title: string; caption: string }[] = [
  { id: 'do', number: '01', title: '중요하고 긴급함', caption: '지금 실행하기' },
  { id: 'schedule', number: '02', title: '중요하지만 긴급하지 않음', caption: '시간을 확보하기' },
  { id: 'delegate', number: '03', title: '긴급하지만 덜 중요함', caption: '위임하거나 최소화하기' },
  { id: 'delete', number: '04', title: '긴급하지도 중요하지도 않음', caption: '삭제하거나 보류하기' },
];

function timeToMinutes(time: string) {
  const [hour, minute] = time.split(':').map(Number);
  return hour * 60 + minute;
}

function minutesToTime(value: number) {
  const hour = Math.max(0, Math.min(23, Math.floor(value / 60)));
  const minute = Math.max(0, Math.min(59, value % 60));
  return `${String(hour).padStart(2, '0')}:${String(minute).padStart(2, '0')}`;
}

function formatTimer(seconds: number) {
  return `${String(Math.floor(seconds / 60)).padStart(2, '0')}:${String(seconds % 60).padStart(2, '0')}`;
}

export default function Home() {
  const [active, setActive] = useState<View>('today');
  const [theme, setTheme] = useState<Theme>('light');
  const [blocks, setBlocks] = useState<Block[]>(INITIAL_BLOCKS);
  const [matrixTasks, setMatrixTasks] = useState<MatrixTask[]>(INITIAL_MATRIX);
  const [dragBlock, setDragBlock] = useState<number | null>(null);
  const [dragTask, setDragTask] = useState<number | null>(null);
  const [blockModal, setBlockModal] = useState(false);
  const [newBlock, setNewBlock] = useState({ title: '', start: '10:00', duration: '60', category: '프로젝트', tone: 'purple' as Block['tone'] });
  const [matrixInput, setMatrixInput] = useState('');
  const [timer, setTimer] = useState(25 * 60);
  const [timerRunning, setTimerRunning] = useState(false);
  const [timerMode, setTimerMode] = useState<'focus' | 'break'>('focus');
  const [selectedFocus, setSelectedFocus] = useState(2);
  const [hydrated, setHydrated] = useState(false);
  const timerRef = useRef<ReturnType<typeof setInterval> | null>(null);

  useEffect(() => {
    try {
      const savedTheme = localStorage.getItem('flowday-theme') as Theme | null;
      const savedBlocks = localStorage.getItem('flowday-blocks');
      const savedMatrix = localStorage.getItem('flowday-matrix');
      if (savedTheme) setTheme(savedTheme);
      if (savedBlocks) setBlocks(JSON.parse(savedBlocks));
      if (savedMatrix) setMatrixTasks(JSON.parse(savedMatrix));
    } catch { /* device storage can be unavailable */ }
    setHydrated(true);
  }, []);

  useEffect(() => {
    if (!hydrated) return;
    localStorage.setItem('flowday-theme', theme);
    localStorage.setItem('flowday-blocks', JSON.stringify(blocks));
    localStorage.setItem('flowday-matrix', JSON.stringify(matrixTasks));
  }, [theme, blocks, matrixTasks, hydrated]);

  useEffect(() => {
    if (!timerRunning) return;
    timerRef.current = setInterval(() => {
      setTimer((value) => {
        if (value <= 1) {
          setTimerRunning(false);
          const nextMode = timerMode === 'focus' ? 'break' : 'focus';
          setTimerMode(nextMode);
          return nextMode === 'focus' ? 25 * 60 : 5 * 60;
        }
        return value - 1;
      });
    }, 1000);
    return () => { if (timerRef.current) clearInterval(timerRef.current); };
  }, [timerRunning, timerMode]);

  const todayBlocks = useMemo(() => blocks.filter((block) => block.date === TODAY), [blocks]);
  const completed = todayBlocks.filter((block) => block.completed).length;
  const completion = todayBlocks.length ? Math.round((completed / todayBlocks.length) * 100) : 0;
  const focusBlock = blocks.find((block) => block.id === selectedFocus) ?? todayBlocks[0];

  function addBlock(event: FormEvent) {
    event.preventDefault();
    if (!newBlock.title.trim()) return;
    setBlocks((current) => [...current, {
      id: Date.now(), title: newBlock.title.trim(), start: newBlock.start,
      duration: Number(newBlock.duration), category: newBlock.category, tone: newBlock.tone,
      date: TODAY, completed: false, goal: '핵심 화면 완성',
    }]);
    setNewBlock((value) => ({ ...value, title: '' }));
    setBlockModal(false);
  }

  function moveBlockToHour(id: number, hour: number) {
    setBlocks((current) => current.map((block) => block.id === id ? { ...block, start: minutesToTime(hour * 60) } : block));
    setDragBlock(null);
  }

  function moveBlockToDate(id: number, date: string) {
    setBlocks((current) => current.map((block) => block.id === id ? { ...block, date } : block));
    setDragBlock(null);
  }

  function resetTimer(mode: 'focus' | 'break' = timerMode) {
    setTimerRunning(false);
    setTimerMode(mode);
    setTimer(mode === 'focus' ? 25 * 60 : 5 * 60);
  }

  function renderToday() {
    const hours = Array.from({ length: 13 }, (_, index) => index + 8);
    return (
      <>
        <div className="summary-row">
          <div className="summary-card primary-summary">
            <div><span className="eyebrow">오늘의 진행</span><strong>{completed} / {todayBlocks.length}</strong><small>개의 블록을 완료했어요</small></div>
            <div className="ring" style={{ '--progress': `${completion * 3.6}deg` } as React.CSSProperties}><span>{completion}%</span></div>
          </div>
          <div className="summary-card"><span className="stat-icon mint">◎</span><div><span className="eyebrow">집중 시간</span><strong>2h 25m</strong><small>이번 주 총 8시간 10분</small></div></div>
          <div className="summary-card"><span className="stat-icon amber">↗</span><div><span className="eyebrow">주간 목표</span><strong>68%</strong><small>안정적으로 진행 중</small></div></div>
        </div>

        <div className="content-grid">
          <section className="schedule-panel panel">
            <div className="panel-heading">
              <div><span className="eyebrow">TIME BLOCKS</span><h2>오늘의 시간표</h2></div>
              <button className="add-button" onClick={() => setBlockModal(true)}>＋ 새 블록</button>
            </div>
            <div className="timeline interactive-timeline">
              {hours.map((hour) => (
                <div className="time-row" key={hour} onDragOver={(event) => event.preventDefault()} onDrop={() => dragBlock && moveBlockToHour(dragBlock, hour)}>
                  <span>{String(hour).padStart(2, '0')}:00</span><i />
                </div>
              ))}
              {todayBlocks.map((block) => {
                const top = ((timeToMinutes(block.start) - 8 * 60) / 60) * 64 + 8;
                const height = Math.max(42, (block.duration / 60) * 64 - 5);
                return (
                  <article className={`time-block ${block.tone} ${block.completed ? 'completed' : ''}`} draggable key={block.id}
                    onDragStart={() => setDragBlock(block.id)} onDragEnd={() => setDragBlock(null)}
                    style={{ top, height }}>
                    <button className="block-check" aria-label="완료 상태 변경" onClick={() => setBlocks((current) => current.map((item) => item.id === block.id ? { ...item, completed: !item.completed } : item))}>{block.completed ? '✓' : ''}</button>
                    <div><strong>{block.title}</strong><small>{block.category} · {block.duration}분</small></div>
                    <span className="block-time">{block.start}</span>
                    <button className="block-remove" aria-label={`${block.title} 삭제`} onClick={() => setBlocks((current) => current.filter((item) => item.id !== block.id))}>×</button>
                  </article>
                );
              })}
              <div className="now-line"><span>지금</span></div>
            </div>
            <div className={`trash-zone ${dragBlock ? 'visible' : ''}`} onDragOver={(event) => event.preventDefault()} onDrop={() => { if (dragBlock) setBlocks((current) => current.filter((block) => block.id !== dragBlock)); setDragBlock(null); }}>여기에 놓아 삭제</div>
          </section>

          <aside className="right-column">
            <section className="panel focus-card">
              <div className="panel-heading"><div><span className="eyebrow">FOCUS</span><h2>다음 집중</h2></div><span className="soft-badge">{focusBlock?.start ?? '비어 있음'}</span></div>
              <div className="focus-body"><span className={`focus-dot ${focusBlock?.tone ?? 'mint'}`} /><div><strong>{focusBlock?.title ?? '집중할 블록을 추가하세요'}</strong><small>25분 집중 · {focusBlock?.category ?? '미분류'}</small></div></div>
              <button className="focus-button" onClick={() => { setActive('focus'); resetTimer('focus'); }}>집중 시작 <span>→</span></button>
            </section>
            <section className="panel goals-card">
              <div className="panel-heading"><div><span className="eyebrow">GOAL PATH</span><h2>목표의 흐름</h2></div><button className="more" onClick={() => setActive('plan')}>전체 보기</button></div>
              {GOALS.slice(0, 3).map((goal) => (
                <button className="goal-row" key={goal.period} onClick={() => setActive('plan')}><span>{goal.period}</span><div><strong>{goal.title}</strong><div className="progress"><i style={{ width: `${goal.progress}%` }} /></div></div><b>{goal.progress}%</b></button>
              ))}
            </section>
          </aside>
        </div>
      </>
    );
  }

  function renderPlan() {
    return (
      <section className="plan-view">
        <div className="section-toolbar"><div><span className="eyebrow">PLAN CASCADE</span><h2>3년의 방향을 오늘의 실행으로</h2><p>각 단계는 바로 아래 계획과 연결됩니다. 큰 목표를 작고 선명한 실행 단위로 나눠보세요.</p></div><button className="add-button" onClick={() => setBlockModal(true)}>＋ 실행 블록 추가</button></div>
        <div className="horizon-tabs">{['3년+', '12개월', '3개월', '4주', '1주', '오늘'].map((item, index) => <button className={index === 2 ? 'active' : ''} key={item}>{item}</button>)}</div>
        <div className="goal-cascade">
          {GOALS.map((goal, index) => (
            <div className="cascade-wrap" key={goal.period}>
              <article className={`cascade-card ${goal.tone}`}>
                <div className="cascade-top"><span>{goal.period}</span><button>•••</button></div>
                <h3>{goal.title}</h3><p>{goal.detail}</p>
                <div className="cascade-progress"><div><i style={{ width: `${goal.progress}%` }} /></div><b>{goal.progress}%</b></div>
                <div className="cascade-footer"><span>{index + 2}개 하위 계획</span><button onClick={() => setBlockModal(true)}>＋ 분할하기</button></div>
              </article>
              {index < GOALS.length - 1 && <span className="cascade-arrow">↓</span>}
            </div>
          ))}
        </div>
      </section>
    );
  }

  function renderCalendar() {
    return (
      <section className="calendar-view panel">
        <div className="calendar-toolbar"><div><span className="eyebrow">WEEKLY CALENDAR</span><h2>2026년 8월 23일 – 29일</h2></div><div className="calendar-actions"><button>‹</button><button className="today-chip">오늘</button><button>›</button><button className="add-button" onClick={() => setBlockModal(true)}>＋ 일정</button></div></div>
        <div className="calendar-days">
          {DAYS.map((day) => (
            <div className={`calendar-day ${day.date === TODAY ? 'current' : ''}`} key={day.date} onDragOver={(event) => event.preventDefault()} onDrop={() => dragBlock && moveBlockToDate(dragBlock, day.date)}>
              <div className="day-head"><span>{day.day}</span><b>{day.number}</b></div>
              <div className="day-body">
                {blocks.filter((block) => block.date === day.date).map((block) => (
                  <article draggable onDragStart={() => setDragBlock(block.id)} onDragEnd={() => setDragBlock(null)} className={`calendar-block ${block.tone}`} key={block.id}>
                    <span>{block.start}</span><strong>{block.title}</strong><small>{block.duration}분 · {block.category}</small>
                  </article>
                ))}
                <button className="day-add" onClick={() => setBlockModal(true)}>＋</button>
              </div>
            </div>
          ))}
        </div>
        <div className="calendar-hint">색상 블록을 다른 날짜로 끌어 계획을 이동할 수 있습니다.</div>
      </section>
    );
  }

  function renderMatrix() {
    return (
      <section className="matrix-view">
        <div className="section-toolbar"><div><span className="eyebrow">EISENHOWER MATRIX</span><h2>중요한 일에 먼저 시간을 주세요.</h2><p>카드를 끌어서 우선순위를 바꾸고, 중요한 일은 오늘 시간표에 배치하세요.</p></div><form className="quick-add" onSubmit={(event) => { event.preventDefault(); if (!matrixInput.trim()) return; setMatrixTasks((current) => [...current, { id: Date.now(), title: matrixInput.trim(), quadrant: 'do', category: '새 할 일', done: false }]); setMatrixInput(''); }}><input value={matrixInput} onChange={(event) => setMatrixInput(event.target.value)} placeholder="할 일 빠르게 추가" aria-label="할 일 빠르게 추가"/><button>＋</button></form></div>
        <div className="matrix-grid">
          {QUADRANTS.map((quadrant) => (
            <section className={`quadrant quadrant-${quadrant.id}`} key={quadrant.id} onDragOver={(event) => event.preventDefault()} onDrop={() => { if (dragTask) setMatrixTasks((current) => current.map((task) => task.id === dragTask ? { ...task, quadrant: quadrant.id } : task)); setDragTask(null); }}>
              <header><span>{quadrant.number}</span><div><h3>{quadrant.title}</h3><p>{quadrant.caption}</p></div><b>{matrixTasks.filter((task) => task.quadrant === quadrant.id).length}</b></header>
              <div className="quadrant-body">
                {matrixTasks.filter((task) => task.quadrant === quadrant.id).map((task) => (
                  <article className={task.done ? 'done' : ''} draggable key={task.id} onDragStart={() => setDragTask(task.id)} onDragEnd={() => setDragTask(null)}>
                    <button className="task-check" onClick={() => setMatrixTasks((current) => current.map((item) => item.id === task.id ? { ...item, done: !item.done } : item))}>{task.done ? '✓' : ''}</button>
                    <div><strong>{task.title}</strong><small>{task.category}</small></div>
                    <button className="task-delete" onClick={() => setMatrixTasks((current) => current.filter((item) => item.id !== task.id))}>×</button>
                  </article>
                ))}
                <button className="quadrant-add" onClick={() => setMatrixTasks((current) => [...current, { id: Date.now(), title: '새로운 할 일', quadrant: quadrant.id, category: '미분류', done: false }])}>＋ 할 일 추가</button>
              </div>
            </section>
          ))}
        </div>
      </section>
    );
  }

  function renderFocus() {
    const total = timerMode === 'focus' ? 25 * 60 : 5 * 60;
    const progress = Math.round(((total - timer) / total) * 360);
    return (
      <section className="focus-view">
        <div className="focus-stage panel">
          <div className="mode-switch"><button className={timerMode === 'focus' ? 'active' : ''} onClick={() => resetTimer('focus')}>집중 25분</button><button className={timerMode === 'break' ? 'active' : ''} onClick={() => resetTimer('break')}>휴식 5분</button></div>
          <span className="eyebrow">{timerMode === 'focus' ? 'DEEP FOCUS' : 'RECOVERY BREAK'}</span>
          <div className="timer-ring" style={{ '--timer-progress': `${progress}deg` } as React.CSSProperties}><div><strong>{formatTimer(timer)}</strong><span>{timerRunning ? '흐름을 유지하세요' : '시작할 준비가 됐어요'}</span></div></div>
          <div className="focus-task-select"><span className={`focus-dot ${focusBlock?.tone ?? 'mint'}`} /><div><small>지금 집중할 일</small><select value={selectedFocus} onChange={(event) => setSelectedFocus(Number(event.target.value))}>{todayBlocks.filter((block) => !block.completed).map((block) => <option value={block.id} key={block.id}>{block.title}</option>)}</select></div></div>
          <div className="timer-actions"><button className="secondary-button" onClick={() => resetTimer()}>↺</button><button className="timer-primary" onClick={() => setTimerRunning((value) => !value)}>{timerRunning ? '잠시 멈춤' : '집중 시작'}</button><button className="secondary-button" onClick={() => setTimer((value) => Math.max(0, value - 60))}>−1</button></div>
        </div>
        <aside className="focus-side">
          <section className="panel focus-stat"><span className="eyebrow">오늘의 집중</span><strong>5</strong><p>완료한 뽀모도로</p><div className="pom-dots">{[0,1,2,3,4,5,6,7].map((dot) => <i className={dot < 5 ? 'filled' : ''} key={dot} />)}</div></section>
          <section className="panel session-list"><div className="panel-heading"><div><span className="eyebrow">SESSIONS</span><h2>오늘의 기록</h2></div></div>{['MVP 화면 설계 · 25분','주간 계획 정리 · 25분','사용자 흐름 점검 · 25분'].map((item, index) => <div className="session-row" key={item}><span>0{index + 1}</span><strong>{item}</strong><b>완료</b></div>)}</section>
        </aside>
      </section>
    );
  }

  function renderReview() {
    const bars = [46, 72, 58, 84, 67, 91, completion];
    return (
      <section className="review-view">
        <div className="section-toolbar"><div><span className="eyebrow">WEEKLY REVIEW</span><h2>실행한 만큼 다음 계획이 선명해져요.</h2><p>8월 17일 – 23일의 계획과 실제 실행을 비교했습니다.</p></div><button className="outline-button">리뷰 노트 작성</button></div>
        <div className="review-cards"><article><span>계획 달성률</span><strong>72%</strong><small>지난주보다 8% 상승</small></article><article><span>총 집중 시간</span><strong>8h 10m</strong><small>목표의 82% 달성</small></article><article><span>완료한 블록</span><strong>24개</strong><small>총 33개 중</small></article></div>
        <div className="review-grid">
          <section className="panel weekly-chart"><div className="panel-heading"><div><span className="eyebrow">EXECUTION RATE</span><h2>요일별 실행률</h2></div><span className="soft-badge">평균 72%</span></div><div className="bar-chart">{bars.map((height, index) => <div className="bar-column" key={index}><div><i style={{ height: `${height}%` }} /></div><span>{['월','화','수','목','금','토','일'][index]}</span></div>)}</div></section>
          <section className="panel insight-card"><span className="eyebrow">THIS WEEK</span><h3>오전에 계획한 블록의<br/>완료율이 가장 높아요.</h3><p>중요한 프로젝트 작업을 오전 10시 이전에 배치하면 현재보다 주간 달성률을 약 10% 높일 수 있어요.</p><button onClick={() => setActive('calendar')}>다음 주에 반영하기 →</button></section>
        </div>
      </section>
    );
  }

  function renderSettings() {
    return (
      <section className="settings-view">
        <div className="section-toolbar"><div><span className="eyebrow">PREFERENCES</span><h2>나에게 맞는 작업 환경</h2><p>선택한 설정은 이 기기에 자동으로 저장됩니다.</p></div></div>
        <section className="panel settings-panel">
          <div className="setting-row"><div><strong>화면 테마</strong><p>주변 밝기와 취향에 맞게 선택하세요.</p></div><div className="theme-options">{(['light','dim','dark'] as Theme[]).map((item) => <button className={`${item} ${theme === item ? 'selected' : ''}`} onClick={() => setTheme(item)} key={item}><i /><span>{item === 'light' ? '밝게' : item === 'dim' ? '중간' : '어둡게'}</span></button>)}</div></div>
          <div className="setting-row"><div><strong>기본 시간 블록</strong><p>새 블록을 만들 때 적용할 시간입니다.</p></div><select defaultValue="60"><option value="30">30분</option><option value="60">60분</option><option value="90">90분</option></select></div>
          <div className="setting-row"><div><strong>뽀모도로 알림</strong><p>집중과 휴식이 끝나면 알려드립니다.</p></div><button className="toggle on" aria-label="뽀모도로 알림 켜짐"><i /></button></div>
          <div className="setting-row"><div><strong>데이터 초기화</strong><p>이 기기에 저장된 계획과 설정을 기본값으로 돌립니다.</p></div><button className="danger-button" onClick={() => { setBlocks(INITIAL_BLOCKS); setMatrixTasks(INITIAL_MATRIX); setTheme('light'); }}>기본값 복원</button></div>
        </section>
      </section>
    );
  }

  const titles: Record<View, [string, string]> = {
    today: ['2026년 8월 23일 · 일요일', '오늘도 좋은 흐름을 만들어봐요.'],
    plan: ['장기 목표 설계', '큰 방향을 실행 가능한 계획으로'],
    calendar: ['주간 캘린더', '시간을 눈에 보이게 배치하세요.'],
    matrix: ['우선순위 설계', '해야 할 일보다 중요한 일을 먼저'],
    focus: ['뽀모도로 집중', '한 번에 한 가지에만 집중해요.'],
    review: ['실행 리뷰', '계획과 실제의 차이를 배움으로'],
    settings: ['환경 설정', 'Flowday를 내 방식에 맞게'],
  };

  return (
    <main className={`app-shell theme-${theme}`}>
      <aside className="sidebar">
        <button className="brand" onClick={() => setActive('today')}><span className="brand-mark">F</span><span>Flowday</span></button>
        <nav className="nav-list" aria-label="주요 메뉴">{NAV.map((item) => <button className={active === item.id ? 'nav-item active' : 'nav-item'} key={item.id} onClick={() => setActive(item.id)}><span className="nav-icon">{item.icon}</span>{item.label}</button>)}</nav>
        <div className="sidebar-bottom"><div className="goal-mini"><span className="eyebrow">3년 목표</span><strong>나만의 제품 출시</strong><div className="progress"><span style={{ width: '42%' }} /></div><small>42% 진행 중</small></div><button className={active === 'settings' ? 'nav-item active' : 'nav-item'} onClick={() => setActive('settings')}><span className="nav-icon">⚙</span>설정</button></div>
      </aside>

      <section className="workspace">
        <header className="topbar"><div><span className="eyebrow">{titles[active][0]}</span><h1>{titles[active][1]}</h1></div><div className="top-actions"><button className="theme-button" onClick={() => setTheme(theme === 'light' ? 'dim' : theme === 'dim' ? 'dark' : 'light')} aria-label="테마 변경"><i className={theme} />{theme === 'light' ? 'Light' : theme === 'dim' ? 'Dim' : 'Dark'}</button><button className="icon-btn" aria-label="알림">♢</button><span className="avatar">AC</span></div></header>
        {active === 'today' && renderToday()}
        {active === 'plan' && renderPlan()}
        {active === 'calendar' && renderCalendar()}
        {active === 'matrix' && renderMatrix()}
        {active === 'focus' && renderFocus()}
        {active === 'review' && renderReview()}
        {active === 'settings' && renderSettings()}
      </section>

      {blockModal && <div className="modal-backdrop" onMouseDown={(event) => { if (event.target === event.currentTarget) setBlockModal(false); }}><form className="modal" onSubmit={addBlock}><div className="modal-head"><div><span className="eyebrow">NEW TIME BLOCK</span><h2>오늘의 실행 블록</h2></div><button type="button" onClick={() => setBlockModal(false)}>×</button></div><label>무엇을 할까요?<input autoFocus value={newBlock.title} onChange={(event) => setNewBlock({ ...newBlock, title: event.target.value })} placeholder="예: 출시 페이지 카피 작성" /></label><div className="form-grid"><label>시작 시간<input type="time" value={newBlock.start} onChange={(event) => setNewBlock({ ...newBlock, start: event.target.value })}/></label><label>소요 시간<select value={newBlock.duration} onChange={(event) => setNewBlock({ ...newBlock, duration: event.target.value })}><option value="25">25분</option><option value="30">30분</option><option value="60">60분</option><option value="90">90분</option><option value="120">120분</option></select></label></div><label>카테고리<select value={newBlock.category} onChange={(event) => setNewBlock({ ...newBlock, category: event.target.value })}><option>프로젝트</option><option>기획</option><option>건강</option><option>성장</option><option>생활</option></select></label><div className="tone-picker"><span>블록 색상</span>{(['mint','purple','orange','blue'] as Block['tone'][]).map((tone) => <button className={`${tone} ${newBlock.tone === tone ? 'selected' : ''}`} type="button" aria-label={`${tone} 색상`} key={tone} onClick={() => setNewBlock({ ...newBlock, tone })} />)}</div><div className="modal-actions"><button type="button" className="outline-button" onClick={() => setBlockModal(false)}>취소</button><button className="add-button">블록 만들기</button></div></form></div>}
    </main>
  );
}

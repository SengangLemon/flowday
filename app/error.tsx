'use client';

import { RotateCcw } from 'lucide-react';
import { useEffect } from 'react';

export default function ErrorPage({ error, reset }: { error: Error & { digest?: string }; reset: () => void }) {
  useEffect(() => {
    console.error('Flowday route error', error);
  }, [error]);

  return (
    <main className="fatal-state">
      <span>잠시 문제가 생겼어요</span>
      <h1>내 데이터는 그대로 보관되어 있습니다.</h1>
      <p>화면을 다시 불러와 작업을 계속해보세요. 같은 문제가 반복되면 설정에서 백업 파일을 먼저 보관해주세요.</p>
      <button type="button" onClick={reset}><RotateCcw size={17} />다시 시도</button>
    </main>
  );
}

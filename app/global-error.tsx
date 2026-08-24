'use client';

export default function GlobalError({ reset }: { error: Error & { digest?: string }; reset: () => void }) {
  return (
    <html lang="ko">
      <body style={{ margin: 0, background: '#f7f1e6', color: '#2a2824', fontFamily: 'system-ui, sans-serif' }}>
        <main style={{ minHeight: '100vh', padding: 24, display: 'grid', placeContent: 'center', textAlign: 'center' }}>
          <h1 style={{ margin: 0, fontSize: 24 }}>Flowday를 다시 불러올게요.</h1>
          <p style={{ maxWidth: 420, color: '#6b645a', lineHeight: 1.6 }}>예상하지 못한 오류가 발생했습니다. 저장된 데이터는 브라우저에 남아 있습니다.</p>
          <button type="button" onClick={reset} style={{ height: 44, border: 0, borderRadius: 12, background: '#3f725d', color: '#fff', fontWeight: 700 }}>다시 시도</button>
        </main>
      </body>
    </html>
  );
}

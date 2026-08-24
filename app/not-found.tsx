import Link from 'next/link';

export default function NotFound() {
  return (
    <main className="fatal-state">
      <span>404</span>
      <h1>찾는 화면이 없습니다.</h1>
      <p>주소를 다시 확인하거나 Flowday 홈으로 돌아가세요.</p>
      <Link href="/">Flowday로 돌아가기</Link>
    </main>
  );
}

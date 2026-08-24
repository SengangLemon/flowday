import Image from 'next/image';
import Link from 'next/link';
import type { ReactNode } from 'react';

type LegalPageProps = {
  eyebrow: string;
  title: string;
  lead: string;
  updatedAt: string;
  children: ReactNode;
};

export function LegalPage({ eyebrow, title, lead, updatedAt, children }: LegalPageProps) {
  return (
    <main className="legal-page">
      <article className="legal-card">
        <header className="legal-header">
          <Link className="legal-brand" href="/" aria-label="Flowday 앱으로 이동">
            <Image src="/flowday-icon-192.png" width={42} height={42} alt="" priority />
            <span><strong>Flowday</strong><small>목표가 오늘이 되는 곳</small></span>
          </Link>
          <Link className="legal-back" href="/">앱으로 돌아가기</Link>
        </header>

        <div className="legal-hero">
          <span>{eyebrow}</span>
          <h1>{title}</h1>
          <p>{lead}</p>
          <small>시행 및 최종 업데이트: {updatedAt}</small>
        </div>

        <div className="legal-content">{children}</div>

        <footer className="legal-footer">
          <nav aria-label="정책 및 지원">
            <Link href="/privacy">개인정보처리방침</Link>
            <Link href="/terms">이용약관</Link>
            <Link href="/support">고객지원</Link>
          </nav>
          <p>문의: <a href="mailto:sunghyun329@gmail.com">sunghyun329@gmail.com</a></p>
        </footer>
      </article>
    </main>
  );
}

import type { Metadata } from 'next';
import './globals.css';

export const metadata: Metadata = {
  metadataBase: new URL(
    process.env.NEXT_PUBLIC_SITE_ORIGIN ??
      (process.env.VERCEL_PROJECT_PRODUCTION_URL
        ? `https://${process.env.VERCEL_PROJECT_PRODUCTION_URL}`
        : 'http://localhost:3000'),
  ),
  title: 'Flowday — 목표가 오늘이 되는 곳',
  description: '장기 목표를 오늘의 시간표와 집중 실행으로 연결하는 생활 관리 앱',
  openGraph: {
    type: 'website',
    locale: 'ko_KR',
    siteName: 'Flowday',
    title: 'Flowday — 목표가 오늘이 되는 곳',
    description: '장기 목표를 오늘의 실행으로 연결하는 생활 관리 앱',
    images: [{
      url: '/og.png',
      width: 1904,
      height: 1000,
      alt: 'Flowday — 목표가 오늘이 되는 곳',
    }],
  },
  twitter: {
    card: 'summary_large_image',
    title: 'Flowday — 목표가 오늘이 되는 곳',
    description: '장기 목표를 오늘의 실행으로 연결하는 생활 관리 앱',
    images: ['/og.png'],
  },
};

export default function RootLayout({
  children,
}: Readonly<{
  children: React.ReactNode;
}>) {
  return (
    <html lang="ko">
      <body>{children}</body>
    </html>
  );
}

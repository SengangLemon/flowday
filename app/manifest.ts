import type { MetadataRoute } from 'next';

export default function manifest(): MetadataRoute.Manifest {
  return {
    name: 'Flowday — 목표가 오늘이 되는 곳',
    short_name: 'Flowday',
    description: '장기 목표를 오늘의 시간표와 집중 실행으로 연결하는 생활 관리 앱',
    id: '/',
    start_url: '/',
    scope: '/',
    display: 'standalone',
    orientation: 'any',
    lang: 'ko-KR',
    categories: ['productivity', 'lifestyle'],
    background_color: '#f7f1e6',
    theme_color: '#3f725d',
    icons: [
      { src: '/flowday-icon-192.png', sizes: '192x192', type: 'image/png', purpose: 'any' },
      { src: '/flowday-icon-512.png', sizes: '512x512', type: 'image/png', purpose: 'maskable' },
    ],
  };
}

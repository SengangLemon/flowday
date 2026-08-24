'use client';

import { App } from '@capacitor/app';
import { Capacitor } from '@capacitor/core';
import { Haptics, ImpactStyle, NotificationType } from '@capacitor/haptics';
import { Keyboard, KeyboardResize } from '@capacitor/keyboard';
import { LocalNotifications } from '@capacitor/local-notifications';
import { Network } from '@capacitor/network';
import { StatusBar, Style } from '@capacitor/status-bar';
import type { Theme } from './planner';

const FOCUS_NOTIFICATION_ID = 250025;

export function isNativeApp() {
  return Capacitor.isNativePlatform();
}

export function currentTimestamp() {
  return Date.now();
}

export async function configureNativeShell(theme: Theme) {
  if (!isNativeApp()) return;
  await Promise.allSettled([
    StatusBar.setStyle({ style: theme === 'dark' ? Style.Light : Style.Dark }),
    StatusBar.setBackgroundColor({ color: theme === 'dark' ? '#171B18' : theme === 'dim' ? '#D7D0C5' : '#F7F1E7' }),
    StatusBar.setOverlaysWebView({ overlay: false }),
    Keyboard.setResizeMode({ mode: KeyboardResize.Body }),
  ]);
}

export async function installNativeEventBridge() {
  if (!isNativeApp()) return () => undefined;
  const [appHandle, networkHandle] = await Promise.all([
    App.addListener('appStateChange', ({ isActive }) => {
      if (isActive) window.dispatchEvent(new Event('focus'));
    }),
    Network.addListener('networkStatusChange', ({ connected }) => {
      window.dispatchEvent(new Event(connected ? 'online' : 'offline'));
    }),
  ]);
  return () => {
    void appHandle.remove();
    void networkHandle.remove();
  };
}

export async function nativeImpact(style: 'light' | 'medium' = 'light') {
  if (!isNativeApp()) return;
  await Haptics.impact({ style: style === 'medium' ? ImpactStyle.Medium : ImpactStyle.Light });
}

export async function nativeSuccess() {
  if (!isNativeApp()) return;
  await Haptics.notification({ type: NotificationType.Success });
}

export async function scheduleFocusNotification(seconds: number, mode: 'focus' | 'break', taskTitle?: string) {
  if (!isNativeApp() || seconds <= 0) return;
  await LocalNotifications.cancel({ notifications: [{ id: FOCUS_NOTIFICATION_ID }] }).catch(() => undefined);
  await LocalNotifications.schedule({
    notifications: [{
      id: FOCUS_NOTIFICATION_ID,
      title: mode === 'focus' ? '집중 시간이 끝났어요' : '휴식이 끝났어요',
      body: mode === 'focus' ? (taskTitle ? `${taskTitle} 집중을 마무리하고 기록을 확인해보세요.` : '수고했어요. 잠시 숨을 고를 시간입니다.') : '다음 집중 블록을 시작할 준비가 됐어요.',
      schedule: { at: new Date(Date.now() + seconds * 1000) },
      extra: { destination: 'focus' },
    }],
  });
}

export async function cancelFocusNotification() {
  if (!isNativeApp()) return;
  await LocalNotifications.cancel({ notifications: [{ id: FOCUS_NOTIFICATION_ID }] });
}

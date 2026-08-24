/// <reference types="@capacitor/app" />
/// <reference types="@capacitor/local-notifications" />
/// <reference types="@capacitor/status-bar" />

import type { CapacitorConfig } from '@capacitor/cli';
import { KeyboardResize, KeyboardStyle } from '@capacitor/keyboard';

const config: CapacitorConfig = {
  appId: 'com.senganglemon.flowday',
  appName: 'Flowday',
  webDir: 'mobile-dist',
  backgroundColor: '#F7F1E7',
  zoomEnabled: false,
  loggingBehavior: 'debug',
  ios: {
    contentInset: 'automatic',
    allowsLinkPreview: false,
    preferredContentMode: 'mobile',
    scheme: 'App',
  },
  plugins: {
    Keyboard: {
      resize: KeyboardResize.Body,
      style: KeyboardStyle.Light,
      resizeOnFullScreen: true,
    },
    LocalNotifications: {
      presentationOptions: ['sound', 'banner', 'list'],
    },
    StatusBar: {
      overlaysWebView: false,
      style: 'DARK',
      backgroundColor: '#F7F1E7',
    },
  },
};

export default config;

import type { CapacitorConfig } from '@capacitor/cli';

const config: CapacitorConfig = {
  appId: 'com.hellogroot.finanseal',
  appName: 'FinanSEAL',
  webDir: 'public',
  server: {
    url: 'https://app.finanseal.com',
    allowNavigation: [
      'app.finanseal.com',
      '*.convex.cloud',
      '*.clerk.accounts.dev',
      'accounts.clerk.dev',
      'accounts.google.com',
      'appleid.apple.com',
    ],
  },
  plugins: {
    CapacitorCookies: { enabled: true },
    CapacitorHttp: { enabled: true },
    SplashScreen: {
      launchAutoHide: false,
      backgroundColor: '#FFFFFF',
      androidSplashResourceName: 'splash',
      showSpinner: false,
    },
    PushNotifications: {
      presentationOptions: ['badge', 'sound', 'alert'],
    },
    StatusBar: {
      style: 'LIGHT',
      backgroundColor: '#FFFFFF',
    },
  },
  ios: {
    scheme: 'FinanSEAL',
    contentInset: 'automatic',
  },
};

export default config;

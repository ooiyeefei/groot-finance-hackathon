import type { CapacitorConfig } from '@capacitor/cli';

const config: CapacitorConfig = {
  appId: 'com.hellogroot.finanseal',
  appName: 'Groot Finance',
  webDir: 'public',
  server: {
    url: 'https://finance.hellogroot.com',
    allowNavigation: [
      'finance.hellogroot.com',
      '*.hellogroot.com',
      '*.convex.cloud',
      '*.clerk.accounts.dev',
      'capable-bobcat-22.clerk.accounts.dev',
      'accounts.clerk.dev',
      'accounts.google.com',
      'appleid.apple.com',
      '*.clerk.com',
    ],
  },
  plugins: {
    CapacitorCookies: { enabled: true },
    CapacitorHttp: { enabled: true },
    SplashScreen: {
      launchAutoHide: true,
      launchShowDuration: 2000,
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
    scheme: 'App',
    contentInset: 'automatic',
  },
};

export default config;

# Quickstart: Capacitor Mobile App (iOS)

**Branch**: `001-capacitor-mobile-app` | **Date**: 2026-02-21

## Prerequisites

- macOS with Xcode 16+ installed
- Apple Developer Program membership (enrolled, $99/year)
- Node.js 20.x, npm
- CocoaPods (`sudo gem install cocoapods`)
- Existing FinanSEAL web app running (local or Vercel)

## Initial Setup

### 1. Install Capacitor

```bash
npm install @capacitor/core @capacitor/cli @capacitor/ios
npm install @capacitor/camera @capacitor/push-notifications @capacitor/app
npm install @capacitor/status-bar @capacitor/splash-screen @capacitor/browser
npm install @capacitor/preferences
npm install @sentry/capacitor@^2.4.1
npx cap init "FinanSEAL" "com.hellogroot.finanseal" --web-dir public
```

### 2. Configure Capacitor

Create `capacitor.config.ts` in the project root:

```typescript
import type { CapacitorConfig } from '@capacitor/cli';

const config: CapacitorConfig = {
  appId: 'com.hellogroot.finanseal',
  appName: 'FinanSEAL',
  webDir: 'public',
  server: {
    url: 'https://app.finanseal.com',  // Production Vercel URL
    allowNavigation: [
      'app.finanseal.com',
      '*.convex.cloud',
      '*.clerk.accounts.dev',
      'accounts.clerk.dev',
    ],
  },
  plugins: {
    CapacitorCookies: { enabled: true },
    CapacitorHttp: { enabled: true },
    SplashScreen: { launchAutoHide: false },
    PushNotifications: { presentationOptions: ['badge', 'sound', 'alert'] },
  },
};

export default config;
```

### 3. Add iOS Platform

```bash
npx cap add ios
npx cap sync ios
```

### 4. Open in Xcode

```bash
npx cap open ios
```

In Xcode:
- Set signing team (Apple Developer account)
- Add capabilities: Push Notifications, Associated Domains (for deep links)
- Set deployment target: iOS 16.0
- Configure app icons and splash screen

### 5. Run on Simulator

```bash
npx cap run ios
```

### 6. Run on Physical Device (TestFlight)

```bash
npx cap sync ios
# Open Xcode → Product → Archive → Distribute App → App Store Connect → TestFlight
```

## Key Development Patterns

### Detect Capacitor Environment

```typescript
import { Capacitor } from '@capacitor/core';

const isNative = Capacitor.isNativePlatform();
const platform = Capacitor.getPlatform(); // 'ios', 'android', or 'web'
```

### Native Camera (replaces browser getUserMedia)

```typescript
import { Camera, CameraResultType, CameraSource } from '@capacitor/camera';

if (Capacitor.isNativePlatform()) {
  const image = await Camera.getPhoto({
    quality: 90,
    allowEditing: false,
    resultType: CameraResultType.Uri,
    source: CameraSource.Camera,
  });
  // image.webPath contains the local file URI
}
```

### Push Notification Registration

```typescript
import { PushNotifications } from '@capacitor/push-notifications';

const result = await PushNotifications.requestPermissions();
if (result.receive === 'granted') {
  await PushNotifications.register();
}

PushNotifications.addListener('registration', (token) => {
  // Send token.value to Convex pushSubscriptions.register mutation
});

PushNotifications.addListener('pushNotificationActionPerformed', (action) => {
  const url = action.notification.data?.resourceUrl;
  // Navigate to url using Next.js router
});
```

### OAuth via System Browser

```typescript
import { Browser } from '@capacitor/browser';
import { App } from '@capacitor/app';

// Open OAuth in SFSafariViewController
await Browser.open({ url: clerkOAuthUrl });

// Listen for callback deep link
App.addListener('appUrlOpen', (event) => {
  const url = new URL(event.url);
  // Parse auth tokens from URL, call Clerk setActive()
});
```

## Build & Deploy

```bash
# Sync web changes to iOS project
npx cap sync ios

# Build and archive in Xcode
# Product → Archive → Distribute App → App Store Connect

# Upload dSYMs to Sentry
npx sentry-cli debug-files upload --org finanseal --project finanseal-mobile \
  ios/App/build/Products/Release-iphoneos/FinanSEAL.app.dSYM
```

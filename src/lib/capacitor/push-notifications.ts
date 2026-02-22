/**
 * Capacitor Push Notifications
 *
 * Handles push notification registration, token management, and
 * notification tap handling for the iOS native app.
 */

import { PushNotifications, Token, ActionPerformed } from '@capacitor/push-notifications';
import { isNativePlatform } from './platform';

type TokenCallback = (token: string) => void;
type NotificationTapCallback = (resourceUrl: string) => void;

let tokenCallback: TokenCallback | null = null;
let tapCallback: NotificationTapCallback | null = null;
let initialized = false;

/**
 * Initialize push notifications. Requests permission, registers for
 * push, and sets up listeners for token registration and notification taps.
 *
 * @param onToken - Called with the APNs device token when registration succeeds.
 * @param onNotificationTap - Called with the resource URL when user taps a notification.
 */
export async function initPushNotifications(
  onToken: TokenCallback,
  onNotificationTap: NotificationTapCallback
): Promise<boolean> {
  if (!isNativePlatform() || initialized) return false;

  tokenCallback = onToken;
  tapCallback = onNotificationTap;

  // Request permission
  const permResult = await PushNotifications.requestPermissions();
  if (permResult.receive !== 'granted') {
    console.log('[Push] Permission denied');
    return false;
  }

  // Register for push
  await PushNotifications.register();

  // Listen for successful registration
  PushNotifications.addListener('registration', (token: Token) => {
    console.log('[Push] Registered with token:', token.value.substring(0, 10) + '...');
    tokenCallback?.(token.value);
  });

  // Listen for registration errors
  PushNotifications.addListener('registrationError', (error) => {
    console.error('[Push] Registration error:', error);
  });

  // Listen for notification taps (user tapped a notification)
  PushNotifications.addListener('pushNotificationActionPerformed', (action: ActionPerformed) => {
    const resourceUrl = action.notification.data?.resourceUrl;
    if (resourceUrl && tapCallback) {
      tapCallback(resourceUrl);
    }
  });

  initialized = true;
  return true;
}

/**
 * Unregister from push notifications. Call on logout.
 */
export async function unregisterPushNotifications(): Promise<void> {
  if (!isNativePlatform()) return;
  try {
    await PushNotifications.removeAllListeners();
    initialized = false;
    tokenCallback = null;
    tapCallback = null;
  } catch (err) {
    console.error('[Push] Unregister error:', err);
  }
}

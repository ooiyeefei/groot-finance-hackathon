/**
 * Capacitor Camera Bridge
 *
 * Unified camera API: uses the native @capacitor/camera plugin when
 * running in Capacitor, falls back to browser getUserMedia on web.
 */

import { Camera, CameraResultType, CameraSource, CameraPermissionState } from '@capacitor/camera';
import { isNativePlatform } from './platform';

export interface CaptureResult {
  /** File object ready for upload. */
  file: File;
  /** Object URL for preview (must be revoked by the caller). */
  previewUrl: string;
}

/**
 * Capture a photo using the native camera (Capacitor) or return null
 * so the caller can fall back to the browser camera UI.
 *
 * Returns null when:
 * - Not running in Capacitor (web fallback should handle it)
 * - User denied camera permission
 * - User cancelled the capture
 */
export async function captureNativePhoto(): Promise<CaptureResult | null> {
  if (!isNativePlatform()) return null;

  // Check / request permission
  const permissions = await Camera.checkPermissions();
  if (permissions.camera === 'denied') {
    const requested = await Camera.requestPermissions({ permissions: ['camera'] });
    if (requested.camera === 'denied') {
      throw new CameraPermissionDeniedError();
    }
  }

  try {
    const image = await Camera.getPhoto({
      quality: 90,
      allowEditing: false,
      resultType: CameraResultType.Uri,
      source: CameraSource.Camera,
      width: 4096,
      height: 3072,
      correctOrientation: true,
    });

    if (!image.webPath) return null;

    // Fetch the local file URI and convert to a File object
    const response = await fetch(image.webPath);
    const blob = await response.blob();
    const file = new File([blob], `receipt-${Date.now()}.jpg`, { type: 'image/jpeg' });
    const previewUrl = URL.createObjectURL(blob);

    return { file, previewUrl };
  } catch (err: unknown) {
    // User cancelled — not an error
    if (err instanceof Error && err.message.includes('User cancelled')) {
      return null;
    }
    throw err;
  }
}

/**
 * Check if the native camera is available and permitted.
 */
export async function checkCameraPermission(): Promise<CameraPermissionState> {
  if (!isNativePlatform()) return 'granted';
  const result = await Camera.checkPermissions();
  return result.camera;
}

/** Thrown when the user has permanently denied camera access. */
export class CameraPermissionDeniedError extends Error {
  constructor() {
    super('Camera permission denied. Please enable camera access in your device Settings.');
    this.name = 'CameraPermissionDeniedError';
  }
}

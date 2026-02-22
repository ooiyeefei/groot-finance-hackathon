/**
 * Capacitor App Update Checker
 *
 * Compares the running native app version against the minimum and latest
 * versions stored in Convex. Returns one of three states:
 * - 'force': App is below minimum version, must update
 * - 'soft': App is below latest version, should update
 * - 'none': App is up to date
 */

import { App as CapApp } from '@capacitor/app';
import { isNativePlatform } from './platform';

export type UpdateStatus = 'force' | 'soft' | 'none';

export interface UpdateCheckResult {
  status: UpdateStatus;
  currentVersion: string;
  message?: string;
}

/**
 * Compare two semver strings. Returns:
 * -1 if a < b, 0 if a === b, 1 if a > b
 */
function compareSemver(a: string, b: string): number {
  const pa = a.split('.').map(Number);
  const pb = b.split('.').map(Number);
  for (let i = 0; i < 3; i++) {
    const na = pa[i] ?? 0;
    const nb = pb[i] ?? 0;
    if (na < nb) return -1;
    if (na > nb) return 1;
  }
  return 0;
}

/**
 * Check if the app needs updating by comparing the native app version
 * against remote version records.
 *
 * @param minimumVersion - The minimum supported version (below = force update).
 * @param latestVersion - The latest available version (below = soft update).
 * @param forceUpdateMessage - Message to show for force updates.
 * @param softUpdateMessage - Message to show for soft updates.
 */
export async function checkForUpdate(
  minimumVersion: string,
  latestVersion: string,
  forceUpdateMessage?: string,
  softUpdateMessage?: string
): Promise<UpdateCheckResult> {
  if (!isNativePlatform()) {
    return { status: 'none', currentVersion: 'web' };
  }

  const info = await CapApp.getInfo();
  const currentVersion = info.version; // e.g. "1.0.0"

  // Below minimum version — force update
  if (compareSemver(currentVersion, minimumVersion) < 0) {
    return {
      status: 'force',
      currentVersion,
      message: forceUpdateMessage || 'A critical update is required. Please update to continue using FinanSEAL.',
    };
  }

  // Below latest version — soft update
  if (compareSemver(currentVersion, latestVersion) < 0) {
    return {
      status: 'soft',
      currentVersion,
      message: softUpdateMessage || 'A new version of FinanSEAL is available.',
    };
  }

  return { status: 'none', currentVersion };
}

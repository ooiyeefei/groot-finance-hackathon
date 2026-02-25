/**
 * Native-safe file download utility.
 *
 * iOS WKWebView doesn't reliably support the <a download> pattern.
 * On native platforms, we open the blob URL in the system browser
 * (SFSafariViewController), which handles downloads natively including
 * the iOS share sheet for saving/sharing files.
 *
 * On web, falls back to the standard <a download> approach.
 */

import { isNativePlatform } from './platform';

/**
 * Download a blob as a file, with native iOS support.
 */
export async function downloadBlob(blob: Blob, filename: string): Promise<void> {
  const url = URL.createObjectURL(blob);

  if (isNativePlatform()) {
    // On native: open in system browser which handles downloads properly
    const { Browser } = await import('@capacitor/browser');
    await Browser.open({ url });
    // Don't revoke immediately — the browser needs time to load it
    setTimeout(() => URL.revokeObjectURL(url), 60_000);
  } else {
    // On web: standard download approach
    const a = document.createElement('a');
    a.href = url;
    a.download = filename;
    document.body.appendChild(a);
    a.click();
    document.body.removeChild(a);
    URL.revokeObjectURL(url);
  }
}

/**
 * Download a CSV string as a file, with native iOS support.
 */
export async function downloadCsv(csvContent: string, filename: string): Promise<void> {
  const blob = new Blob([csvContent], { type: 'text/csv;charset=utf-8;' });
  return downloadBlob(blob, filename);
}

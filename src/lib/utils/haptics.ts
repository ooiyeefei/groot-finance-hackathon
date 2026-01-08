/**
 * Haptic Feedback Utility
 * Provides tactile feedback for mobile interactions using the Vibration API
 *
 * Browser support: Chrome, Edge, Firefox, Opera, Samsung Internet
 * Note: Safari/iOS does not support the Vibration API, so haptics silently fail
 */

type HapticPattern = 'success' | 'error' | 'warning' | 'light' | 'medium' | 'heavy' | 'selection'

// Vibration patterns in milliseconds
const HAPTIC_PATTERNS: Record<HapticPattern, number | number[]> = {
  // Light tap - for selections, toggle switches
  light: 10,

  // Medium tap - for button presses
  medium: 25,

  // Heavy tap - for important actions
  heavy: 50,

  // Selection feedback - very brief
  selection: 5,

  // Success - single solid vibration
  success: 50,

  // Error - triple pulse
  error: [50, 30, 50, 30, 50],

  // Warning - double pulse
  warning: [50, 50, 50],
}

/**
 * Check if haptic feedback is supported
 */
export function isHapticSupported(): boolean {
  return typeof navigator !== 'undefined' && 'vibrate' in navigator
}

/**
 * Trigger haptic feedback with a predefined pattern
 * Safely handles unsupported browsers
 *
 * @param pattern - The type of haptic feedback to trigger
 * @returns true if vibration was triggered, false if not supported
 */
export function triggerHaptic(pattern: HapticPattern = 'medium'): boolean {
  if (!isHapticSupported()) {
    return false
  }

  try {
    const vibrationPattern = HAPTIC_PATTERNS[pattern]
    navigator.vibrate(vibrationPattern)
    return true
  } catch (error) {
    // Silently fail - some browsers may throw even with feature detection
    console.debug('[Haptics] Vibration failed:', error)
    return false
  }
}

/**
 * Cancel any ongoing haptic feedback
 */
export function cancelHaptic(): void {
  if (isHapticSupported()) {
    try {
      navigator.vibrate(0)
    } catch (error) {
      // Silently fail
    }
  }
}

/**
 * Trigger haptic feedback for approval action
 */
export function hapticApprove(): boolean {
  return triggerHaptic('success')
}

/**
 * Trigger haptic feedback for rejection action
 */
export function hapticReject(): boolean {
  return triggerHaptic('error')
}

/**
 * Trigger haptic feedback for selection/tap
 */
export function hapticTap(): boolean {
  return triggerHaptic('light')
}

/**
 * Trigger haptic feedback for button press
 */
export function hapticPress(): boolean {
  return triggerHaptic('medium')
}

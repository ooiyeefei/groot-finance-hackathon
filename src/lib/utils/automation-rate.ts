/**
 * Automation Rate Utilities
 * Feature: 001-surface-automation-rate
 *
 * Shared utilities for automation rate formatting and milestone configuration
 */

/**
 * Get milestone toast configuration for a given threshold
 */
export function getMilestoneToastConfig(threshold: 90 | 95 | 99) {
  const configs = {
    90: {
      title: 'AI Automation Rate Hit 90%!',
      description: 'Only 1 in 10 documents needs your review. Your AI is learning fast.',
      duration: 8000,
    },
    95: {
      title: 'AI Automation Rate Hit 95%!',
      description: 'Only 1 in 20 documents needs your review. Exceptional accuracy.',
      duration: 8000,
    },
    99: {
      title: 'AI Automation Rate Hit 99%!',
      description: 'Only 1 in 100 documents needs your review! Near-perfect automation.',
      duration: 10000,
    },
  };

  return configs[threshold];
}

/**
 * Format automation rate for display
 */
export function formatAutomationRate(rate: number): string {
  if (rate >= 99.5) return '99.5%+';
  return `${rate.toFixed(1)}%`;
}

/**
 * Get color class for automation rate threshold
 */
export function getAutomationRateColor(rate: number): string {
  if (rate >= 95) return 'text-green-600 dark:text-green-400';
  if (rate >= 80) return 'text-blue-600 dark:text-blue-400';
  if (rate >= 60) return 'text-yellow-600 dark:text-yellow-400';
  return 'text-red-600 dark:text-red-400';
}

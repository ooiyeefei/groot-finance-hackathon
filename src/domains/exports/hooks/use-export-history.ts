'use client';

/**
 * Export History Hooks
 *
 * Hooks for viewing export history and re-downloading files.
 */

import { useQuery } from 'convex/react';
import { api } from '../../../../convex/_generated/api';
import type { ExportModule, ExportHistoryStatus } from '../types';

// ============================================
// HISTORY LIST HOOKS
// ============================================

/**
 * List export history for a business
 */
export function useExportHistory(
  businessId: string | undefined,
  options?: {
    module?: ExportModule;
    status?: ExportHistoryStatus;
    limit?: number;
  }
) {
  const result = useQuery(
    api.functions.exportHistory.list,
    businessId
      ? {
          businessId,
          module: options?.module,
          status: options?.status,
          limit: options?.limit,
        }
      : 'skip'
  );

  return {
    items: result?.items || [],
    hasMore: result?.hasMore || false,
    isLoading: result === undefined,
    error: null,
  };
}

/**
 * Get export history stats for a business
 */
export function useExportStats(
  businessId: string | undefined,
  period: 'week' | 'month' | 'year' = 'month'
) {
  const stats = useQuery(
    api.functions.exportHistory.getStats,
    businessId ? { businessId, period } : 'skip'
  );

  return {
    stats,
    isLoading: stats === undefined,
    error: null,
  };
}

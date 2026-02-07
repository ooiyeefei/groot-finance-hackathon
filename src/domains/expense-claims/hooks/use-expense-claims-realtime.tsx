'use client';

/**
 * Real-time Expense Claims Hook using Convex
 *
 * This hook provides automatic real-time updates when expense claims change.
 * Unlike the TanStack Query polling approach, Convex subscriptions push updates
 * immediately when Trigger.dev background jobs update claim status.
 *
 * Architecture:
 * - Trigger.dev → internalUpdateStatus() → Convex DB change
 * - Convex DB change → automatic subscription update → UI re-render
 * - No polling needed - true real-time reactivity
 */

import { useState, useCallback, useMemo } from 'react';
import { useQuery, useMutation } from 'convex/react';
import { api } from '@/convex/_generated/api';

interface PersonalDashboardData {
  summary: {
    total_claims: number;
    pending_approval: number;
    approved_amount: number;
    rejected_count: number;
  };
  recent_claims: any[];
}

interface UseExpenseClaimsRealtimeReturn {
  dashboardData: PersonalDashboardData | null;
  claims: any[];
  loading: boolean;
  error: string | null;
  // Mutations
  deleteClaim: (claimId: string) => Promise<boolean>;
  submitClaim: (claimId: string) => Promise<boolean>;
  updateClaimStatus: (claimId: string, status: string, notes?: string) => Promise<boolean>;
  // Operation loading states
  deleting: Set<string>;
  submitting: Set<string>;
}

/**
 * Hook for real-time expense claims using Convex subscriptions
 *
 * @param businessId - The business ID (Convex ID or legacy UUID)
 * @param options - Optional filters (status, limit)
 */
export function useExpenseClaimsRealtime(
  businessId: string | null,
  options?: {
    status?: string;
    limit?: number;
  }
): UseExpenseClaimsRealtimeReturn {
  // State for tracking operations
  const [deleting, setDeleting] = useState(new Set<string>());
  const [submitting, setSubmitting] = useState(new Set<string>());

  // Real-time Convex query - automatically updates when data changes
  // This is the key difference from TanStack Query polling
  const claimsResult = useQuery(
    api.functions.expenseClaims.list,
    businessId ? {
      businessId,
      status: options?.status,
      limit: options?.limit ?? 20,
      personalOnly: true,
    } : 'skip' // Skip query if no businessId
  );

  // Convex mutations
  const softDeleteMutation = useMutation(api.functions.expenseClaims.softDelete);
  const updateStatusMutation = useMutation(api.functions.expenseClaims.updateStatus);

  // Transform Convex data to match existing dashboard interface
  const dashboardData = useMemo((): PersonalDashboardData | null => {
    if (!claimsResult) return null;

    const claims = claimsResult.claims || [];
    const totalCount = claimsResult.totalCount || claims.length;

    // Calculate summary from claims
    const summary = {
      total_claims: totalCount,
      pending_approval: claims.filter((claim: any) => claim.status === 'submitted').length,
      approved_amount: claims
        .filter((claim: any) => claim.status === 'approved' || claim.status === 'reimbursed')
        .reduce((sum: number, claim: any) => sum + (claim.homeCurrencyAmount || claim.totalAmount || 0), 0),
      rejected_count: claims.filter((claim: any) => claim.status === 'rejected').length,
    };

    // Map Convex camelCase to snake_case for compatibility with existing components
    const mappedClaims = claims.map((claim: any) => ({
      id: claim._id,
      legacy_id: claim.legacyId,
      user_id: claim.userId,
      business_id: claim.businessId,
      status: claim.status,
      processing_status: claim.status, // Map status to processing_status for UI compatibility
      vendor_name: claim.vendorName,
      description: claim.description,
      business_purpose: claim.businessPurpose,
      total_amount: claim.totalAmount,
      currency: claim.currency,
      home_currency: claim.homeCurrency,
      home_currency_amount: claim.homeCurrencyAmount,
      exchange_rate: claim.exchangeRate,
      transaction_date: claim.transactionDate,
      reference_number: claim.referenceNumber,
      expense_category: claim.expenseCategory,
      storage_path: claim.storagePath,
      converted_image_path: claim.convertedImagePath,
      file_name: claim.fileName,
      file_type: claim.fileType,
      file_size: claim.fileSize,
      confidence_score: claim.confidenceScore,
      processing_metadata: claim.processingMetadata,
      error_message: claim.errorMessage,
      submitted_at: claim.submittedAt,
      approved_at: claim.approvedAt,
      rejected_at: claim.rejectedAt,
      paid_at: claim.paidAt,
      created_at: claim._creationTime,
      updated_at: claim.updatedAt,
      // Enriched data from Convex
      submitter: claim.submitter,
      reviewer: claim.reviewer,
      approver: claim.approver,
      // Duplicate detection fields
      duplicateStatus: claim.duplicateStatus,
      duplicateGroupId: claim.duplicateGroupId,
      isSplitExpense: claim.isSplitExpense,
    }));

    return {
      summary,
      recent_claims: mappedClaims,
    };
  }, [claimsResult]);

  // Delete claim operation
  const deleteClaim = useCallback(async (claimId: string): Promise<boolean> => {
    try {
      setDeleting(prev => new Set(prev).add(claimId));
      await softDeleteMutation({ id: claimId });
      return true;
    } catch (error) {
      console.error('Error deleting claim:', error);
      throw error;
    } finally {
      setDeleting(prev => {
        const newSet = new Set(prev);
        newSet.delete(claimId);
        return newSet;
      });
    }
  }, [softDeleteMutation]);

  // Submit claim operation
  const submitClaim = useCallback(async (claimId: string): Promise<boolean> => {
    try {
      setSubmitting(prev => new Set(prev).add(claimId));
      await updateStatusMutation({ id: claimId, status: 'submitted' });
      return true;
    } catch (error) {
      console.error('Error submitting claim:', error);
      throw error;
    } finally {
      setSubmitting(prev => {
        const newSet = new Set(prev);
        newSet.delete(claimId);
        return newSet;
      });
    }
  }, [updateStatusMutation]);

  // Generic status update
  const updateClaimStatus = useCallback(async (
    claimId: string,
    status: string,
    notes?: string
  ): Promise<boolean> => {
    try {
      await updateStatusMutation({
        id: claimId,
        status: status as any,
        reviewerNotes: notes,
      });
      return true;
    } catch (error) {
      console.error('Error updating claim status:', error);
      throw error;
    }
  }, [updateStatusMutation]);

  // Extract claims array for direct access
  const claims = useMemo(() =>
    dashboardData?.recent_claims || [],
    [dashboardData]
  );

  return {
    dashboardData,
    claims,
    loading: claimsResult === undefined,
    error: null, // Convex handles errors differently
    deleteClaim,
    submitClaim,
    updateClaimStatus,
    deleting,
    submitting,
  };
}

/**
 * Hook for getting a single expense claim with real-time updates
 */
export function useExpenseClaimRealtime(claimId: string | null) {
  const claim = useQuery(
    api.functions.expenseClaims.getById,
    claimId ? { id: claimId } : 'skip'
  );

  // Map to snake_case for compatibility
  const mappedClaim = useMemo(() => {
    if (!claim) return null;

    return {
      id: claim._id,
      legacy_id: claim.legacyId,
      user_id: claim.userId,
      business_id: claim.businessId,
      status: claim.status,
      processing_status: claim.status,
      vendor_name: claim.vendorName,
      description: claim.description,
      business_purpose: claim.businessPurpose,
      total_amount: claim.totalAmount,
      currency: claim.currency,
      home_currency: claim.homeCurrency,
      home_currency_amount: claim.homeCurrencyAmount,
      exchange_rate: claim.exchangeRate,
      transaction_date: claim.transactionDate,
      reference_number: claim.referenceNumber,
      expense_category: claim.expenseCategory,
      storage_path: claim.storagePath,
      converted_image_path: claim.convertedImagePath,
      file_name: claim.fileName,
      file_type: claim.fileType,
      file_size: claim.fileSize,
      confidence_score: claim.confidenceScore,
      processing_metadata: claim.processingMetadata,
      error_message: claim.errorMessage,
      submitted_at: claim.submittedAt,
      approved_at: claim.approvedAt,
      rejected_at: claim.rejectedAt,
      paid_at: claim.paidAt,
      processing_started_at: claim.processingStartedAt,
      processed_at: claim.processedAt,
      failed_at: claim.failedAt,
      created_at: claim._creationTime,
      updated_at: claim.updatedAt,
      // Enriched data
      submitter: claim.submitter,
      reviewer: claim.reviewer,
      approver: claim.approver,
      accounting_entry: claim.accountingEntry,
      // Line items status for two-phase extraction real-time updates
      line_items_status: claim.lineItemsStatus,
      // Duplicate detection fields
      duplicateStatus: claim.duplicateStatus,
      duplicateGroupId: claim.duplicateGroupId,
      isSplitExpense: claim.isSplitExpense,
    };
  }, [claim]);

  return {
    claim: mappedClaim,
    loading: claim === undefined,
    error: null,
  };
}

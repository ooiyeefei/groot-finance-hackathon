'use client';

/**
 * Attendance Hooks - Convex real-time subscriptions and mutations
 */

import { useQuery, useMutation } from 'convex/react';
import { api } from '../../../../convex/_generated/api';
import { Id } from '../../../../convex/_generated/dataModel';
import { useCallback, useState } from 'react';

// ============================================
// QUERY HOOKS
// ============================================

export function useMyTrackingStatus(businessId: string | undefined) {
  return useQuery(
    api.functions.attendanceRecords.getMyTrackingStatus,
    businessId ? { businessId } : 'skip'
  );
}

export function useMyTodayAttendance(businessId: string | undefined) {
  const data = useQuery(
    api.functions.attendanceRecords.getMyToday,
    businessId ? { businessId } : 'skip'
  );
  return data;
}

export function useMyAttendanceRecords(
  businessId: string | undefined,
  startDate: string,
  endDate: string
) {
  return useQuery(
    api.functions.attendanceRecords.getMyRecords,
    businessId ? { businessId, startDate, endDate } : 'skip'
  );
}

export function useTeamTodayAttendance(businessId: string | undefined) {
  return useQuery(
    api.functions.attendanceRecords.getTeamToday,
    businessId ? { businessId } : 'skip'
  );
}

export function useTeamAttendanceRecords(
  businessId: string | undefined,
  startDate: string,
  endDate: string,
  userId?: string
) {
  return useQuery(
    api.functions.attendanceRecords.getTeamRecords,
    businessId ? { businessId, startDate, endDate, userId } : 'skip'
  );
}

// ============================================
// MUTATION HOOKS
// ============================================

export function useCheckIn() {
  const checkInMutation = useMutation(api.functions.attendanceRecords.checkIn);
  const [isLoading, setIsLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const checkIn = useCallback(
    async (
      businessId: string,
      location?: { lat: number; lng: number; accuracy: number }
    ) => {
      setIsLoading(true);
      setError(null);
      try {
        const result = await checkInMutation({
          businessId: businessId as Id<'businesses'>,
          location,
        });
        return result;
      } catch (err) {
        const msg = err instanceof Error ? err.message : 'Failed to check in';
        setError(msg);
        throw err;
      } finally {
        setIsLoading(false);
      }
    },
    [checkInMutation]
  );

  return { checkIn, isLoading, error };
}

export function useCheckOut() {
  const checkOutMutation = useMutation(api.functions.attendanceRecords.checkOut);
  const [isLoading, setIsLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const checkOut = useCallback(
    async (businessId: string) => {
      setIsLoading(true);
      setError(null);
      try {
        const result = await checkOutMutation({
          businessId: businessId as Id<'businesses'>,
        });
        return result;
      } catch (err) {
        const msg = err instanceof Error ? err.message : 'Failed to check out';
        setError(msg);
        throw err;
      } finally {
        setIsLoading(false);
      }
    },
    [checkOutMutation]
  );

  return { checkOut, isLoading, error };
}

export function useManualEntry() {
  const manualEntryMutation = useMutation(api.functions.attendanceRecords.manualEntry);
  const [isLoading, setIsLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const createManualEntry = useCallback(
    async (args: {
      businessId: string;
      date: string;
      checkInTime: number;
      checkOutTime: number;
      reason: string;
    }) => {
      setIsLoading(true);
      setError(null);
      try {
        const result = await manualEntryMutation({
          businessId: args.businessId as Id<'businesses'>,
          date: args.date,
          checkInTime: args.checkInTime,
          checkOutTime: args.checkOutTime,
          reason: args.reason,
        });
        return result;
      } catch (err) {
        const msg = err instanceof Error ? err.message : 'Failed to create manual entry';
        setError(msg);
        throw err;
      } finally {
        setIsLoading(false);
      }
    },
    [manualEntryMutation]
  );

  return { createManualEntry, isLoading, error };
}

export function useWaiveDeduction() {
  const waiveDeductionMutation = useMutation(api.functions.attendanceRecords.waiveDeduction);
  const [isLoading, setIsLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const waiveDeduction = useCallback(
    async (id: string, reason: string) => {
      setIsLoading(true);
      setError(null);
      try {
        const result = await waiveDeductionMutation({
          id: id as Id<'attendance_records'>,
          reason,
        });
        return result;
      } catch (err) {
        const msg = err instanceof Error ? err.message : 'Failed to waive deduction';
        setError(msg);
        throw err;
      } finally {
        setIsLoading(false);
      }
    },
    [waiveDeductionMutation]
  );

  return { waiveDeduction, isLoading, error };
}

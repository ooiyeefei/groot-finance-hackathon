'use client';

/**
 * Public Holidays Hooks - Convex real-time subscriptions + date-holidays library
 *
 * System holidays come from date-holidays library (client-side).
 * Custom holidays come from Convex DB.
 * Hooks merge both and return unified results.
 */

import { useQuery, useMutation } from 'convex/react';
import { api } from '@/convex/_generated/api';
import { Id } from '@/convex/_generated/dataModel';
import { useCallback, useState, useMemo } from 'react';
import { getSystemHolidays, getSystemHolidayDates } from '../lib/system-holidays';

// ============================================
// TYPES
// ============================================

export interface Holiday {
  _id?: string;
  businessId?: string;
  countryCode: string;
  date: string;
  name: string;
  year: number;
  isCustom: boolean;
}

// ============================================
// QUERIES
// ============================================

/**
 * Get holidays for a business (system from library + custom from DB)
 */
export function useBusinessHolidays(businessId: string | undefined, year?: number) {
  const currentYear = year ?? new Date().getFullYear();

  const result = useQuery(
    api.functions.publicHolidays.getForBusiness,
    businessId ? { businessId, year: currentYear } : 'skip'
  );

  return useMemo(() => {
    if (!result) return undefined;

    const { customHolidays, countryCode } = result;

    // Get system holidays from date-holidays library
    const systemHolidays = getSystemHolidays(countryCode, currentYear);

    // Merge: system holidays + custom holidays
    const customDates = new Set(customHolidays.map((h: { date: string }) => h.date));
    const merged: Holiday[] = [
      ...systemHolidays
        .filter((h) => !customDates.has(h.date))
        .map((h) => ({ ...h, isCustom: false as const })),
      ...customHolidays.map((h: any) => ({
        _id: h._id,
        businessId: h.businessId,
        countryCode: h.countryCode,
        date: h.date,
        name: h.name,
        year: h.year,
        isCustom: true as const,
      })),
    ];

    merged.sort((a, b) => a.date.localeCompare(b.date));
    return merged;
  }, [result, currentYear]);
}

/**
 * Get holiday dates as strings for date calculations (system + custom merged)
 */
export function useHolidayDates(businessId: string | undefined, year?: number) {
  const currentYear = year ?? new Date().getFullYear();

  const result = useQuery(
    api.functions.publicHolidays.getHolidayDates,
    businessId ? { businessId, year: currentYear } : 'skip'
  );

  return useMemo(() => {
    if (!result) return undefined;

    const { customDates, countryCode } = result;

    // Get system holiday dates from date-holidays library
    const systemDates = getSystemHolidayDates(countryCode, currentYear);

    // Merge and deduplicate
    const allDates = new Set([...systemDates, ...customDates]);
    return Array.from(allDates).sort();
  }, [result, currentYear]);
}

/**
 * Get custom holidays for a business (admin view)
 */
export function useCustomHolidays(businessId: string | undefined, year?: number) {
  return useQuery(
    api.functions.publicHolidays.getCustomHolidays,
    businessId ? { businessId, year } : 'skip'
  );
}

// ============================================
// MUTATIONS
// ============================================

/**
 * Hook for adding a custom holiday (admin)
 */
export function useAddCustomHoliday() {
  const addMutation = useMutation(api.functions.publicHolidays.addCustom);
  const [isLoading, setIsLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const addCustomHoliday = useCallback(
    async (businessId: string, date: string, name: string) => {
      setIsLoading(true);
      setError(null);

      try {
        const result = await addMutation({
          businessId: businessId as Id<'businesses'>,
          date,
          name,
        });

        return result;
      } catch (err) {
        const errorMessage = err instanceof Error ? err.message : 'Failed to add custom holiday';
        setError(errorMessage);
        throw err;
      } finally {
        setIsLoading(false);
      }
    },
    [addMutation]
  );

  return { addCustomHoliday, isLoading, error };
}

/**
 * Hook for removing a custom holiday (admin)
 */
export function useRemoveCustomHoliday() {
  const removeMutation = useMutation(api.functions.publicHolidays.removeCustom);
  const [isLoading, setIsLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const removeCustomHoliday = useCallback(
    async (id: string) => {
      setIsLoading(true);
      setError(null);

      try {
        const result = await removeMutation({
          id: id as Id<'public_holidays'>,
        });

        return result;
      } catch (err) {
        const errorMessage = err instanceof Error ? err.message : 'Failed to remove custom holiday';
        setError(errorMessage);
        throw err;
      } finally {
        setIsLoading(false);
      }
    },
    [removeMutation]
  );

  return { removeCustomHoliday, isLoading, error };
}

/**
 * Hook for updating a custom holiday (admin)
 */
export function useUpdateCustomHoliday() {
  const updateMutation = useMutation(api.functions.publicHolidays.updateCustom);
  const [isLoading, setIsLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const updateCustomHoliday = useCallback(
    async (id: string, updates: { date?: string; name?: string }) => {
      setIsLoading(true);
      setError(null);

      try {
        const result = await updateMutation({
          id: id as Id<'public_holidays'>,
          ...updates,
        });

        return result;
      } catch (err) {
        const errorMessage = err instanceof Error ? err.message : 'Failed to update custom holiday';
        setError(errorMessage);
        throw err;
      } finally {
        setIsLoading(false);
      }
    },
    [updateMutation]
  );

  return { updateCustomHoliday, isLoading, error };
}

// ============================================
// DERIVED HOOKS
// ============================================

/**
 * Get holiday lookup map for quick date checking
 * Returns a Set of date strings (YYYY-MM-DD) for O(1) lookup
 */
export function useHolidayLookup(businessId: string | undefined, year?: number) {
  const holidayDates = useHolidayDates(businessId, year);

  const holidaySet = useMemo(() => {
    if (!holidayDates) return new Set<string>();
    return new Set(holidayDates);
  }, [holidayDates]);

  const isHoliday = useCallback(
    (date: string) => holidaySet.has(date),
    [holidaySet]
  );

  return {
    holidaySet,
    isHoliday,
    isLoading: holidayDates === undefined,
  };
}

/**
 * Combined hook for holiday admin operations
 */
export function useHolidayOperations() {
  const { addCustomHoliday, isLoading: addLoading, error: addError } = useAddCustomHoliday();
  const { removeCustomHoliday, isLoading: removeLoading, error: removeError } = useRemoveCustomHoliday();
  const { updateCustomHoliday, isLoading: updateLoading, error: updateError } = useUpdateCustomHoliday();

  return {
    addCustomHoliday,
    removeCustomHoliday,
    updateCustomHoliday,
    isLoading: addLoading || removeLoading || updateLoading,
    error: addError || removeError || updateError,
  };
}

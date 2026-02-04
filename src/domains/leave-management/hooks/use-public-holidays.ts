'use client';

/**
 * Public Holidays Hooks - Convex real-time subscriptions and mutations
 *
 * Provides hooks for:
 * - Fetching holidays for business day calculation
 * - Managing custom holidays (admin)
 */

import { useQuery, useMutation } from 'convex/react';
import { api } from '@/convex/_generated/api';
import { Id } from '@/convex/_generated/dataModel';
import { useCallback, useState, useMemo } from 'react';

// ============================================
// TYPES
// ============================================

export interface Holiday {
  _id: string;
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
 * Get holidays for a business (system + custom merged)
 * Used for business day calculations and date picker
 */
export function useBusinessHolidays(businessId: string | undefined, year?: number) {
  const currentYear = year ?? new Date().getFullYear();
  return useQuery(
    api.functions.publicHolidays.getForBusiness,
    businessId ? { businessId, year: currentYear } : 'skip'
  );
}

/**
 * Get holiday dates as strings for date calculations
 */
export function useHolidayDates(businessId: string | undefined, year?: number) {
  const currentYear = year ?? new Date().getFullYear();
  return useQuery(
    api.functions.publicHolidays.getHolidayDates,
    businessId ? { businessId, year: currentYear } : 'skip'
  );
}

/**
 * Get system holidays by country
 */
export function useCountryHolidays(countryCode: string | undefined, year?: number) {
  const currentYear = year ?? new Date().getFullYear();
  return useQuery(
    api.functions.publicHolidays.getByCountry,
    countryCode ? { countryCode, year: currentYear } : 'skip'
  );
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
 * Hook for bulk importing system holidays from API
 */
export function useImportCountryHolidays() {
  const bulkImportMutation = useMutation(api.functions.publicHolidays.bulkImportSystem);
  const clearMutation = useMutation(api.functions.publicHolidays.clearSystemHolidays);
  const [isLoading, setIsLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const importCountryHolidays = useCallback(
    async (businessId: string, countryCode: string, year: number, clearExisting = false) => {
      setIsLoading(true);
      setError(null);

      try {
        // Fetch holidays from API
        const response = await fetch(
          `/api/v1/leave-management/holidays?country=${countryCode}&year=${year}`
        );
        const data = await response.json();

        if (!data.success) {
          throw new Error(data.error || 'Failed to fetch holidays');
        }

        // Optionally clear existing system holidays first
        if (clearExisting) {
          await clearMutation({
            businessId: businessId as Id<'businesses'>,
            year,
          });
        }

        // Bulk import the holidays (strip extra fields like 'type' that API returns)
        const result = await bulkImportMutation({
          businessId: businessId as Id<'businesses'>,
          countryCode,
          year,
          holidays: data.data.holidays.map((h: { date: string; name: string }) => ({
            date: h.date,
            name: h.name,
          })),
        });

        return {
          ...result,
          countryName: data.data.countryName,
        };
      } catch (err) {
        const errorMessage = err instanceof Error ? err.message : 'Failed to import holidays';
        setError(errorMessage);
        throw err;
      } finally {
        setIsLoading(false);
      }
    },
    [bulkImportMutation, clearMutation]
  );

  const clearSystemHolidays = useCallback(
    async (businessId: string, year?: number) => {
      setIsLoading(true);
      setError(null);

      try {
        const result = await clearMutation({
          businessId: businessId as Id<'businesses'>,
          year,
        });

        return result;
      } catch (err) {
        const errorMessage = err instanceof Error ? err.message : 'Failed to clear holidays';
        setError(errorMessage);
        throw err;
      } finally {
        setIsLoading(false);
      }
    },
    [clearMutation]
  );

  return { importCountryHolidays, clearSystemHolidays, isLoading, error };
}

/**
 * Combined hook for holiday admin operations
 */
export function useHolidayOperations() {
  const { addCustomHoliday, isLoading: addLoading, error: addError } = useAddCustomHoliday();
  const { removeCustomHoliday, isLoading: removeLoading, error: removeError } = useRemoveCustomHoliday();
  const { updateCustomHoliday, isLoading: updateLoading, error: updateError } = useUpdateCustomHoliday();
  const { importCountryHolidays, clearSystemHolidays, isLoading: importLoading, error: importError } = useImportCountryHolidays();

  return {
    addCustomHoliday,
    removeCustomHoliday,
    updateCustomHoliday,
    importCountryHolidays,
    clearSystemHolidays,
    isLoading: addLoading || removeLoading || updateLoading || importLoading,
    error: addError || removeError || updateError || importError,
  };
}

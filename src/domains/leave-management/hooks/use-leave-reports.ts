'use client';

import { useState, useCallback } from 'react';
import { useAction } from 'convex/react';
import { api } from '@/../convex/_generated/api';
import Papa from 'papaparse';

export function useLeaveReports(businessId: string | undefined) {
  const balanceSummaryAction = useAction(api.functions.leaveReports.balanceSummary);
  const utilizationAction = useAction(api.functions.leaveReports.utilization);
  const absenceTrendsAction = useAction(api.functions.leaveReports.absenceTrends);

  const [balanceSummary, setBalanceSummary] = useState<any>(null);
  const [utilization, setUtilization] = useState<any>(null);
  const [absenceTrends, setAbsenceTrends] = useState<any>(null);
  const [isLoading, setIsLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const generateBalanceSummary = useCallback(async (year?: number) => {
    if (!businessId) return;
    setIsLoading(true);
    setError(null);
    try {
      const result = await balanceSummaryAction({ businessId, year });
      setBalanceSummary(result);
      return result;
    } catch (err: any) {
      setError(err.message);
    } finally {
      setIsLoading(false);
    }
  }, [businessId, balanceSummaryAction]);

  const generateUtilization = useCallback(async (year?: number) => {
    if (!businessId) return;
    setIsLoading(true);
    setError(null);
    try {
      const result = await utilizationAction({ businessId, year });
      setUtilization(result);
      return result;
    } catch (err: any) {
      setError(err.message);
    } finally {
      setIsLoading(false);
    }
  }, [businessId, utilizationAction]);

  const generateAbsenceTrends = useCallback(async (year?: number) => {
    if (!businessId) return;
    setIsLoading(true);
    setError(null);
    try {
      const result = await absenceTrendsAction({ businessId, year });
      setAbsenceTrends(result);
      return result;
    } catch (err: any) {
      setError(err.message);
    } finally {
      setIsLoading(false);
    }
  }, [businessId, absenceTrendsAction]);

  const exportCsv = useCallback((reportType: string, data: any) => {
    if (!data) return;

    let rows: Record<string, any>[] = [];
    let filename = 'leave-report.csv';

    if (reportType === 'balance' && data.employees) {
      filename = `leave-balance-summary-${data.year}.csv`;
      for (const emp of data.employees) {
        for (const bal of emp.balances) {
          rows.push({
            Employee: emp.userName,
            Team: emp.teamName,
            'Leave Type': bal.leaveTypeName,
            Entitled: bal.entitled,
            Used: bal.used,
            Adjustments: bal.adjustments,
            'Carry Over': bal.carryover,
            Remaining: bal.remaining,
          });
        }
      }
    } else if (reportType === 'utilization' && data.teams) {
      filename = `leave-utilization-${data.year}.csv`;
      rows = data.teams.map((t: any) => ({
        Team: t.teamName,
        Members: t.memberCount,
        'Total Entitled': t.totalEntitled,
        'Total Used': t.totalUsed,
        'Utilization %': t.utilizationRate,
      }));
    } else if (reportType === 'trends' && data.months) {
      filename = `absence-trends-${data.year}.csv`;
      rows = data.months.map((m: any) => ({
        Month: m.month,
        'Total Absence Days': m.totalAbsenceDays,
        ...Object.fromEntries(m.byLeaveType.map((lt: any) => [lt.name, lt.days])),
      }));
    }

    const csv = Papa.unparse(rows);
    const blob = new Blob([csv], { type: 'text/csv;charset=utf-8;' });
    const url = URL.createObjectURL(blob);
    const link = document.createElement('a');
    link.href = url;
    link.download = filename;
    link.click();
    URL.revokeObjectURL(url);
  }, []);

  return {
    balanceSummary,
    utilization,
    absenceTrends,
    isLoading,
    error,
    generateBalanceSummary,
    generateUtilization,
    generateAbsenceTrends,
    exportCsv,
  };
}

'use client';

/**
 * Leave Balance Widget Component
 *
 * Displays the employee's leave balance summary with:
 * - Entitled, used, remaining breakdown per leave type
 * - Visual progress indicators
 * - Carryover and adjustments info
 */

import React from 'react';
import { PieChart, TrendingUp, Calendar, Info } from 'lucide-react';
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from '@/components/ui/card';
import { Progress } from '@/components/ui/progress';
import { Skeleton } from '@/components/ui/skeleton';
import { Tooltip, TooltipContent, TooltipProvider, TooltipTrigger } from '@/components/ui/tooltip';
import { useMyBalances } from '../hooks/use-leave-balances';

interface LeaveBalanceWidgetProps {
  businessId: string;
  year?: number;
  compact?: boolean;
}

export default function LeaveBalanceWidget({
  businessId,
  year,
  compact = false,
}: LeaveBalanceWidgetProps) {
  const currentYear = year ?? new Date().getFullYear();
  const balances = useMyBalances(businessId, currentYear);

  // Loading state
  if (balances === undefined) {
    return (
      <Card className="bg-card border-border">
        <CardHeader className="pb-2">
          <Skeleton className="h-5 w-32" />
        </CardHeader>
        <CardContent>
          <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
            {[1, 2, 3, 4].map((i) => (
              <div key={i} className="space-y-2">
                <Skeleton className="h-4 w-20" />
                <Skeleton className="h-8 w-12" />
                <Skeleton className="h-2 w-full" />
              </div>
            ))}
          </div>
        </CardContent>
      </Card>
    );
  }

  // Empty state
  if (balances.length === 0) {
    return (
      <Card className="bg-card border-border">
        <CardHeader>
          <CardTitle className="text-foreground flex items-center gap-2 text-lg">
            <PieChart className="w-5 h-5" />
            Leave Balance
          </CardTitle>
        </CardHeader>
        <CardContent>
          <div className="text-center py-4 text-muted-foreground">
            <Calendar className="w-8 h-8 mx-auto mb-2 opacity-50" />
            <p>No balance data available</p>
            <p className="text-sm">Contact your administrator to initialize your leave balance</p>
          </div>
        </CardContent>
      </Card>
    );
  }

  // Compact mode - single row summary
  if (compact) {
    const totalEntitled = balances.reduce((sum: number, b: { entitled: number }) => sum + b.entitled, 0);
    const totalUsed = balances.reduce((sum: number, b: { used: number }) => sum + b.used, 0);
    const totalRemaining = balances.reduce((sum: number, b: { remaining: number }) => sum + b.remaining, 0);

    return (
      <div className="flex items-center gap-6 p-4 bg-muted/50 rounded-lg border border-border">
        <div className="flex items-center gap-2">
          <PieChart className="w-5 h-5 text-primary" />
          <span className="font-medium text-foreground">Leave Balance</span>
        </div>
        <div className="flex items-center gap-4 text-sm">
          <span className="text-muted-foreground">
            Entitled: <span className="font-medium text-foreground">{totalEntitled}</span>
          </span>
          <span className="text-muted-foreground">
            Used: <span className="font-medium text-foreground">{totalUsed}</span>
          </span>
          <span className="text-muted-foreground">
            Remaining:{' '}
            <span className="font-medium text-green-600 dark:text-green-400">{totalRemaining}</span>
          </span>
        </div>
      </div>
    );
  }

  return (
    <TooltipProvider>
      <Card className="bg-card border-border">
        <CardHeader className="pb-2">
          <div className="flex items-center justify-between">
            <div>
              <CardTitle className="text-foreground flex items-center gap-2 text-lg">
                <PieChart className="w-5 h-5" />
                Leave Balance
              </CardTitle>
              <CardDescription className="text-muted-foreground">{currentYear}</CardDescription>
            </div>
          </div>
        </CardHeader>
        <CardContent>
          <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4">
            {balances.map((balance: {
              _id: string;
              entitled: number;
              used: number;
              remaining: number;
              adjustments: number;
              carryover?: number;
              leaveType: { _id: string; name: string; code: string; color?: string } | null;
            }) => {
              const leaveType = balance.leaveType;
              const usagePercent =
                balance.entitled > 0
                  ? Math.min(100, (balance.used / balance.entitled) * 100)
                  : 0;

              // Determine color based on remaining balance
              const remainingPercent =
                balance.entitled > 0 ? (balance.remaining / balance.entitled) * 100 : 100;
              const progressColor =
                remainingPercent > 50
                  ? 'bg-green-500'
                  : remainingPercent > 20
                    ? 'bg-yellow-500'
                    : 'bg-red-500';

              return (
                <div
                  key={balance._id}
                  className="p-4 bg-muted/50 rounded-lg border border-border space-y-3"
                >
                  {/* Header */}
                  <div className="flex items-center gap-2">
                    <div
                      className="w-3 h-3 rounded-full flex-shrink-0"
                      style={{ backgroundColor: leaveType?.color || '#3B82F6' }}
                    />
                    <span className="font-medium text-foreground truncate">
                      {leaveType?.name || 'Unknown'}
                    </span>
                    {(balance.adjustments !== 0 || balance.carryover) && (
                      <Tooltip>
                        <TooltipTrigger>
                          <Info className="w-3 h-3 text-muted-foreground" />
                        </TooltipTrigger>
                        <TooltipContent>
                          <div className="space-y-1 text-sm">
                            {balance.adjustments !== 0 && (
                              <p>
                                Adjustments:{' '}
                                {balance.adjustments > 0 ? '+' : ''}
                                {balance.adjustments}
                              </p>
                            )}
                            {balance.carryover && <p>Carryover: {balance.carryover}</p>}
                          </div>
                        </TooltipContent>
                      </Tooltip>
                    )}
                  </div>

                  {/* Stats */}
                  <div className="grid grid-cols-3 gap-2 text-center">
                    <div>
                      <p className="text-xs text-muted-foreground">Entitled</p>
                      <p className="text-lg font-semibold text-foreground">{balance.entitled}</p>
                    </div>
                    <div>
                      <p className="text-xs text-muted-foreground">Used</p>
                      <p className="text-lg font-semibold text-foreground">{balance.used}</p>
                    </div>
                    <div>
                      <p className="text-xs text-muted-foreground">Remaining</p>
                      <p
                        className={`text-lg font-semibold ${
                          remainingPercent > 20
                            ? 'text-green-600 dark:text-green-400'
                            : 'text-red-600 dark:text-red-400'
                        }`}
                      >
                        {balance.remaining}
                      </p>
                    </div>
                  </div>

                  {/* Progress Bar */}
                  <div className="space-y-1">
                    <Progress
                      value={usagePercent}
                      className="h-2 bg-muted"
                    />
                    <p className="text-xs text-muted-foreground text-right">
                      {Math.round(usagePercent)}% used
                    </p>
                  </div>
                </div>
              );
            })}
          </div>
        </CardContent>
      </Card>
    </TooltipProvider>
  );
}

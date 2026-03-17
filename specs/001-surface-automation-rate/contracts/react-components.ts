/**
 * React Component Contracts: Surface Automation Rate Metric
 *
 * These TypeScript interfaces define the props and types for all React
 * components used in the automation rate feature.
 */

// ============================================
// HERO METRIC COMPONENT (Dashboard)
// ============================================

/**
 * Hero metric card displaying current automation rate
 * Location: src/domains/analytics/components/automation-rate-hero.tsx
 * Placement: Top of analytics dashboard
 *
 * @example
 * <AutomationRateHero
 *   businessId={business._id}
 *   defaultPeriod="week"
 * />
 */
export interface AutomationRateHeroProps {
  businessId: string;                              // Business ID
  defaultPeriod?: "today" | "week" | "month";     // Initial period (default: "week")
  className?: string;                               // Optional Tailwind classes
}

/**
 * Hero component displays:
 * - Large automation rate percentage (96.0%)
 * - Total documents processed count
 * - Documents reviewed count
 * - Period selector dropdown (Today/This Week/This Month)
 * - Trend indicator (↑ 2.3% from last period)
 * - "No AI activity" or "Collecting data..." message when applicable
 */

// ============================================
// TREND CHART COMPONENT (Dashboard)
// ============================================

/**
 * Weekly trend chart showing automation rate over time
 * Location: src/domains/analytics/components/automation-rate-trend-chart.tsx
 * Placement: Below hero metric on analytics dashboard
 *
 * @example
 * <AutomationRateTrendChart
 *   businessId={business._id}
 *   weeks={8}
 *   height={300}
 * />
 */
export interface AutomationRateTrendChartProps {
  businessId: string;        // Business ID
  weeks?: number;            // Number of weeks to display (default: 8, max: 52)
  height?: number;           // Chart height in pixels (default: 300)
  showOptimizationMarkers?: boolean; // Show "Model optimized" annotations (default: true)
  className?: string;        // Optional Tailwind classes
}

/**
 * Trend chart displays:
 * - Recharts LineChart with weekly data points
 * - X-axis: Week labels ("Week of Mar 3")
 * - Y-axis: Automation rate percentage (0-100%)
 * - Vertical reference lines for optimization events
 * - Custom tooltip showing rate + decision count
 * - Responsive container
 * - "No activity" markers for weeks with zero decisions
 * - "Tracking automation trends" message if < 2 weeks of data
 */

// ============================================
// CUMULATIVE STATS COMPONENT (Settings)
// ============================================

/**
 * Lifetime automation statistics for business settings
 * Location: src/domains/account-management/components/ai-automation-settings.tsx
 * Placement: "AI & Automation" tab in business settings
 *
 * @example
 * <AutomationRateStats
 *   businessId={business._id}
 * />
 */
export interface AutomationRateStatsProps {
  businessId: string;        // Business ID
  className?: string;        // Optional Tailwind classes
}

/**
 * Stats component displays:
 * - Lifetime automation rate percentage
 * - Total documents processed count
 * - Total reviewed count
 * - First decision date
 * - Time saved estimate
 * - Source breakdown (AR, Bank, Fee, Expense)
 * - "Get started" message if no AI activity yet
 */

// ============================================
// ACTION CENTER SUMMARY (Modified Component)
// ============================================

/**
 * Props extension for ProactiveActionCenter component
 * Location: src/domains/analytics/components/action-center/ProactiveActionCenter.tsx
 * Modification: Add automation summary at top
 *
 * @example
 * <ProactiveActionCenter
 *   businessId={business._id}
 *   showAutomationSummary={true}
 * />
 */
export interface ProactiveActionCenterProps {
  businessId: string;
  showAutomationSummary?: boolean; // Show daily automation summary (default: true)
  // ... existing props
}

/**
 * Automation summary displays:
 * - Today's format: "Today: **47 documents** processed, **2 needed your attention**"
 * - Large text, prominent placement
 * - Success color if high rate (>90%), warning if low (<80%)
 * - "No AI activity today" if zero decisions
 */

// ============================================
// AUTOMATION SUMMARY CARD (Sub-component)
// ============================================

/**
 * Standalone summary card for Action Center
 * Location: src/domains/analytics/components/action-center/AutomationSummaryCard.tsx
 *
 * @internal Used by ProactiveActionCenter, can also be used standalone
 */
export interface AutomationSummaryCardProps {
  businessId: string;
  className?: string;
}

// ============================================
// CUSTOM HOOK: useAutomationRate
// ============================================

/**
 * React Query hook for fetching automation rate data
 * Location: src/domains/analytics/hooks/use-automation-rate.ts
 *
 * @example
 * const { rate, isLoading, error } = useAutomationRate({
 *   businessId: business._id,
 *   period: "week"
 * });
 */
export interface UseAutomationRateOptions {
  businessId: string;
  period: "today" | "week" | "month" | "custom";
  startDate?: string;  // ISO date (required if period="custom")
  endDate?: string;    // ISO date (required if period="custom")
  refetchInterval?: number; // Polling interval in ms (default: 60000 = 1 min)
}

export interface UseAutomationRateResult {
  // Data
  rate: number | undefined;              // Automation rate percentage
  totalDecisions: number | undefined;    // Total AI decisions
  decisionsReviewed: number | undefined; // Reviewed decisions
  message: string | undefined;           // "No AI activity" or "Collecting data..."
  hasMinimumData: boolean | undefined;   // >= 10 decisions
  sources: {
    arRecon: { total: number; reviewed: number };
    bankRecon: { total: number; reviewed: number };
    feeClassification: { total: number; reviewed: number };
    expenseOCR: { total: number; reviewed: number };
  } | undefined;

  // Query state
  isLoading: boolean;
  error: Error | null;
  refetch: () => void;
}

// ============================================
// CUSTOM HOOK: useAutomationRateTrend
// ============================================

/**
 * React Query hook for fetching trend data
 * Location: src/domains/analytics/hooks/use-automation-rate.ts
 *
 * @example
 * const { trendData, isLoading } = useAutomationRateTrend({
 *   businessId: business._id,
 *   weeks: 8
 * });
 */
export interface UseAutomationRateTrendOptions {
  businessId: string;
  weeks?: number;           // Number of weeks (default: 8, max: 52)
  refetchInterval?: number; // Polling interval (default: 300000 = 5 min)
}

export interface UseAutomationRateTrendResult {
  // Data
  trendData: Array<{
    weekStart: string;
    weekEnd: string;
    week: string;
    rate: number | null;
    totalDecisions: number;
    decisionsReviewed: number;
    optimizationEvents: Array<{
      date: number;
      label: string;
      modelType: string;
    }>;
  }> | undefined;

  // Query state
  isLoading: boolean;
  error: Error | null;
  refetch: () => void;
}

// ============================================
// CUSTOM HOOK: useMilestoneSubscription
// ============================================

/**
 * Subscription hook for milestone achievements (triggers toasts)
 * Location: src/domains/analytics/hooks/use-milestone-subscription.ts
 *
 * @example
 * useMilestoneSubscription({ businessId: business._id });
 */
export interface UseMilestoneSubscriptionOptions {
  businessId: string;
  enabled?: boolean;  // Enable/disable subscription (default: true)
  onMilestoneAchieved?: (threshold: 90 | 95 | 99) => void; // Callback on achievement
}

/**
 * Hook behavior:
 * - Subscribes to businesses table changes
 * - Detects new milestone achievements
 * - Triggers Sonner toast notification
 * - Prevents duplicate toasts (tracks shown milestones in session storage)
 */

// ============================================
// UTILITY TYPES
// ============================================

/**
 * Period selector option
 */
export interface PeriodOption {
  value: "today" | "week" | "month";
  label: string;  // "Today", "This Week", "This Month"
}

/**
 * Automation source breakdown
 */
export interface AutomationSourceBreakdown {
  name: string;          // "AR Reconciliation", "Bank Transactions", etc.
  total: number;         // Total decisions
  reviewed: number;      // Decisions reviewed
  rate: number;          // Source-specific automation rate
  color: string;         // Tailwind color class for visualization
}

// ============================================
// TOAST NOTIFICATION TYPES
// ============================================

/**
 * Milestone achievement toast configuration
 */
export interface MilestoneToastConfig {
  title: string;         // "🎉 Milestone Achieved!"
  description: string;   // "Your AI automation rate just hit 90%!"
  duration: number;      // Duration in ms (default: 5000)
  threshold: 90 | 95 | 99;
}

// ============================================
// STYLING CONSTANTS
// ============================================

/**
 * Tailwind color classes based on automation rate thresholds
 */
export const AutomationRateColors = {
  excellent: "text-green-600 bg-green-50",    // >= 95%
  good: "text-blue-600 bg-blue-50",           // 80-94%
  fair: "text-yellow-600 bg-yellow-50",       // 60-79%
  poor: "text-red-600 bg-red-50",             // < 60%
} as const;

/**
 * Helper function to get color class based on rate
 */
export function getAutomationRateColorClass(rate: number): string {
  if (rate >= 95) return AutomationRateColors.excellent;
  if (rate >= 80) return AutomationRateColors.good;
  if (rate >= 60) return AutomationRateColors.fair;
  return AutomationRateColors.poor;
}

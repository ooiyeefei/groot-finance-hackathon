/**
 * Timesheet & Attendance Types
 *
 * TypeScript interfaces for the timesheet-attendance domain.
 * These types represent the frontend view of Convex document data.
 */

import type { Id } from "../../../../convex/_generated/dataModel";

// ============================================
// ATTENDANCE RECORDS
// ============================================

export interface AttendanceRecord {
  _id: Id<"attendance_records">;
  _creationTime: number;
  businessId: Id<"businesses">;
  userId: Id<"users">;
  date: string;
  checkInTime: number;
  checkOutTime?: number;
  totalMinutes?: number;
  breakMinutes: number;
  status: "complete" | "incomplete" | "flagged" | "auto_closed";
  attendanceStatus: "present" | "late" | "early_departure" | "absent";
  latenessMinutes?: number;
  earlyDepartureMinutes?: number;
  hoursDeducted?: number;
  deductionWaived?: boolean;
  waivedBy?: Id<"users">;
  waivedReason?: string;
  source: "auto" | "manual" | "system";
  manualEditReason?: string;
  location?: { lat: number; lng: number; accuracy: number };
  locationFlagged?: boolean;
  notes?: string;
  updatedAt?: number;
}

// ============================================
// WORK SCHEDULES
// ============================================

export interface WorkSchedule {
  _id: Id<"work_schedules">;
  _creationTime: number;
  businessId: Id<"businesses">;
  name: string;
  startTime: string; // HH:MM
  endTime: string; // HH:MM
  workDays: number[]; // 0=Sun, 1=Mon, ..., 6=Sat
  breakMinutes: number;
  graceMinutes: number;
  regularHoursPerDay: number;
  overtimeRuleId?: Id<"overtime_rules">;
  isDefault: boolean;
  isActive: boolean;
  updatedAt?: number;
}

// ============================================
// OVERTIME RULES
// ============================================

export interface RateTier {
  label: string;
  multiplier: number;
  applicableOn: "weekday_ot" | "rest_day" | "public_holiday";
}

export interface OvertimeRule {
  _id: Id<"overtime_rules">;
  _creationTime: number;
  businessId: Id<"businesses">;
  name: string;
  calculationBasis: "daily" | "weekly" | "both";
  dailyThresholdHours?: number;
  weeklyThresholdHours?: number;
  requiresPreApproval: boolean;
  rateTiers: RateTier[];
  isActive: boolean;
  updatedAt?: number;
}

// ============================================
// TIMESHEETS
// ============================================

export interface DailyEntry {
  date: string;
  attendanceRecordId?: string;
  dayType: "workday" | "rest_day" | "public_holiday" | "leave";
  leaveType?: string;
  checkInTime?: number;
  checkOutTime?: number;
  regularMinutes: number;
  overtimeMinutes: number;
  overtimeTier?: string;
  attendanceStatus: string;
  latenessMinutes: number;
  earlyDepartureMinutes: number;
  hoursDeducted: number;
  deductionWaived: boolean;
  flags: string[];
}

export interface OvertimeByTier {
  tierLabel: string;
  multiplier: number;
  minutes: number;
}

export interface LeaveDaySummary {
  leaveType: string;
  days: number;
}

export interface Timesheet {
  _id: Id<"timesheets">;
  _creationTime: number;
  businessId: Id<"businesses">;
  userId: Id<"users">;
  payPeriodConfigId: Id<"pay_period_configs">;
  periodStartDate: string;
  periodEndDate: string;
  dailyEntries: DailyEntry[];
  totalRegularMinutes: number;
  totalOvertimeMinutes: number;
  overtimeByTier: OvertimeByTier[];
  leaveDays: LeaveDaySummary[];
  publicHolidayDays: number;
  attendanceDeductionMinutes: number;
  netPayableMinutes: number;
  hasAnomalies: boolean;
  anomalySummary?: string[];
  status: "draft" | "confirmed" | "approved" | "finalized" | "locked";
  confirmedAt?: number;
  confirmedBy?: "employee" | "system";
  approverId?: Id<"users">;
  approvedAt?: number;
  approverNotes?: string;
  finalizedAt?: number;
  lockedAt?: number;
  updatedAt?: number;
}

// ============================================
// PAYROLL ADJUSTMENTS
// ============================================

export interface PayrollAdjustment {
  _id: Id<"payroll_adjustments">;
  _creationTime: number;
  businessId: Id<"businesses">;
  userId: Id<"users">;
  originalTimesheetId: Id<"timesheets">;
  originalPeriodStartDate: string;
  adjustmentType: "hours_add" | "hours_deduct" | "ot_add" | "ot_deduct";
  minutes: number;
  overtimeTier?: string;
  reason: string;
  createdBy: Id<"users">;
  appliedToTimesheetId?: Id<"timesheets">;
  appliedAt?: number;
  updatedAt?: number;
}

// ============================================
// PAY PERIOD CONFIG
// ============================================

export interface PayPeriodConfig {
  _id: Id<"pay_period_configs">;
  _creationTime: number;
  businessId: Id<"businesses">;
  frequency: "weekly" | "biweekly" | "monthly";
  startDay: number;
  confirmationDeadlineDays: number;
  isActive: boolean;
  updatedAt?: number;
}

// ============================================
// ANOMALY FLAGS
// ============================================

export const ANOMALY_FLAGS = {
  MISSING_CHECKIN: "missing_checkin",
  INCOMPLETE_SESSION: "incomplete_session",
  MANUAL_EDIT: "manual_edit",
  OT_EXCEEDS_THRESHOLD: "ot_exceeds_threshold",
  LOCATION_OUTSIDE_GEOFENCE: "location_outside_geofence",
  LEAVE_ATTENDANCE_CONFLICT: "leave_attendance_conflict",
} as const;

export type AnomalyFlag = typeof ANOMALY_FLAGS[keyof typeof ANOMALY_FLAGS];

// ============================================
// DEFAULT CONFIGS
// ============================================

export const DEFAULT_WORK_SCHEDULE = {
  startTime: "09:00",
  endTime: "18:00",
  workDays: [1, 2, 3, 4, 5], // Mon-Fri
  breakMinutes: 60,
  graceMinutes: 15,
  regularHoursPerDay: 8,
} as const;

export const DEFAULT_PAY_PERIOD = {
  frequency: "monthly" as const,
  startDay: 1,
  confirmationDeadlineDays: 2,
} as const;

export const DEFAULT_OVERTIME_RATE_TIERS: RateTier[] = [
  { label: "Standard OT", multiplier: 1.5, applicableOn: "weekday_ot" },
  { label: "Rest Day", multiplier: 2.0, applicableOn: "rest_day" },
  { label: "Public Holiday", multiplier: 3.0, applicableOn: "public_holiday" },
];

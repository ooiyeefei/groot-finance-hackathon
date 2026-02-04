/**
 * Leave Management Domain Types
 *
 * Type definitions for the leave management module.
 * These types mirror the Convex schema but are platform-agnostic.
 */

import type { Id } from "../../../../convex/_generated/dataModel";
import { LEAVE_REQUEST_STATUSES, type LeaveRequestStatus } from "@/lib/constants/statuses";

// Re-export status constants and type
export { LEAVE_REQUEST_STATUSES };
export type { LeaveRequestStatus };

// ============================================
// LEAVE REQUEST
// ============================================

export interface LeaveRequest {
  _id: Id<"leave_requests">;
  _creationTime: number;
  businessId: Id<"businesses">;
  userId: Id<"users">;
  leaveTypeId: Id<"leave_types">;
  startDate: string;  // ISO date YYYY-MM-DD
  endDate: string;    // ISO date YYYY-MM-DD
  totalDays: number;
  status: LeaveRequestStatus;
  notes?: string;
  approverId?: Id<"users">;
  approverNotes?: string;
  approvedAt?: number;
  cancelledAt?: number;
  cancelReason?: string;
  submittedAt?: number;
  updatedAt?: number;
}

export interface CreateLeaveRequestInput {
  businessId: Id<"businesses">;
  leaveTypeId: Id<"leave_types">;
  startDate: string;
  endDate: string;
  notes?: string;
}

export interface UpdateLeaveRequestInput {
  id: Id<"leave_requests">;
  leaveTypeId?: Id<"leave_types">;
  startDate?: string;
  endDate?: string;
  notes?: string;
}

export interface ApproveLeaveRequestInput {
  id: Id<"leave_requests">;
  notes?: string;
}

export interface RejectLeaveRequestInput {
  id: Id<"leave_requests">;
  reason: string;  // Required for rejection
}

export interface CancelLeaveRequestInput {
  id: Id<"leave_requests">;
  reason?: string;
}

// ============================================
// LEAVE BALANCE
// ============================================

export interface LeaveBalance {
  _id: Id<"leave_balances">;
  _creationTime: number;
  businessId: Id<"businesses">;
  userId: Id<"users">;
  leaveTypeId: Id<"leave_types">;
  year: number;
  entitled: number;
  used: number;
  adjustments: number;
  carryover?: number;
  lastUpdated: number;
}

/**
 * Computed remaining balance
 * remaining = entitled - used + adjustments + (carryover ?? 0)
 */
export interface LeaveBalanceWithRemaining extends LeaveBalance {
  remaining: number;
}

export interface AdjustBalanceInput {
  balanceId: Id<"leave_balances">;
  adjustment: number;
  reason: string;
}

// ============================================
// LEAVE TYPE
// ============================================

export type CarryoverPolicy = "none" | "cap" | "unlimited";

export interface LeaveType {
  _id: Id<"leave_types">;
  _creationTime: number;
  businessId: Id<"businesses">;
  name: string;
  code: string;
  description?: string;
  color?: string;
  defaultDays: number;
  requiresApproval: boolean;
  deductsBalance: boolean;
  countryCode?: string;
  carryoverCap?: number;
  carryoverPolicy?: CarryoverPolicy;
  prorationEnabled?: boolean;
  isActive: boolean;
  sortOrder: number;
  updatedAt?: number;
}

export interface CreateLeaveTypeInput {
  businessId: Id<"businesses">;
  name: string;
  code: string;
  description?: string;
  defaultDays: number;
  requiresApproval?: boolean;
  deductsBalance?: boolean;
  countryCode?: string;
  color?: string;
}

export interface UpdateLeaveTypeInput {
  id: Id<"leave_types">;
  name?: string;
  description?: string;
  defaultDays?: number;
  requiresApproval?: boolean;
  deductsBalance?: boolean;
  color?: string;
  isActive?: boolean;
  sortOrder?: number;
  carryoverCap?: number;
  carryoverPolicy?: CarryoverPolicy;
  prorationEnabled?: boolean;
}

// ============================================
// PUBLIC HOLIDAY
// ============================================

export type SupportedCountryCode = "MY" | "SG" | "ID" | "PH" | "TH" | "VN";

export const SUPPORTED_COUNTRIES: Record<SupportedCountryCode, string> = {
  MY: "Malaysia",
  SG: "Singapore",
  ID: "Indonesia",
  PH: "Philippines",
  TH: "Thailand",
  VN: "Vietnam",
};

export interface PublicHoliday {
  _id: Id<"public_holidays">;
  _creationTime: number;
  businessId?: Id<"businesses">;
  countryCode: string;
  date: string;  // ISO date YYYY-MM-DD
  name: string;
  year: number;
  isCustom: boolean;
  updatedAt?: number;
}

export interface AddCustomHolidayInput {
  businessId: Id<"businesses">;
  date: string;
  name: string;
}

// ============================================
// TEAM CALENDAR
// ============================================

export interface CalendarLeaveEvent {
  requestId: Id<"leave_requests">;
  userId: Id<"users">;
  userName: string;
  leaveType: string;
  leaveTypeColor?: string;
  startDate: string;
  endDate: string;
  status: LeaveRequestStatus;
}

export interface CalendarResponse {
  leaveEvents: CalendarLeaveEvent[];
  holidays: PublicHoliday[];
  conflicts: string[];  // Dates with multiple absences (ISO date strings)
}

// ============================================
// DEFAULT LEAVE TYPES (for seeding)
// ============================================

export const DEFAULT_LEAVE_TYPES: Omit<LeaveType, "_id" | "_creationTime" | "businessId" | "updatedAt">[] = [
  {
    name: "Annual Leave",
    code: "ANNUAL",
    description: "Paid annual leave for rest and vacation",
    defaultDays: 14,
    requiresApproval: true,
    deductsBalance: true,
    color: "#3B82F6",  // Blue
    isActive: true,
    sortOrder: 1,
  },
  {
    name: "Sick Leave",
    code: "SICK",
    description: "Leave for illness or medical appointments",
    defaultDays: 14,
    requiresApproval: true,
    deductsBalance: true,
    color: "#EF4444",  // Red
    isActive: true,
    sortOrder: 2,
  },
  {
    name: "Medical Leave",
    code: "MEDICAL",
    description: "Extended leave for hospitalization or serious illness",
    defaultDays: 60,
    requiresApproval: true,
    deductsBalance: true,
    color: "#F97316",  // Orange
    isActive: true,
    sortOrder: 3,
  },
  {
    name: "Unpaid Leave",
    code: "UNPAID",
    description: "Leave without pay for personal matters",
    defaultDays: 0,
    requiresApproval: true,
    deductsBalance: false,
    color: "#6B7280",  // Gray
    isActive: true,
    sortOrder: 4,
  },
];

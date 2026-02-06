/**
 * Export Templates Domain Types
 *
 * Type definitions for the CSV Template Builder module.
 * These types mirror the Convex schema but are platform-agnostic.
 */

import type { Id } from "../../../../convex/_generated/dataModel";

// ============================================
// COMMON TYPES
// ============================================

export type ExportModule = "expense" | "leave";
export type ExportTemplateType = "custom" | "cloned";
export type ExportFrequency = "daily" | "weekly" | "monthly";
export type ExportHistoryStatus = "completed" | "failed" | "archived";
export type ExportTrigger = "manual" | "schedule";
export type ThousandSeparator = "comma" | "none";
export type DateRangeType =
  | "previous_day"
  | "previous_week"
  | "previous_month"
  | "month_to_date"
  | "year_to_date";

// ============================================
// FIELD MAPPING
// ============================================

export interface FieldMapping {
  sourceField: string;
  targetColumn: string;
  order: number;
  dateFormat?: string;
  decimalPlaces?: number;
  thousandSeparator?: ThousandSeparator;
}

export interface FieldDefinition {
  id: string;
  label: string;
  type: "text" | "number" | "date";
}

// ============================================
// EXPORT TEMPLATE
// ============================================

export interface ExportTemplate {
  _id: Id<"export_templates">;
  _creationTime: number;
  businessId: Id<"businesses">;
  name: string;
  description?: string;
  module: ExportModule;
  type: ExportTemplateType;
  clonedFromId?: string;
  clonedFromVersion?: string;
  fieldMappings: FieldMapping[];
  defaultDateFormat?: string;
  defaultDecimalPlaces?: number;
  defaultThousandSeparator?: ThousandSeparator;
  createdBy: Id<"users">;
  updatedBy?: Id<"users">;
  updatedAt?: number;
}

export interface CreateTemplateInput {
  businessId: Id<"businesses">;
  name: string;
  module: ExportModule;
  fieldMappings: FieldMapping[];
  description?: string;
  defaultDateFormat?: string;
  defaultDecimalPlaces?: number;
  defaultThousandSeparator?: ThousandSeparator;
}

export interface UpdateTemplateInput {
  templateId: Id<"export_templates">;
  name?: string;
  fieldMappings?: FieldMapping[];
  description?: string;
  defaultDateFormat?: string;
  defaultDecimalPlaces?: number;
  defaultThousandSeparator?: ThousandSeparator;
}

export interface CloneTemplateInput {
  businessId: Id<"businesses">;
  prebuiltId: string;
  name: string;
}

// ============================================
// PRE-BUILT TEMPLATE
// ============================================

export interface PrebuiltTemplate {
  id: string;
  name: string;
  description: string;
  module: ExportModule;
  version: string;
  targetSystem: string;
  fieldMappings: FieldMapping[];
  defaultDateFormat?: string;
  defaultDecimalPlaces?: number;
}

// ============================================
// EXPORT FILTERS
// ============================================

export interface ExportFilters {
  startDate?: string;
  endDate?: string;
  statusFilter?: string[];
  employeeIds?: string[];
  dateRangeType?: DateRangeType;
}

/**
 * Schedule-specific filters (no start/end date - uses dateRangeType for relative dates)
 */
export interface ScheduleFilters {
  statusFilter?: string[];
  employeeIds?: Id<"users">[];
  dateRangeType?: DateRangeType;
}

// ============================================
// EXPORT SCHEDULE
// ============================================

export interface ExportSchedule {
  _id: Id<"export_schedules">;
  _creationTime: number;
  businessId: Id<"businesses">;
  templateId?: Id<"export_templates">;
  prebuiltTemplateId?: string;
  frequency: ExportFrequency;
  hourUtc: number;
  minuteUtc?: number;
  dayOfWeek?: number;
  dayOfMonth?: number;
  filters?: ScheduleFilters;
  isEnabled: boolean;
  lastRunAt?: number;
  nextRunAt: number;
  createdBy: Id<"users">;
  updatedAt?: number;
}

export interface CreateScheduleInput {
  businessId: Id<"businesses">;
  templateId?: Id<"export_templates">;
  prebuiltId?: string;
  frequency: ExportFrequency;
  hourUtc: number;
  minuteUtc?: number;
  dayOfWeek?: number;
  dayOfMonth?: number;
  filters?: ScheduleFilters;
}

export interface UpdateScheduleInput {
  scheduleId: Id<"export_schedules">;
  frequency?: ExportFrequency;
  hourUtc?: number;
  minuteUtc?: number;
  dayOfWeek?: number;
  dayOfMonth?: number;
  filters?: ScheduleFilters;
}

// ============================================
// EXPORT HISTORY
// ============================================

export interface ExportHistory {
  _id: Id<"export_history">;
  _creationTime: number;
  businessId: Id<"businesses">;
  templateId?: Id<"export_templates">;
  prebuiltTemplateId?: string;
  templateName: string;
  module: ExportModule;
  recordCount: number;
  fileSize: number;
  storageId?: Id<"_storage">;
  filters?: ExportFilters;
  status: ExportHistoryStatus;
  errorMessage?: string;
  triggeredBy: ExportTrigger;
  scheduleId?: Id<"export_schedules">;
  initiatedBy?: Id<"users">;
  completedAt?: number;
  expiresAt?: number;
}

// ============================================
// PREVIEW RESPONSE
// ============================================

export interface ExportPreviewResponse {
  columns: string[];
  rows: (string | number | null)[][];
  totalCount: number;
}

// ============================================
// COMBINED TEMPLATE LIST ITEM
// ============================================

export interface TemplateListItem {
  id: string;
  name: string;
  description?: string;
  module: ExportModule;
  isPrebuilt: boolean;
  targetSystem?: string;
  fieldCount: number;
}

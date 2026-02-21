/**
 * Timesheet Generator
 * Aggregates attendance records, leave, and holidays into a period timesheet.
 */

import type { DailyEntry, OvertimeByTier, LeaveDaySummary } from "../types";
import { ANOMALY_FLAGS } from "../types";
import { calculateDailyOvertime } from "./overtime-calculator";
import { isWorkday } from "./attendance-classifier";
import type { RateTier } from "../types";

interface GeneratorInput {
  periodStartDate: string; // YYYY-MM-DD
  periodEndDate: string;
  workDays: number[];
  regularMinutesPerDay: number;
  breakMinutes: number;
  graceMinutes: number;
  rateTiers: RateTier[];
  attendanceRecords: Array<{
    _id: string;
    date: string;
    checkInTime: number;
    checkOutTime?: number;
    totalMinutes?: number;
    status: string;
    attendanceStatus: string;
    latenessMinutes?: number;
    earlyDepartureMinutes?: number;
    hoursDeducted?: number;
    deductionWaived?: boolean;
    source: string;
    locationFlagged?: boolean;
  }>;
  leaveRequests: Array<{
    startDate: string;
    endDate: string;
    leaveTypeName: string;
    status: string;
  }>;
  publicHolidays: Array<{
    date: string;
    name: string;
  }>;
}

interface GeneratorResult {
  dailyEntries: DailyEntry[];
  totalRegularMinutes: number;
  totalOvertimeMinutes: number;
  overtimeByTier: OvertimeByTier[];
  leaveDays: LeaveDaySummary[];
  publicHolidayDays: number;
  attendanceDeductionMinutes: number;
  netPayableMinutes: number;
  hasAnomalies: boolean;
  anomalySummary: string[];
}

/**
 * Generate all dates in a period range.
 */
function getDateRange(start: string, end: string): string[] {
  const dates: string[] = [];
  const current = new Date(start + "T00:00:00Z");
  const endDate = new Date(end + "T00:00:00Z");
  while (current <= endDate) {
    dates.push(current.toISOString().split("T")[0]);
    current.setUTCDate(current.getUTCDate() + 1);
  }
  return dates;
}

/**
 * Generate a timesheet from attendance records, leave, and holidays.
 */
export function generateTimesheet(input: GeneratorInput): GeneratorResult {
  const {
    periodStartDate, periodEndDate, workDays, regularMinutesPerDay,
    rateTiers, attendanceRecords, leaveRequests, publicHolidays,
  } = input;

  const dates = getDateRange(periodStartDate, periodEndDate);
  const recordsByDate = new Map(attendanceRecords.map((r) => [r.date, r]));
  const holidayDates = new Set(publicHolidays.map((h) => h.date));

  const dailyEntries: DailyEntry[] = [];
  const anomalies: string[] = [];
  const otByTierMap = new Map<string, OvertimeByTier>();
  const leaveCountMap = new Map<string, number>();
  let totalRegularMinutes = 0;
  let totalOvertimeMinutes = 0;
  let publicHolidayDays = 0;
  let attendanceDeductionMinutes = 0;

  for (const date of dates) {
    const record = recordsByDate.get(date);
    const isHoliday = holidayDates.has(date);
    const isWork = isWorkday(date, workDays);

    // Check if on leave
    const leaveForDay = leaveRequests.find(
      (lr) => lr.status === "approved" && date >= lr.startDate && date <= lr.endDate
    );

    // Determine day type
    let dayType: DailyEntry["dayType"] = "workday";
    if (leaveForDay) dayType = "leave";
    else if (isHoliday) dayType = "public_holiday";
    else if (!isWork) dayType = "rest_day";

    const flags: string[] = [];

    // Leave day
    if (dayType === "leave") {
      const leaveType = leaveForDay!.leaveTypeName;
      leaveCountMap.set(leaveType, (leaveCountMap.get(leaveType) ?? 0) + 1);
      // Check leave-attendance conflict
      if (record) {
        flags.push(ANOMALY_FLAGS.LEAVE_ATTENDANCE_CONFLICT);
        anomalies.push(`Leave-attendance conflict on ${date}`);
      }
      dailyEntries.push({
        date, attendanceRecordId: record?._id, dayType, leaveType,
        checkInTime: undefined, checkOutTime: undefined,
        regularMinutes: 0, overtimeMinutes: 0, overtimeTier: undefined,
        attendanceStatus: "on_leave", latenessMinutes: 0, earlyDepartureMinutes: 0,
        hoursDeducted: 0, deductionWaived: false, flags,
      });
      continue;
    }

    // Public holiday (no work expected)
    if (dayType === "public_holiday") {
      publicHolidayDays++;
      if (record && record.totalMinutes && record.totalMinutes > 0) {
        // Worked on holiday - classify as holiday OT
        const otResult = calculateDailyOvertime({
          workedMinutes: record.totalMinutes,
          regularMinutesPerDay,
          dayType: "public_holiday",
          rateTiers,
        });
        totalOvertimeMinutes += otResult.overtimeMinutes;
        if (otResult.overtimeTier) {
          const existing = otByTierMap.get(otResult.overtimeTier);
          if (existing) existing.minutes += otResult.overtimeMinutes;
          else otByTierMap.set(otResult.overtimeTier, { tierLabel: otResult.overtimeTier, multiplier: otResult.multiplier, minutes: otResult.overtimeMinutes });
        }
        dailyEntries.push({
          date, attendanceRecordId: record._id, dayType,
          leaveType: undefined, checkInTime: record.checkInTime, checkOutTime: record.checkOutTime,
          regularMinutes: 0, overtimeMinutes: otResult.overtimeMinutes,
          overtimeTier: otResult.overtimeTier ?? undefined, attendanceStatus: record.attendanceStatus,
          latenessMinutes: 0, earlyDepartureMinutes: 0, hoursDeducted: 0, deductionWaived: false, flags,
        });
      } else {
        dailyEntries.push({
          date, attendanceRecordId: undefined, dayType,
          leaveType: undefined, checkInTime: undefined, checkOutTime: undefined,
          regularMinutes: 0, overtimeMinutes: 0, overtimeTier: undefined,
          attendanceStatus: "public_holiday", latenessMinutes: 0, earlyDepartureMinutes: 0,
          hoursDeducted: 0, deductionWaived: false, flags,
        });
      }
      continue;
    }

    // Rest day
    if (dayType === "rest_day") {
      if (record && record.totalMinutes && record.totalMinutes > 0) {
        const otResult = calculateDailyOvertime({
          workedMinutes: record.totalMinutes,
          regularMinutesPerDay,
          dayType: "rest_day",
          rateTiers,
        });
        totalOvertimeMinutes += otResult.overtimeMinutes;
        if (otResult.overtimeTier) {
          const existing = otByTierMap.get(otResult.overtimeTier);
          if (existing) existing.minutes += otResult.overtimeMinutes;
          else otByTierMap.set(otResult.overtimeTier, { tierLabel: otResult.overtimeTier, multiplier: otResult.multiplier, minutes: otResult.overtimeMinutes });
        }
        dailyEntries.push({
          date, attendanceRecordId: record._id, dayType,
          leaveType: undefined, checkInTime: record.checkInTime, checkOutTime: record.checkOutTime,
          regularMinutes: 0, overtimeMinutes: otResult.overtimeMinutes,
          overtimeTier: otResult.overtimeTier ?? undefined, attendanceStatus: record.attendanceStatus,
          latenessMinutes: 0, earlyDepartureMinutes: 0, hoursDeducted: 0, deductionWaived: false, flags,
        });
      } else {
        dailyEntries.push({
          date, attendanceRecordId: undefined, dayType,
          leaveType: undefined, checkInTime: undefined, checkOutTime: undefined,
          regularMinutes: 0, overtimeMinutes: 0, overtimeTier: undefined,
          attendanceStatus: "rest_day", latenessMinutes: 0, earlyDepartureMinutes: 0,
          hoursDeducted: 0, deductionWaived: false, flags,
        });
      }
      continue;
    }

    // Workday — need attendance
    if (!record) {
      flags.push(ANOMALY_FLAGS.MISSING_CHECKIN);
      anomalies.push(`Missing check-in on ${date}`);
      dailyEntries.push({
        date, attendanceRecordId: undefined, dayType,
        leaveType: undefined, checkInTime: undefined, checkOutTime: undefined,
        regularMinutes: 0, overtimeMinutes: 0, overtimeTier: undefined,
        attendanceStatus: "absent", latenessMinutes: 0, earlyDepartureMinutes: 0,
        hoursDeducted: 0, deductionWaived: false, flags,
      });
      continue;
    }

    // Check flags
    if (record.status === "auto_closed") {
      flags.push(ANOMALY_FLAGS.INCOMPLETE_SESSION);
      anomalies.push(`Incomplete session on ${date} (auto-closed)`);
    }
    if (record.source === "manual") {
      flags.push(ANOMALY_FLAGS.MANUAL_EDIT);
      anomalies.push(`Manual edit on ${date}`);
    }
    if (record.locationFlagged) {
      flags.push(ANOMALY_FLAGS.LOCATION_OUTSIDE_GEOFENCE);
      anomalies.push(`Location outside geofence on ${date}`);
    }

    const workedMinutes = record.totalMinutes ?? 0;
    const otResult = calculateDailyOvertime({
      workedMinutes,
      regularMinutesPerDay,
      dayType: "workday",
      rateTiers,
    });

    totalRegularMinutes += otResult.regularMinutes;
    totalOvertimeMinutes += otResult.overtimeMinutes;

    if (otResult.overtimeTier && otResult.overtimeMinutes > 0) {
      const existing = otByTierMap.get(otResult.overtimeTier);
      if (existing) existing.minutes += otResult.overtimeMinutes;
      else otByTierMap.set(otResult.overtimeTier, { tierLabel: otResult.overtimeTier, multiplier: otResult.multiplier, minutes: otResult.overtimeMinutes });
    }

    const deductionMinutes = record.deductionWaived ? 0 : ((record.latenessMinutes ?? 0) + (record.earlyDepartureMinutes ?? 0));
    attendanceDeductionMinutes += deductionMinutes;

    dailyEntries.push({
      date,
      attendanceRecordId: record._id,
      dayType,
      leaveType: undefined,
      checkInTime: record.checkInTime,
      checkOutTime: record.checkOutTime,
      regularMinutes: otResult.regularMinutes,
      overtimeMinutes: otResult.overtimeMinutes,
      overtimeTier: otResult.overtimeTier ?? undefined,
      attendanceStatus: record.attendanceStatus,
      latenessMinutes: record.latenessMinutes ?? 0,
      earlyDepartureMinutes: record.earlyDepartureMinutes ?? 0,
      hoursDeducted: record.deductionWaived ? 0 : (record.hoursDeducted ?? 0),
      deductionWaived: record.deductionWaived ?? false,
      flags,
    });
  }

  const overtimeByTier = Array.from(otByTierMap.values());
  const leaveDays = Array.from(leaveCountMap.entries()).map(([leaveType, days]) => ({ leaveType, days }));
  const netPayableMinutes = totalRegularMinutes + totalOvertimeMinutes - attendanceDeductionMinutes;
  const hasAnomalies = anomalies.length > 0;

  return {
    dailyEntries,
    totalRegularMinutes,
    totalOvertimeMinutes,
    overtimeByTier,
    leaveDays,
    publicHolidayDays,
    attendanceDeductionMinutes,
    netPayableMinutes: Math.max(0, netPayableMinutes),
    hasAnomalies,
    anomalySummary: anomalies,
  };
}

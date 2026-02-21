/**
 * Overtime Calculator
 * Classifies work hours as regular or overtime by rate tier.
 */

import type { RateTier } from "../types";

interface OvertimeInput {
  workedMinutes: number;
  regularMinutesPerDay: number;
  dayType: "workday" | "rest_day" | "public_holiday";
  rateTiers: RateTier[];
}

interface OvertimeResult {
  regularMinutes: number;
  overtimeMinutes: number;
  overtimeTier: string | null;
  multiplier: number;
}

/**
 * Calculate daily overtime classification.
 * On workdays: hours beyond regularMinutesPerDay are OT at "weekday_ot" tier.
 * On rest days: all hours are OT at "rest_day" tier.
 * On public holidays: all hours are OT at "public_holiday" tier.
 */
export function calculateDailyOvertime(input: OvertimeInput): OvertimeResult {
  const { workedMinutes, regularMinutesPerDay, dayType, rateTiers } = input;

  if (workedMinutes <= 0) {
    return { regularMinutes: 0, overtimeMinutes: 0, overtimeTier: null, multiplier: 1 };
  }

  // Rest day or public holiday: all hours are OT
  if (dayType === "rest_day" || dayType === "public_holiday") {
    const applicableOn = dayType === "rest_day" ? "rest_day" : "public_holiday";
    const tier = rateTiers.find((t) => t.applicableOn === applicableOn);
    return {
      regularMinutes: 0,
      overtimeMinutes: workedMinutes,
      overtimeTier: tier?.label ?? applicableOn,
      multiplier: tier?.multiplier ?? (dayType === "rest_day" ? 2.0 : 3.0),
    };
  }

  // Workday: hours beyond threshold are weekday OT
  if (workedMinutes <= regularMinutesPerDay) {
    return { regularMinutes: workedMinutes, overtimeMinutes: 0, overtimeTier: null, multiplier: 1 };
  }

  const regularMinutes = regularMinutesPerDay;
  const overtimeMinutes = workedMinutes - regularMinutesPerDay;
  const tier = rateTiers.find((t) => t.applicableOn === "weekday_ot");

  return {
    regularMinutes,
    overtimeMinutes,
    overtimeTier: tier?.label ?? "Standard OT",
    multiplier: tier?.multiplier ?? 1.5,
  };
}

/**
 * Calculate weekly overtime (hours beyond weekly threshold).
 * Called after daily classification to catch additional weekly OT.
 */
export function calculateWeeklyOvertime(
  totalWeeklyWorkedMinutes: number,
  totalWeeklyRegularMinutes: number,
  weeklyThresholdMinutes: number,
  rateTiers: RateTier[]
): { additionalOvertimeMinutes: number; tier: string | null; multiplier: number } {
  if (totalWeeklyRegularMinutes <= weeklyThresholdMinutes) {
    return { additionalOvertimeMinutes: 0, tier: null, multiplier: 1 };
  }

  const additionalOvertimeMinutes = totalWeeklyRegularMinutes - weeklyThresholdMinutes;
  const tier = rateTiers.find((t) => t.applicableOn === "weekday_ot");

  return {
    additionalOvertimeMinutes,
    tier: tier?.label ?? "Standard OT",
    multiplier: tier?.multiplier ?? 1.5,
  };
}

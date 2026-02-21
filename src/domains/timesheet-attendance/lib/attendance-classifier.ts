/**
 * Attendance Classifier
 * Determines attendance status and calculates deductions based on work schedule.
 */

interface ClassifyInput {
  checkInTime: number; // Unix timestamp
  checkOutTime: number | undefined;
  scheduleStartTime: string; // "HH:MM"
  scheduleEndTime: string; // "HH:MM"
  graceMinutes: number;
  breakMinutes: number;
  date: string; // YYYY-MM-DD for schedule anchor
}

interface ClassifyResult {
  attendanceStatus: "present" | "late" | "early_departure" | "absent";
  latenessMinutes: number;
  earlyDepartureMinutes: number;
  hoursDeducted: number;
  totalWorkedMinutes: number;
}

function parseTimeToMinutesOfDay(time: string): number {
  const [hours, minutes] = time.split(":").map(Number);
  return hours * 60 + minutes;
}

function getMinutesOfDay(timestamp: number): number {
  const date = new Date(timestamp);
  return date.getUTCHours() * 60 + date.getUTCMinutes();
}

/**
 * Classify a single day's attendance record.
 */
export function classifyAttendance(input: ClassifyInput): ClassifyResult {
  const { checkInTime, checkOutTime, scheduleStartTime, scheduleEndTime, graceMinutes, breakMinutes } = input;

  const scheduledStart = parseTimeToMinutesOfDay(scheduleStartTime);
  const scheduledEnd = parseTimeToMinutesOfDay(scheduleEndTime);
  const actualStart = getMinutesOfDay(checkInTime);

  // Calculate lateness (beyond grace period)
  let latenessMinutes = 0;
  if (actualStart > scheduledStart + graceMinutes) {
    latenessMinutes = actualStart - scheduledStart;
  }

  // Calculate early departure (beyond grace period)
  let earlyDepartureMinutes = 0;
  if (checkOutTime) {
    const actualEnd = getMinutesOfDay(checkOutTime);
    if (actualEnd < scheduledEnd - graceMinutes) {
      earlyDepartureMinutes = scheduledEnd - actualEnd;
    }
  }

  // Calculate total worked minutes
  let totalWorkedMinutes = 0;
  if (checkOutTime) {
    totalWorkedMinutes = Math.max(0, Math.floor((checkOutTime - checkInTime) / 60000) - breakMinutes);
  }

  // Calculate hours deducted (in decimal hours)
  const hoursDeducted = (latenessMinutes + earlyDepartureMinutes) / 60;

  // Determine status
  let attendanceStatus: ClassifyResult["attendanceStatus"] = "present";
  if (latenessMinutes > 0 && earlyDepartureMinutes > 0) {
    // Both late and early departure — use the worse one
    attendanceStatus = latenessMinutes >= earlyDepartureMinutes ? "late" : "early_departure";
  } else if (latenessMinutes > 0) {
    attendanceStatus = "late";
  } else if (earlyDepartureMinutes > 0) {
    attendanceStatus = "early_departure";
  }

  return {
    attendanceStatus,
    latenessMinutes,
    earlyDepartureMinutes,
    hoursDeducted,
    totalWorkedMinutes,
  };
}

/**
 * Check if a given date is a workday for the given work schedule.
 */
export function isWorkday(date: string, workDays: number[]): boolean {
  const dayOfWeek = new Date(date + "T00:00:00Z").getUTCDay();
  return workDays.includes(dayOfWeek);
}

/**
 * Role-Based Data Access Filter
 *
 * Determines which records a user can access based on their role.
 * Used for exports to ensure employees only export their own data,
 * managers see their team's data, and admins see all data.
 */

import type { Id } from "../../../../convex/_generated/dataModel";

// ============================================
// TYPES
// ============================================

export type UserRole = "owner" | "finance_admin" | "manager" | "employee";

export interface DataAccessScope {
  /** Access all records in the business */
  allRecords: boolean;
  /** Access only specific user IDs (for managers) */
  userIds?: Id<"users">[];
  /** Access only own records (for employees) */
  ownRecordsOnly: boolean;
}

export interface MembershipInfo {
  userId: Id<"users">;
  businessId: Id<"businesses">;
  role: UserRole;
  managerId?: Id<"users">;
}

// ============================================
// ACCESS SCOPE DETERMINATION
// ============================================

/**
 * Determine the data access scope based on user role
 *
 * Rules:
 * - owner/finance_admin: Can access all records in the business
 * - manager: Can access their direct reports' records + own records
 * - employee: Can only access their own records
 */
export function getDataAccessScope(
  userRole: UserRole,
  userId: Id<"users">,
  directReportIds?: Id<"users">[]
): DataAccessScope {
  switch (userRole) {
    case "owner":
    case "finance_admin":
      return {
        allRecords: true,
        ownRecordsOnly: false,
      };

    case "manager":
      // Managers can see their direct reports + themselves
      const userIds = directReportIds ? [...directReportIds, userId] : [userId];
      return {
        allRecords: false,
        userIds,
        ownRecordsOnly: false,
      };

    case "employee":
    default:
      return {
        allRecords: false,
        userIds: [userId],
        ownRecordsOnly: true,
      };
  }
}

/**
 * Check if a user can access a specific record
 *
 * @param scope - The user's data access scope
 * @param recordUserId - The user ID associated with the record
 * @returns Whether the user can access the record
 */
export function canAccessRecord(
  scope: DataAccessScope,
  recordUserId: Id<"users">
): boolean {
  if (scope.allRecords) {
    return true;
  }

  if (scope.userIds) {
    return scope.userIds.includes(recordUserId);
  }

  return false;
}

/**
 * Get the role hierarchy level (higher = more access)
 */
export function getRoleLevel(role: UserRole): number {
  switch (role) {
    case "owner":
      return 4;
    case "finance_admin":
      return 3;
    case "manager":
      return 2;
    case "employee":
    default:
      return 1;
  }
}

/**
 * Check if user has admin-level access (can manage templates/schedules)
 */
export function hasAdminAccess(role: UserRole): boolean {
  return role === "owner" || role === "finance_admin";
}

/**
 * Check if user can manage schedules
 */
export function canManageSchedules(role: UserRole): boolean {
  return hasAdminAccess(role);
}

/**
 * Check if user can create/edit/delete custom templates
 */
export function canManageTemplates(role: UserRole): boolean {
  return hasAdminAccess(role);
}

/**
 * Check if user can export data (all roles can export, scope varies)
 */
export function canExportData(_role: UserRole): boolean {
  // All roles can export, but the data they see is filtered by scope
  return true;
}

// ============================================
// FILTER HELPERS
// ============================================

/**
 * Filter an array of records based on data access scope
 */
export function filterRecordsByScope<
  T extends { userId: Id<"users"> }
>(records: T[], scope: DataAccessScope): T[] {
  if (scope.allRecords) {
    return records;
  }

  return records.filter((record) => canAccessRecord(scope, record.userId));
}

/**
 * Build a user ID filter for Convex queries
 * Returns null if all records should be returned (admin access)
 */
export function buildUserIdFilter(
  scope: DataAccessScope
): Id<"users">[] | null {
  if (scope.allRecords) {
    return null; // No filter needed
  }

  return scope.userIds || [];
}

/**
 * Get a human-readable description of the access scope
 */
export function describeAccessScope(scope: DataAccessScope): string {
  if (scope.allRecords) {
    return "All business records";
  }

  if (scope.ownRecordsOnly) {
    return "Your own records only";
  }

  if (scope.userIds && scope.userIds.length > 1) {
    return `Your records and ${scope.userIds.length - 1} team member(s)`;
  }

  return "Your own records";
}

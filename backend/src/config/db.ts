import { PrismaClient } from "@prisma/client";

/**
 * Connects to the existing PostgreSQL database without modifying the schema.
 * Always use SAFE_EMPLOYEE_SELECT when returning employee records so password hashes
 * are never serialized to clients (fixes S4, M10, P2, A3, T9, H4, AS2, AC2).
 */
export const prisma = new PrismaClient({
  log: process.env.NODE_ENV === "development" ? ["warn", "error"] : ["error"],
});

export const SAFE_EMPLOYEE_SELECT = {
  id: true,
  employeeId: true,
  firstName: true,
  lastName: true,
  officeEmail: true,
  designation: true,
  department: true,
  role: true,
  status: true,
  approvalStatus: true,
  isApproved: true,
  approvedAt: true,
  approvedBy: true,
  profileImage: true,
  reportingManager: true,
  reportingPartner: true,
  managerId: true,
  partnerId: true,
  subManagerId: true,
  reportingManagerIds: true,
  reportingPartnerIds: true,
  subManagerIds: true,
  hasAccountsAccess: true,
  roleId: true,
  designationId: true,
  departmentId: true,
  shiftId: true,
  locationId: true,
  createdAt: true,
  updatedAt: true,
} as const;

export function stripPassword<T extends Record<string, any> | null | undefined>(record: T): T {
  if (!record || typeof record !== "object") return record;
  const copy: Record<string, any> = Array.isArray(record) ? [...record] : { ...record };
  delete copy.password;
  for (const [k, v] of Object.entries(copy)) {
    if (v && typeof v === "object" && !(v instanceof Date)) {
      copy[k] = stripPassword(v);
    }
  }
  return copy as T;
}

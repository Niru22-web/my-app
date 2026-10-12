// Single source of truth for role handling in the new portal.
// Role strings in the database are free-form with mixed casing ("Admin", "HR", "ACCOUNTS"),
// so everything is compared lower-cased.

export const ACCOUNTS_ROLES = [
  "accounts",
  "accounts_admin",
  "accounts_manager",
  "accounts_executive",
  "finance_approver",
  "ar_manager",
  "ap_manager",
  "accountant",
] as const;

export function normRole(role: string | null | undefined): string {
  return (role ?? "").trim().toLowerCase();
}

export function roleInfo(role: string | null | undefined) {
  const r = normRole(role);
  const isAccounts = (ACCOUNTS_ROLES as readonly string[]).includes(r);
  return {
    role: r,
    isAdmin: r === "admin",
    isOwner: r === "owner",
    isIT: r === "it",
    isHR: r === "hr",
    isManager: r === "manager",
    isPartner: r === "partner",
    isAccounts,
    isEmployee: r === "employee" || r === "user" || r === "",
    /** Sees firm-wide figures (matches backend scoping for activity and compliance). */
    isFirmWide: r === "admin" || r === "owner" || r === "it" || r === "hr",
    /** Approves leave, reimbursements, assets or tickets for others. */
    isApprover: ["admin", "owner", "it", "hr", "manager", "partner"].includes(r) || isAccounts,
    /** Uses the employee-facing asset request flow instead of asset administration. */
    isAssetRequester: ["employee", "user", "manager", "partner", "accountant"].includes(r),
  };
}

export type RoleInfo = ReturnType<typeof roleInfo>;

export function roleLabel(role: string | null | undefined): string {
  const r = normRole(role);
  const labels: Record<string, string> = {
    admin: "Administrator",
    owner: "Owner",
    it: "IT",
    hr: "HR",
    manager: "Manager",
    partner: "Partner",
    employee: "Employee",
    user: "Employee",
    accounts: "Accounts",
    accounts_admin: "Accounts Admin",
    accounts_manager: "Accounts Manager",
    accounts_executive: "Accounts Executive",
    finance_approver: "Finance Approver",
    ar_manager: "AR Manager",
    ap_manager: "AP Manager",
    accountant: "Accountant",
  };
  return labels[r] ?? (role ? role.replace(/_/g, " ") : "Employee");
}

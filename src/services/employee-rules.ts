// Pure employee-access rules shared by the employee services and the UI. A real backend should apply the same rules.
import type { EmployeeStatus } from "@/types/models";

export const EMPLOYEE_STATUSES: EmployeeStatus[] = ["Active", "Invitation Pending", "Inactive", "Suspended"];
/** Statuses an administrator may pick. "Invitation Pending" is set automatically only. */
export const ASSIGNABLE_STATUSES = ["Active", "Inactive", "Suspended"] as const;
export type AssignableStatus = (typeof ASSIGNABLE_STATUSES)[number];

export const isBlockedStatus = (s: EmployeeStatus) => s === "Inactive" || s === "Suspended";

/**
 * Final status after an administrator picks a new one. An employee who has not yet
 * signed in and chosen a password stays "Invitation Pending" when reactivated.
 */
export function resolveStatusChange(requested: string, mustChangePassword: boolean): EmployeeStatus {
  if (requested === "Invitation Pending") throw new Error("Invitation Pending is set automatically and can't be chosen.");
  if (!(ASSIGNABLE_STATUSES as readonly string[]).includes(requested)) throw new Error("Choose a valid account status.");
  if (requested === "Active" && mustChangePassword) return "Invitation Pending";
  return requested as EmployeeStatus;
}

/** At least one active Administrator must always remain. */
export function assertKeepsAdministrator(opts: { targetIsActiveAdmin: boolean; remainsActiveAdmin: boolean; otherActiveAdmins: number }) {
  if (opts.targetIsActiveAdmin && !opts.remainsActiveAdmin && opts.otherActiveAdmins < 1) {
    throw new Error("At least one active Administrator must remain.");
  }
}

export function roleDeletionBlocker(role: { is_system: boolean }, assignedCount: number): string | null {
  if (role.is_system) return "System roles can't be deleted.";
  if (assignedCount > 0) return `Reassign the ${assignedCount} employee${assignedCount === 1 ? "" : "s"} using this role before deleting it.`;
  return null;
}

/** Requirements an employee-chosen password must meet. Returns unmet requirements. */
export function passwordIssues(pw: string): string[] {
  const issues: string[] = [];
  if (pw.length < 12) issues.push("At least 12 characters");
  if (!/[A-Z]/.test(pw)) issues.push("An uppercase letter");
  if (!/[a-z]/.test(pw)) issues.push("A lowercase letter");
  if (!/[0-9]/.test(pw)) issues.push("A number");
  return issues;
}

const SETS = ["ABCDEFGHJKLMNPQRSTUVWXYZ", "abcdefghijkmnopqrstuvwxyz", "23456789", "!@#$%*?-"];

function randomIndex(n: number) {
  const a = new Uint32Array(1);
  crypto.getRandomValues(a);
  return (a[0] ?? 0) % n;
}

/** Unique, random temporary password. Administrators never choose or share a password. */
export function generateTemporaryPassword(length = 16): string {
  const all = SETS.join("");
  const chars = SETS.map((s) => s.charAt(randomIndex(s.length)));
  while (chars.length < length) chars.push(all.charAt(randomIndex(all.length)));
  for (let i = chars.length - 1; i > 0; i--) {
    const j = randomIndex(i + 1);
    const t = chars[i] ?? "";
    chars[i] = chars[j] ?? "";
    chars[j] = t;
  }
  return chars.join("");
}

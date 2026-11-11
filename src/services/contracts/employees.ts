// Employee directory contract: record shapes, validated inputs and the admin API every backend implements.
// Field names match the reference schema in docs/schema.sql.
import { z } from "zod";
import type { EmployeeStatus } from "@/types/models";
import { DEPARTMENTS, LANDING_PAGES, isPermission } from "../permissions";

export type JsonValue =
  string | number | boolean | null | { [key: string]: JsonValue | undefined } | JsonValue[];

export interface RoleRecord {
  id: string;
  name: string;
  description: string;
  department: string | null;
  /** Route the employee lands on after sign-in. */
  landing_page: string;
  permissions: string[];
  /** System roles ship with Renda Admin and can't be renamed or deleted. */
  is_system: boolean;
  created_at: string;
  updated_at: string;
}

export interface EmployeeRow {
  id: string;
  /** Human-readable employee ID, e.g. EMP-1001. */
  employee_code: string;
  first_name: string;
  last_name: string;
  email: string;
  department: string;
  job_title: string | null;
  phone: string | null;
  status: EmployeeStatus;
  /** True until the employee replaces their system-generated temporary password. */
  must_change_password: boolean;
  last_login_at: string | null;
  created_by: string | null;
  created_at: string;
  updated_at: string;
}

export interface RoleAssignment {
  user_id: string;
  role_id: string;
  assigned_at: string;
}

export interface AdminAuditRecord {
  id: string;
  actor_id: string | null;
  actor_name: string;
  action: string;
  module: string;
  entity_type: string;
  entity_id: string;
  entity_label: string;
  outcome: string;
  details: string;
  before: JsonValue | null;
  after: JsonValue | null;
  created_at: string;
}

export interface DirectorySnapshot {
  employees: EmployeeRow[];
  roles: RoleRecord[];
  assignments: RoleAssignment[];
}

/* ---------------- Inputs (validate on the backend too) ---------------- */

const optionalText = (max: number) =>
  z
    .string()
    .trim()
    .max(max)
    .optional()
    .transform((v) => (v ? v : null));
const phonePattern = /^[0-9+()\-.\s]*$/;

export const CreateEmployeeInput = z.object({
  firstName: z.string().trim().min(1, "First name is required.").max(60),
  lastName: z.string().trim().min(1, "Last name is required.").max(60),
  email: z.string().trim().toLowerCase().email("Enter a valid work email.").max(254),
  department: z.enum(DEPARTMENTS),
  roleId: z.string().min(1, "Choose a role."),
  jobTitle: optionalText(80),
  phone: z
    .string()
    .trim()
    .max(30)
    .regex(phonePattern, "Use digits, spaces and + ( ) - only.")
    .optional()
    .transform((v) => (v ? v : null)),
});

export const UpdateEmployeeInput = z.object({
  id: z.string().min(1),
  firstName: z.string().trim().min(1).max(60).optional(),
  lastName: z.string().trim().min(1).max(60).optional(),
  department: z.enum(DEPARTMENTS).optional(),
  jobTitle: z.string().trim().max(80).nullable().optional(),
  phone: z.string().trim().max(30).regex(phonePattern).nullable().optional(),
  roleId: z.string().min(1).optional(),
  /** Requested status; "Invitation Pending" is set automatically and is rejected. */
  status: z.string().optional(),
  /** Recorded in the audit log. */
  reason: z.string().trim().max(300).optional(),
});

export const RoleInput = z.object({
  name: z.string().trim().min(2, "Role name needs at least 2 characters.").max(50),
  description: z.string().trim().max(300).default(""),
  department: z.enum(DEPARTMENTS).nullable().default(null),
  landingPage: z
    .string()
    .refine((v) => LANDING_PAGES.some((l) => l.to === v), "Choose a landing page."),
  permissions: z
    .array(z.string())
    .transform((list) => Array.from(new Set(list.filter(isPermission)))),
});

export const UpdateRoleInput = RoleInput.extend({ id: z.string().min(1) });

export type CreateEmployeeInput = z.input<typeof CreateEmployeeInput>;
export type UpdateEmployeeInput = z.input<typeof UpdateEmployeeInput>;
export type RoleInput = z.input<typeof RoleInput>;
export type UpdateRoleInput = z.input<typeof UpdateRoleInput>;

/* ---------------- API ---------------- */

/**
 * Employee and role administration. Every method runs as the signed-in employee; the backend
 * must check the caller's permission (`employees.manage`, `roles.manage`, `audit.view`) and the
 * rules in `employee-rules.ts` itself — the UI checks are for presentation only.
 */
export interface EmployeeAdminApi {
  /** Employees, roles and role assignments visible to an active employee. */
  getDirectory(): Promise<DirectorySnapshot>;
  /** Most recent administration events first. Requires `audit.view`. */
  listAuditEvents(): Promise<AdminAuditRecord[]>;
  /** Creates an Invitation Pending account with a system-generated temporary password. */
  createEmployee(
    input: CreateEmployeeInput,
  ): Promise<{ id: string; employeeCode: string; temporaryPassword: string }>;
  /** Updates details, role or status. Returns the resulting status. */
  updateEmployee(input: UpdateEmployeeInput): Promise<{ status: EmployeeStatus }>;
  /** Issues a new temporary password; the employee must choose a new one at next sign-in. */
  resetPassword(employeeId: string): Promise<{ temporaryPassword: string }>;
  createRole(input: RoleInput): Promise<RoleRecord>;
  updateRole(input: UpdateRoleInput): Promise<RoleRecord>;
  /** Only unassigned custom roles can be deleted. */
  deleteRole(roleId: string): Promise<void>;
}

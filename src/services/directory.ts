// Employee directory reads and employee-workspace session resolution, built on the service contracts.
import { queryOptions, type QueryClient } from "@tanstack/react-query";
import type { EmployeeStatus } from "@/types/models";
import { auth, employeesApi } from "./api";
import type { AdminAuditRecord, EmployeeRow, RoleRecord } from "./contracts/employees";
import { isPermission, setRolePermissions, type Permission } from "./permissions";
import { clearEmployeeSession, syncDirectory } from "./actions";
import { loadOperations } from "./store";

export type { AdminAuditRecord, RoleRecord };
export type EmployeeRecord = EmployeeRow & { name: string; role: RoleRecord | null };

export interface Directory {
  employees: EmployeeRecord[];
  roles: RoleRecord[];
  assignedCount: Record<string, number>;
}

const toRecord = (e: EmployeeRow, role: RoleRecord | null): EmployeeRecord => ({
  ...e,
  status: e.status as EmployeeStatus,
  name: `${e.first_name} ${e.last_name}`,
  role,
});

export async function fetchDirectory(): Promise<Directory> {
  const [snapshot, session] = await Promise.all([employeesApi.getDirectory(), auth.getSession()]);
  const roleById = new Map(snapshot.roles.map((r) => [r.id, r]));
  const roleOf = new Map(snapshot.assignments.map((a) => [a.user_id, a.role_id]));
  const assignedCount: Record<string, number> = {};
  for (const a of snapshot.assignments)
    assignedCount[a.role_id] = (assignedCount[a.role_id] ?? 0) + 1;
  const employees = snapshot.employees.map((e) =>
    toRecord(e, roleById.get(roleOf.get(e.id) ?? "") ?? null),
  );
  setRolePermissions(
    Object.fromEntries(
      snapshot.roles.map((r) => [r.name, r.permissions.filter(isPermission) as Permission[]]),
    ),
  );
  syncDirectory(
    session?.userId ?? "",
    employees.map((e) => ({
      id: e.id,
      name: e.name,
      email: e.email,
      role: e.role?.name ?? "",
      status: e.status,
      directory: true,
    })),
  );
  return { employees, roles: snapshot.roles, assignedCount };
}

export const directoryQuery = queryOptions({
  queryKey: ["directory"],
  queryFn: fetchDirectory,
  staleTime: 30_000,
});

export const adminAuditQuery = (enabled: boolean) =>
  queryOptions({
    queryKey: ["admin-audit"],
    enabled,
    queryFn: async () => {
      try {
        return await employeesApi.listAuditEvents();
      } catch {
        throw new Error("Administration audit events couldn't be loaded.");
      }
    },
  });

/* ---------------- Session ---------------- */

const REMEMBER_KEY = "renda-admin-remember";
const SESSION_KEY = "renda-admin-session";

export function rememberSession(remember: boolean) {
  window.localStorage.setItem(REMEMBER_KEY, remember ? "1" : "0");
  window.sessionStorage.setItem(SESSION_KEY, "1");
}

/** True when the employee chose not to be remembered and this is a new browser session. */
export function sessionExpiredByBrowserClose() {
  return (
    window.localStorage.getItem(REMEMBER_KEY) === "0" &&
    window.sessionStorage.getItem(SESSION_KEY) !== "1"
  );
}

export async function needsMfa() {
  return (await auth.getSession())?.mfaRequired ?? false;
}

/** The signed-in employee's record and role. */
export const ownAccess = async () => {
  const { employee, role } = await auth.getCurrentEmployee();
  return { me: employee, role };
};

export type AccessResult =
  | { kind: "ok"; me: EmployeeRecord }
  | { kind: "signin"; reason?: "denied" | "expired" }
  | { kind: "mfa" }
  | { kind: "set-password" };

/** Decides whether the current browser session may enter the employee workspace. */
export async function resolveAccess(queryClient: QueryClient): Promise<AccessResult> {
  if (sessionExpiredByBrowserClose()) {
    await signOutEverywhere(queryClient);
    return { kind: "signin", reason: "expired" };
  }
  const session = await auth.getSession();
  if (!session) return { kind: "signin" };
  if (session.mfaRequired) return { kind: "mfa" };
  const { me, role } = await ownAccess();
  if (!me || me.status === "Inactive" || me.status === "Suspended" || !role) {
    await signOutEverywhere(queryClient);
    return { kind: "signin", reason: "denied" };
  }
  if (me.must_change_password) return { kind: "set-password" };
  // Load the operations dataset before the directory mirrors employees into it.
  await loadOperations();
  await queryClient.ensureQueryData(directoryQuery);
  return { kind: "ok", me: toRecord(me, role) };
}

export async function signOutEverywhere(queryClient: QueryClient) {
  await queryClient.cancelQueries();
  queryClient.clear();
  clearEmployeeSession();
  setRolePermissions({});
  await auth.logout();
}

/** Where the signed-in employee lands after signing in, from their role. */
export async function landingPath() {
  const { role } = await ownAccess();
  return role?.landing_page ?? "/";
}

export const safeRedirect = (v: unknown) =>
  typeof v === "string" && v.startsWith("/") && !v.startsWith("//") ? v : undefined;

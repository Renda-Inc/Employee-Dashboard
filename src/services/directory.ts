// Employee directory reads (browser client, protected by row-level security) and session resolution.
import { queryOptions, type QueryClient } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import type { Tables } from "@/integrations/supabase/types";
import type { EmployeeStatus } from "@/types/models";
import { isPermission, setRolePermissions, type Permission } from "./permissions";
import { clearEmployeeSession, syncDirectory } from "./actions";

export type RoleRecord = Tables<"roles">;
export type EmployeeRecord = Omit<Tables<"employees">, "status"> & { status: EmployeeStatus; name: string; role: RoleRecord | null };
export type AdminAuditRecord = Tables<"admin_audit_events">;

export interface Directory {
  employees: EmployeeRecord[];
  roles: RoleRecord[];
  assignedCount: Record<string, number>;
}

export async function fetchDirectory(): Promise<Directory> {
  const [emp, roles, assigns, session] = await Promise.all([
    supabase.from("employees").select("*").order("created_at"),
    supabase.from("roles").select("*").order("created_at"),
    supabase.from("user_roles").select("user_id, role_id"),
    supabase.auth.getSession(),
  ]);
  if (emp.error || roles.error || assigns.error) throw new Error("The employee directory couldn't be loaded.");
  const roleById = new Map(roles.data.map((r) => [r.id, r]));
  const roleOf = new Map(assigns.data.map((a) => [a.user_id, a.role_id]));
  const assignedCount: Record<string, number> = {};
  for (const a of assigns.data) assignedCount[a.role_id] = (assignedCount[a.role_id] ?? 0) + 1;
  const employees: EmployeeRecord[] = emp.data.map((e) => ({
    ...e,
    status: e.status as EmployeeStatus,
    name: `${e.first_name} ${e.last_name}`,
    role: roleById.get(roleOf.get(e.id) ?? "") ?? null,
  }));
  setRolePermissions(Object.fromEntries(roles.data.map((r) => [r.name, r.permissions.filter(isPermission) as Permission[]])));
  const meId = session.data.session?.user.id ?? "";
  syncDirectory(meId, employees.map((e) => ({ id: e.id, name: e.name, email: e.email, role: e.role?.name ?? "", status: e.status, directory: true })));
  return { employees, roles: roles.data, assignedCount };
}

export const directoryQuery = queryOptions({ queryKey: ["directory"], queryFn: fetchDirectory, staleTime: 30_000 });

export const adminAuditQuery = (enabled: boolean) =>
  queryOptions({
    queryKey: ["admin-audit"],
    enabled,
    queryFn: async () => {
      const { data, error } = await supabase.from("admin_audit_events").select("*").order("created_at", { ascending: false }).limit(1000);
      if (error) throw new Error("Administration audit events couldn't be loaded.");
      return data;
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
  return window.localStorage.getItem(REMEMBER_KEY) === "0" && window.sessionStorage.getItem(SESSION_KEY) !== "1";
}

export async function needsMfa() {
  const { data } = await supabase.auth.mfa.getAuthenticatorAssuranceLevel();
  return !!data && data.nextLevel === "aal2" && data.currentLevel !== "aal2";
}

export async function ownAccess(userId: string) {
  const [{ data: me }, { data: assignment }] = await Promise.all([
    supabase.from("employees").select("*").eq("id", userId).maybeSingle(),
    supabase.from("user_roles").select("role_id, roles(*)").eq("user_id", userId).maybeSingle(),
  ]);
  return { me, role: (assignment?.roles ?? null) as RoleRecord | null };
}

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
  const { data } = await supabase.auth.getUser();
  if (!data.user) return { kind: "signin" };
  if (await needsMfa()) return { kind: "mfa" };
  const { me, role } = await ownAccess(data.user.id);
  if (!me || me.status === "Inactive" || me.status === "Suspended" || !role) {
    await signOutEverywhere(queryClient);
    return { kind: "signin", reason: "denied" };
  }
  if (me.must_change_password) return { kind: "set-password" };
  await queryClient.ensureQueryData(directoryQuery);
  return { kind: "ok", me: { ...me, status: me.status as EmployeeStatus, name: `${me.first_name} ${me.last_name}`, role } };
}

export async function signOutEverywhere(queryClient: QueryClient) {
  await queryClient.cancelQueries();
  queryClient.clear();
  clearEmployeeSession();
  setRolePermissions({});
  await supabase.auth.signOut();
}

/** Where an employee lands after signing in, from their role. */
export async function landingPath(userId: string) {
  const { role } = await ownAccess(userId);
  return role?.landing_page ?? "/";
}

export const safeRedirect = (v: unknown) => (typeof v === "string" && v.startsWith("/") && !v.startsWith("//") ? v : undefined);

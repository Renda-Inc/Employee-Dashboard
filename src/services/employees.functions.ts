// Employee accounts and roles. Every mutation verifies the caller's permission in the
// database before using the privileged client; clients have read-only table access.
import { createServerFn } from "@tanstack/react-start";
import { z } from "zod";
import type { SupabaseClient } from "@supabase/supabase-js";
import { requireSupabaseAuth } from "@/integrations/supabase/auth-middleware";
import type { Database, Json } from "@/integrations/supabase/types";
import { ALL_PERMISSIONS, DEPARTMENTS, LANDING_PAGES, isPermission } from "./permissions";
import {
  assertKeepsAdministrator, generateTemporaryPassword, isBlockedStatus, passwordIssues, resolveStatusChange, roleDeletionBlocker,
} from "./employee-rules";
import type { EmployeeStatus } from "@/types/models";

type DBClient = SupabaseClient<Database>;
const ADMIN_ROLE = "Administrator";
const BAN = "876000h";

async function adminClient(): Promise<DBClient> {
  const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
  return supabaseAdmin;
}

async function requirePermission(supabase: DBClient, permission: string) {
  const { data, error } = await supabase.rpc("has_permission", { _permission: permission });
  if (error || data !== true) throw new Error("Your role doesn't allow this action.");
}

async function actorName(admin: DBClient, id: string) {
  const { data } = await admin.from("employees").select("first_name, last_name").eq("id", id).maybeSingle();
  return data ? `${data.first_name} ${data.last_name}` : "";
}

async function audit(admin: DBClient, actorId: string | null, e: { action: string; module?: string; entityType: string; entityId: string; entityLabel: string; details?: string; before?: Json; after?: Json }) {
  await admin.from("admin_audit_events").insert({
    actor_id: actorId,
    actor_name: actorId ? await actorName(admin, actorId) : "",
    action: e.action,
    module: e.module ?? "Employees & Permissions",
    entity_type: e.entityType,
    entity_id: e.entityId,
    entity_label: e.entityLabel,
    details: e.details ?? "",
    before: e.before ?? null,
    after: e.after ?? null,
  });
}

async function roleOf(admin: DBClient, userId: string) {
  const { data } = await admin.from("user_roles").select("role_id, roles(id, name)").eq("user_id", userId).maybeSingle();
  return data?.roles ?? null;
}

async function otherActiveAdmins(admin: DBClient, excludeId: string) {
  const { data: role } = await admin.from("roles").select("id").eq("name", ADMIN_ROLE).single();
  if (!role) return 0;
  const { data: rows } = await admin.from("user_roles").select("user_id").eq("role_id", role.id).neq("user_id", excludeId);
  const ids = (rows ?? []).map((r) => r.user_id);
  if (!ids.length) return 0;
  const { count } = await admin.from("employees").select("id", { count: "exact", head: true }).in("id", ids).eq("status", "Active");
  return count ?? 0;
}

const optionalText = (max: number) => z.string().trim().max(max).optional().transform((v) => (v ? v : null));
const phone = z.string().trim().max(30).regex(/^[0-9+()\-.\s]*$/, "Use digits, spaces and + ( ) - only.").optional().transform((v) => (v ? v : null));

/* ---------------- Sign-in lifecycle ---------------- */

export const recordSignIn = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .handler(async ({ context }) => {
    const admin = await adminClient();
    const { data: me } = await admin.from("employees").select("id, first_name, last_name").eq("id", context.userId).maybeSingle();
    if (!me) return { ok: false };
    await admin.from("employees").update({ last_login_at: new Date().toISOString() }).eq("id", me.id);
    await audit(admin, me.id, { action: "Signed in", module: "Authentication", entityType: "Employee", entityId: me.id, entityLabel: `${me.first_name} ${me.last_name}` });
    return { ok: true };
  });

export const completePasswordSetup = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((input: { password: string }) => z.object({ password: z.string().max(128) }).parse(input))
  .handler(async ({ data, context }) => {
    const issues = passwordIssues(data.password);
    if (issues.length) throw new Error(`Your password needs: ${issues.join(", ").toLowerCase()}.`);
    const admin = await adminClient();
    const { data: me } = await admin.from("employees").select("*").eq("id", context.userId).maybeSingle();
    if (!me || isBlockedStatus(me.status as EmployeeStatus)) throw new Error("Your account can't be updated. Contact your administrator.");
    if (!me.must_change_password) throw new Error("Your password is already set.");
    const { error } = await admin.auth.admin.updateUserById(me.id, { password: data.password });
    if (error) throw new Error(/weak|pwned|leaked/i.test(error.message) ? "Choose a stronger password — this one appears in known data breaches." : "We couldn't save your password. Try again.");
    const status = me.status === "Invitation Pending" ? "Active" : me.status;
    await admin.from("employees").update({ must_change_password: false, status }).eq("id", me.id);
    await audit(admin, me.id, { action: "Password set by employee", module: "Authentication", entityType: "Employee", entityId: me.id, entityLabel: `${me.first_name} ${me.last_name}`, before: { status: me.status }, after: { status } });
    return { ok: true };
  });

/* ---------------- First administrator ---------------- */

const BootstrapInput = z.object({
  firstName: z.string().trim().min(1).max(60),
  lastName: z.string().trim().min(1).max(60),
  email: z.string().trim().toLowerCase().email().max(254),
  password: z.string().max(128),
});

export const bootstrapAdministrator = createServerFn({ method: "POST" })
  .inputValidator((input: z.input<typeof BootstrapInput>) => BootstrapInput.parse(input))
  .handler(async ({ data }) => {
    const admin = await adminClient();
    const { count } = await admin.from("employees").select("id", { count: "exact", head: true });
    if ((count ?? 0) > 0) throw new Error("Renda Admin is already set up. Sign in instead.");
    const issues = passwordIssues(data.password);
    if (issues.length) throw new Error(`Your password needs: ${issues.join(", ").toLowerCase()}.`);
    const { data: role } = await admin.from("roles").select("id").eq("name", ADMIN_ROLE).single();
    if (!role) throw new Error("The Administrator role is missing.");
    const { data: created, error } = await admin.auth.admin.createUser({ email: data.email, password: data.password, email_confirm: true });
    if (error || !created.user) throw new Error("We couldn't create the administrator account. Try again.");
    const id = created.user.id;
    const { error: insErr } = await admin.from("employees").insert({
      id, first_name: data.firstName, last_name: data.lastName, email: data.email, department: "Executive", job_title: "Administrator", status: "Active", must_change_password: false,
    });
    if (insErr) {
      await admin.auth.admin.deleteUser(id);
      throw new Error("We couldn't create the administrator account. Try again.");
    }
    await admin.from("user_roles").insert({ user_id: id, role_id: role.id });
    await audit(admin, id, { action: "First administrator created", entityType: "Employee", entityId: id, entityLabel: `${data.firstName} ${data.lastName}` });
    return { ok: true };
  });

/* ---------------- Employees ---------------- */

const CreateEmployeeInput = z.object({
  firstName: z.string().trim().min(1, "First name is required.").max(60),
  lastName: z.string().trim().min(1, "Last name is required.").max(60),
  email: z.string().trim().toLowerCase().email("Enter a valid work email.").max(254),
  department: z.enum(DEPARTMENTS),
  roleId: z.string().uuid("Choose a role."),
  jobTitle: optionalText(80),
  phone,
});

export const createEmployee = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((input: z.input<typeof CreateEmployeeInput>) => CreateEmployeeInput.parse(input))
  .handler(async ({ data, context }) => {
    await requirePermission(context.supabase, "employees.manage");
    const admin = await adminClient();
    const { data: role } = await admin.from("roles").select("id, name").eq("id", data.roleId).maybeSingle();
    if (!role) throw new Error("Choose a valid role.");
    const { data: existing } = await admin.from("employees").select("id").eq("email", data.email).maybeSingle();
    if (existing) throw new Error("An employee with this work email already exists.");

    const temporaryPassword = generateTemporaryPassword();
    const { data: created, error } = await admin.auth.admin.createUser({ email: data.email, password: temporaryPassword, email_confirm: true });
    if (error || !created.user) throw new Error(/already/i.test(error?.message ?? "") ? "An account with this work email already exists." : "We couldn't create this account. Try again.");
    const id = created.user.id;
    const { data: emp, error: insErr } = await admin.from("employees").insert({
      id, first_name: data.firstName, last_name: data.lastName, email: data.email, department: data.department,
      job_title: data.jobTitle, phone: data.phone, status: "Invitation Pending", must_change_password: true, created_by: context.userId,
    }).select("id, employee_code").single();
    if (insErr || !emp) {
      await admin.auth.admin.deleteUser(id);
      throw new Error("We couldn't create this account. Try again.");
    }
    await admin.from("user_roles").insert({ user_id: id, role_id: role.id });
    await audit(admin, context.userId, {
      action: "Employee account created", entityType: "Employee", entityId: id, entityLabel: `${data.firstName} ${data.lastName}`,
      details: `${emp.employee_code} · ${role.name} · ${data.department}. Temporary password generated by the system.`,
      after: { role: role.name, department: data.department, status: "Invitation Pending" },
    });
    return { id, employeeCode: emp.employee_code, temporaryPassword };
  });

const UpdateEmployeeInput = z.object({
  id: z.string().uuid(),
  firstName: z.string().trim().min(1).max(60).optional(),
  lastName: z.string().trim().min(1).max(60).optional(),
  department: z.enum(DEPARTMENTS).optional(),
  jobTitle: z.string().trim().max(80).nullable().optional(),
  phone: z.string().trim().max(30).regex(/^[0-9+()\-.\s]*$/).nullable().optional(),
  roleId: z.string().uuid().optional(),
  status: z.string().optional(),
  reason: z.string().trim().max(300).optional(),
});

export const updateEmployeeAccount = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((input: z.input<typeof UpdateEmployeeInput>) => UpdateEmployeeInput.parse(input))
  .handler(async ({ data, context }) => {
    await requirePermission(context.supabase, "employees.manage");
    const admin = await adminClient();
    const { data: target } = await admin.from("employees").select("*").eq("id", data.id).maybeSingle();
    if (!target) throw new Error("Employee not found.");
    const self = data.id === context.userId;
    const currentRole = await roleOf(admin, data.id);

    let nextRole = currentRole;
    if (data.roleId && data.roleId !== currentRole?.id) {
      if (self) throw new Error("You can't change your own role.");
      const { data: r } = await admin.from("roles").select("id, name").eq("id", data.roleId).maybeSingle();
      if (!r) throw new Error("Choose a valid role.");
      nextRole = r;
    }
    let nextStatus = target.status as EmployeeStatus;
    if (data.status && data.status !== target.status) {
      if (self) throw new Error("You can't change your own account status.");
      nextStatus = resolveStatusChange(data.status, target.must_change_password);
    }

    const wasActiveAdmin = target.status === "Active" && currentRole?.name === ADMIN_ROLE;
    const remains = nextStatus === "Active" && nextRole?.name === ADMIN_ROLE;
    if (wasActiveAdmin && !remains) assertKeepsAdministrator({ targetIsActiveAdmin: true, remainsActiveAdmin: false, otherActiveAdmins: await otherActiveAdmins(admin, data.id) });

    const patch: Database["public"]["Tables"]["employees"]["Update"] = {};
    if (data.firstName !== undefined) patch.first_name = data.firstName;
    if (data.lastName !== undefined) patch.last_name = data.lastName;
    if (data.department !== undefined) patch.department = data.department;
    if (data.jobTitle !== undefined) patch.job_title = data.jobTitle || null;
    if (data.phone !== undefined) patch.phone = data.phone || null;
    if (nextStatus !== target.status) patch.status = nextStatus;
    if (Object.keys(patch).length) {
      const { error } = await admin.from("employees").update(patch).eq("id", data.id);
      if (error) throw new Error("We couldn't save these changes. Try again.");
    }
    if (nextRole && nextRole.id !== currentRole?.id) {
      await admin.from("user_roles").upsert({ user_id: data.id, role_id: nextRole.id, assigned_at: new Date().toISOString() });
    }
    const wasBlocked = isBlockedStatus(target.status as EmployeeStatus);
    const nowBlocked = isBlockedStatus(nextStatus);
    if (wasBlocked !== nowBlocked) await admin.auth.admin.updateUserById(data.id, { ban_duration: nowBlocked ? BAN : "none" });

    const label = `${patch.first_name ?? target.first_name} ${patch.last_name ?? target.last_name}`;
    const before: Record<string, Json> = {};
    const after: Record<string, Json> = {};
    for (const [k, v] of Object.entries(patch)) {
      before[k] = (target as Record<string, Json>)[k] ?? null;
      after[k] = (v ?? null) as Json;
    }
    if (nextRole?.id !== currentRole?.id) { before.role = currentRole?.name ?? null; after.role = nextRole?.name ?? null; }
    const action = nextStatus !== target.status ? "Employee status changed" : nextRole?.id !== currentRole?.id ? "Employee role changed" : "Employee details updated";
    if (Object.keys(after).length) await audit(admin, context.userId, { action, entityType: "Employee", entityId: data.id, entityLabel: label, details: data.reason ?? "", before, after });
    return { status: nextStatus };
  });

export const resetEmployeePassword = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((input: { id: string }) => z.object({ id: z.string().uuid() }).parse(input))
  .handler(async ({ data, context }) => {
    await requirePermission(context.supabase, "employees.manage");
    if (data.id === context.userId) throw new Error("You can't reset your own password here.");
    const admin = await adminClient();
    const { data: target } = await admin.from("employees").select("*").eq("id", data.id).maybeSingle();
    if (!target) throw new Error("Employee not found.");
    const temporaryPassword = generateTemporaryPassword();
    const { error } = await admin.auth.admin.updateUserById(data.id, { password: temporaryPassword });
    if (error) throw new Error("We couldn't reset this password. Try again.");
    await admin.from("employees").update({ must_change_password: true }).eq("id", data.id);
    await audit(admin, context.userId, { action: "Password reset by administrator", entityType: "Employee", entityId: data.id, entityLabel: `${target.first_name} ${target.last_name}`, details: "New temporary password generated by the system." });
    return { temporaryPassword };
  });

/* ---------------- Roles ---------------- */

const RoleInput = z.object({
  name: z.string().trim().min(2, "Role name needs at least 2 characters.").max(50),
  description: z.string().trim().max(300).default(""),
  department: z.enum(DEPARTMENTS).nullable().default(null),
  landingPage: z.string().refine((v) => LANDING_PAGES.some((l) => l.to === v), "Choose a landing page."),
  permissions: z.array(z.string()).transform((list) => Array.from(new Set(list.filter(isPermission)))),
});

async function assertUniqueName(admin: DBClient, name: string, excludeId?: string) {
  const { data } = await admin.from("roles").select("id").ilike("name", name);
  if ((data ?? []).some((r) => r.id !== excludeId)) throw new Error("A role with this name already exists.");
}

export const createRole = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((input: z.input<typeof RoleInput>) => RoleInput.parse(input))
  .handler(async ({ data, context }) => {
    await requirePermission(context.supabase, "roles.manage");
    if (!data.permissions.length) throw new Error("Choose at least one permission.");
    const admin = await adminClient();
    await assertUniqueName(admin, data.name);
    const { data: role, error } = await admin.from("roles").insert({
      name: data.name, description: data.description, department: data.department, landing_page: data.landingPage, permissions: data.permissions, is_system: false,
    }).select("*").single();
    if (error || !role) throw new Error("We couldn't create this role. Try again.");
    await audit(admin, context.userId, { action: "Role created", entityType: "Role", entityId: role.id, entityLabel: role.name, details: `${role.permissions.length} permissions`, after: { permissions: role.permissions.join(", ") } });
    return role;
  });

export const updateRole = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((input: z.input<typeof RoleInput> & { id: string }) => RoleInput.extend({ id: z.string().uuid() }).parse(input))
  .handler(async ({ data, context }) => {
    await requirePermission(context.supabase, "roles.manage");
    const admin = await adminClient();
    const { data: role } = await admin.from("roles").select("*").eq("id", data.id).maybeSingle();
    if (!role) throw new Error("Role not found.");
    if (role.is_system && data.name !== role.name) throw new Error("System roles can't be renamed.");
    const permissions: string[] = role.name === ADMIN_ROLE && role.is_system ? [...ALL_PERMISSIONS] : data.permissions;
    if (!permissions.length) throw new Error("Choose at least one permission.");
    await assertUniqueName(admin, data.name, role.id);
    const { data: updated, error } = await admin.from("roles").update({
      name: data.name, description: data.description, department: data.department, landing_page: data.landingPage, permissions,
    }).eq("id", role.id).select("*").single();
    if (error || !updated) throw new Error("We couldn't save this role. Try again.");
    const added = permissions.filter((p) => !role.permissions.includes(p));
    const removed = role.permissions.filter((p) => !permissions.includes(p));
    await audit(admin, context.userId, {
      action: "Role updated", entityType: "Role", entityId: role.id, entityLabel: updated.name,
      details: [added.length && `Added: ${added.join(", ")}`, removed.length && `Removed: ${removed.join(", ")}`].filter(Boolean).join(" · "),
      before: { name: role.name, landing_page: role.landing_page, permissions: role.permissions.length }, after: { name: updated.name, landing_page: updated.landing_page, permissions: updated.permissions.length },
    });
    return updated;
  });

export const deleteRole = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((input: { id: string }) => z.object({ id: z.string().uuid() }).parse(input))
  .handler(async ({ data, context }) => {
    await requirePermission(context.supabase, "roles.manage");
    const admin = await adminClient();
    const { data: role } = await admin.from("roles").select("*").eq("id", data.id).maybeSingle();
    if (!role) throw new Error("Role not found.");
    const { count } = await admin.from("user_roles").select("user_id", { count: "exact", head: true }).eq("role_id", role.id);
    const blocker = roleDeletionBlocker(role, count ?? 0);
    if (blocker) throw new Error(blocker);
    const { error } = await admin.from("roles").delete().eq("id", role.id);
    if (error) throw new Error("We couldn't delete this role. Try again.");
    await audit(admin, context.userId, { action: "Role deleted", entityType: "Role", entityId: role.id, entityLabel: role.name });
    return { ok: true };
  });

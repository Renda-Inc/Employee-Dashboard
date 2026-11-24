// In-browser mock backend for employee accounts, roles and sessions. It mirrors the tables in
// docs/schema.sql and is persisted to localStorage so the app runs without external services.
// NOT secure: everything lives in the browser. Replace with real services via src/services/api.ts.
import type {
  AdminAuditRecord,
  EmployeeRow,
  JsonValue,
  RoleAssignment,
  RoleRecord,
} from "../contracts/employees";
import { ROLE_PERMISSIONS } from "../permissions";

export const ADMIN_ROLE = "Administrator";

export interface MfaFactor {
  id: string;
  secret: string;
  status: "unverified" | "verified";
}

export interface MockTables {
  version: 2;
  roles: RoleRecord[];
  employees: EmployeeRow[];
  assignments: RoleAssignment[];
  audit: AdminAuditRecord[];
  /** SHA-256 password hashes by employee ID. */
  credentials: Record<string, string>;
  factors: Record<string, MfaFactor[]>;
  nextEmployeeNumber: number;
}

export interface MockSession {
  userId: string;
  assurance: "aal1" | "aal2";
  issuedAt: string;
}

const TABLES_KEY = "renda-admin-mock-backend-v1";
const SESSION_KEY = "renda-admin-mock-session-v1";

/* ---------------- Ephemeral test administrator ----------------
 * Backs OPEN_SIGN_IN in mock/auth.ts (temporary testing mode). This is a
 * fixed, generic identity that exists only in memory: it is never written
 * to localStorage, it has no credential, and its session is memory-only,
 * so a page reload ends it. The email and password typed at sign-in are
 * never attached to it and never stored anywhere. */
export const TEST_ADMIN_ID = "test-administrator";
export const TEST_ADMIN_EMAIL = "test@renda.local";

/** Ensures the in-memory test administrator exists in the table cache. Never persists anything. */
export function ensureTestAdmin(): EmployeeRow {
  const t = readTables();
  const existing = findEmployee(t, TEST_ADMIN_ID);
  if (existing) return existing;
  const role = t.roles.find((r) => r.name === ADMIN_ROLE);
  if (!role) throw new Error("The Administrator role is missing.");
  const at = nowIso();
  const emp: EmployeeRow = {
    id: TEST_ADMIN_ID,
    employee_code: "TEST-001",
    first_name: "Test",
    last_name: "Administrator",
    email: TEST_ADMIN_EMAIL,
    department: "Executive",
    job_title: "Administrator (testing)",
    phone: null,
    status: "Active",
    must_change_password: false,
    last_login_at: null,
    created_by: null,
    created_at: at,
    updated_at: at,
  };
  // Mutate the in-memory cache directly, deliberately bypassing
  // writeTables so nothing about this identity reaches localStorage.
  t.employees.push(emp);
  t.assignments.push({ user_id: TEST_ADMIN_ID, role_id: role.id, assigned_at: at });
  return emp;
}

/** Removes every trace of the test administrator from a tables snapshot before it is persisted. */
function forPersistence(t: MockTables): MockTables {
  if (!t.employees.some((e) => e.id === TEST_ADMIN_ID)) return t;
  const clean = structuredClone(t);
  clean.employees = clean.employees.filter((e) => e.id !== TEST_ADMIN_ID);
  clean.assignments = clean.assignments.filter((a) => a.user_id !== TEST_ADMIN_ID);
  delete clean.credentials[TEST_ADMIN_ID];
  delete clean.factors[TEST_ADMIN_ID];
  clean.audit = clean.audit.filter((a) => a.actor_id !== TEST_ADMIN_ID);
  return clean;
}

const SYSTEM_ROLES: {
  name: keyof typeof ROLE_PERMISSIONS;
  description: string;
  department: string;
  landing: string;
}[] = [
  {
    name: "Administrator",
    description: "Full access to every module, employee accounts and role configuration.",
    department: "Executive",
    landing: "/",
  },
  {
    name: "Customer Support",
    description: "Handles customer enquiries, card help and membership changes.",
    department: "Customer Support",
    landing: "/support",
  },
  {
    name: "Compliance",
    description: "Reviews identity verification and records compliance decisions.",
    department: "Compliance",
    landing: "/onboarding",
  },
  {
    name: "Banking Operations",
    description: "Runs account issuance and banking operational actions.",
    department: "Banking Operations",
    landing: "/accounts",
  },
  {
    name: "Card Operations",
    description: "Manages cards, replacements and manufacturing batches.",
    department: "Card Operations",
    landing: "/cards",
  },
  {
    name: "Read-Only Analyst",
    description: "View-only access for reporting and analysis.",
    department: "Operations",
    landing: "/",
  },
];

export const nowIso = () => new Date().toISOString();
export const newId = () => crypto.randomUUID();

export async function hashPassword(userId: string, password: string): Promise<string> {
  const digest = await crypto.subtle.digest(
    "SHA-256",
    new TextEncoder().encode(`${userId}:${password}`),
  );
  return Array.from(new Uint8Array(digest), (b) => b.toString(16).padStart(2, "0")).join("");
}

function seed(): MockTables {
  const at = nowIso();
  const roles: RoleRecord[] = SYSTEM_ROLES.map((r) => ({
    id: newId(),
    name: r.name,
    description: r.description,
    department: r.department,
    landing_page: r.landing,
    permissions: [...ROLE_PERMISSIONS[r.name]],
    is_system: true,
    created_at: at,
    updated_at: at,
  }));
  return {
    version: 2,
    roles,
    employees: [],
    assignments: [],
    audit: [],
    credentials: {},
    factors: {},
    nextEmployeeNumber: 1001,
  };
}

/** One-time migration from table version 1: system roles were seeded
 * once from the code defaults and then persisted, so permissions added
 * in code later (alfie.manage, customers.restrict, customers.hold) never
 * reached existing browsers and the directory replaced the live
 * permission registry with the stale lists. Refreshing the system
 * roles from the current code defaults fixes that; custom roles,
 * employees, assignments and audit history are preserved, and any
 * permission edits made after this migration persist as usual. */
function migrateV1(t: MockTables & { version: number }): MockTables {
  const at = nowIso();
  for (const def of SYSTEM_ROLES) {
    const existing = t.roles.find((r) => r.is_system && r.name === def.name);
    if (existing) {
      existing.permissions = [...ROLE_PERMISSIONS[def.name]];
      existing.updated_at = at;
    } else {
      t.roles.push({
        id: newId(),
        name: def.name,
        description: def.description,
        department: def.department,
        landing_page: def.landing,
        permissions: [...ROLE_PERMISSIONS[def.name]],
        is_system: true,
        created_at: at,
        updated_at: at,
      });
    }
  }
  const migrated = { ...t, version: 2 as const };
  try {
    window.localStorage.setItem(TABLES_KEY, JSON.stringify(forPersistence(migrated)));
  } catch {
    // Storage unavailable: the in-memory copy is still migrated.
  }
  return migrated;
}

let cache: MockTables | null = null;

export function readTables(): MockTables {
  if (cache) return cache;
  try {
    const raw = window.localStorage.getItem(TABLES_KEY);
    const parsed = raw ? (JSON.parse(raw) as MockTables & { version: number }) : null;
    cache =
      parsed?.version === 2 ? parsed : parsed?.version === 1 ? migrateV1(parsed) : seed();
  } catch {
    cache = seed();
  }
  return cache;
}

/** Applies a change atomically and persists it. */
export function writeTables<T>(mutate: (t: MockTables) => T): T {
  const draft = structuredClone(readTables());
  const result = mutate(draft);
  cache = draft;
  try {
    // The in-memory cache keeps the ephemeral test administrator; the
    // persisted copy never does.
    window.localStorage.setItem(TABLES_KEY, JSON.stringify(forPersistence(draft)));
  } catch {
    /* storage full, keep in memory */
  }
  return result;
}

/** Test helper: forget all mock data. */
export function resetMockBackend() {
  cache = null;
  memorySession = null;
  window.localStorage.removeItem(TABLES_KEY);
  window.localStorage.removeItem(SESSION_KEY);
}

/* ---------------- Session ----------------
 * Real employees' sessions persist in localStorage. The test
 * administrator's session is memory-only: it is never written to storage,
 * so reloading the page signs the test administrator out. */
let memorySession: MockSession | null = null;

export function readSession(): MockSession | null {
  if (memorySession) return memorySession;
  try {
    const raw = window.localStorage.getItem(SESSION_KEY);
    return raw ? (JSON.parse(raw) as MockSession) : null;
  } catch {
    return null;
  }
}

export function writeSession(session: MockSession | null) {
  if (session?.userId === TEST_ADMIN_ID) {
    memorySession = session;
    window.localStorage.removeItem(SESSION_KEY);
    return;
  }
  memorySession = null;
  if (session) window.localStorage.setItem(SESSION_KEY, JSON.stringify(session));
  else window.localStorage.removeItem(SESSION_KEY);
}

/* ---------------- Queries ---------------- */

export const fullName = (e: Pick<EmployeeRow, "first_name" | "last_name">) =>
  `${e.first_name} ${e.last_name}`;
export const findEmployee = (t: MockTables, id: string) =>
  t.employees.find((e) => e.id === id) ?? null;
export const roleOf = (t: MockTables, userId: string) => {
  const a = t.assignments.find((x) => x.user_id === userId);
  return a ? (t.roles.find((r) => r.id === a.role_id) ?? null) : null;
};
export const hasVerifiedFactor = (t: MockTables, userId: string) =>
  (t.factors[userId] ?? []).some((f) => f.status === "verified");

export function otherActiveAdmins(t: MockTables, excludeId: string) {
  const admin = t.roles.find((r) => r.name === ADMIN_ROLE);
  if (!admin) return 0;
  return t.assignments.filter(
    (a) =>
      a.role_id === admin.id &&
      a.user_id !== excludeId &&
      // The ephemeral test administrator is not a real safeguard admin.
      a.user_id !== TEST_ADMIN_ID &&
      findEmployee(t, a.user_id)?.status === "Active",
  ).length;
}

export function audit(
  t: MockTables,
  actorId: string | null,
  e: {
    action: string;
    module?: string;
    entityType: string;
    entityId: string;
    entityLabel: string;
    details?: string;
    before?: JsonValue;
    after?: JsonValue;
  },
) {
  const actor = actorId ? findEmployee(t, actorId) : null;
  t.audit.unshift({
    id: newId(),
    actor_id: actorId,
    actor_name: actor ? fullName(actor) : "",
    action: e.action,
    module: e.module ?? "Employees & Permissions",
    entity_type: e.entityType,
    entity_id: e.entityId,
    entity_label: e.entityLabel,
    outcome: "Success",
    details: e.details ?? "",
    before: e.before ?? null,
    after: e.after ?? null,
    created_at: nowIso(),
  });
  t.audit = t.audit.slice(0, 1000);
}

/** Active, verified (when enrolled) caller, the equivalent of `is_active_employee()` in the schema. */
export function activeCaller(t: MockTables) {
  const s = readSession();
  const me = s ? findEmployee(t, s.userId) : null;
  if (!s || !me || me.status !== "Active") return null;
  if (hasVerifiedFactor(t, me.id) && s.assurance !== "aal2") return null;
  return me;
}

/** Equivalent of `has_permission()` in the schema. Throws when the caller lacks the permission. */
export function requirePermission(t: MockTables, permission: string): EmployeeRow {
  const me = activeCaller(t);
  if (!me || !roleOf(t, me.id)?.permissions.includes(permission))
    throw new Error("Your role doesn't allow this action.");
  return me;
}

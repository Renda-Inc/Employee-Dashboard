// Mock AuthService backed by the in-browser mock backend.
import QRCode from "qrcode";
import type { AuthEvent, AuthService, AuthSession } from "../contracts/auth";
import { isBlockedStatus, passwordIssues } from "../employee-rules";
import {
  ADMIN_ROLE,
  TEST_ADMIN_ID,
  audit,
  ensureTestAdmin,
  findEmployee,
  fullName,
  hasVerifiedFactor,
  hashPassword,
  newId,
  nowIso,
  readSession,
  readTables,
  roleOf,
  writeSession,
  writeTables,
  type MockSession,
  type MockTables,
} from "./backend";
import { generateTotpSecret, otpauthUri, verifyTotp } from "./totp";

const listeners = new Set<(event: AuthEvent) => void>();

/* ---------------- Sign-in rate limiting ----------------
 * Failed attempts are counted per email in this browser. After
 * MAX_FAILED_ATTEMPTS failures inside the window, further attempts for
 * that email are refused as "rate-limited" until the lock expires. A real
 * backend must enforce the same limit server-side. */
const ATTEMPTS_KEY = "renda-admin-signin-attempts-v1";
const MAX_FAILED_ATTEMPTS = 5;
const LOCK_MS = 5 * 60_000;

interface AttemptRecord {
  count: number;
  lockedUntil: number;
}

function readAttempts(): Record<string, AttemptRecord> {
  try {
    return JSON.parse(window.localStorage.getItem(ATTEMPTS_KEY) ?? "{}") as Record<
      string,
      AttemptRecord
    >;
  } catch {
    return {};
  }
}

function writeAttempts(a: Record<string, AttemptRecord>) {
  try {
    window.localStorage.setItem(ATTEMPTS_KEY, JSON.stringify(a));
  } catch {
    /* storage unavailable; limiting stays in-memory best effort */
  }
}

function isLocked(email: string): boolean {
  const rec = readAttempts()[email];
  return !!rec && rec.lockedUntil > Date.now();
}

function recordFailure(email: string) {
  const all = readAttempts();
  const rec = all[email] ?? { count: 0, lockedUntil: 0 };
  rec.count += 1;
  if (rec.count >= MAX_FAILED_ATTEMPTS) {
    rec.lockedUntil = Date.now() + LOCK_MS;
    rec.count = 0;
  }
  all[email] = rec;
  writeAttempts(all);
}

function clearFailures(email: string) {
  const all = readAttempts();
  delete all[email];
  writeAttempts(all);
}

/** Test helper: forget all sign-in attempt counters. */
export function resetSignInAttempts() {
  try {
    window.localStorage.removeItem(ATTEMPTS_KEY);
  } catch {
    /* ignore */
  }
}
/* ---------------- Open sign-in (temporary testing mode) ----------------
 * Turned ON at the team's request on 2026-11-15 so testers can sign in
 * with anything while the dashboard is being exercised. Any email and
 * password that do not match a real employee sign in as the ephemeral
 * Test Administrator (see backend.ts): the typed credentials are never
 * stored, no account is created from them, and the session lives in
 * memory only, so a page reload signs it out. Real employee accounts
 * still sign in with their own credentials exactly as before, and their
 * sessions persist normally. Set this to false before any real use: that
 * restores strict sign-in, per-email rate limiting and the one-time
 * first-administrator setup screen. */
export const OPEN_SIGN_IN = true;

const emit = (event: AuthEvent) => listeners.forEach((l) => l(event));

function toSession(t: MockTables, s: MockSession | null): AuthSession | null {
  const me = s ? findEmployee(t, s.userId) : null;
  if (!s || !me) return null;
  return {
    userId: me.id,
    email: me.email,
    assurance: s.assurance,
    mfaRequired: hasVerifiedFactor(t, me.id) && s.assurance !== "aal2",
  };
}

function recordSignIn(t: MockTables, userId: string) {
  // The test administrator leaves no audit trail and no last-login stamp:
  // nothing about a testing sign-in is recorded.
  if (userId === TEST_ADMIN_ID) return;
  const me = findEmployee(t, userId);
  if (!me) return;
  me.last_login_at = nowIso();
  audit(t, me.id, {
    action: "Signed in",
    module: "Authentication",
    entityType: "Employee",
    entityId: me.id,
    entityLabel: fullName(me),
  });
}

function requireSession() {
  const s = readSession();
  if (!s || !findEmployee(readTables(), s.userId))
    throw new Error("Your session has ended. Sign in again.");
  return s;
}

function startSession(userId: string) {
  const session: MockSession = { userId, assurance: "aal1", issuedAt: nowIso() };
  writeSession(session);
  const view = toSession(readTables(), session);
  if (!view) return null;
  if (!view.mfaRequired) writeTables((x) => recordSignIn(x, userId));
  emit("SIGNED_IN");
  return view;
}

export const mockAuthService: AuthService = {
  async login(email, password) {
    const normalized = email.trim().toLowerCase();
    if (!OPEN_SIGN_IN && isLocked(normalized)) return { ok: false, error: "rate-limited" };
    const t = readTables();
    const emp = t.employees.find((e) => e.email === normalized);
    let userId: string | null = null;
    if (
      emp &&
      !isBlockedStatus(emp.status) &&
      t.credentials[emp.id] === (await hashPassword(emp.id, password))
    )
      userId = emp.id;
    if (!userId && OPEN_SIGN_IN) {
      // Testing mode: whatever was typed is discarded, never recorded,
      // and the session belongs to the ephemeral test administrator.
      ensureTestAdmin();
      userId = TEST_ADMIN_ID;
    }
    if (!userId) {
      recordFailure(normalized);
      return { ok: false, error: isLocked(normalized) ? "rate-limited" : "invalid" };
    }
    clearFailures(normalized);
    const view = startSession(userId);
    if (!view) return { ok: false, error: "invalid" };
    return { ok: true, session: view };
  },

  async needsInitialSetup() {
    // While open sign-in is on, testers go straight to the sign-in form;
    // setupInitialAdmin itself stays one-time-only either way.
    return !OPEN_SIGN_IN && readTables().employees.length === 0;
  },

  async setupInitialAdmin(input) {
    const firstName = input.firstName.trim();
    const lastName = input.lastName.trim();
    const email = input.email.trim().toLowerCase();
    if (!firstName || !lastName) throw new Error("Enter the first administrator's name.");
    if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)) throw new Error("Enter a valid work email.");
    const issues = passwordIssues(input.password);
    if (issues.length) throw new Error(`Your password needs: ${issues.join(", ").toLowerCase()}.`);
    const id = newId();
    const hash = await hashPassword(id, input.password);
    const created = writeTables((t) => {
      // One-time only: refuse once any real employee account exists, so
      // this can never be used to create a backdoor administrator later.
      // The ephemeral test administrator does not count.
      if (t.employees.some((e) => e.id !== TEST_ADMIN_ID)) return false;
      const role = t.roles.find((r) => r.name === ADMIN_ROLE);
      if (!role) throw new Error("The Administrator role is missing.");
      const at = nowIso();
      t.employees.push({
        id,
        employee_code: `EMP-${t.nextEmployeeNumber++}`,
        first_name: firstName,
        last_name: lastName,
        email,
        department: "Executive",
        job_title: "Administrator",
        phone: null,
        status: "Active",
        must_change_password: false,
        last_login_at: null,
        created_by: null,
        created_at: at,
        updated_at: at,
      });
      t.credentials[id] = hash;
      t.assignments.push({ user_id: id, role_id: role.id, assigned_at: at });
      audit(t, id, {
        action: "Initial administrator created",
        module: "Authentication",
        entityType: "Employee",
        entityId: id,
        entityLabel: `${firstName} ${lastName}`,
      });
      return true;
    });
    if (!created) throw new Error("Setup is already complete. Sign in instead.");
    const view = startSession(id);
    if (!view) return { ok: false, error: "invalid" };
    return { ok: true, session: view };
  },

  async verifyMfa(code) {
    const s = requireSession();
    const factor = (readTables().factors[s.userId] ?? []).find((f) => f.status === "verified");
    if (!factor) throw new Error("Your verification session expired. Sign in again.");
    if (!(await verifyTotp(factor.secret, code)))
      throw new Error("That code didn't work. Check your authenticator app and try again.");
    writeSession({ ...s, assurance: "aal2" });
    writeTables((t) => recordSignIn(t, s.userId));
  },

  async logout() {
    writeSession(null);
    emit("SIGNED_OUT");
  },

  async getSession() {
    return toSession(readTables(), readSession());
  },

  async getCurrentEmployee() {
    const s = readSession();
    const t = readTables();
    const employee = s ? findEmployee(t, s.userId) : null;
    return {
      employee: employee ? structuredClone(employee) : null,
      role: employee ? structuredClone(roleOf(t, employee.id)) : null,
    };
  },

  async completePasswordSetup(password) {
    const issues = passwordIssues(password);
    if (issues.length) throw new Error(`Your password needs: ${issues.join(", ").toLowerCase()}.`);
    const s = requireSession();
    const me = findEmployee(readTables(), s.userId);
    if (!me || isBlockedStatus(me.status))
      throw new Error("Your account can't be updated. Contact your administrator.");
    if (!me.must_change_password) throw new Error("Your password is already set.");
    const hash = await hashPassword(me.id, password);
    writeTables((t) => {
      const x = findEmployee(t, me.id)!;
      const before = x.status;
      x.status = x.status === "Invitation Pending" ? "Active" : x.status;
      x.must_change_password = false;
      x.updated_at = nowIso();
      t.credentials[x.id] = hash;
      audit(t, x.id, {
        action: "Password set by employee",
        module: "Authentication",
        entityType: "Employee",
        entityId: x.id,
        entityLabel: fullName(x),
        before: { status: before },
        after: { status: x.status },
      });
    });
    emit("USER_UPDATED");
  },

  mfa: {
    async isEnrolled() {
      const s = readSession();
      return !!s && hasVerifiedFactor(readTables(), s.userId);
    },
    async startEnrollment() {
      const s = requireSession();
      const me = findEmployee(readTables(), s.userId)!;
      const factor = { id: newId(), secret: generateTotpSecret(), status: "unverified" as const };
      writeTables((t) => {
        t.factors[s.userId] = [
          ...(t.factors[s.userId] ?? []).filter((f) => f.status === "verified"),
          factor,
        ];
      });
      const uri = otpauthUri(factor.secret, me.email);
      const qrCodeDataUrl = await QRCode.toDataURL(uri, { margin: 1, width: 320 }).catch(
        () => undefined,
      );
      return {
        enrollmentId: factor.id,
        secret: factor.secret,
        otpauthUri: uri,
        ...(qrCodeDataUrl ? { qrCodeDataUrl } : {}),
      };
    },
    async confirmEnrollment(enrollmentId, code) {
      const s = requireSession();
      const factor = (readTables().factors[s.userId] ?? []).find((f) => f.id === enrollmentId);
      if (!factor) throw new Error("Two-step verification setup expired. Start again.");
      if (!(await verifyTotp(factor.secret, code)))
        throw new Error("That code didn't work. Check the time on your device and try again.");
      writeTables((t) => {
        t.factors[s.userId] = (t.factors[s.userId] ?? []).map((f) =>
          f.id === enrollmentId ? { ...f, status: "verified" } : f,
        );
      });
      writeSession({ ...s, assurance: "aal2" });
    },
    async cancelEnrollment(enrollmentId) {
      const s = requireSession();
      writeTables((t) => {
        t.factors[s.userId] = (t.factors[s.userId] ?? []).filter(
          (f) => f.id !== enrollmentId || f.status === "verified",
        );
      });
    },
    async disable() {
      const s = requireSession();
      writeTables((t) => {
        delete t.factors[s.userId];
      });
    },
  },

  onAuthStateChange(listener) {
    listeners.add(listener);
    return () => listeners.delete(listener);
  },
};

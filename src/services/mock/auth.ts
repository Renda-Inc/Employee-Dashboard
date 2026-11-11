// Mock AuthService backed by the in-browser mock backend.
import QRCode from "qrcode";
import type { AuthEvent, AuthService, AuthSession } from "../contracts/auth";
import { isBlockedStatus, passwordIssues } from "../employee-rules";
import {
  audit,
  ensureDemoAdmin,
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

/**
 * TEMPORARY: while true, any email/password that doesn't match an employee login signs in to one
 * shared demo Administrator account. Set to false to require real credentials.
 */
export const OPEN_SIGN_IN = true;

const listeners = new Set<(event: AuthEvent) => void>();
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

export const mockAuthService: AuthService = {
  async login(email, password) {
    const t = readTables();
    const emp = t.employees.find((e) => e.email === email.trim().toLowerCase());
    let userId: string | null = null;
    if (
      emp &&
      !isBlockedStatus(emp.status) &&
      t.credentials[emp.id] === (await hashPassword(emp.id, password))
    )
      userId = emp.id;
    if (!userId && OPEN_SIGN_IN) userId = writeTables(ensureDemoAdmin);
    if (!userId) return { ok: false, error: "invalid" };

    const session: MockSession = { userId, assurance: "aal1", issuedAt: nowIso() };
    writeSession(session);
    const view = toSession(readTables(), session);
    if (!view) return { ok: false, error: "invalid" };
    if (!view.mfaRequired) writeTables((x) => recordSignIn(x, userId));
    emit("SIGNED_IN");
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

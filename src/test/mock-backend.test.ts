// Rules the mock backend must keep until a real backend replaces it.
import { beforeEach, describe, expect, it } from "vitest";
import { mockAuthService as auth, resetSignInAttempts } from "@/services/mock/auth";
import { mockEmployeeAdminApi as api } from "@/services/mock/employees";
import { resetMockBackend } from "@/services/mock/backend";
import { totpCode, verifyTotp } from "@/services/mock/totp";

const FIRST_ADMIN = {
  firstName: "First",
  lastName: "Administrator",
  email: "first.admin@renda.ca",
  password: "CorrectHorse42Battery",
};

async function signInAsDemoAdmin() {
  // First-run setup is the only bootstrap: it creates the first
  // Administrator and signs them in. Later calls sign in normally.
  if (await auth.needsInitialSetup()) {
    const res = await auth.setupInitialAdmin(FIRST_ADMIN);
    if (!res.ok) throw new Error("initial setup failed");
    return res.session;
  }
  const res = await auth.login(FIRST_ADMIN.email, FIRST_ADMIN.password);
  if (!res.ok) throw new Error("admin sign-in failed");
  return res.session;
}

async function supportRoleId() {
  const { roles } = await api.getDirectory();
  return roles.find((r) => r.name === "Customer Support")!.id;
}

describe("mock auth & employee admin", () => {
  beforeEach(() => {
    resetMockBackend();
    resetSignInAttempts();
    window.localStorage.clear();
    resetMockBackend();
    resetSignInAttempts();
  });

  it("rejects unknown credentials: there is no shared or fallback account", async () => {
    const res = await auth.login("anyone@example.com", "any password");
    expect(res.ok).toBe(false);
    expect(await auth.getSession()).toBeNull();
  });

  it("creates the first Administrator only through one-time setup", async () => {
    expect(await auth.needsInitialSetup()).toBe(true);
    const session = await signInAsDemoAdmin();
    expect(session.email).toBe(FIRST_ADMIN.email);
    const { role } = await auth.getCurrentEmployee();
    expect(role?.name).toBe("Administrator");
    expect(await auth.needsInitialSetup()).toBe(false);
    await expect(
      auth.setupInitialAdmin({ ...FIRST_ADMIN, email: "second@renda.ca" }),
    ).rejects.toThrow("Setup is already complete");
  });

  it("rate-limits repeated failed sign-ins for the same email", async () => {
    await signInAsDemoAdmin();
    await auth.logout();
    for (let i = 0; i < 5; i++) {
      const attempt = await auth.login(FIRST_ADMIN.email, "wrong password");
      expect(attempt.ok).toBe(false);
    }
    const locked = await auth.login(FIRST_ADMIN.email, FIRST_ADMIN.password);
    expect(locked).toEqual({ ok: false, error: "rate-limited" });
  });

  it("creates employees as Invitation Pending with a system-generated password they must replace", async () => {
    await signInAsDemoAdmin();
    const created = await api.createEmployee({
      firstName: "Ada",
      lastName: "Lovelace",
      email: "Ada@Renda.ca",
      department: "Customer Support",
      roleId: await supportRoleId(),
    });
    expect(created.employeeCode).toMatch(/^EMP-\d+$/);
    expect(created.temporaryPassword).toHaveLength(16);

    await auth.logout();
    const res = await auth.login("ada@renda.ca", created.temporaryPassword);
    expect(res.ok && res.session.email).toBe("ada@renda.ca");
    expect((await auth.getCurrentEmployee()).employee?.status).toBe("Invitation Pending");

    await auth.completePasswordSetup("CorrectHorse42Battery");
    const me = (await auth.getCurrentEmployee()).employee;
    expect(me?.status).toBe("Active");
    expect(me?.must_change_password).toBe(false);
  });

  it("does not let a suspended employee sign in as themselves", async () => {
    await signInAsDemoAdmin();
    const created = await api.createEmployee({
      firstName: "Sam",
      lastName: "Lee",
      email: "sam@renda.ca",
      department: "Compliance",
      roleId: await supportRoleId(),
    });
    await api.updateEmployee({ id: created.id, status: "Suspended" });
    await auth.logout();
    const res = await auth.login("sam@renda.ca", created.temporaryPassword);
    expect(res.ok).toBe(false);
  });

  it("rejects employee management for roles without employees.manage", async () => {
    await signInAsDemoAdmin();
    const created = await api.createEmployee({
      firstName: "Kim",
      lastName: "Ng",
      email: "kim@renda.ca",
      department: "Customer Support",
      roleId: await supportRoleId(),
    });
    await auth.logout();
    await auth.login("kim@renda.ca", created.temporaryPassword);
    await auth.completePasswordSetup("CorrectHorse42Battery");
    await expect(
      api.createEmployee({
        firstName: "X",
        lastName: "Y",
        email: "x@renda.ca",
        department: "Finance",
        roleId: await supportRoleId(),
      }),
    ).rejects.toThrow("Your role doesn't allow this action.");
  });

  it("requires a two-step code after enrolment", async () => {
    await signInAsDemoAdmin();
    const created = await api.createEmployee({
      firstName: "Ola",
      lastName: "Ade",
      email: "ola@renda.ca",
      department: "Customer Support",
      roleId: await supportRoleId(),
    });
    await auth.logout();
    await auth.login("ola@renda.ca", created.temporaryPassword);
    await auth.completePasswordSetup("CorrectHorse42Battery");
    const enrol = await auth.mfa.startEnrollment();
    await auth.mfa.confirmEnrollment(
      enrol.enrollmentId,
      await totpCode(enrol.secret, Math.floor(Date.now() / 30_000)),
    );
    await auth.logout();

    const res = await auth.login("ola@renda.ca", "CorrectHorse42Battery");
    expect(res.ok && res.session.mfaRequired).toBe(true);
    await expect(auth.verifyMfa("000000")).rejects.toThrow();
    await auth.verifyMfa(await totpCode(enrol.secret, Math.floor(Date.now() / 30_000)));
    expect((await auth.getSession())?.mfaRequired).toBe(false);
  });
});

describe("TOTP", () => {
  it("matches the RFC 6238 SHA-1 test vector", async () => {
    // Secret "12345678901234567890" in base32, T = 59s → 94287082 (last 6 digits: 287082).
    expect(await totpCode("GEZDGNBVGY3TQOJQGEZDGNBVGY3TQOJQ", 1)).toBe("287082");
    expect(await verifyTotp("GEZDGNBVGY3TQOJQGEZDGNBVGY3TQOJQ", "287082", 59_000)).toBe(true);
  });
});

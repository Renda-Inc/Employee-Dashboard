import { describe, expect, it } from "vitest";
import {
  assertKeepsAdministrator,
  generateTemporaryPassword,
  passwordIssues,
  resolveStatusChange,
  roleDeletionBlocker,
} from "@/services/employee-rules";
import { can, setRolePermissions, ROLE_PERMISSIONS } from "@/services/permissions";

describe("employee status rules", () => {
  it("does not let an administrator choose Invitation Pending", () => {
    expect(() => resolveStatusChange("Invitation Pending", false)).toThrow();
  });
  it("keeps a never-signed-in employee as Invitation Pending when set to Active", () => {
    expect(resolveStatusChange("Active", true)).toBe("Invitation Pending");
  });
  it("activates an employee who has already set their password", () => {
    expect(resolveStatusChange("Active", false)).toBe("Active");
  });
  it("allows Suspended and Inactive", () => {
    expect(resolveStatusChange("Suspended", false)).toBe("Suspended");
    expect(resolveStatusChange("Inactive", true)).toBe("Inactive");
  });
  it("blocks removing the last active Administrator", () => {
    expect(() =>
      assertKeepsAdministrator({
        targetIsActiveAdmin: true,
        remainsActiveAdmin: false,
        otherActiveAdmins: 0,
      }),
    ).toThrow();
    expect(() =>
      assertKeepsAdministrator({
        targetIsActiveAdmin: true,
        remainsActiveAdmin: false,
        otherActiveAdmins: 1,
      }),
    ).not.toThrow();
  });
});

describe("passwords", () => {
  it("generates a 16-character password with every character class", () => {
    const pw = generateTemporaryPassword();
    expect(pw).toHaveLength(16);
    expect(passwordIssues(pw)).toEqual([]);
    expect(/[!@#$%*?-]/.test(pw)).toBe(true);
  });
  it("never repeats the same temporary password", () => {
    expect(generateTemporaryPassword()).not.toBe(generateTemporaryPassword());
  });
  it("rejects short employee-chosen passwords", () => {
    expect(passwordIssues("Short1")).toContain("At least 12 characters");
  });
});

describe("roles", () => {
  it("cannot delete system roles or roles in use", () => {
    expect(roleDeletionBlocker({ is_system: true }, 0)).not.toBeNull();
    expect(roleDeletionBlocker({ is_system: false }, 2)).toMatch(/Reassign the 2 employees/);
    expect(roleDeletionBlocker({ is_system: false }, 0)).toBeNull();
  });
  it("applies custom role permissions from the directory", () => {
    setRolePermissions({ "Fraud Analyst": ["transactions.view"] });
    expect(can("Fraud Analyst", "transactions.view")).toBe(true);
    expect(can("Fraud Analyst", "cards.lock")).toBe(false);
    expect(can("Administrator", "cards.lock")).toBe(false);
    setRolePermissions({ ...ROLE_PERMISSIONS });
    expect(can("Administrator", "roles.manage")).toBe(true);
  });
});

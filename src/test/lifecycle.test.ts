import { describe, expect, it } from "vitest";
import {
  CLOSURE_REASONS,
  CLOSURE_REQUEST_REASONS,
  closureBalanceSnapshot,
  REACTIVATION_WINDOW_DAYS,
  reactivationAvailable,
  RESTRICTION_REASONS,
  SETUP_FOLLOWUP_DAYS,
  setupIncomplete,
} from "../services/rules";
import type { Account, Customer, SavingsGoal } from "../types/models";

const DAY = 864e5;
const NOW = Date.parse("2026-11-17T12:00:00Z");
const daysAgo = (n: number) => new Date(NOW - n * DAY).toISOString();

describe("restriction and closure policy", () => {
  it("has the standard reason lists", () => {
    expect(RESTRICTION_REASONS).toContain("Suspected fraud");
    expect(RESTRICTION_REASONS).toContain("AML review");
    expect(RESTRICTION_REASONS).toContain("Sanctions");
    expect(CLOSURE_REASONS).toContain("Customer request");
    expect(CLOSURE_REASONS).toContain("Inactivity");
    expect(CLOSURE_REASONS).toContain("Failed KYC");
    expect(CLOSURE_REASONS).toContain("Deceased");
  });

  it("allows reactivation inside the appeal window", () => {
    expect(reactivationAvailable({ closedAt: daysAgo(1) }, NOW)).toBe(true);
    expect(reactivationAvailable({ closedAt: daysAgo(REACTIVATION_WINDOW_DAYS - 1) }, NOW)).toBe(
      true,
    );
  });

  it("makes closure permanent after the window", () => {
    expect(reactivationAvailable({ closedAt: daysAgo(REACTIVATION_WINDOW_DAYS + 1) }, NOW)).toBe(
      false,
    );
    expect(reactivationAvailable({ closedAt: daysAgo(400) }, NOW)).toBe(false);
  });

  it("never allows reactivation without a closure record", () => {
    expect(reactivationAvailable(null, NOW)).toBe(false);
  });
});

describe("closure requests", () => {
  it("offers the app exit-survey reasons", () => {
    expect(CLOSURE_REQUEST_REASONS).toContain("Moving to another bank");
    expect(CLOSURE_REQUEST_REASONS).toContain("Moving abroad");
    expect(CLOSURE_REQUEST_REASONS).toContain("Other");
  });
});

describe("closureBalanceSnapshot", () => {
  const acc = (
    patch: Partial<Account>,
  ): Pick<Account, "customerId" | "accountType" | "availableBalance"> => ({
    customerId: "cus_1",
    accountType: "Smart Spend",
    availableBalance: 0,
    ...patch,
  });
  const goal = (patch: Partial<SavingsGoal>) => ({
    customerId: "cus_1",
    currentAmount: 0,
    status: "Active",
    ...patch,
  });

  it("totals Smart Spend plus Sense Save, with goals reported inside Sense Save", () => {
    const snap = closureBalanceSnapshot(
      [
        acc({ accountType: "Smart Spend", availableBalance: 120.5 }),
        acc({ accountType: "Sense Save", availableBalance: 900 }),
      ],
      [goal({ currentAmount: 400 })],
      "cus_1",
    );
    expect(snap).toEqual({ smartSpend: 120.5, senseSave: 900, goals: 400, total: 1020.5 });
  });

  it("never double-counts goal funds in the payable total", () => {
    const snap = closureBalanceSnapshot(
      [acc({ accountType: "Sense Save", availableBalance: 500 })],
      [goal({ currentAmount: 500 })],
      "cus_1",
    );
    expect(snap.total).toBe(500);
  });

  it("ignores other customers and closed goals", () => {
    const snap = closureBalanceSnapshot(
      [
        acc({ customerId: "cus_2", accountType: "Smart Spend", availableBalance: 999 }),
        acc({ accountType: "Smart Spend", availableBalance: null }),
      ],
      [
        goal({ currentAmount: 50, status: "Closed" }),
        goal({ customerId: "cus_2", currentAmount: 70 }),
      ],
      "cus_1",
    );
    expect(snap).toEqual({ smartSpend: 0, senseSave: 0, goals: 0, total: 0 });
  });
});

describe("setupIncomplete", () => {
  const at = (customerStatus: string, updatedAt: string) =>
    ({ customerStatus, updatedAt }) as unknown as Customer;

  it("flags a customer stuck in setup past the follow-up window", () => {
    expect(setupIncomplete(at("Setup In Progress", daysAgo(SETUP_FOLLOWUP_DAYS + 1)), NOW)).toBe(
      true,
    );
  });

  it("leaves a customer who only just entered setup alone", () => {
    expect(setupIncomplete(at("Setup In Progress", daysAgo(0)), NOW)).toBe(false);
  });

  it("ignores customers in any other state", () => {
    expect(setupIncomplete(at("Active", daysAgo(30)), NOW)).toBe(false);
    expect(setupIncomplete(at("KYC Pending", daysAgo(30)), NOW)).toBe(false);
  });
});

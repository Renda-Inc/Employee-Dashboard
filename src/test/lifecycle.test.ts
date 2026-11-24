import { describe, expect, it } from "vitest";
import {
  CLOSURE_REASONS,
  CLOSURE_REQUEST_REASONS,
  closureBalanceSnapshot,
  currentOrderForCard,
  FREEZE_REASONS,
  HOLD_REASONS,
  payableBalance,
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

  it("keeps freeze and hold reasons separate, by kind", () => {
    // The split the backend engineer was given (2026-11-24): freezes
    // are operational, holds are AML and sanctions only.
    expect(FREEZE_REASONS).toContain("Suspected fraud");
    expect(FREEZE_REASONS).toContain("Lost or stolen device");
    expect(FREEZE_REASONS).toContain("Customer request");
    expect(FREEZE_REASONS).not.toContain("AML review");
    expect(FREEZE_REASONS).not.toContain("Sanctions");
    expect(HOLD_REASONS).toEqual(["AML review", "Sanctions"]);
    expect(RESTRICTION_REASONS).toEqual([...FREEZE_REASONS, ...HOLD_REASONS]);
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

describe("payableBalance", () => {
  const acc = (
    patch: Partial<Account>,
  ): Pick<Account, "customerId" | "accountStatus" | "availableBalance"> => ({
    customerId: "cus_1",
    accountStatus: "Active",
    availableBalance: 0,
    ...patch,
  });

  it("sums positive balances on Active and Restricted accounts only", () => {
    const accounts = [
      acc({ accountStatus: "Active", availableBalance: 100.1 }),
      acc({ accountStatus: "Restricted", availableBalance: 50 }),
      acc({ accountStatus: "Closed", availableBalance: 999 }),
      acc({ accountStatus: "Pending Issuance", availableBalance: 999 }),
      acc({ accountStatus: "Active", availableBalance: -5 }),
      acc({ customerId: "cus_2", accountStatus: "Active", availableBalance: 999 }),
    ];
    expect(payableBalance(accounts, "cus_1")).toBe(150.1);
  });

  it("is zero when nothing is payable", () => {
    expect(payableBalance([acc({ availableBalance: 0 })], "cus_1")).toBe(0);
    expect(payableBalance([], "cus_1")).toBe(0);
  });
});

describe("currentOrderForCard", () => {
  const order = (patch: Record<string, unknown>) =>
    ({ id: "ord_1", cardId: "card_1", orderStatus: "Eligible", ...patch }) as never;

  it("returns the card's non-canceled order", () => {
    const live = order({ id: "ord_2", orderStatus: "Batched" });
    expect(currentOrderForCard([order({}), live], "card_1")?.id).toBe("ord_1");
    expect(currentOrderForCard([live], "card_1")?.id).toBe("ord_2");
  });

  it("skips canceled orders and other cards", () => {
    expect(
      currentOrderForCard(
        [order({ orderStatus: "Canceled" }), order({ id: "ord_9", cardId: "card_2" })],
        "card_1",
      ),
    ).toBeUndefined();
  });
});

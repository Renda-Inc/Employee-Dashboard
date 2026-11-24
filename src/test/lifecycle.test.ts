import { describe, expect, it } from "vitest";
import {
  CLOSURE_REASONS,
  REACTIVATION_WINDOW_DAYS,
  reactivationAvailable,
  RESTRICTION_REASONS,
  SETUP_FOLLOWUP_DAYS,
  setupIncomplete,
} from "../services/rules";
import type { Customer } from "../types/models";

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

import { describe, expect, it } from "vitest";
import {
  CLOSURE_REASONS,
  REACTIVATION_WINDOW_DAYS,
  reactivationAvailable,
  RESTRICTION_REASONS,
} from "../services/rules";

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

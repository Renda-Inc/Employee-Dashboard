// Plus billing rules (product rule, user, 2026-11-17): upgrades charge
// Smart Spend immediately or do not happen; a failed renewal is retried
// at intervals for the rest of the billing month with the plan staying
// active; if the fee is still unpaid at the new billing date, the plan
// downgrades to Everyday. There is no "billing issue" state.
import { describe, expect, it } from "vitest";
import { addMonths, billingDowngradeDue } from "@/services/rules";

describe("addMonths", () => {
  it("advances a plain date by one month", () => {
    expect(addMonths("2026-11-17T12:00:00.000Z", 1)).toBe("2026-12-17T12:00:00.000Z");
  });

  it("clamps the day to the target month's length", () => {
    expect(addMonths("2026-01-31T12:00:00.000Z", 1)).toBe("2026-02-28T12:00:00.000Z");
    expect(addMonths("2028-01-31T12:00:00.000Z", 1)).toBe("2028-02-29T12:00:00.000Z");
  });

  it("crosses year boundaries", () => {
    expect(addMonths("2026-12-15T00:00:00.000Z", 1)).toBe("2027-01-15T00:00:00.000Z");
  });
});

describe("billingDowngradeDue", () => {
  const sub = {
    billingOutstandingSince: "2026-10-17T00:00:00.000Z",
    nextBillingDate: "2026-11-17T00:00:00.000Z",
  };

  it("is false while the retry window is still open", () => {
    expect(billingDowngradeDue(sub, new Date("2026-11-16T23:59:59.000Z").getTime())).toBe(false);
  });

  it("is true once the new billing date arrives with the fee unpaid", () => {
    expect(billingDowngradeDue(sub, new Date("2026-11-17T00:00:00.000Z").getTime())).toBe(true);
    expect(billingDowngradeDue(sub, new Date("2026-11-20T00:00:00.000Z").getTime())).toBe(true);
  });

  it("is false when no fee is outstanding", () => {
    expect(
      billingDowngradeDue(
        { billingOutstandingSince: null, nextBillingDate: "2026-11-17T00:00:00.000Z" },
        new Date("2026-12-01T00:00:00.000Z").getTime(),
      ),
    ).toBe(false);
  });

  it("is false without a next billing date", () => {
    expect(
      billingDowngradeDue(
        { billingOutstandingSince: "2026-10-17T00:00:00.000Z", nextBillingDate: null },
        new Date("2026-12-01T00:00:00.000Z").getTime(),
      ),
    ).toBe(false);
  });
});

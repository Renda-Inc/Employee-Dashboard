// Card lifecycle rules: manufacturing is outsourced end to end. Renda
// submits a batch, the manufacturer prints and mails cards directly,
// delivery is never tracked, and customer activation completes the flow.
import { describe, expect, it } from "vitest";
import { ACTIVATION_FOLLOWUP_DAYS, activationOverdue, batchIneligibility } from "@/services/rules";
import type { CardOrder } from "@/types/models";

const order = (patch: Partial<CardOrder>): CardOrder =>
  ({
    id: "ord_1",
    orderReference: "CO-2026-1041",
    customerId: "cus_001",
    cardId: "crd_1",
    previousCardId: null,
    orderType: "Initial Plus Card",
    requestedDesign: "Classic",
    previousDesign: null,
    orderStatus: "Eligible",
    requestDate: new Date().toISOString(),
    manufacturingBatchId: null,
    replacementReason: null,
    replacementReference: null,
    activatedAt: null,
    notes: "",
    ...patch,
  }) as CardOrder;

describe("batch eligibility", () => {
  it("accepts an eligible, unbatched order", () => {
    expect(batchIneligibility(order({}))).toBeNull();
  });

  it("rejects orders already sent to the manufacturer", () => {
    expect(batchIneligibility(order({ orderStatus: "Submitted" }))).toContain(
      "already been included in a submitted manufacturing batch",
    );
  });

  it("rejects activated orders: activation is the terminal state", () => {
    expect(
      batchIneligibility(
        order({ orderStatus: "Activated", activatedAt: new Date().toISOString() }),
      ),
    ).toContain("already been included in a submitted manufacturing batch");
  });
});

describe("activation follow-up", () => {
  const daysAgo = (n: number) => new Date(Date.now() - n * 864e5).toISOString();

  it("flags a card in production past the follow-up window", () => {
    expect(
      activationOverdue({ cardStatus: "In Production" }, daysAgo(ACTIVATION_FOLLOWUP_DAYS)),
    ).toBe(true);
    expect(activationOverdue({ cardStatus: "In Production" }, daysAgo(30))).toBe(true);
  });

  it("does not flag a recently submitted card", () => {
    expect(
      activationOverdue({ cardStatus: "In Production" }, daysAgo(ACTIVATION_FOLLOWUP_DAYS - 1)),
    ).toBe(false);
  });

  it("does not flag activated cards or cards without a submission", () => {
    expect(activationOverdue({ cardStatus: "Active" }, daysAgo(30))).toBe(false);
    expect(activationOverdue({ cardStatus: "In Production" }, null)).toBe(false);
  });
});

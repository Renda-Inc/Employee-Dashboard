// Pure business rules. No UI, no storage — easy to test and to move server-side later.
import type { Account, CardOrder, Customer, Plan } from "@/types/models";

export const PLAN_PRICES: Record<Plan, number> = { Everyday: 0, Plus: 9.96 };
export const CURRENCY = "CAD";

/** Next Friday processing date (today if today is Friday), local time. */
export function nextFriday(from: Date = new Date()): Date {
  const d = new Date(from.getFullYear(), from.getMonth(), from.getDate());
  const diff = (5 - d.getDay() + 7) % 7;
  d.setDate(d.getDate() + diff);
  return d;
}

/** Returns null when the customer can be activated, otherwise the blocking reason. */
export function activationBlocker(c: Customer, accounts: Account[]): string | null {
  if (!c.emailVerified)
    return "This customer cannot be activated because the email address has not been verified.";
  if (!c.phoneVerified)
    return "This customer cannot be activated because the phone number has not been verified.";
  if (c.kycStatus !== "Approved")
    return "This customer cannot be activated because KYC verification has not been completed.";
  if (c.accountIssuanceStatus !== "Issued")
    return "This customer cannot be activated because their banking accounts have not been issued.";
  const mine = accounts.filter((a) => a.customerId === c.id);
  if (!mine.some((a) => a.accountType === "Smart Spend" && a.accountStatus === "Active"))
    return "This customer cannot be activated because no active Smart Spend account exists.";
  if (c.customerStatus !== "Setup In Progress")
    return `Activation is only possible from Setup In Progress (current: ${c.customerStatus}).`;
  return null;
}

/** Why an order cannot be added to a new batch, or null if it can. */
export function batchIneligibility(o: CardOrder): string | null {
  if (o.orderStatus === "Submitted" || o.orderStatus === "Delivered")
    return "This card order has already been included in a submitted manufacturing batch.";
  if (o.manufacturingBatchId)
    return "This card order is already part of another manufacturing batch.";
  if (o.orderStatus !== "Eligible") return `Orders with status ${o.orderStatus} cannot be batched.`;
  return null;
}

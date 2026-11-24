// Pure business rules. No UI, no storage, easy to test and to move server-side later.
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
/** Days a customer can sit in Setup In Progress (accounts issued, app
 * setup unfinished: plan choice, biometrics, card design) before the
 * attention queue flags them as not fully live yet. */
export const SETUP_FOLLOWUP_DAYS = 2;

export function setupIncomplete(c: Customer, now: number = Date.now()): boolean {
  if (c.customerStatus !== "Setup In Progress") return false;
  return now - new Date(c.updatedAt).getTime() >= SETUP_FOLLOWUP_DAYS * 864e5;
}

export function activationBlocker(c: Customer, accounts: Account[]): string | null {
  if (c.restriction)
    return "This customer is restricted. The restriction must be lifted before setup can be completed.";
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
  if (o.orderStatus === "Submitted" || o.orderStatus === "Activated")
    return "This card order has already been included in a submitted manufacturing batch.";
  if (o.manufacturingBatchId)
    return "This card order is already part of another manufacturing batch.";
  if (o.orderStatus !== "Eligible") return `Orders with status ${o.orderStatus} cannot be batched.`;
  return null;
}

/** Days a card may sit In Production before the missing activation is
 * worth an employee's attention. The manufacturer mails cards directly
 * and delivery is not tracked, so a card that was submitted long ago and
 * never activated is the only "where is my card" signal Renda gets. */
export const ACTIVATION_FOLLOWUP_DAYS = 14;

/** True when a manufactured card was submitted at least
 * ACTIVATION_FOLLOWUP_DAYS ago and the customer still has not activated it. */
export function activationOverdue(
  card: { cardStatus: string },
  submittedAt: string | null,
  now: number = Date.now(),
): boolean {
  if (card.cardStatus !== "In Production" || !submittedAt) return false;
  return now - new Date(submittedAt).getTime() >= ACTIVATION_FOLLOWUP_DAYS * 864e5;
}

/** ISO timestamp one or more calendar months after the given one, with the
 * day clamped to the target month's length (Jan 31 + 1 month is Feb 28/29). */
export function addMonths(iso: string, months: number): string {
  const d = new Date(iso);
  const day = d.getDate();
  d.setDate(1);
  d.setMonth(d.getMonth() + months);
  const lastDay = new Date(d.getFullYear(), d.getMonth() + 1, 0).getDate();
  d.setDate(Math.min(day, lastDay));
  return d.toISOString();
}

/** Restriction and closure (product rule, user, 2026-11-17): two kinds of
 * restriction, an operational freeze (Support or Banking Operations) and a
 * compliance hold (Compliance only). Restriction blocks outbound activity
 * only; inbound payments and login still work, and cards stop working
 * because spending is outbound, not because the card itself is blocked.
 * Only Compliance can lift a restriction from the admin. */
export const RESTRICTION_REASONS = [
  "Suspected fraud",
  "Customer request",
  "Lost or stolen device",
  "AML review",
  "Sanctions",
  "Abuse",
] as const;

export const CLOSURE_REASONS = [
  "Customer request",
  "Inactivity",
  "Abuse",
  "Failed KYC",
  "Suspected fraud",
  "AML review",
  "Deceased",
] as const;

/** Exit reasons offered to the customer in the app when they ask to
 * close their account. Their pick, plus any feedback, lands on the
 * customer record as a closure request for the admin to process. */
export const CLOSURE_REQUEST_REASONS = [
  "Moving to another bank",
  "Fees and pricing",
  "Not using it enough",
  "Missing a feature I need",
  "Moving abroad",
  "Customer service experience",
  "Other",
] as const;

/** Balance snapshot for a closure request or closure preview: what sits
 * in each account, how much of Sense Save is held in savings goals, and
 * the payable total. Goal funds are part of the Sense Save balance, so
 * the total is Smart Spend + Sense Save, never plus goals again. */
export function closureBalanceSnapshot(
  accounts: Pick<Account, "customerId" | "accountType" | "availableBalance">[],
  goals: { customerId: string; currentAmount: number | null; status: string }[],
  customerId: string,
): { smartSpend: number; senseSave: number; goals: number; total: number } {
  const mine = accounts.filter((a) => a.customerId === customerId);
  const smartSpend = mine
    .filter((a) => a.accountType === "Smart Spend")
    .reduce((s, a) => s + (a.availableBalance ?? 0), 0);
  const senseSave = mine
    .filter((a) => a.accountType === "Sense Save")
    .reduce((s, a) => s + (a.availableBalance ?? 0), 0);
  const goalsTotal = goals
    .filter((g) => g.customerId === customerId && (g.status === "Active" || g.status === "Paused"))
    .reduce((s, g) => s + (g.currentAmount ?? 0), 0);
  const round = (n: number) => Math.round(n * 100) / 100;
  return {
    smartSpend: round(smartSpend),
    senseSave: round(senseSave),
    goals: round(goalsTotal),
    total: round(smartSpend + senseSave),
  };
}

/** Days after closure during which a customer can appeal and, if they
 * pass the reactivation policy checks, have the same account reactivated.
 * After the window the closure is permanent; returning customers then
 * register fresh (Revolut's model: the same email and phone can be reused
 * for a new account, with full KYC again). */
export const REACTIVATION_WINDOW_DAYS = 90;

export function reactivationAvailable(
  closure: { closedAt: string } | null,
  now: number = Date.now(),
): boolean {
  if (!closure) return false;
  return now - new Date(closure.closedAt).getTime() < REACTIVATION_WINDOW_DAYS * 864e5;
}

/** Plus billing (product rule, user, 2026-11-17): a failed renewal charge is
 * retried at intervals for the rest of the billing month while the plan
 * stays active. The retry window closes at the new billing date, which is
 * the subscription's nextBillingDate (advanced past the missed date when
 * the first attempt failed). If the fee is still outstanding then, the
 * plan is downgraded to Everyday. There is no "billing issue" state. */
export function billingDowngradeDue(
  sub: { billingOutstandingSince: string | null; nextBillingDate: string | null },
  now: number = Date.now(),
): boolean {
  if (!sub.billingOutstandingSince || !sub.nextBillingDate) return false;
  return now >= new Date(sub.nextBillingDate).getTime();
}

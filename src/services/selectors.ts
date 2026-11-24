// Derived views over the shared dataset (queues, notifications, search).
import type { DB } from "@/types/models";
import type { Permission } from "./permissions";
import { fmtDate, fullName } from "@/lib/format";
import {
  ACTIVATION_FOLLOWUP_DAYS,
  activationOverdue,
  billingDowngradeDue,
  setupIncomplete,
} from "./rules";

export interface QueueItem {
  id: string;
  /** Permission needed to open the item's target, so the dashboard and
   * the notification bell only show items the signed-in role can act on. */
  perm: Permission;
  type: string;
  record: string;
  detail: string;
  at: string;
  action: string;
  to: string;
  params?: Record<string, string>;
  tone: "warning" | "danger" | "info";
}

export function attentionQueue(db: DB): QueueItem[] {
  const name = (id: string) => {
    const c = db.customers.find((x) => x.id === id);
    return c ? fullName(c) : id;
  };
  const items: QueueItem[] = [];
  for (const k of db.kycCases) {
    if (k.status === "Under Review" || k.status === "Pending")
      items.push({
        id: `q_kyc_${k.id}`,
        perm: "kyc.view",
        type: k.status === "Under Review" ? "KYC manual review" : "KYC awaiting result",
        record: name(k.customerId),
        detail: k.outstandingRequirements[0] ?? "",
        at: k.lastUpdated,
        action: "Review",
        to: "/onboarding/$customerId",
        params: { customerId: k.customerId },
        tone: k.status === "Under Review" ? "warning" : "info",
      });
  }
  for (const c of db.customers) {
    if (c.customerStatus === "Account Issuance Failed")
      items.push({
        id: `q_iss_${c.id}`,
        perm: "kyc.view",
        type: "Account issuance failed",
        record: fullName(c),
        detail: "Banking provider returned an error",
        at: c.updatedAt,
        action: "Investigate",
        to: "/onboarding/$customerId",
        params: { customerId: c.id },
        tone: "danger",
      });
    if (setupIncomplete(c))
      items.push({
        id: `q_setup_${c.id}`,
        perm: "customers.view",
        type: "Setup incomplete",
        record: fullName(c),
        detail:
          "Accounts issued and active, but the customer has not finished app setup (plan choice, biometrics, card design), so they are not fully live yet",
        at: c.updatedAt,
        action: "Open",
        to: "/customers/$customerId",
        params: { customerId: c.id },
        tone: "warning",
      });
    if (c.closureRequest?.status === "Pending" || c.closureRequest?.status === "In Progress") {
      const assignee = c.closureRequest.assignedTo
        ? db.employees.find((e) => e.id === c.closureRequest!.assignedTo)
        : undefined;
      items.push({
        id: `q_close_${c.id}`,
        perm: "customers.view",
        type:
          c.closureRequest.status === "In Progress"
            ? "Closure being processed"
            : "Closure requested",
        record: fullName(c),
        detail: `Asked to close from the app · reason: ${c.closureRequest.reason} · ${c.closureRequest.balances.total > 0 ? `$${c.closureRequest.balances.total.toFixed(2)} to pay out to ${c.closureRequest.payoutEmail}` : "no balance to pay out"}${assignee ? ` · assigned to ${assignee.name}` : ""}`,
        at: c.closureRequest.requestedAt,
        action: "Review",
        to: "/closure-requests/$customerId",
        params: { customerId: c.id },
        tone: "warning",
      });
    }
    if (
      c.onboardingStatus === "Blocked" ||
      (c.customerStatus === "Onboarding In Progress" && !c.phoneVerified)
    )
      items.push({
        id: `q_onb_${c.id}`,
        perm: "kyc.view",
        type: "Onboarding blocked",
        record: fullName(c),
        detail:
          c.kycStatus === "Failed"
            ? "KYC failed: resubmission needed"
            : "Phone verification incomplete",
        at: c.updatedAt,
        action: "Open",
        to: "/onboarding/$customerId",
        params: { customerId: c.id },
        tone: "warning",
      });
  }
  for (const o of db.cardOrders) {
    if (o.orderType === "Replacement Card" && o.orderStatus === "Eligible")
      items.push({
        id: `q_rpl_${o.id}`,
        perm: "cards.view",
        type: "Card replacement awaiting batch",
        record: name(o.customerId),
        detail: `${o.replacementReference} · ${o.previousDesign} → ${o.requestedDesign}`,
        at: o.requestDate,
        action: "View card",
        to: "/cards/$cardId",
        params: { cardId: o.cardId },
        tone: "info",
      });
  }
  for (const card of db.cards) {
    if (card.cardStatus !== "In Production") continue;
    const batch = db.batches.find((b) => b.id === card.manufacturingBatchId);
    if (!activationOverdue(card, batch?.submittedAt ?? null)) continue;
    const days = batch?.submittedAt
      ? Math.floor((Date.now() - new Date(batch.submittedAt).getTime()) / 864e5)
      : ACTIVATION_FOLLOWUP_DAYS;
    items.push({
      id: `q_act_${card.id}`,
      perm: "cards.view",
      type: "Card not activated",
      record: name(card.customerId),
      detail: `•••• ${card.last4} · sent to manufacturer ${days} days ago in ${batch?.batchReference ?? "a submitted batch"} · no activation yet (delivery is not tracked)`,
      at: batch?.submittedAt ?? card.issueDate ?? "",
      action: "View card",
      to: "/cards/$cardId",
      params: { cardId: card.id },
      tone: "warning",
    });
  }
  for (const b of db.batches) {
    if (b.status !== "Submitted")
      items.push({
        id: `q_bat_${b.id}`,
        perm: "cards.view",
        type: b.status === "Draft" ? "Draft manufacturing batch" : "Batch awaiting submission",
        record: b.batchReference,
        detail: `${b.orderCount} orders · ${b.pdfReference ? "PDF generated" : "PDF not generated"}`,
        at: b.createdAt,
        action: "Open batch",
        to: "/cards/manufacturing/$batchId",
        params: { batchId: b.id },
        tone: "warning",
      });
  }
  for (const s of db.subscriptions) {
    if (s.cardSelectionRequired)
      items.push({
        id: `q_sel_${s.id}`,
        perm: "customers.view",
        type: "Plus card selection outstanding",
        record: name(s.customerId),
        detail: "Upgraded to Plus; no physical card selected",
        at: s.history[s.history.length - 1].at,
        action: "Open",
        to: "/customers/$customerId",
        params: { customerId: s.customerId },
        tone: "info",
      });
    if (s.billingOutstandingSince) {
      const due = billingDowngradeDue(s);
      items.push({
        id: `q_bil_${s.id}`,
        perm: "customers.view",
        type: due ? "Plus downgrade due" : "Plus payment retrying",
        record: name(s.customerId),
        detail: due
          ? `Plus fee unpaid since ${fmtDate(s.billingOutstandingSince)} after ${s.billingRetryCount} failed attempt${s.billingRetryCount === 1 ? "" : "s"} · retry window closed at the new billing date`
          : `Plus fee unpaid since ${fmtDate(s.billingOutstandingSince)} · attempt ${s.billingRetryCount} · retries every ${db.settings.planRetryIntervalDays} days · downgrades ${fmtDate(s.nextBillingDate)} if unpaid`,
        at: s.lastBillingAttemptAt ?? s.billingOutstandingSince,
        action: "Open",
        to: "/customers/$customerId",
        params: { customerId: s.customerId },
        tone: due ? "danger" : "warning",
      });
    }
  }
  for (const sc of db.supportCases) {
    if ((sc.status === "Open" && !sc.assignedEmployeeId) || sc.status === "Escalated")
      items.push({
        id: `q_sc_${sc.id}`,
        perm: "support.view",
        type: sc.status === "Escalated" ? "Escalated support case" : "Unassigned support case",
        record: `${sc.caseReference} · ${name(sc.customerId)}`,
        detail: sc.subject,
        at: sc.createdAt,
        action: "Open case",
        to: "/support/$caseId",
        params: { caseId: sc.id },
        tone: sc.priority === "Urgent" || sc.status === "Escalated" ? "danger" : "warning",
      });
  }
  for (const t of db.transactions) {
    if (
      t.status === "Failed" &&
      db.supportCases.some(
        (sc) =>
          sc.links.some((l) => l.id === t.id) && sc.status !== "Resolved" && sc.status !== "Closed",
      )
    )
      items.push({
        id: `q_tx_${t.id}`,
        perm: "transactions.view",
        type: "Transaction under investigation",
        record: t.transactionReference,
        detail: `${t.description} · ${t.errorMessage ?? "Failed"}`,
        at: t.timestamp,
        action: "Investigate",
        to: "/transactions/$transactionId",
        params: { transactionId: t.id },
        tone: "danger",
      });
  }
  return items.sort((a, b) => b.at.localeCompare(a.at));
}

export function notifications(db: DB) {
  const s = db.settings;
  return attentionQueue(db)
    .filter((q) => {
      if (q.id.startsWith("q_kyc") || q.id.startsWith("q_onb") || q.id.startsWith("q_iss"))
        return s.notifyKyc;
      if (q.id.startsWith("q_sc") || q.id.startsWith("q_tx")) return s.notifySupport;
      if (
        q.id.startsWith("q_bat") ||
        q.id.startsWith("q_rpl") ||
        q.id.startsWith("q_sel") ||
        q.id.startsWith("q_act")
      )
        return s.notifyManufacturing;
      return true;
    })
    .slice(0, 12);
}

export interface SearchResult {
  group: "Customers" | "Accounts" | "Transactions" | "Cards" | "Support Cases";
  id: string;
  title: string;
  subtitle: string;
  to: string;
  params: Record<string, string>;
}

export function globalSearch(
  db: DB,
  q: string,
  allowed: (g: SearchResult["group"]) => boolean,
): SearchResult[] {
  const t = q.trim().toLowerCase();
  if (t.length < 2) return [];
  const has = (...v: (string | null | undefined)[]) => v.some((x) => x?.toLowerCase().includes(t));
  const cname = (id: string) => {
    const c = db.customers.find((x) => x.id === id);
    return c ? fullName(c) : "";
  };
  const out: SearchResult[] = [];
  if (allowed("Customers"))
    db.customers
      .filter((c) => has(fullName(c), c.userId, c.email, c.phone))
      .slice(0, 6)
      .forEach((c) =>
        out.push({
          group: "Customers",
          id: c.id,
          title: fullName(c),
          subtitle: `${c.userId} · ${c.email}`,
          to: "/customers/$customerId",
          params: { customerId: c.id },
        }),
      );
  if (allowed("Accounts"))
    db.accounts
      .filter((a) => has(a.maskedAccountIdentifier, a.id, cname(a.customerId)))
      .slice(0, 5)
      .forEach((a) =>
        out.push({
          group: "Accounts",
          id: a.id,
          title: `${a.accountType} ${a.maskedAccountIdentifier ?? "(pending)"}`,
          subtitle: cname(a.customerId),
          to: "/accounts/$accountId",
          params: { accountId: a.id },
        }),
      );
  if (allowed("Transactions"))
    db.transactions
      .filter((x) => has(x.transactionReference, x.providerReference, x.description))
      .slice(0, 5)
      .forEach((x) =>
        out.push({
          group: "Transactions",
          id: x.id,
          title: x.transactionReference,
          subtitle: `${x.description} · ${cname(x.customerId)}`,
          to: "/transactions/$transactionId",
          params: { transactionId: x.id },
        }),
      );
  if (allowed("Cards"))
    db.cards
      .filter((c) => has(c.last4, c.cardDesign, c.replacementReference, cname(c.customerId)))
      .slice(0, 5)
      .forEach((c) =>
        out.push({
          group: "Cards",
          id: c.id,
          title: `${c.cardDesign} •••• ${c.last4}`,
          subtitle: `${cname(c.customerId)} · ${c.cardStatus}`,
          to: "/cards/$cardId",
          params: { cardId: c.id },
        }),
      );
  if (allowed("Support Cases"))
    db.supportCases
      .filter((s) => has(s.caseReference, s.subject, cname(s.customerId)))
      .slice(0, 5)
      .forEach((s) =>
        out.push({
          group: "Support Cases",
          id: s.id,
          title: `${s.caseReference} · ${s.subject}`,
          subtitle: `${cname(s.customerId)} · ${s.status}`,
          to: "/support/$caseId",
          params: { caseId: s.id },
        }),
      );
  return out;
}

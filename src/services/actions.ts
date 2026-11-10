// Demo implementation of `OperationsService` (see contracts/operations.ts). Every action checks
// permission here (not just in the UI), enforces business rules and records an audit event.
// Integrations (KYC, card processor, billing, manufacturer) are simulated.
import type {
  AuditEvent,
  CardDesign,
  CaseCategory,
  CaseLink,
  CasePriority,
  CaseStatus,
  Customer,
  DB,
  Plan,
  ReplacementReason,
} from "@/types/models";
import { getState, resetState, setState } from "./store";
import { EDITABLE_FIELDS, type EditableField, type OperationalSettings, type OperationsService, type PersonalSettings } from "./contracts/operations";
import { can, PermissionError, RuleError, type Permission } from "./permissions";
import { activationBlocker, batchIneligibility, PLAN_PRICES } from "./rules";

let seq = 0;
const uid = (p: string) => `${p}_${Date.now().toString(36)}${(++seq).toString(36)}`;
const now = () => new Date().toISOString();
const name = (c: Customer) => `${c.firstName} ${c.lastName}`;

const SIGNED_OUT: DB["employees"][number] = { id: "", name: "Signed out", email: "", role: "", status: "Inactive" };

/** The signed-in employee (synced from the employee directory at sign-in). */
export function currentEmployee(db: DB = getState()) {
  return db.employees.find((e) => e.id === db.currentEmployeeId) ?? SIGNED_OUT;
}

function pushAudit(d: DB, e: Omit<AuditEvent, "id" | "timestamp" | "employeeId">) {
  d.audit.unshift({ id: uid("aud"), timestamp: now(), employeeId: d.currentEmployeeId, ...e });
}

/** Throws (and audits the denial) when the current employee lacks a permission. */
function authorize(p: Permission, action: string, module: string, entityType: string, entityId: string, entityLabel: string) {
  const emp = currentEmployee();
  if (emp.status !== "Active" || !can(emp.role, p)) {
    setState((d) =>
      pushAudit(d, { action: `${action} attempted`, module, entityType, entityId, entityLabel, outcome: "Denied", details: `Role ${emp.role} lacks ${p}` }),
    );
    throw new PermissionError(`Your role (${emp.role}) is not permitted to ${action.toLowerCase()}.`);
  }
}

function getCustomer(id: string) {
  const c = getState().customers.find((x) => x.id === id);
  if (!c) throw new RuleError("Customer not found.");
  return c;
}

function activity(d: DB, customerId: string, type: DB["activity"][number]["type"], description: string, link?: DB["activity"][number]["link"]) {
  d.activity.unshift({ id: uid("act"), customerId, type, description, timestamp: now(), link });
}

/* ---------------- Employee session ---------------- */

/** Mirrors the employee directory into the operations dataset so names, assignment and audit attribution resolve. */
export function syncDirectory(meId: string, employees: DB["employees"]) {
  setState((d) => {
    const ids = new Set(employees.map((e) => e.id));
    d.employees = [...d.employees.filter((e) => !e.directory && !ids.has(e.id)), ...employees];
    d.currentEmployeeId = meId;
  });
}

export function clearEmployeeSession() {
  setState((d) => {
    d.currentEmployeeId = "";
  });
}

function markNotificationsRead(ids: string[]) {
  setState((d) => {
    d.readNotificationIds = Array.from(new Set([...d.readNotificationIds, ...ids]));
  });
}

/* ---------------- Customers ---------------- */


function updateCustomer(id: string, patch: Partial<Pick<Customer, EditableField>>) {
  const c = getCustomer(id);
  authorize("customers.edit", "Update customer information", "Customers", "Customer", id, name(c));
  const before: Record<string, unknown> = {};
  const after: Record<string, unknown> = {};
  for (const k of EDITABLE_FIELDS) {
    if (k in patch && patch[k] !== undefined && patch[k] !== c[k]) {
      before[k] = c[k];
      after[k] = patch[k];
    }
  }
  if (!Object.keys(after).length) throw new RuleError("No changes to save.");
  setState((d) => {
    const x = d.customers.find((y) => y.id === id)!;
    Object.assign(x, after);
    // Changing contact details requires re-verification.
    if ("email" in after) x.emailVerified = false;
    if ("phone" in after) x.phoneVerified = false;
    x.updatedAt = now();
    pushAudit(d, { action: "Customer information updated", module: "Customers", entityType: "Customer", entityId: id, entityLabel: name(x), outcome: "Success", details: Object.keys(after).join(", "), before, after });
    activity(d, id, "Profile", `Profile updated by employee (${Object.keys(after).join(", ")})`);
  });
}

/* ---------------- KYC & lifecycle ---------------- */

function escalateKyc(customerId: string, reason: string) {
  const c = getCustomer(customerId);
  authorize("kyc.decide", "Escalate KYC to manual review", "Onboarding & KYC", "Customer", customerId, name(c));
  if (c.kycStatus !== "Pending") throw new RuleError("Only pending KYC cases can be escalated to manual review.");
  if (reason.trim().length < 10) throw new RuleError("Provide a documented reason (at least 10 characters).");
  setState((d) => {
    const x = d.customers.find((y) => y.id === customerId)!;
    x.kycStatus = "Under Review";
    x.customerStatus = "KYC Under Review";
    x.updatedAt = now();
    const k = d.kycCases.find((y) => y.customerId === customerId);
    if (k) {
      k.status = "Under Review";
      k.lastUpdated = now();
      k.outstandingRequirements = ["Manual compliance review"];
    }
    pushAudit(d, { action: "KYC escalated to manual review", module: "Onboarding & KYC", entityType: "Customer", entityId: customerId, entityLabel: name(x), outcome: "Success", details: reason, before: { kycStatus: "Pending" }, after: { kycStatus: "Under Review" } });
    activity(d, customerId, "KYC", "KYC case escalated to manual review");
  });
}

/** Manual review decision — only for cases already in manual review. A failed provider result cannot be overturned here. */
function recordKycDecision(customerId: string, decision: "Approved" | "Failed", reason: string) {
  const c = getCustomer(customerId);
  authorize("kyc.decide", "Record KYC decision", "Onboarding & KYC", "Customer", customerId, name(c));
  if (c.kycStatus !== "Under Review")
    throw new RuleError(c.kycStatus === "Failed" ? "A failed KYC check cannot be marked as passed. Request resubmission instead." : "Decisions can only be recorded for cases under manual review.");
  if (reason.trim().length < 10) throw new RuleError("Provide a documented reason (at least 10 characters).");
  setState((d) => {
    const x = d.customers.find((y) => y.id === customerId)!;
    x.kycStatus = decision;
    x.customerStatus = decision === "Approved" ? "KYC Approved" : "KYC Failed";
    x.onboardingStatus = decision === "Approved" ? "Completed" : "Blocked";
    x.updatedAt = now();
    const k = d.kycCases.find((y) => y.customerId === customerId);
    if (k) {
      k.status = decision;
      k.completedAt = now();
      k.lastUpdated = now();
      k.decisionReason = reason;
      k.outstandingRequirements = decision === "Failed" ? ["Customer must resubmit identity documents"] : [];
    }
    pushAudit(d, { action: `KYC manual review: ${decision === "Approved" ? "approved" : "declined"}`, module: "Onboarding & KYC", entityType: "Customer", entityId: customerId, entityLabel: name(x), outcome: "Success", details: reason, before: { kycStatus: "Under Review" }, after: { kycStatus: decision } });
    activity(d, customerId, "KYC", decision === "Approved" ? "KYC approved after manual review" : "KYC declined after manual review");
  });
}

function requestKycResubmission(customerId: string) {
  const c = getCustomer(customerId);
  authorize("kyc.decide", "Request KYC resubmission", "Onboarding & KYC", "Customer", customerId, name(c));
  if (c.kycStatus !== "Failed") throw new RuleError("Resubmission can only be requested for failed KYC checks.");
  setState((d) => {
    const x = d.customers.find((y) => y.id === customerId)!;
    x.kycStatus = "Pending";
    x.customerStatus = "KYC Pending";
    x.onboardingStatus = "Completed";
    x.updatedAt = now();
    const k = d.kycCases.find((y) => y.customerId === customerId);
    if (k) {
      k.status = "Pending";
      k.completedAt = null;
      k.lastUpdated = now();
      k.outstandingRequirements = ["Awaiting customer resubmission and provider result"];
      k.providerMessages = [...k.providerMessages, "Resubmission requested (simulated — no provider call made)."];
    }
    pushAudit(d, { action: "KYC resubmission requested", module: "Onboarding & KYC", entityType: "Customer", entityId: customerId, entityLabel: name(x), outcome: "Simulated", details: "Customer must upload new documents. No provider request sent in demo.", before: { kycStatus: "Failed" }, after: { kycStatus: "Pending" } });
    activity(d, customerId, "KYC", "KYC resubmission requested");
  });
}

function requestAccountIssuance(customerId: string) {
  const c = getCustomer(customerId);
  authorize("accounts.manage", "Request account issuance", "Banking & Accounts", "Customer", customerId, name(c));
  if (c.kycStatus !== "Approved") throw new RuleError("Accounts cannot be issued because KYC verification has not been approved.");
  if (!(c.accountIssuanceStatus === "Not Started" || c.accountIssuanceStatus === "Failed"))
    throw new RuleError(`Account issuance is already ${c.accountIssuanceStatus.toLowerCase()}.`);
  setState((d) => {
    const x = d.customers.find((y) => y.id === customerId)!;
    const retry = x.accountIssuanceStatus === "Failed";
    x.accountIssuanceStatus = "Pending";
    x.customerStatus = "Account Issuance Pending";
    x.updatedAt = now();
    for (const type of ["Smart Spend", "Sense Save"] as const) {
      const accId = `acc_${customerId.slice(4)}_${type === "Smart Spend" ? "ss" : "sv"}`;
      const existing = d.accounts.find((a) => a.id === accId);
      if (existing) existing.accountStatus = "Pending Issuance";
      else d.accounts.push({ id: accId, customerId, accountType: type, accountStatus: "Pending Issuance", maskedAccountIdentifier: null, openingDate: null, availableBalance: null, ledgerBalance: null, restrictions: [], lastActivity: null });
    }
    pushAudit(d, { action: retry ? "Account issuance retried" : "Account issuance requested", module: "Banking & Accounts", entityType: "Customer", entityId: customerId, entityLabel: name(x), outcome: "Simulated", details: "Queued with banking provider (simulated)." });
    activity(d, customerId, "Accounts", retry ? "Account issuance retried" : "Account issuance requested");
  });
}

function simulateIssuanceResult(customerId: string, success: boolean) {
  const c = getCustomer(customerId);
  authorize("accounts.manage", "Record issuance result", "Banking & Accounts", "Customer", customerId, name(c));
  if (c.accountIssuanceStatus !== "Pending") throw new RuleError("No issuance request is pending for this customer.");
  setState((d) => {
    const x = d.customers.find((y) => y.id === customerId)!;
    x.accountIssuanceStatus = success ? "Issued" : "Failed";
    x.customerStatus = success ? "Setup In Progress" : "Account Issuance Failed";
    x.updatedAt = now();
    d.accounts.filter((a) => a.customerId === customerId).forEach((a, i) => {
      a.accountStatus = success ? "Active" : "Issuance Failed";
      if (success) {
        a.maskedAccountIdentifier = `•••• ${String(4000 + ((customerId.charCodeAt(5) * 37 + i * 911) % 6000))}`;
        a.openingDate = now();
        a.availableBalance = 0;
        a.ledgerBalance = 0;
      }
    });
    pushAudit(d, { action: success ? "Accounts issued" : "Account issuance failed", module: "Banking & Accounts", entityType: "Customer", entityId: customerId, entityLabel: name(x), outcome: "Simulated", details: "Demo provider response — no real banking system contacted." });
    activity(d, customerId, "Accounts", success ? "Smart Spend and Sense Save accounts issued (simulated)" : "Account issuance failed — provider error (simulated)");
  });
}

function completeSetup(customerId: string) {
  const c = getCustomer(customerId);
  authorize("customers.lifecycle", "Activate customer", "Customers", "Customer", customerId, name(c));
  const blocker = activationBlocker(c, getState().accounts);
  if (blocker) throw new RuleError(blocker);
  setState((d) => {
    const x = d.customers.find((y) => y.id === customerId)!;
    x.customerStatus = "Active";
    x.updatedAt = now();
    const sub = d.subscriptions.find((s) => s.customerId === customerId);
    if (sub && sub.plan === "Everyday" && sub.subscriptionStatus === "Pending") sub.subscriptionStatus = "Active";
    pushAudit(d, { action: "Customer activated", module: "Customers", entityType: "Customer", entityId: customerId, entityLabel: name(x), outcome: "Success", details: "All onboarding, KYC, issuance and setup conditions satisfied.", before: { customerStatus: "Setup In Progress" }, after: { customerStatus: "Active" } });
    activity(d, customerId, "Accounts", "Setup completed — customer is now Active");
  });
}

/* ---------------- Transactions ---------------- */

function addTransactionNote(txId: string, text: string) {
  const t = getState().transactions.find((x) => x.id === txId);
  if (!t) throw new RuleError("Transaction not found.");
  authorize("transactions.investigate", "Add transaction note", "Transactions", "Transaction", txId, t.transactionReference);
  if (text.trim().length < 3) throw new RuleError("Note cannot be empty.");
  setState((d) => {
    d.transactions.find((x) => x.id === txId)!.notes.unshift({ id: uid("note"), at: now(), by: d.currentEmployeeId, text: text.trim() });
    pushAudit(d, { action: "Transaction note added", module: "Transactions", entityType: "Transaction", entityId: txId, entityLabel: t.transactionReference, outcome: "Success", details: "Internal note recorded" });
  });
}

/* ---------------- Support ---------------- */

function createSupportCase(input: { customerId: string; subject: string; message: string; category: CaseCategory; priority: CasePriority; links?: CaseLink[]; assignToMe?: boolean }) {
  const c = getCustomer(input.customerId);
  authorize("support.manage", "Create support case", "Customer Support", "Customer", c.id, name(c));
  if (input.subject.trim().length < 4) throw new RuleError("Subject must be at least 4 characters.");
  if (input.message.trim().length < 10) throw new RuleError("Description must be at least 10 characters.");
  const id = uid("case");
  let ref = "";
  setState((d) => {
    const maxRef = Math.max(...d.supportCases.map((s) => Number(s.caseReference.slice(3))), 20400);
    ref = `SC-${maxRef + 1}`;
    const me = d.currentEmployeeId;
    const t = now();
    d.supportCases.unshift({
      id, customerId: c.id, caseReference: ref, subject: input.subject.trim(), message: input.message.trim(), category: input.category, priority: input.priority,
      status: "Open", assignedEmployeeId: input.assignToMe ? me : null, createdAt: t, updatedAt: t, notes: [], links: input.links ?? [], resolution: null,
      timeline: [{ at: t, by: me, text: "Case opened by employee" }, ...(input.assignToMe ? [{ at: t, by: me, text: `Assigned to ${currentEmployee(d).name}` }] : [])],
    });
    pushAudit(d, { action: "Support case created", module: "Customer Support", entityType: "Support Case", entityId: id, entityLabel: ref, outcome: "Success", details: `${input.category} · ${input.priority}` });
    activity(d, c.id, "Support", `Support case ${ref} opened: ${input.subject.trim()}`, { to: "/support/$caseId", params: { caseId: id } });
  });
  return { id, ref };
}

function updateCase(id: string, patch: { status?: CaseStatus; priority?: CasePriority; assignedEmployeeId?: string | null; resolution?: string }) {
  const sc = getState().supportCases.find((x) => x.id === id);
  if (!sc) throw new RuleError("Support case not found.");
  authorize("support.manage", "Update support case", "Customer Support", "Support Case", id, sc.caseReference);
  if ((patch.status === "Resolved" || patch.status === "Closed") && !(patch.resolution ?? sc.resolution)?.trim())
    throw new RuleError("Record resolution details before resolving or closing a case.");
  if (patch.assignedEmployeeId) {
    const emp = getState().employees.find((e) => e.id === patch.assignedEmployeeId);
    if (!emp || emp.status !== "Active" || !can(emp.role, "support.manage")) throw new RuleError("That employee is not authorized to handle support cases.");
  }
  setState((d) => {
    const x = d.supportCases.find((y) => y.id === id)!;
    const before: Record<string, unknown> = {};
    const after: Record<string, unknown> = {};
    const t = now();
    const me = d.currentEmployeeId;
    if (patch.status && patch.status !== x.status) {
      before.status = x.status; after.status = patch.status;
      x.timeline.push({ at: t, by: me, text: `Status changed to ${patch.status}` });
      x.status = patch.status;
    }
    if (patch.priority && patch.priority !== x.priority) {
      before.priority = x.priority; after.priority = patch.priority;
      x.timeline.push({ at: t, by: me, text: `Priority changed to ${patch.priority}` });
      x.priority = patch.priority;
    }
    if (patch.assignedEmployeeId !== undefined && patch.assignedEmployeeId !== x.assignedEmployeeId) {
      before.assignedTo = x.assignedEmployeeId; after.assignedTo = patch.assignedEmployeeId;
      const emp = d.employees.find((e) => e.id === patch.assignedEmployeeId);
      x.timeline.push({ at: t, by: me, text: emp ? `Assigned to ${emp.name}` : "Unassigned" });
      x.assignedEmployeeId = patch.assignedEmployeeId;
    }
    if (patch.resolution !== undefined && patch.resolution !== x.resolution) {
      after.resolution = patch.resolution;
      x.resolution = patch.resolution;
    }
    x.updatedAt = t;
    const action = "assignedTo" in after ? "Support case assigned" : "status" in after ? "Support case status changed" : "Support case updated";
    pushAudit(d, { action, module: "Customer Support", entityType: "Support Case", entityId: id, entityLabel: x.caseReference, outcome: "Success", details: Object.keys(after).join(", "), before, after });
  });
}

function addCaseNote(id: string, text: string) {
  const sc = getState().supportCases.find((x) => x.id === id);
  if (!sc) throw new RuleError("Support case not found.");
  authorize("support.manage", "Add internal note", "Customer Support", "Support Case", id, sc.caseReference);
  if (text.trim().length < 3) throw new RuleError("Note cannot be empty.");
  setState((d) => {
    const x = d.supportCases.find((y) => y.id === id)!;
    x.notes.unshift({ id: uid("note"), at: now(), by: d.currentEmployeeId, text: text.trim() });
    x.updatedAt = now();
    pushAudit(d, { action: "Internal note added", module: "Customer Support", entityType: "Support Case", entityId: id, entityLabel: x.caseReference, outcome: "Success", details: "Internal note (not visible to customer)" });
  });
}

function linkCaseRecord(id: string, link: CaseLink) {
  const sc = getState().supportCases.find((x) => x.id === id);
  if (!sc) throw new RuleError("Support case not found.");
  authorize("support.manage", "Link record to case", "Customer Support", "Support Case", id, sc.caseReference);
  if (sc.links.some((l) => l.type === link.type && l.id === link.id)) throw new RuleError("That record is already linked to this case.");
  setState((d) => {
    const x = d.supportCases.find((y) => y.id === id)!;
    x.links.push(link);
    x.timeline.push({ at: now(), by: d.currentEmployeeId, text: `Linked ${link.type} record` });
    x.updatedAt = now();
    pushAudit(d, { action: "Record linked to support case", module: "Customer Support", entityType: "Support Case", entityId: id, entityLabel: x.caseReference, outcome: "Success", details: `${link.type}: ${link.id}` });
  });
}

/* ---------------- Cards ---------------- */

function lockCard(cardId: string, reason: string) {
  const card = getState().cards.find((x) => x.id === cardId);
  if (!card) throw new RuleError("Card not found.");
  authorize("cards.lock", "Lock card", "Cards", "Card", cardId, `•••• ${card.last4}`);
  if (card.cardStatus !== "Active") throw new RuleError(`Only active cards can be locked (current: ${card.cardStatus}).`);
  if (reason.trim().length < 5) throw new RuleError("A reason is required to lock a card.");
  setState((d) => {
    const x = d.cards.find((y) => y.id === cardId)!;
    x.cardStatus = "Locked";
    x.notes.unshift({ id: uid("note"), at: now(), by: d.currentEmployeeId, text: `Locked: ${reason.trim()} (simulated — card processor not contacted)` });
    pushAudit(d, { action: "Card lock requested", module: "Cards", entityType: "Card", entityId: cardId, entityLabel: `•••• ${x.last4}`, outcome: "Simulated", details: reason.trim(), before: { cardStatus: "Active" }, after: { cardStatus: "Locked" } });
    activity(d, x.customerId, "Cards", `Card •••• ${x.last4} locked by employee (simulated)`, { to: "/cards/$cardId", params: { cardId } });
  });
}

function unlockCard(cardId: string, reason: string) {
  const card = getState().cards.find((x) => x.id === cardId);
  if (!card) throw new RuleError("Card not found.");
  authorize("cards.lock", "Unlock card", "Cards", "Card", cardId, `•••• ${card.last4}`);
  if (card.cardStatus !== "Locked") throw new RuleError("Only locked cards can be unlocked.");
  const cust = getCustomer(card.customerId);
  if (cust.customerStatus === "Restricted") throw new RuleError("Card cannot be unlocked while the customer is restricted.");
  if (reason.trim().length < 5) throw new RuleError("A reason is required to unlock a card.");
  setState((d) => {
    const x = d.cards.find((y) => y.id === cardId)!;
    x.cardStatus = "Active";
    x.notes.unshift({ id: uid("note"), at: now(), by: d.currentEmployeeId, text: `Unlocked: ${reason.trim()} (simulated)` });
    pushAudit(d, { action: "Card unlock requested", module: "Cards", entityType: "Card", entityId: cardId, entityLabel: `•••• ${x.last4}`, outcome: "Simulated", details: reason.trim(), before: { cardStatus: "Locked" }, after: { cardStatus: "Active" } });
  });
}

function createReplacement(input: { cardId: string; design: CardDesign; reason: ReplacementReason; notes: string }) {
  const db = getState();
  const card = db.cards.find((x) => x.id === input.cardId);
  if (!card) throw new RuleError("Card not found.");
  authorize("cards.replace", "Create replacement request", "Cards", "Card", card.id, `•••• ${card.last4}`);
  if (card.cardType !== "Physical") throw new RuleError("Replacement manufacturing applies to physical cards only. Virtual cards are reissued by the card processor.");
  if (!(card.cardStatus === "Active" || card.cardStatus === "Locked")) throw new RuleError(`A replacement cannot be requested for a card that is ${card.cardStatus.toLowerCase()}.`);
  const open = db.cardOrders.find((o) => o.previousCardId === card.id && o.orderStatus !== "Canceled" && o.orderStatus !== "Failed");
  if (open) throw new RuleError(`A replacement (${open.replacementReference}) already exists for this card.`);
  if (input.reason === "Customer-requested design change" && input.design === card.cardDesign) throw new RuleError("Choose a different design for a design-change replacement.");
  const newCardId = uid("crd");
  setState((d) => {
    const old = d.cards.find((y) => y.id === card.id)!;
    const maxRpl = Math.max(...d.cardOrders.map((o) => Number(o.replacementReference?.slice(9) ?? 0)), 300);
    const rpl = `RPL-2026-${String(maxRpl + 1).padStart(4, "0")}`;
    const maxOrd = Math.max(...d.cardOrders.map((o) => Number(o.orderReference.slice(8))), 1040);
    if (input.reason === "Lost card" || input.reason === "Suspected compromise") old.cardStatus = "Locked";
    old.replacedByCardId = newCardId;
    d.cards.push({ id: newCardId, customerId: old.customerId, accountId: old.accountId, cardType: "Physical", cardDesign: input.design, cardStatus: "Awaiting Manufacturing", last4: String(1000 + ((maxOrd * 7919) % 9000)), issueDate: null, manufacturingBatchId: null, replacementReference: rpl, replacesCardId: old.id, replacedByCardId: null, notes: [] });
    d.cardOrders.unshift({ id: uid("ord"), orderReference: `CO-2026-${maxOrd + 1}`, customerId: old.customerId, cardId: newCardId, previousCardId: old.id, orderType: "Replacement Card", requestedDesign: input.design, previousDesign: old.cardDesign, orderStatus: "Eligible", requestDate: now(), manufacturingBatchId: null, replacementReason: input.reason, replacementReference: rpl, shippingReference: `SHP-${String(100000 + maxOrd * 31).slice(0, 6)}`, notes: input.notes.trim() });
    pushAudit(d, { action: "Replacement card request created", module: "Cards", entityType: "Card", entityId: newCardId, entityLabel: rpl, outcome: "Success", details: `${old.cardDesign} → ${input.design} · ${input.reason}` });
    activity(d, old.customerId, "Cards", `Replacement card requested (${old.cardDesign} → ${input.design})`, { to: "/cards/$cardId", params: { cardId: newCardId } });
  });
  return newCardId;
}

function cancelOrder(orderId: string, reason: string) {
  const o = getState().cardOrders.find((x) => x.id === orderId);
  if (!o) throw new RuleError("Order not found.");
  authorize("cards.replace", "Cancel card order", "Cards", "Card Order", orderId, o.orderReference);
  if (o.orderStatus !== "Eligible") throw new RuleError("Only unbatched eligible orders can be canceled. Remove it from its draft batch first.");
  if (reason.trim().length < 5) throw new RuleError("A reason is required.");
  setState((d) => {
    const x = d.cardOrders.find((y) => y.id === orderId)!;
    x.orderStatus = "Canceled";
    x.notes = `${x.notes ? x.notes + " " : ""}Canceled: ${reason.trim()}`;
    const card = d.cards.find((c) => c.id === x.cardId);
    if (card) card.cardStatus = "Canceled";
    if (x.previousCardId) {
      const prev = d.cards.find((c) => c.id === x.previousCardId);
      if (prev) prev.replacedByCardId = null;
    }
    if (x.orderType === "Initial Plus Card") {
      const sub = d.subscriptions.find((s) => s.customerId === x.customerId);
      if (sub?.plan === "Plus") sub.cardSelectionRequired = true;
    }
    pushAudit(d, { action: "Card order canceled", module: "Cards", entityType: "Card Order", entityId: orderId, entityLabel: x.orderReference, outcome: "Success", details: reason.trim() });
  });
}

/* ---------------- Plans ---------------- */

function changePlan(customerId: string, to: Plan, note: string) {
  const db = getState();
  const c = getCustomer(customerId);
  authorize("subscriptions.manage", "Change membership plan", "Plans & Subscriptions", "Customer", customerId, name(c));
  const sub = db.subscriptions.find((s) => s.customerId === customerId);
  if (!sub) throw new RuleError("This customer has no subscription yet — a plan is selected during setup.");
  if (sub.subscriptionStatus === "Canceled" || c.customerStatus === "Closed") throw new RuleError("Plans cannot be changed for closed accounts.");
  if (c.customerStatus === "Restricted") throw new RuleError("Plans cannot be changed while the customer is restricted.");
  if (sub.plan === to) throw new RuleError(`Customer is already on Renda ${to}.`);
  const hasPhysical = db.cards.some((x) => x.customerId === customerId && x.cardType === "Physical" && x.cardStatus !== "Canceled" && x.cardStatus !== "Replaced");
  setState((d) => {
    const s = d.subscriptions.find((y) => y.id === sub.id)!;
    const from = s.plan;
    s.plan = to;
    s.monthlyPrice = PLAN_PRICES[to];
    s.history.push({ at: now(), from, to, by: d.currentEmployeeId, note: note.trim() || "Changed by employee (demo)" });
    if (to === "Plus") {
      s.subscriptionStatus = "Pending";
      s.latestBillingStatus = "Pending";
      s.nextBillingDate = now();
      s.cardSelectionRequired = !hasPhysical;
    } else {
      s.subscriptionStatus = "Active";
      s.latestBillingStatus = "Not Applicable";
      s.nextBillingDate = null;
      s.cardSelectionRequired = false;
    }
    pushAudit(d, { action: to === "Plus" ? "Plan upgraded" : "Plan downgraded", module: "Plans & Subscriptions", entityType: "Customer", entityId: customerId, entityLabel: name(c), outcome: "Simulated", details: to === "Plus" ? `Billing pending (simulated).${!hasPhysical ? " Physical card selection required." : ""}` : "Downgraded to Everyday", before: { plan: from }, after: { plan: to } });
    activity(d, customerId, "Membership", to === "Plus" ? "Upgraded from Everyday to Renda Plus" : "Downgraded to Renda Everyday");
  });
}

function simulateBillingOutcome(customerId: string, success: boolean) {
  const db = getState();
  const c = getCustomer(customerId);
  authorize("subscriptions.manage", "Record billing outcome", "Plans & Subscriptions", "Customer", customerId, name(c));
  const sub = db.subscriptions.find((s) => s.customerId === customerId);
  if (!sub || sub.plan !== "Plus" || sub.latestBillingStatus !== "Pending") throw new RuleError("No pending Plus billing to resolve.");
  setState((d) => {
    const s = d.subscriptions.find((y) => y.id === sub.id)!;
    s.latestBillingStatus = success ? "Paid" : "Failed";
    s.subscriptionStatus = success ? "Active" : "Billing Issue";
    if (success) s.nextBillingDate = new Date(Date.now() + 30 * 864e5).toISOString();
    pushAudit(d, { action: success ? "Billing succeeded" : "Billing failed", module: "Plans & Subscriptions", entityType: "Customer", entityId: customerId, entityLabel: name(c), outcome: "Simulated", details: "Demo billing outcome — no payment processed." });
  });
}

function recordCardSelection(customerId: string, design: CardDesign) {
  const db = getState();
  const c = getCustomer(customerId);
  authorize("cards.replace", "Record card design selection", "Cards", "Customer", customerId, name(c));
  const sub = db.subscriptions.find((s) => s.customerId === customerId);
  if (!sub || sub.plan !== "Plus") throw new RuleError("Physical card selection is only available on Renda Plus.");
  const dup = db.cardOrders.find((o) => o.customerId === customerId && o.orderType === "Initial Plus Card" && o.orderStatus !== "Canceled" && o.orderStatus !== "Failed");
  if (dup) throw new RuleError(`An initial Plus card order (${dup.orderReference}) already exists for this customer.`);
  if (!sub.cardSelectionRequired) throw new RuleError("No card selection is outstanding for this customer.");
  const cardId = uid("crd");
  setState((d) => {
    const maxOrd = Math.max(...d.cardOrders.map((o) => Number(o.orderReference.slice(8))), 1040);
    d.cards.push({ id: cardId, customerId, accountId: `acc_${customerId.slice(4)}_ss`, cardType: "Physical", cardDesign: design, cardStatus: "Awaiting Manufacturing", last4: String(1000 + ((maxOrd * 6151) % 9000)), issueDate: null, manufacturingBatchId: null, replacementReference: null, replacesCardId: null, replacedByCardId: null, notes: [] });
    d.cardOrders.unshift({ id: uid("ord"), orderReference: `CO-2026-${maxOrd + 1}`, customerId, cardId, previousCardId: null, orderType: "Initial Plus Card", requestedDesign: design, previousDesign: null, orderStatus: "Eligible", requestDate: now(), manufacturingBatchId: null, replacementReason: null, replacementReference: null, shippingReference: `SHP-${String(200000 + maxOrd * 29).slice(0, 6)}`, notes: "Design selected by customer; recorded by employee." });
    d.subscriptions.find((s) => s.id === sub.id)!.cardSelectionRequired = false;
    pushAudit(d, { action: "Physical card order created", module: "Cards", entityType: "Customer", entityId: customerId, entityLabel: name(c), outcome: "Success", details: `Initial Plus card · ${design}` });
    activity(d, customerId, "Cards", `Physical ${design} card selected`, { to: "/cards/$cardId", params: { cardId } });
  });
  return cardId;
}

/* ---------------- Manufacturing ---------------- */

function batchLabel(id: string) {
  return getState().batches.find((b) => b.id === id)?.batchReference ?? id;
}

function createBatch(orderIds: string[]) {
  authorize("manufacturing.manage", "Create manufacturing batch", "Card Manufacturing", "Batch", "-", "New batch");
  if (!orderIds.length) throw new RuleError("Select at least one eligible order.");
  if (new Set(orderIds).size !== orderIds.length) throw new RuleError("Duplicate orders selected.");
  const db = getState();
  for (const id of orderIds) {
    const o = db.cardOrders.find((x) => x.id === id);
    if (!o) throw new RuleError("Order not found.");
    const why = batchIneligibility(o);
    if (why) throw new RuleError(`${o.orderReference}: ${why}`);
  }
  const id = uid("bat");
  let ref = "";
  setState((d) => {
    const today = new Date();
    const week = Math.ceil(((+today - +new Date(today.getFullYear(), 0, 1)) / 864e5 + new Date(today.getFullYear(), 0, 1).getDay() + 1) / 7);
    const base = `MB-${today.getFullYear()}-W${week}`;
    const count = d.batches.filter((b) => b.batchReference.startsWith(base)).length;
    ref = count ? `${base}-${String.fromCharCode(65 + count)}` : base;
    const me = d.currentEmployeeId;
    d.batches.unshift({ id, batchReference: ref, createdAt: now(), createdBy: me, status: "Draft", orderIds: [...orderIds], orderCount: orderIds.length, pdfReference: null, exportedAt: null, exportedBy: null, reviewedBy: null, submittedAt: null, submittedBy: null, submissionNote: null, history: [{ at: now(), by: me, action: `Batch created with ${orderIds.length} order${orderIds.length === 1 ? "" : "s"}` }] });
    for (const oid of orderIds) {
      const o = d.cardOrders.find((x) => x.id === oid)!;
      o.orderStatus = "Batched";
      o.manufacturingBatchId = id;
      const card = d.cards.find((c) => c.id === o.cardId);
      if (card) card.manufacturingBatchId = id;
    }
    pushAudit(d, { action: "Manufacturing batch created", module: "Card Manufacturing", entityType: "Batch", entityId: id, entityLabel: ref, outcome: "Success", details: `${orderIds.length} orders included` });
  });
  return { id, ref };
}

function removeOrderFromBatch(batchId: string, orderId: string) {
  authorize("manufacturing.manage", "Remove order from batch", "Card Manufacturing", "Batch", batchId, batchLabel(batchId));
  const b = getState().batches.find((x) => x.id === batchId);
  if (!b) throw new RuleError("Batch not found.");
  if (b.status !== "Draft") throw new RuleError("Orders can only be removed from draft batches.");
  setState((d) => {
    const x = d.batches.find((y) => y.id === batchId)!;
    x.orderIds = x.orderIds.filter((o) => o !== orderId);
    x.orderCount = x.orderIds.length;
    x.pdfReference = null;
    x.exportedAt = null;
    const o = d.cardOrders.find((y) => y.id === orderId)!;
    o.orderStatus = "Eligible";
    o.manufacturingBatchId = null;
    const card = d.cards.find((c) => c.id === o.cardId);
    if (card) card.manufacturingBatchId = null;
    x.history.push({ at: now(), by: d.currentEmployeeId, action: `Removed ${o.orderReference}; PDF must be regenerated` });
    pushAudit(d, { action: "Order removed from batch", module: "Card Manufacturing", entityType: "Batch", entityId: batchId, entityLabel: x.batchReference, outcome: "Success", details: o.orderReference });
  });
}

/** Records the export after the PDF file has been generated client-side. */
function recordPdfExport(batchId: string) {
  authorize("manufacturing.manage", "Generate manufacturing PDF", "Card Manufacturing", "Batch", batchId, batchLabel(batchId));
  const b = getState().batches.find((x) => x.id === batchId);
  if (!b) throw new RuleError("Batch not found.");
  if (!b.orderCount) throw new RuleError("This batch has no orders.");
  setState((d) => {
    const x = d.batches.find((y) => y.id === batchId)!;
    x.pdfReference = `${x.batchReference}.pdf`;
    x.exportedAt = now();
    x.exportedBy = d.currentEmployeeId;
    x.history.push({ at: now(), by: d.currentEmployeeId, action: "Manufacturing PDF generated and downloaded" });
    pushAudit(d, { action: "Manufacturing PDF exported", module: "Card Manufacturing", entityType: "Batch", entityId: batchId, entityLabel: x.batchReference, outcome: "Success", details: x.pdfReference });
  });
}

function markBatchReady(batchId: string) {
  authorize("manufacturing.manage", "Mark batch ready", "Card Manufacturing", "Batch", batchId, batchLabel(batchId));
  const b = getState().batches.find((x) => x.id === batchId);
  if (!b) throw new RuleError("Batch not found.");
  if (b.status !== "Draft") throw new RuleError("Only draft batches can be marked ready.");
  if (!b.pdfReference) throw new RuleError("Generate the manufacturing PDF before marking the batch ready.");
  setState((d) => {
    const x = d.batches.find((y) => y.id === batchId)!;
    x.status = "Ready for Submission";
    x.reviewedBy = d.currentEmployeeId;
    x.history.push({ at: now(), by: d.currentEmployeeId, action: "Reviewed and marked ready for submission" });
    pushAudit(d, { action: "Batch marked ready for submission", module: "Card Manufacturing", entityType: "Batch", entityId: batchId, entityLabel: x.batchReference, outcome: "Success", details: "", before: { status: "Draft" }, after: { status: "Ready for Submission" } });
  });
}

/** Employee confirms the PDF was actually sent to the manufacturer. Never automatic. */
function recordBatchSubmission(batchId: string, note: string) {
  authorize("manufacturing.manage", "Record batch submission", "Card Manufacturing", "Batch", batchId, batchLabel(batchId));
  const b = getState().batches.find((x) => x.id === batchId);
  if (!b) throw new RuleError("Batch not found.");
  if (b.status !== "Ready for Submission") throw new RuleError("Only batches marked ready can be recorded as submitted.");
  if (note.trim().length < 5) throw new RuleError("Describe how the batch was sent (e.g. emailed to production desk).");
  setState((d) => {
    const x = d.batches.find((y) => y.id === batchId)!;
    x.status = "Submitted";
    x.submittedAt = now();
    x.submittedBy = d.currentEmployeeId;
    x.submissionNote = note.trim();
    x.history.push({ at: now(), by: d.currentEmployeeId, action: "Submission to manufacturer recorded" });
    for (const oid of x.orderIds) {
      const o = d.cardOrders.find((y) => y.id === oid)!;
      o.orderStatus = "Submitted";
      const card = d.cards.find((c) => c.id === o.cardId);
      if (card && card.cardStatus === "Awaiting Manufacturing") card.cardStatus = "In Production";
    }
    pushAudit(d, { action: "Batch submission recorded", module: "Card Manufacturing", entityType: "Batch", entityId: batchId, entityLabel: x.batchReference, outcome: "Success", details: note.trim(), before: { status: "Ready for Submission" }, after: { status: "Submitted" } });
  });
}

/* ---------------- Settings ---------------- */

function updatePreferences(patch: Partial<PersonalSettings>) {
  setState((d) => {
    Object.assign(d.settings, patch);
  });
}

function updateOperationalSettings(patch: Partial<OperationalSettings>) {
  authorize("settings.manage", "Change operational settings", "Settings", "Settings", "org", "Operational configuration");
  if (patch.kycReviewSlaHours !== undefined && (patch.kycReviewSlaHours < 1 || patch.kycReviewSlaHours > 720)) throw new RuleError("KYC review SLA must be between 1 and 720 hours.");
  if (patch.supportResponseSlaHours !== undefined && (patch.supportResponseSlaHours < 1 || patch.supportResponseSlaHours > 168)) throw new RuleError("Support SLA must be between 1 and 168 hours.");
  setState((d) => {
    const before: Record<string, unknown> = {};
    for (const k of Object.keys(patch)) before[k] = (d.settings as unknown as Record<string, unknown>)[k];
    Object.assign(d.settings, patch);
    pushAudit(d, { action: "Settings changed", module: "Settings", entityType: "Settings", entityId: "org", entityLabel: "Operational configuration", outcome: "Success", details: Object.keys(patch).join(", "), before, after: patch as Record<string, unknown> });
  });
}

/* ---------------- Service ---------------- */

/** Wraps a synchronous demo action so it resolves or rejects like a network call. */
const asAsync = <A extends unknown[], R>(fn: (...args: A) => R) => (...args: A): Promise<R> => Promise.resolve().then(() => fn(...args));

export const localOperations: OperationsService = {
  updateCustomer: asAsync(updateCustomer),
  escalateKyc: asAsync(escalateKyc),
  recordKycDecision: asAsync(recordKycDecision),
  requestKycResubmission: asAsync(requestKycResubmission),
  requestAccountIssuance: asAsync(requestAccountIssuance),
  simulateIssuanceResult: asAsync(simulateIssuanceResult),
  completeSetup: asAsync(completeSetup),
  addTransactionNote: asAsync(addTransactionNote),
  createSupportCase: asAsync(createSupportCase),
  updateCase: asAsync(updateCase),
  addCaseNote: asAsync(addCaseNote),
  linkCaseRecord: asAsync(linkCaseRecord),
  lockCard: asAsync(lockCard),
  unlockCard: asAsync(unlockCard),
  createReplacement: asAsync(createReplacement),
  cancelOrder: asAsync(cancelOrder),
  changePlan: asAsync(changePlan),
  simulateBillingOutcome: asAsync(simulateBillingOutcome),
  recordCardSelection: asAsync(recordCardSelection),
  createBatch: asAsync(createBatch),
  removeOrderFromBatch: asAsync(removeOrderFromBatch),
  recordPdfExport: asAsync(recordPdfExport),
  markBatchReady: asAsync(markBatchReady),
  recordBatchSubmission: asAsync(recordBatchSubmission),
  markNotificationsRead: asAsync(markNotificationsRead),
  updatePreferences: asAsync(updatePreferences),
  updateOperationalSettings: asAsync(updateOperationalSettings),
  resetDemoData: () => resetState(),
};

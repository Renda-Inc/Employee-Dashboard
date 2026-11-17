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
import {
  EDITABLE_FIELDS,
  type EditableField,
  type OperationalSettings,
  type OperationsService,
  type PersonalSettings,
} from "./contracts/operations";
import { can, PermissionError, RuleError, type Permission } from "./permissions";
import {
  activationBlocker,
  addMonths,
  batchIneligibility,
  billingDowngradeDue,
  PLAN_PRICES,
} from "./rules";

let seq = 0;
const uid = (p: string) => `${p}_${Date.now().toString(36)}${(++seq).toString(36)}`;
const now = () => new Date().toISOString();
const name = (c: Customer) => `${c.firstName} ${c.lastName}`;

const SIGNED_OUT: DB["employees"][number] = {
  id: "",
  name: "Signed out",
  email: "",
  role: "",
  status: "Inactive",
};

/** The signed-in employee (synced from the employee directory at sign-in). */
export function currentEmployee(db: DB = getState()) {
  return db.employees.find((e) => e.id === db.currentEmployeeId) ?? SIGNED_OUT;
}

function pushAudit(d: DB, e: Omit<AuditEvent, "id" | "timestamp" | "employeeId">) {
  d.audit.unshift({ id: uid("aud"), timestamp: now(), employeeId: d.currentEmployeeId, ...e });
}

/** Throws (and audits the denial) when the current employee lacks a permission. */
function authorize(
  p: Permission,
  action: string,
  module: string,
  entityType: string,
  entityId: string,
  entityLabel: string,
) {
  const emp = currentEmployee();
  if (emp.status !== "Active" || !can(emp.role, p)) {
    setState((d) =>
      pushAudit(d, {
        action: `${action} attempted`,
        module,
        entityType,
        entityId,
        entityLabel,
        outcome: "Denied",
        details: `Role ${emp.role} lacks ${p}`,
      }),
    );
    throw new PermissionError(
      `Your role (${emp.role}) is not permitted to ${action.toLowerCase()}.`,
    );
  }
}

function getCustomer(id: string) {
  const c = getState().customers.find((x) => x.id === id);
  if (!c) throw new RuleError("Customer not found.");
  return c;
}

function activity(
  d: DB,
  customerId: string,
  type: DB["activity"][number]["type"],
  description: string,
  link?: DB["activity"][number]["link"],
) {
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
    // Product rule (user, 2026-11-17): contact details verified at sign-up
    // (email) and during onboarding KYC (phone) stay verified when they
    // change. Customers update them in the app with OTP, or support updates
    // them after the customer passes identity verification on the call or
    // chat. A support change therefore keeps the verified flags, and no
    // re-KYC is required. The sign-up email is kept on record separately
    // (signupEmail) and never overwritten.
    x.updatedAt = now();
    const contactChanged = "email" in after || "phone" in after;
    pushAudit(d, {
      action: "Customer information updated",
      module: "Customers",
      entityType: "Customer",
      entityId: id,
      entityLabel: name(x),
      outcome: "Success",
      details:
        Object.keys(after).join(", ") +
        (contactChanged
          ? ". Contact change made by support after identity verification; verified status retained, no re-KYC required."
          : ""),
      before,
      after,
    });
    activity(d, id, "Profile", `Profile updated by employee (${Object.keys(after).join(", ")})`);
  });
}

/* ---------------- KYC & lifecycle ---------------- */

function escalateKyc(customerId: string, reason: string) {
  const c = getCustomer(customerId);
  authorize(
    "kyc.decide",
    "Escalate KYC to manual review",
    "Onboarding & KYC",
    "Customer",
    customerId,
    name(c),
  );
  if (c.kycStatus !== "Pending")
    throw new RuleError("Only pending KYC cases can be escalated to manual review.");
  if (reason.trim().length < 10)
    throw new RuleError("Provide a documented reason (at least 10 characters).");
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
    pushAudit(d, {
      action: "KYC escalated to manual review",
      module: "Onboarding & KYC",
      entityType: "Customer",
      entityId: customerId,
      entityLabel: name(x),
      outcome: "Success",
      details: reason,
      before: { kycStatus: "Pending" },
      after: { kycStatus: "Under Review" },
    });
    activity(d, customerId, "KYC", "KYC case escalated to manual review");
  });
}

/** Manual review decision, only for cases already in manual review. A failed provider result cannot be overturned here. */
function recordKycDecision(customerId: string, decision: "Approved" | "Failed", reason: string) {
  const c = getCustomer(customerId);
  authorize(
    "kyc.decide",
    "Record KYC decision",
    "Onboarding & KYC",
    "Customer",
    customerId,
    name(c),
  );
  if (c.kycStatus !== "Under Review")
    throw new RuleError(
      c.kycStatus === "Failed"
        ? "A failed KYC check cannot be marked as passed. Request resubmission instead."
        : "Decisions can only be recorded for cases under manual review.",
    );
  if (reason.trim().length < 10)
    throw new RuleError("Provide a documented reason (at least 10 characters).");
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
      k.outstandingRequirements =
        decision === "Failed" ? ["Customer must resubmit identity documents"] : [];
    }
    pushAudit(d, {
      action: `KYC manual review: ${decision === "Approved" ? "approved" : "declined"}`,
      module: "Onboarding & KYC",
      entityType: "Customer",
      entityId: customerId,
      entityLabel: name(x),
      outcome: "Success",
      details: reason,
      before: { kycStatus: "Under Review" },
      after: { kycStatus: decision },
    });
    activity(
      d,
      customerId,
      "KYC",
      decision === "Approved"
        ? "KYC approved after manual review"
        : "KYC declined after manual review",
    );
  });
}

function requestKycResubmission(customerId: string) {
  const c = getCustomer(customerId);
  authorize(
    "kyc.decide",
    "Request KYC resubmission",
    "Onboarding & KYC",
    "Customer",
    customerId,
    name(c),
  );
  if (c.kycStatus !== "Failed")
    throw new RuleError("Resubmission can only be requested for failed KYC checks.");
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
      k.providerMessages = [
        ...k.providerMessages,
        "Resubmission requested (simulated. No provider call made).",
      ];
    }
    pushAudit(d, {
      action: "KYC resubmission requested",
      module: "Onboarding & KYC",
      entityType: "Customer",
      entityId: customerId,
      entityLabel: name(x),
      outcome: "Simulated",
      details: "Customer must upload new documents. No provider request sent in demo.",
      before: { kycStatus: "Failed" },
      after: { kycStatus: "Pending" },
    });
    activity(d, customerId, "KYC", "KYC resubmission requested");
  });
}

function requestAccountIssuance(customerId: string) {
  const c = getCustomer(customerId);
  authorize(
    "accounts.manage",
    "Request account issuance",
    "Banking & Accounts",
    "Customer",
    customerId,
    name(c),
  );
  if (c.kycStatus !== "Approved")
    throw new RuleError(
      "Accounts cannot be issued because KYC verification has not been approved.",
    );
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
      else
        d.accounts.push({
          id: accId,
          customerId,
          accountType: type,
          accountStatus: "Pending Issuance",
          maskedAccountIdentifier: null,
          openingDate: null,
          availableBalance: null,
          ledgerBalance: null,
          restrictions: [],
          lastActivity: null,
        });
    }
    pushAudit(d, {
      action: retry ? "Account issuance retried" : "Account issuance requested",
      module: "Banking & Accounts",
      entityType: "Customer",
      entityId: customerId,
      entityLabel: name(x),
      outcome: "Simulated",
      details: "Queued with banking provider (simulated).",
    });
    activity(
      d,
      customerId,
      "Accounts",
      retry ? "Account issuance retried" : "Account issuance requested",
    );
  });
}

function simulateIssuanceResult(customerId: string, success: boolean) {
  const c = getCustomer(customerId);
  authorize(
    "accounts.manage",
    "Record issuance result",
    "Banking & Accounts",
    "Customer",
    customerId,
    name(c),
  );
  if (c.accountIssuanceStatus !== "Pending")
    throw new RuleError("No issuance request is pending for this customer.");
  setState((d) => {
    const x = d.customers.find((y) => y.id === customerId)!;
    x.accountIssuanceStatus = success ? "Issued" : "Failed";
    x.customerStatus = success ? "Setup In Progress" : "Account Issuance Failed";
    x.updatedAt = now();
    d.accounts
      .filter((a) => a.customerId === customerId)
      .forEach((a, i) => {
        a.accountStatus = success ? "Active" : "Issuance Failed";
        if (success) {
          a.maskedAccountIdentifier = `•••• ${String(4000 + ((customerId.charCodeAt(5) * 37 + i * 911) % 6000))}`;
          a.openingDate = now();
          a.availableBalance = 0;
          a.ledgerBalance = 0;
        }
      });
    pushAudit(d, {
      action: success ? "Accounts issued" : "Account issuance failed",
      module: "Banking & Accounts",
      entityType: "Customer",
      entityId: customerId,
      entityLabel: name(x),
      outcome: "Simulated",
      details: "Demo provider response. No real banking system contacted.",
    });
    activity(
      d,
      customerId,
      "Accounts",
      success
        ? "Smart Spend and Sense Save accounts issued (simulated)"
        : "Account issuance failed: provider error (simulated)",
    );
  });
}

function completeSetup(customerId: string) {
  const c = getCustomer(customerId);
  authorize(
    "customers.lifecycle",
    "Activate customer",
    "Customers",
    "Customer",
    customerId,
    name(c),
  );
  const blocker = activationBlocker(c, getState().accounts);
  if (blocker) throw new RuleError(blocker);
  setState((d) => {
    const x = d.customers.find((y) => y.id === customerId)!;
    x.customerStatus = "Active";
    x.updatedAt = now();
    const sub = d.subscriptions.find((s) => s.customerId === customerId);
    if (sub && sub.plan === "Everyday" && sub.subscriptionStatus === "Pending")
      sub.subscriptionStatus = "Active";
    pushAudit(d, {
      action: "Customer activated",
      module: "Customers",
      entityType: "Customer",
      entityId: customerId,
      entityLabel: name(x),
      outcome: "Success",
      details: "All onboarding, KYC, issuance and setup conditions satisfied.",
      before: { customerStatus: "Setup In Progress" },
      after: { customerStatus: "Active" },
    });
    activity(d, customerId, "Accounts", "Setup completed. Customer is now Active");
  });
}

/* ---------------- Transactions ---------------- */

function addTransactionNote(txId: string, text: string) {
  const t = getState().transactions.find((x) => x.id === txId);
  if (!t) throw new RuleError("Transaction not found.");
  authorize(
    "transactions.investigate",
    "Add transaction note",
    "Transactions",
    "Transaction",
    txId,
    t.transactionReference,
  );
  if (text.trim().length < 3) throw new RuleError("Note cannot be empty.");
  setState((d) => {
    d.transactions
      .find((x) => x.id === txId)!
      .notes.unshift({ id: uid("note"), at: now(), by: d.currentEmployeeId, text: text.trim() });
    pushAudit(d, {
      action: "Transaction note added",
      module: "Transactions",
      entityType: "Transaction",
      entityId: txId,
      entityLabel: t.transactionReference,
      outcome: "Success",
      details: "Internal note recorded",
    });
  });
}

/* ---------------- Transfers ---------------- */

/** RenPay follows the Revolut model for internal transfers (product rule,
 * user, 2026-11-17): a completed transfer is instant and can never be
 * cancelled or reversed by Renda. What Renda can do is ask the recipient
 * to return the funds on the sender's behalf. The money moves only if the
 * recipient agrees. */
function requestTransferReturn(transferId: string, note: string) {
  const db = getState();
  const tr = db.transfers.find((x) => x.id === transferId);
  if (!tr) throw new RuleError("Transfer not found.");
  getCustomer(tr.senderCustomerId);
  authorize(
    "transactions.investigate",
    "Request return of RenPay transfer",
    "Payments & Transfers",
    "Transfer",
    transferId,
    tr.transactionReference,
  );
  if (tr.transferType !== "P2P")
    throw new RuleError("Return requests apply to RenPay transfers only.");
  if (tr.status !== "Completed")
    throw new RuleError("Only a completed RenPay transfer can have a return requested.");
  if (!tr.recipientCustomerId) throw new RuleError("This transfer has no Renda recipient to ask.");
  if (tr.returnRequest && tr.returnRequest.status === "Requested")
    throw new RuleError("A return request is already open for this transfer.");
  if (note.trim().length < 5)
    throw new RuleError("Say why the return is being requested (at least 5 characters).");
  setState((d) => {
    const t = d.transfers.find((x) => x.id === transferId)!;
    t.returnRequest = {
      status: "Requested",
      requestedAt: now(),
      requestedBy: d.currentEmployeeId,
      note: note.trim(),
      resolvedAt: null,
      resolutionNote: null,
    };
    pushAudit(d, {
      action: "RenPay return requested",
      module: "Payments & Transfers",
      entityType: "Transfer",
      entityId: transferId,
      entityLabel: tr.transactionReference,
      outcome: "Success",
      details: `Renda will ask the recipient to return $${tr.amount.toFixed(2)} on the sender's behalf. A completed RenPay transfer cannot be cancelled or reversed; the funds move only with the recipient's consent. Reason: ${note.trim()}`,
    });
    activity(
      d,
      tr.senderCustomerId,
      "Transfers",
      `Return of RenPay payment ${tr.transactionReference} requested: Renda is contacting the recipient`,
    );
    if (tr.recipientCustomerId)
      activity(
        d,
        tr.recipientCustomerId,
        "Transfers",
        `Renda requested the return of RenPay payment ${tr.transactionReference} on the sender's behalf`,
      );
  });
}

/** Records how a RenPay return request ended. "Returned" posts the
 * offsetting movement: the recipient sends the money back as a new
 * transfer, which is the only way funds move in this model. */
function recordReturnOutcome(
  transferId: string,
  outcome: "Returned" | "Declined" | "No Response",
  note: string,
) {
  const db = getState();
  const tr = db.transfers.find((x) => x.id === transferId);
  if (!tr) throw new RuleError("Transfer not found.");
  authorize(
    "transactions.investigate",
    "Record RenPay return outcome",
    "Payments & Transfers",
    "Transfer",
    transferId,
    tr.transactionReference,
  );
  if (!tr.returnRequest || tr.returnRequest.status !== "Requested")
    throw new RuleError("There is no open return request for this transfer.");
  if (note.trim().length < 5)
    throw new RuleError("Record how the request ended (at least 5 characters).");
  if (outcome === "Returned") {
    const recipientAcc = db.accounts.find(
      (a) =>
        a.customerId === tr.recipientCustomerId &&
        a.accountType === "Smart Spend" &&
        a.accountStatus === "Active",
    );
    if (!recipientAcc || (recipientAcc.availableBalance ?? 0) < tr.amount)
      throw new RuleError(
        "The recipient's Smart Spend cannot cover the return in full, so a full return cannot be recorded. Record the actual outcome instead.",
      );
  }
  setState((d) => {
    const t = d.transfers.find((x) => x.id === transferId)!;
    t.returnRequest = {
      ...t.returnRequest!,
      status: outcome,
      resolvedAt: now(),
      resolutionNote: note.trim(),
    };
    if (outcome === "Returned" && t.recipientCustomerId) {
      const fromAcc = d.accounts.find(
        (a) =>
          a.customerId === t.recipientCustomerId &&
          a.accountType === "Smart Spend" &&
          a.accountStatus === "Active",
      )!;
      const toAcc = d.accounts.find(
        (a) =>
          a.customerId === t.senderCustomerId &&
          a.accountType === "Smart Spend" &&
          a.accountStatus === "Active",
      );
      fromAcc.availableBalance = (fromAcc.availableBalance ?? 0) - t.amount;
      fromAcc.ledgerBalance = (fromAcc.ledgerBalance ?? 0) - t.amount;
      if (toAcc) {
        toAcc.availableBalance = (toAcc.availableBalance ?? 0) + t.amount;
        toAcc.ledgerBalance = (toAcc.ledgerBalance ?? 0) + t.amount;
      }
      const ref = `TR-${Math.floor(510000 + Math.random() * 389999)}`;
      const returnTransferId = uid("trf");
      d.transfers.unshift({
        id: returnTransferId,
        transferType: "P2P",
        senderCustomerId: t.recipientCustomerId,
        recipientCustomerId: t.senderCustomerId,
        amount: t.amount,
        currency: "CAD",
        status: "Completed",
        createdAt: now(),
        providerReference: `P2P-${Math.floor(10000000 + Math.random() * 89999999)}`,
        transactionReference: ref,
        returnRequest: null,
      });
      d.transactions.unshift({
        id: uid("txn"),
        customerId: t.recipientCustomerId,
        accountId: fromAcc.id,
        transactionReference: ref,
        transactionType: "P2P Sent",
        description: `Return of RenPay payment ${t.transactionReference}`,
        direction: "debit",
        amount: t.amount,
        currency: "CAD",
        status: "Completed",
        timestamp: now(),
        completedAt: now(),
        providerReference: `P2P-${Math.floor(10000000 + Math.random() * 89999999)}`,
        paymentRail: "Internal Ledger",
        transferId: returnTransferId,
        notes: [],
      });
      if (toAcc)
        d.transactions.unshift({
          id: uid("txn"),
          customerId: t.senderCustomerId,
          accountId: toAcc.id,
          transactionReference: ref,
          transactionType: "P2P Received",
          description: `Returned RenPay payment ${t.transactionReference}`,
          direction: "credit",
          amount: t.amount,
          currency: "CAD",
          status: "Completed",
          timestamp: now(),
          completedAt: now(),
          providerReference: `P2P-${Math.floor(10000000 + Math.random() * 89999999)}`,
          paymentRail: "Internal Ledger",
          transferId: returnTransferId,
          notes: [],
        });
    }
    pushAudit(d, {
      action: `RenPay return ${outcome.toLowerCase()}`,
      module: "Payments & Transfers",
      entityType: "Transfer",
      entityId: transferId,
      entityLabel: tr.transactionReference,
      outcome: "Success",
      details:
        outcome === "Returned"
          ? `Recipient agreed and returned $${tr.amount.toFixed(2)} as a new RenPay transfer. ${note.trim()}`
          : `Return request closed without the funds moving: ${outcome}. ${note.trim()}`,
    });
    activity(
      d,
      tr.senderCustomerId,
      "Transfers",
      outcome === "Returned"
        ? `RenPay payment ${tr.transactionReference} was returned by the recipient`
        : `Return request for RenPay payment ${tr.transactionReference} closed: ${outcome}`,
    );
  });
}

/** Interac e-Transfers can be cancelled while they are still pending
 * (not yet accepted or deposited); that is a real Interac capability and
 * the one cancellation that exists in this model. Once an Interac
 * transfer completes, it is final like everything else. */
function cancelInteracTransfer(transferId: string, reason: string) {
  const db = getState();
  const tr = db.transfers.find((x) => x.id === transferId);
  if (!tr) throw new RuleError("Transfer not found.");
  authorize(
    "transactions.investigate",
    "Cancel pending Interac transfer",
    "Payments & Transfers",
    "Transfer",
    transferId,
    tr.transactionReference,
  );
  if (tr.transferType !== "Interac")
    throw new RuleError("Only Interac transfers can be cancelled, and only while pending.");
  if (tr.status !== "Pending")
    throw new RuleError(
      `This Interac transfer is ${tr.status.toLowerCase()} and can no longer be cancelled.`,
    );
  if (reason.trim().length < 5)
    throw new RuleError("Provide a reason for the cancellation (at least 5 characters).");
  setState((d) => {
    const t = d.transfers.find((x) => x.id === transferId)!;
    t.status = "Canceled";
    for (const tx of d.transactions) {
      if (tx.transferId === transferId && tx.status === "Pending") tx.status = "Canceled";
    }
    pushAudit(d, {
      action: "Pending Interac transfer cancelled",
      module: "Payments & Transfers",
      entityType: "Transfer",
      entityId: transferId,
      entityLabel: tr.transactionReference,
      outcome: "Success",
      details: `Cancelled while still pending, before acceptance or deposit. Reason: ${reason.trim()}`,
    });
    activity(
      d,
      tr.senderCustomerId,
      "Transfers",
      `Pending Interac transfer ${tr.transactionReference} cancelled`,
    );
  });
}

/* ---------------- Alfie events ---------------- */

/** Best practice for an operational event queue: resolving requires a
 * short note saying what happened, and records who resolved it and when,
 * so the queue can actually clear and stay auditable. Resolved events can
 * be reopened if the issue recurs. */
function resolveAlfieEvent(eventId: string, note: string) {
  const db = getState();
  const ev = db.alfieEvents.find((x) => x.id === eventId);
  if (!ev) throw new RuleError("Alfie event not found.");
  authorize(
    "alfie.manage",
    "Resolve Alfie event",
    "Alfie",
    "Alfie Event",
    eventId,
    ev.description.slice(0, 60),
  );
  if (ev.status === "Resolved") throw new RuleError("This event is already resolved.");
  if (note.trim().length < 5)
    throw new RuleError("Add a short resolution note (at least 5 characters).");
  setState((d) => {
    const e = d.alfieEvents.find((x) => x.id === eventId)!;
    e.status = "Resolved";
    e.resolvedAt = now();
    e.resolvedBy = d.currentEmployeeId;
    e.resolutionNote = note.trim();
    pushAudit(d, {
      action: "Alfie event resolved",
      module: "Alfie",
      entityType: "Alfie Event",
      entityId: eventId,
      entityLabel: ev.description.slice(0, 60),
      outcome: "Success",
      details: note.trim(),
    });
  });
}

function reopenAlfieEvent(eventId: string, note: string) {
  const db = getState();
  const ev = db.alfieEvents.find((x) => x.id === eventId);
  if (!ev) throw new RuleError("Alfie event not found.");
  authorize(
    "alfie.manage",
    "Reopen Alfie event",
    "Alfie",
    "Alfie Event",
    eventId,
    ev.description.slice(0, 60),
  );
  if (ev.status !== "Resolved") throw new RuleError("Only a resolved event can be reopened.");
  if (note.trim().length < 5)
    throw new RuleError("Say why the event is being reopened (at least 5 characters).");
  setState((d) => {
    const e = d.alfieEvents.find((x) => x.id === eventId)!;
    e.status = "Open";
    e.resolvedAt = null;
    e.resolvedBy = null;
    e.resolutionNote = null;
    pushAudit(d, {
      action: "Alfie event reopened",
      module: "Alfie",
      entityType: "Alfie Event",
      entityId: eventId,
      entityLabel: ev.description.slice(0, 60),
      outcome: "Success",
      details: note.trim(),
    });
  });
}

/* ---------------- Support ---------------- */

function createSupportCase(input: {
  customerId: string;
  subject: string;
  message: string;
  category: CaseCategory;
  priority: CasePriority;
  links?: CaseLink[];
  assignToMe?: boolean;
}) {
  const c = getCustomer(input.customerId);
  authorize("support.manage", "Create support case", "Customer Support", "Customer", c.id, name(c));
  if (input.subject.trim().length < 4)
    throw new RuleError("Subject must be at least 4 characters.");
  if (input.message.trim().length < 10)
    throw new RuleError("Description must be at least 10 characters.");
  const id = uid("case");
  let ref = "";
  setState((d) => {
    const maxRef = Math.max(...d.supportCases.map((s) => Number(s.caseReference.slice(3))), 20400);
    ref = `SC-${maxRef + 1}`;
    const me = d.currentEmployeeId;
    const t = now();
    d.supportCases.unshift({
      id,
      customerId: c.id,
      caseReference: ref,
      subject: input.subject.trim(),
      message: input.message.trim(),
      category: input.category,
      priority: input.priority,
      status: "Open",
      assignedEmployeeId: input.assignToMe ? me : null,
      createdAt: t,
      updatedAt: t,
      notes: [],
      links: input.links ?? [],
      resolution: null,
      timeline: [
        { at: t, by: me, text: "Case opened by employee" },
        ...(input.assignToMe
          ? [{ at: t, by: me, text: `Assigned to ${currentEmployee(d).name}` }]
          : []),
      ],
    });
    pushAudit(d, {
      action: "Support case created",
      module: "Customer Support",
      entityType: "Support Case",
      entityId: id,
      entityLabel: ref,
      outcome: "Success",
      details: `${input.category} · ${input.priority}`,
    });
    activity(d, c.id, "Support", `Support case ${ref} opened: ${input.subject.trim()}`, {
      to: "/support/$caseId",
      params: { caseId: id },
    });
  });
  return { id, ref };
}

function updateCase(
  id: string,
  patch: {
    status?: CaseStatus;
    priority?: CasePriority;
    assignedEmployeeId?: string | null;
    resolution?: string;
  },
) {
  const sc = getState().supportCases.find((x) => x.id === id);
  if (!sc) throw new RuleError("Support case not found.");
  authorize(
    "support.manage",
    "Update support case",
    "Customer Support",
    "Support Case",
    id,
    sc.caseReference,
  );
  if (
    (patch.status === "Resolved" || patch.status === "Closed") &&
    !(patch.resolution ?? sc.resolution)?.trim()
  )
    throw new RuleError("Record resolution details before resolving or closing a case.");
  if (patch.assignedEmployeeId) {
    const emp = getState().employees.find((e) => e.id === patch.assignedEmployeeId);
    if (!emp || emp.status !== "Active" || !can(emp.role, "support.manage"))
      throw new RuleError("That employee is not authorized to handle support cases.");
  }
  setState((d) => {
    const x = d.supportCases.find((y) => y.id === id)!;
    const before: Record<string, unknown> = {};
    const after: Record<string, unknown> = {};
    const t = now();
    const me = d.currentEmployeeId;
    if (patch.status && patch.status !== x.status) {
      before.status = x.status;
      after.status = patch.status;
      x.timeline.push({ at: t, by: me, text: `Status changed to ${patch.status}` });
      x.status = patch.status;
    }
    if (patch.priority && patch.priority !== x.priority) {
      before.priority = x.priority;
      after.priority = patch.priority;
      x.timeline.push({ at: t, by: me, text: `Priority changed to ${patch.priority}` });
      x.priority = patch.priority;
    }
    if (
      patch.assignedEmployeeId !== undefined &&
      patch.assignedEmployeeId !== x.assignedEmployeeId
    ) {
      before.assignedTo = x.assignedEmployeeId;
      after.assignedTo = patch.assignedEmployeeId;
      const emp = d.employees.find((e) => e.id === patch.assignedEmployeeId);
      x.timeline.push({ at: t, by: me, text: emp ? `Assigned to ${emp.name}` : "Unassigned" });
      x.assignedEmployeeId = patch.assignedEmployeeId;
    }
    if (patch.resolution !== undefined && patch.resolution !== x.resolution) {
      after.resolution = patch.resolution;
      x.resolution = patch.resolution;
    }
    x.updatedAt = t;
    const action =
      "assignedTo" in after
        ? "Support case assigned"
        : "status" in after
          ? "Support case status changed"
          : "Support case updated";
    pushAudit(d, {
      action,
      module: "Customer Support",
      entityType: "Support Case",
      entityId: id,
      entityLabel: x.caseReference,
      outcome: "Success",
      details: Object.keys(after).join(", "),
      before,
      after,
    });
  });
}

function addCaseNote(id: string, text: string) {
  const sc = getState().supportCases.find((x) => x.id === id);
  if (!sc) throw new RuleError("Support case not found.");
  authorize(
    "support.manage",
    "Add internal note",
    "Customer Support",
    "Support Case",
    id,
    sc.caseReference,
  );
  if (text.trim().length < 3) throw new RuleError("Note cannot be empty.");
  setState((d) => {
    const x = d.supportCases.find((y) => y.id === id)!;
    x.notes.unshift({ id: uid("note"), at: now(), by: d.currentEmployeeId, text: text.trim() });
    x.updatedAt = now();
    pushAudit(d, {
      action: "Internal note added",
      module: "Customer Support",
      entityType: "Support Case",
      entityId: id,
      entityLabel: x.caseReference,
      outcome: "Success",
      details: "Internal note (not visible to customer)",
    });
  });
}

function linkCaseRecord(id: string, link: CaseLink) {
  const sc = getState().supportCases.find((x) => x.id === id);
  if (!sc) throw new RuleError("Support case not found.");
  authorize(
    "support.manage",
    "Link record to case",
    "Customer Support",
    "Support Case",
    id,
    sc.caseReference,
  );
  if (sc.links.some((l) => l.type === link.type && l.id === link.id))
    throw new RuleError("That record is already linked to this case.");
  setState((d) => {
    const x = d.supportCases.find((y) => y.id === id)!;
    x.links.push(link);
    x.timeline.push({ at: now(), by: d.currentEmployeeId, text: `Linked ${link.type} record` });
    x.updatedAt = now();
    pushAudit(d, {
      action: "Record linked to support case",
      module: "Customer Support",
      entityType: "Support Case",
      entityId: id,
      entityLabel: x.caseReference,
      outcome: "Success",
      details: `${link.type}: ${link.id}`,
    });
  });
}

/* ---------------- Cards ---------------- */

function lockCard(cardId: string, reason: string) {
  const card = getState().cards.find((x) => x.id === cardId);
  if (!card) throw new RuleError("Card not found.");
  authorize("cards.lock", "Lock card", "Cards", "Card", cardId, `•••• ${card.last4}`);
  if (card.cardStatus !== "Active")
    throw new RuleError(`Only active cards can be locked (current: ${card.cardStatus}).`);
  if (reason.trim().length < 5) throw new RuleError("A reason is required to lock a card.");
  setState((d) => {
    const x = d.cards.find((y) => y.id === cardId)!;
    x.cardStatus = "Locked";
    x.notes.unshift({
      id: uid("note"),
      at: now(),
      by: d.currentEmployeeId,
      text: `Locked: ${reason.trim()} (simulated. Card processor not contacted)`,
    });
    pushAudit(d, {
      action: "Card lock requested",
      module: "Cards",
      entityType: "Card",
      entityId: cardId,
      entityLabel: `•••• ${x.last4}`,
      outcome: "Simulated",
      details: reason.trim(),
      before: { cardStatus: "Active" },
      after: { cardStatus: "Locked" },
    });
    activity(d, x.customerId, "Cards", `Card •••• ${x.last4} locked by employee (simulated)`, {
      to: "/cards/$cardId",
      params: { cardId },
    });
  });
}

function unlockCard(cardId: string, reason: string) {
  const card = getState().cards.find((x) => x.id === cardId);
  if (!card) throw new RuleError("Card not found.");
  authorize("cards.lock", "Unlock card", "Cards", "Card", cardId, `•••• ${card.last4}`);
  if (card.cardStatus !== "Locked") throw new RuleError("Only locked cards can be unlocked.");
  const cust = getCustomer(card.customerId);
  if (cust.customerStatus === "Restricted")
    throw new RuleError("Card cannot be unlocked while the customer is restricted.");
  if (reason.trim().length < 5) throw new RuleError("A reason is required to unlock a card.");
  setState((d) => {
    const x = d.cards.find((y) => y.id === cardId)!;
    x.cardStatus = "Active";
    x.notes.unshift({
      id: uid("note"),
      at: now(),
      by: d.currentEmployeeId,
      text: `Unlocked: ${reason.trim()} (simulated)`,
    });
    pushAudit(d, {
      action: "Card unlock requested",
      module: "Cards",
      entityType: "Card",
      entityId: cardId,
      entityLabel: `•••• ${x.last4}`,
      outcome: "Simulated",
      details: reason.trim(),
      before: { cardStatus: "Locked" },
      after: { cardStatus: "Active" },
    });
  });
}

/**
 * Records a customer activation reported by the card processor. This is
 * the moment a manufactured card's journey completes: the manufacturer
 * printed it and mailed it to the customer directly, Renda never tracked
 * its delivery, and activation is the first confirmation it arrived.
 * Activating a replacement retires the card it replaces.
 */
function recordCardActivation(cardId: string) {
  const db = getState();
  const card = db.cards.find((x) => x.id === cardId);
  if (!card) throw new RuleError("Card not found.");
  authorize("cards.lock", "Record card activation", "Cards", "Card", cardId, `•••• ${card.last4}`);
  if (card.cardType !== "Physical")
    throw new RuleError("Virtual cards are active from issuance and need no activation.");
  if (card.cardStatus !== "In Production")
    throw new RuleError(
      `Only cards in production can be recorded as activated (current: ${card.cardStatus}).`,
    );
  const order = db.cardOrders.find((o) => o.cardId === cardId && o.orderStatus === "Submitted");
  if (!order) throw new RuleError("This card has no submitted manufacturing order.");
  setState((d) => {
    const x = d.cards.find((y) => y.id === cardId)!;
    const at = now();
    x.cardStatus = "Active";
    x.activatedAt = at;
    if (!x.issueDate) x.issueDate = at;
    x.notes.unshift({
      id: uid("note"),
      at,
      by: d.currentEmployeeId,
      text: "Activated by the customer (reported by the card processor, simulated). Activation is the first confirmation the card arrived; the manufacturer mailed it directly and delivery was not tracked.",
    });
    const o = d.cardOrders.find((y) => y.id === order.id)!;
    o.orderStatus = "Activated";
    o.activatedAt = at;
    if (x.replacesCardId) {
      const prev = d.cards.find((y) => y.id === x.replacesCardId);
      if (prev && prev.cardStatus !== "Canceled" && prev.cardStatus !== "Replaced")
        prev.cardStatus = "Replaced";
    }
    pushAudit(d, {
      action: "Card activation recorded",
      module: "Cards",
      entityType: "Card",
      entityId: cardId,
      entityLabel: `•••• ${x.last4}`,
      outcome: "Simulated",
      details:
        "Customer activated the card. The manufacturer delivered it directly; no delivery was tracked.",
      before: { cardStatus: "In Production" },
      after: { cardStatus: "Active" },
    });
    activity(d, x.customerId, "Cards", `Card •••• ${x.last4} activated by customer`, {
      to: "/cards/$cardId",
      params: { cardId },
    });
  });
}

function createReplacement(input: {
  cardId: string;
  design: CardDesign;
  reason: ReplacementReason;
  notes: string;
}) {
  const db = getState();
  const card = db.cards.find((x) => x.id === input.cardId);
  if (!card) throw new RuleError("Card not found.");
  authorize(
    "cards.replace",
    "Create replacement request",
    "Cards",
    "Card",
    card.id,
    `•••• ${card.last4}`,
  );
  if (card.cardType !== "Physical")
    throw new RuleError(
      "Replacement manufacturing applies to physical cards only. Virtual cards are reissued by the card processor.",
    );
  if (!(card.cardStatus === "Active" || card.cardStatus === "Locked"))
    throw new RuleError(
      `A replacement cannot be requested for a card that is ${card.cardStatus.toLowerCase()}.`,
    );
  const open = db.cardOrders.find(
    (o) =>
      o.previousCardId === card.id && o.orderStatus !== "Canceled" && o.orderStatus !== "Failed",
  );
  if (open)
    throw new RuleError(
      `A replacement (${open.replacementReference}) already exists for this card.`,
    );
  if (input.reason === "Customer-requested design change" && input.design === card.cardDesign)
    throw new RuleError("Choose a different design for a design-change replacement.");
  const newCardId = uid("crd");
  setState((d) => {
    const old = d.cards.find((y) => y.id === card.id)!;
    const maxRpl = Math.max(
      ...d.cardOrders.map((o) => Number(o.replacementReference?.slice(9) ?? 0)),
      300,
    );
    const rpl = `RPL-2026-${String(maxRpl + 1).padStart(4, "0")}`;
    const maxOrd = Math.max(...d.cardOrders.map((o) => Number(o.orderReference.slice(8))), 1040);
    if (input.reason === "Lost card" || input.reason === "Suspected compromise")
      old.cardStatus = "Locked";
    old.replacedByCardId = newCardId;
    d.cards.push({
      id: newCardId,
      customerId: old.customerId,
      accountId: old.accountId,
      cardType: "Physical",
      cardDesign: input.design,
      cardStatus: "Awaiting Manufacturing",
      last4: String(1000 + ((maxOrd * 7919) % 9000)),
      issueDate: null,
      activatedAt: null,
      manufacturingBatchId: null,
      replacementReference: rpl,
      replacesCardId: old.id,
      replacedByCardId: null,
      notes: [],
    });
    d.cardOrders.unshift({
      id: uid("ord"),
      orderReference: `CO-2026-${maxOrd + 1}`,
      customerId: old.customerId,
      cardId: newCardId,
      previousCardId: old.id,
      orderType: "Replacement Card",
      requestedDesign: input.design,
      previousDesign: old.cardDesign,
      orderStatus: "Eligible",
      requestDate: now(),
      manufacturingBatchId: null,
      replacementReason: input.reason,
      replacementReference: rpl,
      activatedAt: null,
      notes: input.notes.trim(),
    });
    pushAudit(d, {
      action: "Replacement card request created",
      module: "Cards",
      entityType: "Card",
      entityId: newCardId,
      entityLabel: rpl,
      outcome: "Success",
      details: `${old.cardDesign} → ${input.design} · ${input.reason}`,
    });
    activity(
      d,
      old.customerId,
      "Cards",
      `Replacement card requested (${old.cardDesign} → ${input.design})`,
      { to: "/cards/$cardId", params: { cardId: newCardId } },
    );
  });
  return newCardId;
}

function cancelOrder(orderId: string, reason: string) {
  const o = getState().cardOrders.find((x) => x.id === orderId);
  if (!o) throw new RuleError("Order not found.");
  authorize("cards.replace", "Cancel card order", "Cards", "Card Order", orderId, o.orderReference);
  if (o.orderStatus === "Batched")
    throw new RuleError(
      "This order is in a draft batch. Remove it from the batch before canceling it.",
    );
  // Submitted orders can still be canceled while the card was never
  // activated (for example it never arrived): the manufactured card is
  // canceled with the order, and a replacement can then be issued.
  if (o.orderStatus !== "Eligible" && o.orderStatus !== "Submitted")
    throw new RuleError(`Orders with status ${o.orderStatus} cannot be canceled.`);
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
    pushAudit(d, {
      action: "Card order canceled",
      module: "Cards",
      entityType: "Card Order",
      entityId: orderId,
      entityLabel: x.orderReference,
      outcome: "Success",
      details: reason.trim(),
    });
  });
}

/* ---------------- Plans ---------------- */

const fmtDay = (iso: string | null) =>
  iso
    ? new Date(iso).toLocaleDateString("en-CA", {
        year: "numeric",
        month: "short",
        day: "numeric",
      })
    : "-";

function smartSpendAccount(d: DB, customerId: string) {
  return d.accounts.find((a) => a.customerId === customerId && a.accountType === "Smart Spend");
}

/** Why the Plus fee cannot be collected from this customer's Smart Spend
 * right now, or null when it can. Plus is charged from Smart Spend and the
 * charge is all-or-nothing: no partial collection, no negative balance. */
function planFeeBlocker(d: DB, customerId: string): string | null {
  const acc = smartSpendAccount(d, customerId);
  if (!acc || acc.accountStatus !== "Active")
    return "The customer has no active Smart Spend account to charge.";
  if (acc.availableBalance === null || acc.availableBalance < PLAN_PRICES.Plus)
    return `Smart Spend cannot cover the $${PLAN_PRICES.Plus.toFixed(2)} Plus fee (available: ${
      acc.availableBalance === null ? "unknown" : `$${acc.availableBalance.toFixed(2)}`
    }).`;
  return null;
}

/** Collects the Plus fee from Smart Spend and posts the Plan Fee
 * transaction. The caller must have checked planFeeBlocker first. */
function collectPlanFee(d: DB, customerId: string) {
  const acc = smartSpendAccount(d, customerId)!;
  const fee = PLAN_PRICES.Plus;
  acc.availableBalance = (acc.availableBalance ?? 0) - fee;
  acc.ledgerBalance = (acc.ledgerBalance ?? 0) - fee;
  d.transactions.unshift({
    id: uid("txn"),
    customerId,
    accountId: acc.id,
    transactionReference: `TX-${Math.floor(700000 + Math.random() * 299999)}`,
    transactionType: "Plan Fee",
    description: "Renda Plus membership",
    direction: "debit",
    amount: fee,
    currency: "CAD",
    status: "Completed",
    timestamp: now(),
    completedAt: now(),
    providerReference: `BIL-${Math.floor(10000000 + Math.random() * 89999999)}`,
    paymentRail: "Renda Billing",
    notes: [],
  });
}

function changePlan(customerId: string, to: Plan, note: string) {
  const db = getState();
  const c = getCustomer(customerId);
  authorize(
    "subscriptions.manage",
    "Change membership plan",
    "Plans & Subscriptions",
    "Customer",
    customerId,
    name(c),
  );
  const sub = db.subscriptions.find((s) => s.customerId === customerId);
  if (!sub)
    throw new RuleError("This customer has no subscription yet. A plan is selected during setup.");
  if (sub.subscriptionStatus === "Canceled" || c.customerStatus === "Closed")
    throw new RuleError("Plans cannot be changed for closed accounts.");
  if (c.customerStatus === "Restricted")
    throw new RuleError("Plans cannot be changed while the customer is restricted.");
  if (sub.plan === to) throw new RuleError(`Customer is already on Renda ${to}.`);
  // Product rule (user, 2026-11-17): an upgrade charges Smart Spend
  // immediately, and if the fee cannot be collected the upgrade simply
  // does not happen. There is no pending state.
  if (to === "Plus") {
    const blocker = planFeeBlocker(db, customerId);
    if (blocker)
      throw new RuleError(
        `${blocker} The upgrade does not go ahead and the customer stays on Everyday.`,
      );
  }
  const hasPhysical = db.cards.some(
    (x) =>
      x.customerId === customerId &&
      x.cardType === "Physical" &&
      x.cardStatus !== "Canceled" &&
      x.cardStatus !== "Replaced",
  );
  setState((d) => {
    const s = d.subscriptions.find((y) => y.id === sub.id)!;
    const from = s.plan;
    s.plan = to;
    s.monthlyPrice = PLAN_PRICES[to];
    s.history.push({
      at: now(),
      from,
      to,
      by: d.currentEmployeeId,
      note:
        note.trim() ||
        (to === "Plus"
          ? "Upgraded by employee; Plus fee collected from Smart Spend"
          : "Changed by employee (demo)"),
    });
    if (to === "Plus") {
      collectPlanFee(d, customerId);
      s.subscriptionStatus = "Active";
      s.latestBillingStatus = "Paid";
      s.nextBillingDate = addMonths(now(), 1);
      s.billingOutstandingSince = null;
      s.billingRetryCount = 0;
      s.lastBillingAttemptAt = now();
      s.cardSelectionRequired = !hasPhysical;
    } else {
      s.subscriptionStatus = "Active";
      s.latestBillingStatus = "Not Applicable";
      s.nextBillingDate = null;
      s.billingOutstandingSince = null;
      s.billingRetryCount = 0;
      s.lastBillingAttemptAt = null;
      s.cardSelectionRequired = false;
    }
    pushAudit(d, {
      action: to === "Plus" ? "Plan upgraded" : "Plan downgraded",
      module: "Plans & Subscriptions",
      entityType: "Customer",
      entityId: customerId,
      entityLabel: name(c),
      outcome: "Success",
      details:
        to === "Plus"
          ? `Plus fee of $${PLAN_PRICES.Plus.toFixed(2)} collected from Smart Spend at upgrade.${!hasPhysical ? " Physical card selection required." : ""}`
          : "Downgraded to Everyday",
      before: { plan: from },
      after: { plan: to },
    });
    activity(
      d,
      customerId,
      "Membership",
      to === "Plus" ? "Upgraded from Everyday to Renda Plus" : "Downgraded to Renda Everyday",
    );
  });
}

/** Records one renewal charge attempt for a Plus subscription, the way the
 * billing system would report it. A failed attempt leaves the plan active
 * and starts (or continues) the retry window: the fee stays outstanding
 * and retries run until the new billing date. A successful attempt, at the
 * due date or on any retry, collects the fee and clears the window. */
function recordRenewalAttempt(customerId: string, success: boolean) {
  const db = getState();
  const c = getCustomer(customerId);
  authorize(
    "subscriptions.manage",
    "Record renewal charge attempt",
    "Plans & Subscriptions",
    "Customer",
    customerId,
    name(c),
  );
  const sub = db.subscriptions.find((s) => s.customerId === customerId);
  if (!sub || sub.plan !== "Plus" || sub.subscriptionStatus !== "Active")
    throw new RuleError("Renewal charges only apply to an active Renda Plus subscription.");
  if (billingDowngradeDue(sub))
    throw new RuleError(
      "The retry window closed at the new billing date. Downgrade the plan for non-payment instead of recording another attempt.",
    );
  if (success) {
    const blocker = planFeeBlocker(db, customerId);
    if (blocker)
      throw new RuleError(
        `${blocker} Record a failed attempt instead; the fee stays outstanding and retries continue.`,
      );
  }
  setState((d) => {
    const s = d.subscriptions.find((y) => y.id === sub.id)!;
    s.lastBillingAttemptAt = now();
    if (success) {
      collectPlanFee(d, customerId);
      const wasRetry = !!s.billingOutstandingSince;
      s.latestBillingStatus = "Paid";
      s.billingOutstandingSince = null;
      s.billingRetryCount = 0;
      // On a normal renewal the cycle advances from the date that was due;
      // on a successful retry nextBillingDate already holds the new date.
      if (!wasRetry && s.nextBillingDate) s.nextBillingDate = addMonths(s.nextBillingDate, 1);
      pushAudit(d, {
        action: wasRetry ? "Plus fee collected on retry" : "Plus renewal charged",
        module: "Plans & Subscriptions",
        entityType: "Customer",
        entityId: customerId,
        entityLabel: name(c),
        outcome: "Success",
        details: `Plus fee of $${PLAN_PRICES.Plus.toFixed(2)} collected from Smart Spend.`,
      });
      activity(
        d,
        customerId,
        "Membership",
        wasRetry ? "Plus fee collected after retry" : "Plus renewal charged",
      );
    } else {
      const firstFailure = !s.billingOutstandingSince;
      if (firstFailure) {
        // The missed billing date becomes the outstanding date and the
        // next billing date becomes the end of the retry window.
        s.billingOutstandingSince = s.nextBillingDate ?? now();
        s.nextBillingDate = addMonths(s.billingOutstandingSince, 1);
      }
      s.latestBillingStatus = "Failed";
      s.billingRetryCount += 1;
      pushAudit(d, {
        action: "Plus renewal charge failed",
        module: "Plans & Subscriptions",
        entityType: "Customer",
        entityId: customerId,
        entityLabel: name(c),
        outcome: "Simulated",
        details: `Attempt ${s.billingRetryCount}. Fee outstanding since ${fmtDay(s.billingOutstandingSince)}; retries run every ${d.settings.planRetryIntervalDays} days until the new billing date, ${fmtDay(s.nextBillingDate)}, when the plan downgrades to Everyday if still unpaid.`,
      });
      activity(
        d,
        customerId,
        "Membership",
        `Plus renewal charge failed (attempt ${s.billingRetryCount}); fee outstanding, retries running`,
      );
    }
  });
}

/** Ends the retry window: the new billing date has arrived and the Plus
 * fee is still unpaid, so the plan downgrades to Everyday. Physical cards
 * and open card orders are canceled, because Everyday is virtual-only. */
function downgradeForNonPayment(customerId: string) {
  const db = getState();
  const c = getCustomer(customerId);
  authorize(
    "subscriptions.manage",
    "Downgrade plan for non-payment",
    "Plans & Subscriptions",
    "Customer",
    customerId,
    name(c),
  );
  const sub = db.subscriptions.find((s) => s.customerId === customerId);
  if (!sub || sub.plan !== "Plus")
    throw new RuleError("Only a Renda Plus subscription can be downgraded for non-payment.");
  if (!sub.billingOutstandingSince)
    throw new RuleError("This subscription has no unpaid Plus fee outstanding.");
  if (!billingDowngradeDue(sub))
    throw new RuleError(
      `Retries are still open. The fee has been outstanding since ${fmtDay(sub.billingOutstandingSince)} and the plan downgrades at the new billing date, ${fmtDay(sub.nextBillingDate)}, if it is still unpaid.`,
    );
  setState((d) => {
    const s = d.subscriptions.find((y) => y.id === sub.id)!;
    const outstandingSince = s.billingOutstandingSince;
    const attempts = s.billingRetryCount;
    s.plan = "Everyday";
    s.monthlyPrice = PLAN_PRICES.Everyday;
    s.subscriptionStatus = "Active";
    s.latestBillingStatus = "Not Applicable";
    s.nextBillingDate = null;
    s.billingOutstandingSince = null;
    s.billingRetryCount = 0;
    s.cardSelectionRequired = false;
    s.history.push({
      at: now(),
      from: "Plus",
      to: "Everyday",
      by: d.currentEmployeeId,
      note: `Downgraded for non-payment: Plus fee unpaid since ${fmtDay(outstandingSince)} after ${attempts} failed attempt${attempts === 1 ? "" : "s"}; retry window closed at the new billing date.`,
    });
    let cardsCanceled = 0;
    for (const card of d.cards) {
      if (
        card.customerId === customerId &&
        card.cardType === "Physical" &&
        card.cardStatus !== "Canceled" &&
        card.cardStatus !== "Replaced"
      ) {
        card.cardStatus = "Canceled";
        card.notes.unshift({
          id: uid("note"),
          at: now(),
          by: d.currentEmployeeId,
          text: "Canceled: the Plus plan was downgraded to Everyday for non-payment. Everyday includes a virtual card only.",
        });
        cardsCanceled += 1;
      }
    }
    let ordersCanceled = 0;
    for (const o of d.cardOrders) {
      if (
        o.customerId === customerId &&
        o.orderStatus !== "Activated" &&
        o.orderStatus !== "Canceled" &&
        o.orderStatus !== "Failed"
      ) {
        o.orderStatus = "Canceled";
        o.notes =
          (o.notes ? `${o.notes} ` : "") +
          "Canceled: the Plus plan was downgraded to Everyday for non-payment.";
        ordersCanceled += 1;
      }
    }
    pushAudit(d, {
      action: "Plan downgraded for non-payment",
      module: "Plans & Subscriptions",
      entityType: "Customer",
      entityId: customerId,
      entityLabel: name(c),
      outcome: "Success",
      details: `Plus fee unpaid since ${fmtDay(outstandingSince)} (${attempts} failed attempts). Downgraded to Everyday at the new billing date.${cardsCanceled ? ` ${cardsCanceled} physical card(s) canceled.` : ""}${ordersCanceled ? ` ${ordersCanceled} open card order(s) canceled.` : ""}`,
      before: { plan: "Plus" },
      after: { plan: "Everyday" },
    });
    activity(
      d,
      customerId,
      "Membership",
      "Downgraded to Everyday: Plus fee still unpaid at the new billing date",
    );
  });
}

function recordCardSelection(customerId: string, design: CardDesign) {
  const db = getState();
  const c = getCustomer(customerId);
  authorize(
    "cards.replace",
    "Record card design selection",
    "Cards",
    "Customer",
    customerId,
    name(c),
  );
  const sub = db.subscriptions.find((s) => s.customerId === customerId);
  if (!sub || sub.plan !== "Plus")
    throw new RuleError("Physical card selection is only available on Renda Plus.");
  const dup = db.cardOrders.find(
    (o) =>
      o.customerId === customerId &&
      o.orderType === "Initial Plus Card" &&
      o.orderStatus !== "Canceled" &&
      o.orderStatus !== "Failed",
  );
  if (dup)
    throw new RuleError(
      `An initial Plus card order (${dup.orderReference}) already exists for this customer.`,
    );
  if (!sub.cardSelectionRequired)
    throw new RuleError("No card selection is outstanding for this customer.");
  const cardId = uid("crd");
  setState((d) => {
    const maxOrd = Math.max(...d.cardOrders.map((o) => Number(o.orderReference.slice(8))), 1040);
    d.cards.push({
      id: cardId,
      customerId,
      accountId: `acc_${customerId.slice(4)}_ss`,
      cardType: "Physical",
      cardDesign: design,
      cardStatus: "Awaiting Manufacturing",
      last4: String(1000 + ((maxOrd * 6151) % 9000)),
      issueDate: null,
      activatedAt: null,
      manufacturingBatchId: null,
      replacementReference: null,
      replacesCardId: null,
      replacedByCardId: null,
      notes: [],
    });
    d.cardOrders.unshift({
      id: uid("ord"),
      orderReference: `CO-2026-${maxOrd + 1}`,
      customerId,
      cardId,
      previousCardId: null,
      orderType: "Initial Plus Card",
      requestedDesign: design,
      previousDesign: null,
      orderStatus: "Eligible",
      requestDate: now(),
      manufacturingBatchId: null,
      replacementReason: null,
      replacementReference: null,
      activatedAt: null,
      notes: "Design selected by customer; recorded by employee.",
    });
    d.subscriptions.find((s) => s.id === sub.id)!.cardSelectionRequired = false;
    pushAudit(d, {
      action: "Physical card order created",
      module: "Cards",
      entityType: "Customer",
      entityId: customerId,
      entityLabel: name(c),
      outcome: "Success",
      details: `Initial Plus card · ${design}`,
    });
    activity(d, customerId, "Cards", `Physical ${design} card selected`, {
      to: "/cards/$cardId",
      params: { cardId },
    });
  });
  return cardId;
}

/* ---------------- Manufacturing ---------------- */

function batchLabel(id: string) {
  return getState().batches.find((b) => b.id === id)?.batchReference ?? id;
}

function createBatch(orderIds: string[]) {
  authorize(
    "manufacturing.manage",
    "Create manufacturing batch",
    "Card Manufacturing",
    "Batch",
    "-",
    "New batch",
  );
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
    const week = Math.ceil(
      ((+today - +new Date(today.getFullYear(), 0, 1)) / 864e5 +
        new Date(today.getFullYear(), 0, 1).getDay() +
        1) /
        7,
    );
    const base = `MB-${today.getFullYear()}-W${week}`;
    const count = d.batches.filter((b) => b.batchReference.startsWith(base)).length;
    ref = count ? `${base}-${String.fromCharCode(65 + count)}` : base;
    const me = d.currentEmployeeId;
    d.batches.unshift({
      id,
      batchReference: ref,
      createdAt: now(),
      createdBy: me,
      status: "Draft",
      orderIds: [...orderIds],
      orderCount: orderIds.length,
      pdfReference: null,
      exportedAt: null,
      exportedBy: null,
      reviewedBy: null,
      submittedAt: null,
      submittedBy: null,
      submissionNote: null,
      history: [
        {
          at: now(),
          by: me,
          action: `Batch created with ${orderIds.length} order${orderIds.length === 1 ? "" : "s"}`,
        },
      ],
    });
    for (const oid of orderIds) {
      const o = d.cardOrders.find((x) => x.id === oid)!;
      o.orderStatus = "Batched";
      o.manufacturingBatchId = id;
      const card = d.cards.find((c) => c.id === o.cardId);
      if (card) card.manufacturingBatchId = id;
    }
    pushAudit(d, {
      action: "Manufacturing batch created",
      module: "Card Manufacturing",
      entityType: "Batch",
      entityId: id,
      entityLabel: ref,
      outcome: "Success",
      details: `${orderIds.length} orders included`,
    });
  });
  return { id, ref };
}

function removeOrderFromBatch(batchId: string, orderId: string) {
  authorize(
    "manufacturing.manage",
    "Remove order from batch",
    "Card Manufacturing",
    "Batch",
    batchId,
    batchLabel(batchId),
  );
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
    x.history.push({
      at: now(),
      by: d.currentEmployeeId,
      action: `Removed ${o.orderReference}; PDF must be regenerated`,
    });
    pushAudit(d, {
      action: "Order removed from batch",
      module: "Card Manufacturing",
      entityType: "Batch",
      entityId: batchId,
      entityLabel: x.batchReference,
      outcome: "Success",
      details: o.orderReference,
    });
  });
}

/** Records the export after the PDF file has been generated client-side. */
function recordPdfExport(batchId: string) {
  authorize(
    "manufacturing.manage",
    "Generate manufacturing PDF",
    "Card Manufacturing",
    "Batch",
    batchId,
    batchLabel(batchId),
  );
  const b = getState().batches.find((x) => x.id === batchId);
  if (!b) throw new RuleError("Batch not found.");
  if (!b.orderCount) throw new RuleError("This batch has no orders.");
  setState((d) => {
    const x = d.batches.find((y) => y.id === batchId)!;
    x.pdfReference = `${x.batchReference}.pdf`;
    x.exportedAt = now();
    x.exportedBy = d.currentEmployeeId;
    x.history.push({
      at: now(),
      by: d.currentEmployeeId,
      action: "Manufacturing PDF generated and downloaded",
    });
    pushAudit(d, {
      action: "Manufacturing PDF exported",
      module: "Card Manufacturing",
      entityType: "Batch",
      entityId: batchId,
      entityLabel: x.batchReference,
      outcome: "Success",
      details: x.pdfReference,
    });
  });
}

function markBatchReady(batchId: string) {
  authorize(
    "manufacturing.manage",
    "Mark batch ready",
    "Card Manufacturing",
    "Batch",
    batchId,
    batchLabel(batchId),
  );
  const b = getState().batches.find((x) => x.id === batchId);
  if (!b) throw new RuleError("Batch not found.");
  if (b.status !== "Draft") throw new RuleError("Only draft batches can be marked ready.");
  if (!b.pdfReference)
    throw new RuleError("Generate the manufacturing PDF before marking the batch ready.");
  setState((d) => {
    const x = d.batches.find((y) => y.id === batchId)!;
    x.status = "Ready for Submission";
    x.reviewedBy = d.currentEmployeeId;
    x.history.push({
      at: now(),
      by: d.currentEmployeeId,
      action: "Reviewed and marked ready for submission",
    });
    pushAudit(d, {
      action: "Batch marked ready for submission",
      module: "Card Manufacturing",
      entityType: "Batch",
      entityId: batchId,
      entityLabel: x.batchReference,
      outcome: "Success",
      details: "",
      before: { status: "Draft" },
      after: { status: "Ready for Submission" },
    });
  });
}

/** Employee confirms the PDF was actually sent to the manufacturer. Never automatic. */
function recordBatchSubmission(batchId: string, note: string) {
  authorize(
    "manufacturing.manage",
    "Record batch submission",
    "Card Manufacturing",
    "Batch",
    batchId,
    batchLabel(batchId),
  );
  const b = getState().batches.find((x) => x.id === batchId);
  if (!b) throw new RuleError("Batch not found.");
  if (b.status !== "Ready for Submission")
    throw new RuleError("Only batches marked ready can be recorded as submitted.");
  if (note.trim().length < 5)
    throw new RuleError("Describe how the batch was sent (e.g. emailed to production desk).");
  setState((d) => {
    const x = d.batches.find((y) => y.id === batchId)!;
    x.status = "Submitted";
    x.submittedAt = now();
    x.submittedBy = d.currentEmployeeId;
    x.submissionNote = note.trim();
    x.history.push({
      at: now(),
      by: d.currentEmployeeId,
      action: "Submission to manufacturer recorded",
    });
    for (const oid of x.orderIds) {
      const o = d.cardOrders.find((y) => y.id === oid)!;
      o.orderStatus = "Submitted";
      const card = d.cards.find((c) => c.id === o.cardId);
      if (card && card.cardStatus === "Awaiting Manufacturing") card.cardStatus = "In Production";
    }
    pushAudit(d, {
      action: "Batch submission recorded",
      module: "Card Manufacturing",
      entityType: "Batch",
      entityId: batchId,
      entityLabel: x.batchReference,
      outcome: "Success",
      details: note.trim(),
      before: { status: "Ready for Submission" },
      after: { status: "Submitted" },
    });
  });
}

/* ---------------- Settings ---------------- */

function updatePreferences(patch: Partial<PersonalSettings>) {
  setState((d) => {
    Object.assign(d.settings, patch);
  });
}

function updateOperationalSettings(patch: Partial<OperationalSettings>) {
  authorize(
    "settings.manage",
    "Change operational settings",
    "Settings",
    "Settings",
    "org",
    "Operational configuration",
  );
  if (
    patch.kycReviewSlaHours !== undefined &&
    (patch.kycReviewSlaHours < 1 || patch.kycReviewSlaHours > 720)
  )
    throw new RuleError("KYC review SLA must be between 1 and 720 hours.");
  if (
    patch.supportResponseSlaHours !== undefined &&
    (patch.supportResponseSlaHours < 1 || patch.supportResponseSlaHours > 168)
  )
    throw new RuleError("Support SLA must be between 1 and 168 hours.");
  setState((d) => {
    const before: Record<string, unknown> = {};
    for (const k of Object.keys(patch))
      before[k] = (d.settings as unknown as Record<string, unknown>)[k];
    Object.assign(d.settings, patch);
    pushAudit(d, {
      action: "Settings changed",
      module: "Settings",
      entityType: "Settings",
      entityId: "org",
      entityLabel: "Operational configuration",
      outcome: "Success",
      details: Object.keys(patch).join(", "),
      before,
      after: patch as Record<string, unknown>,
    });
  });
}

/* ---------------- Service ---------------- */

/** Wraps a synchronous demo action so it resolves or rejects like a network call. */
const asAsync =
  <A extends unknown[], R>(fn: (...args: A) => R) =>
  (...args: A): Promise<R> =>
    Promise.resolve().then(() => fn(...args));

export const localOperations: OperationsService = {
  updateCustomer: asAsync(updateCustomer),
  escalateKyc: asAsync(escalateKyc),
  recordKycDecision: asAsync(recordKycDecision),
  requestKycResubmission: asAsync(requestKycResubmission),
  requestAccountIssuance: asAsync(requestAccountIssuance),
  simulateIssuanceResult: asAsync(simulateIssuanceResult),
  completeSetup: asAsync(completeSetup),
  addTransactionNote: asAsync(addTransactionNote),
  requestTransferReturn: asAsync(requestTransferReturn),
  recordReturnOutcome: asAsync(recordReturnOutcome),
  cancelInteracTransfer: asAsync(cancelInteracTransfer),
  resolveAlfieEvent: asAsync(resolveAlfieEvent),
  reopenAlfieEvent: asAsync(reopenAlfieEvent),
  createSupportCase: asAsync(createSupportCase),
  updateCase: asAsync(updateCase),
  addCaseNote: asAsync(addCaseNote),
  linkCaseRecord: asAsync(linkCaseRecord),
  lockCard: asAsync(lockCard),
  unlockCard: asAsync(unlockCard),
  recordCardActivation: asAsync(recordCardActivation),
  createReplacement: asAsync(createReplacement),
  cancelOrder: asAsync(cancelOrder),
  changePlan: asAsync(changePlan),
  recordRenewalAttempt: asAsync(recordRenewalAttempt),
  downgradeForNonPayment: asAsync(downgradeForNonPayment),
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

// Primary data entities for Renda Operations. Shared by every module.

export type CustomerStatus =
  | "Registered"
  | "Email Verification Pending"
  | "Email Verified"
  | "Onboarding In Progress"
  | "KYC Pending"
  | "KYC Failed"
  | "KYC Under Review"
  | "KYC Approved"
  | "Account Issuance Pending"
  | "Account Issuance Failed"
  | "Setup In Progress"
  | "Active"
  | "Restricted"
  | "Closed";

export type OnboardingStatus = "Not Started" | "In Progress" | "Completed" | "Blocked";
export type KycStatus = "Not Started" | "Pending" | "Under Review" | "Approved" | "Failed";
export type IssuanceStatus = "Not Started" | "Pending" | "Issued" | "Failed";
export type Plan = "Everyday" | "Plus";

export type RestrictionKind = "Operational Freeze" | "Compliance Hold";

/** Why a customer is restricted and who did it. Restriction is outbound
 * only: the customer can log in and receive money, but cannot send, spend
 * or withdraw, so cards stop working without being blocked themselves. */
export interface CustomerRestriction {
  kind: RestrictionKind;
  reason: string;
  note: string;
  setBy: string;
  setAt: string;
  /** The lifecycle status to restore when the restriction is lifted. A
   * customer frozen during setup goes back to Setup In Progress, not
   * Active. Absent on records created before this field existed. */
  previousStatus?: CustomerStatus;
}

/** A closure the customer requested themselves in the app (exit survey).
 * The admin sees why they are leaving, what they said, the balances as
 * they stood when they asked, and the Interac email they chose for the
 * payout. Processing is stepped (assign, prepare the payout, complete)
 * and completion is one-time: once a request is Processed it can never
 * be processed again, so a payout cannot duplicate. */
export interface ClosureRequest {
  requestedAt: string;
  /** Exit reason the customer picked in the app. */
  reason: string;
  /** Free-text feedback from the exit survey; may be empty. */
  feedback: string;
  /** Interac email the customer chose in the app for the balance payout. */
  payoutEmail: string;
  /** Balances when the request was made. `goals` is the amount held in
   * savings goals; it is part of the Sense Save balance, not extra. */
  balances: { smartSpend: number; senseSave: number; goals: number; total: number };
  status: "Pending" | "In Progress" | "Processed" | "Cancelled";
  /** Employee working the request once processing has started (step 1
   * of processing assigns it, to themselves or to someone else). */
  assignedTo: string | null;
  assignedAt: string | null;
  assignedBy: string | null;
  /** How the payout was made when the request was processed: sent by
   * the system (Automated), sent outside the admin by the assignee and
   * recorded here (Manual), or None when the balance was zero and no
   * payout was needed at all. */
  processingMethod: "Automated" | "Manual" | "None" | null;
  /** Interac reference of the payout: generated for automated payouts,
   * recorded by the employee for a manual one. */
  payoutReference: string | null;
  resolvedAt: string | null;
  resolvedBy: string | null;
  /** For a cancelled request, why it was closed without closing the
   * account (for example, the customer changed their mind). */
  resolutionNote: string | null;
}

/** Closure record. Balances are paid out by Interac before closing;
 * a closed account can be reactivated on appeal only inside the
 * reactivation window, after which the closure is permanent. */
export interface CustomerClosure {
  reason: string;
  note: string;
  closedBy: string;
  closedAt: string;
  payoutEmail: string | null;
  payoutAmount: number;
  /** Whether the closure was an admin action or the processing of a
   * closure the customer requested in the app. */
  source: "Admin" | "Customer app request";
  /** The lifecycle status a reactivation restores: the status the
   * customer held when they were closed (for a customer closed while
   * restricted, the status the restriction itself would have restored).
   * Absent on records created before this field existed; those
   * reactivate to Active. */
  previousStatus?: CustomerStatus;
}

export interface Customer {
  id: string;
  userId: string;
  firstName: string;
  lastName: string;
  email: string;
  /** The email verified at sign-up. Kept on record permanently; the
   * current email can change (in-app OTP, or support after identity
   * verification) without replacing it. */
  signupEmail: string;
  emailVerified: boolean;
  phone: string;
  phoneVerified: boolean;
  address: string;
  city: string;
  province: string;
  postalCode: string;
  dateOfBirth: string;
  maritalStatus: string;
  employmentType: string;
  occupation: string;
  industry: string;
  annualIncome: number;
  registrationDate: string;
  onboardingStatus: OnboardingStatus;
  kycStatus: KycStatus;
  accountIssuanceStatus: IssuanceStatus;
  customerStatus: CustomerStatus;
  restriction: CustomerRestriction | null;
  closure: CustomerClosure | null;
  /** Set when the customer asks to close their account from the app. */
  closureRequest: ClosureRequest | null;
  createdAt: string;
  updatedAt: string;
}

export type AccountType = "Smart Spend" | "Sense Save";
export type AccountStatus =
  "Pending Issuance" | "Issuance Failed" | "Active" | "Restricted" | "Closed";

export interface Account {
  id: string;
  customerId: string;
  accountType: AccountType;
  accountStatus: AccountStatus;
  maskedAccountIdentifier: string | null;
  openingDate: string | null;
  availableBalance: number | null;
  ledgerBalance: number | null;
  restrictions: string[];
  lastActivity: string | null;
}

export type TxnStatus = "Pending" | "Completed" | "Failed" | "Reversed" | "Canceled";
export type PaymentRail = "Mastercard" | "Internal Ledger" | "Interac" | "Renda Billing";
export type TxnType =
  | "Card Purchase"
  | "P2P Sent"
  | "P2P Received"
  | "Interac Sent"
  | "Interac Received"
  | "Account Transfer"
  | "Plan Fee"
  | "Interest";

export interface Note {
  id: string;
  at: string;
  by: string; // employee id
  text: string;
}

export interface Transaction {
  id: string;
  customerId: string;
  accountId: string;
  transactionReference: string;
  transactionType: TxnType;
  description: string;
  direction: "debit" | "credit";
  amount: number;
  currency: "CAD";
  status: TxnStatus;
  timestamp: string;
  completedAt: string | null;
  providerReference: string;
  paymentRail: PaymentRail;
  errorMessage?: string;
  transferId?: string;
  notes: Note[];
}

export type TransferType = "P2P" | "Interac" | "Account-to-Account";

/** RenPay return request (Revolut model): a completed internal transfer
 * cannot be cancelled or reversed. Renda asks the recipient to return the
 * funds on the sender's behalf; money moves only with the recipient's
 * consent, recorded as the request's outcome. */
export interface ReturnRequest {
  status: "Requested" | "Returned" | "Declined" | "No Response";
  requestedAt: string;
  requestedBy: string;
  note: string;
  resolvedAt: string | null;
  resolutionNote: string | null;
}

export interface Transfer {
  id: string;
  transferType: TransferType;
  senderCustomerId: string;
  recipientCustomerId: string | null;
  direction?: "Outgoing" | "Incoming";
  counterpartyLabel?: string;
  sourceAccountId?: string;
  destinationAccountId?: string;
  amount: number;
  currency: "CAD";
  status: TxnStatus;
  createdAt: string;
  providerReference: string;
  transactionReference: string;
  returnRequest: ReturnRequest | null;
}

export type CardDesign = "Classic" | "Blue Nova" | "Aqua Aura" | "Pearl Ivory";
export const CARD_DESIGNS: CardDesign[] = ["Classic", "Blue Nova", "Aqua Aura", "Pearl Ivory"];
export type CardStatus =
  "Active" | "Locked" | "Awaiting Manufacturing" | "In Production" | "Replaced" | "Canceled";

export interface Card {
  id: string;
  customerId: string;
  accountId: string;
  cardType: "Virtual" | "Physical";
  cardDesign: CardDesign | "Virtual";
  cardStatus: CardStatus;
  last4: string;
  issueDate: string | null;
  /** When the customer activated the card. For physical cards this is the
   * first confirmation the card arrived: the manufacturer mails cards
   * directly and delivery is not tracked. Null until activation. */
  activatedAt: string | null;
  manufacturingBatchId: string | null;
  replacementReference: string | null;
  replacesCardId: string | null;
  replacedByCardId: string | null;
  notes: Note[];
}

export type OrderStatus =
  "Eligible" | "Batched" | "Submitted" | "Activated" | "Canceled" | "Failed";
export type OrderType = "Initial Plus Card" | "Replacement Card";
export type ReplacementReason =
  | "Lost card"
  | "Damaged card"
  | "Suspected compromise"
  | "Customer-requested design change"
  | "Other";

export interface CardOrder {
  id: string;
  orderReference: string;
  customerId: string;
  cardId: string; // the new card being manufactured
  previousCardId: string | null;
  orderType: OrderType;
  requestedDesign: CardDesign;
  previousDesign: CardDesign | "Virtual" | null;
  orderStatus: OrderStatus;
  requestDate: string;
  manufacturingBatchId: string | null;
  replacementReason: ReplacementReason | null;
  replacementReference: string | null;
  /** When the customer activated the manufactured card; the order is
   * complete at that point. There is deliberately no delivery state:
   * the manufacturer mails the card directly and Renda does not track it. */
  activatedAt: string | null;
  notes: string;
}

export type BatchStatus = "Draft" | "Ready for Submission" | "Submitted";

export interface BatchHistoryEntry {
  at: string;
  by: string;
  action: string;
}

export interface ManufacturingBatch {
  id: string;
  batchReference: string;
  createdAt: string;
  createdBy: string;
  status: BatchStatus;
  orderIds: string[];
  orderCount: number;
  pdfReference: string | null;
  exportedAt: string | null;
  exportedBy: string | null;
  reviewedBy: string | null;
  submittedAt: string | null;
  submittedBy: string | null;
  submissionNote: string | null;
  history: BatchHistoryEntry[];
}

export type SubscriptionStatus = "Active" | "Pending" | "Canceled";
export type BillingStatus = "Paid" | "Failed" | "Not Applicable" | "Pending";

export interface PlanChange {
  at: string;
  from: Plan | null;
  to: Plan;
  by: string; // employee id or "customer"
  note: string;
}

export interface Subscription {
  id: string;
  customerId: string;
  plan: Plan;
  monthlyPrice: number;
  currency: "CAD";
  subscriptionStatus: SubscriptionStatus;
  startDate: string;
  nextBillingDate: string | null;
  latestBillingStatus: BillingStatus;
  /** Billing date whose Plus fee is still unpaid, while retries run. Null when current. */
  billingOutstandingSince: string | null;
  /** Failed charge attempts recorded for the outstanding fee. */
  billingRetryCount: number;
  lastBillingAttemptAt: string | null;
  cardSelectionRequired: boolean;
  history: PlanChange[];
}

export type GoalStatus = "Active" | "Completed" | "Paused" | "Closed";

export interface SavingsGoal {
  id: string;
  customerId: string;
  accountId: string;
  goalName: string;
  targetAmount: number;
  currentAmount: number | null;
  currency: "CAD";
  status: GoalStatus;
  createdAt: string;
  targetDate: string | null;
}

export type CaseStatus =
  "Open" | "In Progress" | "Awaiting Customer" | "Escalated" | "Resolved" | "Closed";
export type CasePriority = "Low" | "Normal" | "High" | "Urgent";
export type CaseCategory =
  | "Account Access"
  | "Verification"
  | "Banking Account"
  | "Transaction"
  | "Transfer"
  | "Card"
  | "Membership"
  | "Savings"
  | "Alfie"
  | "General Inquiry";

export interface CaseLink {
  type: "transaction" | "card" | "account";
  id: string;
}

export interface SupportCase {
  id: string;
  customerId: string;
  caseReference: string;
  subject: string;
  message: string;
  category: CaseCategory;
  priority: CasePriority;
  status: CaseStatus;
  assignedEmployeeId: string | null;
  createdAt: string;
  updatedAt: string;
  notes: Note[];
  links: CaseLink[];
  resolution: string | null;
  timeline: { at: string; by: string | null; text: string }[];
}

export type Role =
  | "Administrator"
  | "Customer Support"
  | "Compliance"
  | "Banking Operations"
  | "Card Operations"
  | "Read-Only Analyst";

export type EmployeeStatus = "Active" | "Invitation Pending" | "Inactive" | "Suspended";

export interface Employee {
  id: string;
  name: string;
  email: string;
  /** Role name, a system role or a custom role from the employee directory. */
  role: Role | (string & {});
  status: EmployeeStatus;
  /** True for employees with a real Renda Admin login (from the employee directory). */
  directory?: boolean;
}

export type AuditOutcome = "Success" | "Simulated" | "Denied" | "Failed";

export interface AuditEvent {
  id: string;
  employeeId: string;
  action: string;
  module: string;
  entityType: string;
  entityId: string;
  entityLabel: string;
  timestamp: string;
  outcome: AuditOutcome;
  details: string;
  before?: Record<string, unknown>;
  after?: Record<string, unknown>;
}

export interface KycCase {
  id: string;
  customerId: string;
  provider: string;
  providerReference: string;
  status: KycStatus;
  initiatedAt: string;
  completedAt: string | null;
  lastUpdated: string;
  outstandingRequirements: string[];
  providerMessages: string[];
  decisionReason: string | null;
}

export type ActivityType =
  | "Registration"
  | "Verification"
  | "KYC"
  | "Accounts"
  | "Membership"
  | "Cards"
  | "Support"
  | "Profile"
  | "Transfers";

export interface ActivityEvent {
  id: string;
  customerId: string;
  type: ActivityType;
  description: string;
  timestamp: string;
  link?: { to: string; params?: Record<string, string> };
}

export interface AlfieEvent {
  id: string;
  timestamp: string;
  workflow:
    | "Savings Goals"
    | "Subscription Analysis"
    | "Spending Insights"
    | "Conversation"
    | "Integration";
  description: string;
  severity: "Info" | "Warning" | "Error";
  status: "Open" | "Resolved";
  customerId: string | null;
  resolvedAt: string | null;
  resolvedBy: string | null;
  resolutionNote: string | null;
}

export interface AlfieService {
  name: string;
  status: "Operational" | "Degraded" | "Outage";
  latencyMs: number;
  successRate: number;
}

export interface Settings {
  organizationName: string;
  timezone: string;
  density: "compact" | "comfortable";
  notifyKyc: boolean;
  notifySupport: boolean;
  notifyManufacturing: boolean;
  kycReviewSlaHours: number;
  supportResponseSlaHours: number;
  batchProcessingDay: "Friday";
  manufacturerName: string;
  /** Days between Plus fee charge retries while a fee is outstanding. */
  planRetryIntervalDays: number;
}

export interface DB {
  version: number;
  customers: Customer[];
  accounts: Account[];
  transactions: Transaction[];
  transfers: Transfer[];
  cards: Card[];
  cardOrders: CardOrder[];
  batches: ManufacturingBatch[];
  subscriptions: Subscription[];
  goals: SavingsGoal[];
  supportCases: SupportCase[];
  employees: Employee[];
  audit: AuditEvent[];
  kycCases: KycCase[];
  activity: ActivityEvent[];
  alfieEvents: AlfieEvent[];
  alfieServices: AlfieService[];
  settings: Settings;
  currentEmployeeId: string;
  readNotificationIds: string[];
}

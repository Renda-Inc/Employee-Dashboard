// Operations contract: every change an employee can make to customer, banking, card and support records.
// The current implementation is the browser-persisted demo workspace (`src/services/actions.ts`).
// A backend implementation must enforce the same permissions and business rules and record audit events.
import type {
  CardDesign,
  CaseCategory,
  CaseLink,
  CasePriority,
  CaseStatus,
  Customer,
  DB,
  Plan,
  ReplacementReason,
  RestrictionKind,
  Settings,
} from "@/types/models";

export const EDITABLE_FIELDS = [
  "firstName",
  "lastName",
  "email",
  "phone",
  "address",
  "city",
  "province",
  "postalCode",
  "maritalStatus",
  "employmentType",
  "occupation",
  "industry",
  "annualIncome",
] as const;
export type EditableField = (typeof EDITABLE_FIELDS)[number];

export type PersonalSettings = Pick<
  Settings,
  "density" | "notifyKyc" | "notifySupport" | "notifyManufacturing"
>;
export type OperationalSettings = Omit<Settings, keyof PersonalSettings>;

export interface NewSupportCase {
  customerId: string;
  subject: string;
  message: string;
  category: CaseCategory;
  priority: CasePriority;
  links?: CaseLink[];
  assignToMe?: boolean;
}

export interface CasePatch {
  status?: CaseStatus;
  priority?: CasePriority;
  assignedEmployeeId?: string | null;
  resolution?: string;
}

export interface NewReplacement {
  cardId: string;
  design: CardDesign;
  reason: ReplacementReason;
  notes: string;
}

/** Every method rejects with a readable message when the employee lacks permission or a rule blocks it. */
export interface OperationsService {
  // Customers & lifecycle
  updateCustomer(customerId: string, patch: Partial<Pick<Customer, EditableField>>): Promise<void>;
  escalateKyc(customerId: string, reason: string): Promise<void>;
  recordKycDecision(
    customerId: string,
    decision: "Approved" | "Failed",
    reason: string,
  ): Promise<void>;
  requestKycResubmission(customerId: string): Promise<void>;
  requestAccountIssuance(customerId: string): Promise<void>;
  simulateIssuanceResult(customerId: string, success: boolean): Promise<void>;
  completeSetup(customerId: string): Promise<void>;
  // Transactions
  addTransactionNote(transactionId: string, text: string): Promise<void>;
  restrictCustomer(
    customerId: string,
    kind: RestrictionKind,
    reason: string,
    note: string,
  ): Promise<void>;
  liftRestriction(customerId: string, note: string): Promise<void>;
  closeCustomer(
    customerId: string,
    input: { reason: string; note: string; payoutEmail: string },
  ): Promise<void>;
  reactivateCustomer(customerId: string, note: string): Promise<void>;
  requestTransferReturn(transferId: string, note: string): Promise<void>;
  recordReturnOutcome(
    transferId: string,
    outcome: "Returned" | "Declined" | "No Response",
    note: string,
  ): Promise<void>;
  cancelInteracTransfer(transferId: string, reason: string): Promise<void>;
  resolveAlfieEvent(eventId: string, note: string): Promise<void>;
  reopenAlfieEvent(eventId: string, note: string): Promise<void>;
  // Support
  createSupportCase(input: NewSupportCase): Promise<{ id: string; ref: string }>;
  updateCase(caseId: string, patch: CasePatch): Promise<void>;
  addCaseNote(caseId: string, text: string): Promise<void>;
  linkCaseRecord(caseId: string, link: CaseLink): Promise<void>;
  // Cards
  lockCard(cardId: string, reason: string): Promise<void>;
  unlockCard(cardId: string, reason: string): Promise<void>;
  /** Records that the customer activated a manufactured card (reported by
   * the card processor in production). Activation completes the card
   * order and retires any card it replaces. There is no delivery step:
   * the manufacturer mails cards directly and delivery is not tracked. */
  recordCardActivation(cardId: string): Promise<void>;
  /** Returns the new replacement card ID. */
  createReplacement(input: NewReplacement): Promise<string>;
  cancelOrder(orderId: string, reason: string): Promise<void>;
  // Subscriptions
  changePlan(customerId: string, to: Plan, note: string): Promise<void>;
  recordRenewalAttempt(customerId: string, success: boolean): Promise<void>;
  downgradeForNonPayment(customerId: string): Promise<void>;
  /** Returns the new card ID. */
  recordCardSelection(customerId: string, design: CardDesign): Promise<string>;
  // Card manufacturing
  createBatch(orderIds: string[]): Promise<{ id: string; ref: string }>;
  removeOrderFromBatch(batchId: string, orderId: string): Promise<void>;
  recordPdfExport(batchId: string): Promise<void>;
  markBatchReady(batchId: string): Promise<void>;
  recordBatchSubmission(batchId: string, note: string): Promise<void>;
  // Workspace
  markNotificationsRead(ids: string[]): Promise<void>;
  updatePreferences(patch: Partial<PersonalSettings>): Promise<void>;
  updateOperationalSettings(patch: Partial<OperationalSettings>): Promise<void>;
  /** Demo only: discards local changes and restores the sample dataset. */
  resetDemoData(): Promise<void>;
}

/** Loads and persists the operations dataset. Replace with API reads when records move to a backend. */
export interface OperationsRepository {
  load(): Promise<DB>;
  save(db: DB): Promise<void>;
  /** Restores the initial dataset and returns it. */
  reset(): Promise<DB>;
}

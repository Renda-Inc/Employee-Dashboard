import type { Role } from "@/types/models";

export type Permission =
  | "customers.view"
  | "customers.edit"
  | "customers.lifecycle"
  | "kyc.view"
  | "kyc.decide"
  | "accounts.view"
  | "accounts.manage"
  | "transactions.view"
  | "transactions.investigate"
  | "cards.view"
  | "cards.lock"
  | "cards.replace"
  | "manufacturing.manage"
  | "subscriptions.view"
  | "subscriptions.manage"
  | "support.view"
  | "support.manage"
  | "alfie.view"
  | "alfie.sensitive"
  | "employees.manage"
  | "audit.view"
  | "settings.manage";

const ALL: Permission[] = [
  "customers.view", "customers.edit", "customers.lifecycle", "kyc.view", "kyc.decide", "accounts.view", "accounts.manage",
  "transactions.view", "transactions.investigate", "cards.view", "cards.lock", "cards.replace", "manufacturing.manage",
  "subscriptions.view", "subscriptions.manage", "support.view", "support.manage", "alfie.view", "alfie.sensitive",
  "employees.manage", "audit.view", "settings.manage",
];

export const ROLE_PERMISSIONS: Record<Role, Permission[]> = {
  Administrator: ALL,
  "Customer Support": [
    "customers.view", "customers.edit", "accounts.view", "transactions.view", "transactions.investigate",
    "cards.view", "cards.lock", "cards.replace", "subscriptions.view", "subscriptions.manage", "support.view", "support.manage", "alfie.view",
  ],
  Compliance: [
    "customers.view", "customers.lifecycle", "kyc.view", "kyc.decide", "accounts.view", "transactions.view",
    "transactions.investigate", "support.view", "support.manage", "audit.view", "alfie.view", "alfie.sensitive",
  ],
  "Banking Operations": [
    "customers.view", "customers.lifecycle", "kyc.view", "accounts.view", "accounts.manage", "transactions.view",
    "transactions.investigate", "subscriptions.view", "support.view", "alfie.view",
  ],
  "Card Operations": [
    "customers.view", "accounts.view", "cards.view", "cards.lock", "cards.replace", "manufacturing.manage",
    "subscriptions.view", "support.view", "support.manage",
  ],
  "Read-Only Analyst": [
    "customers.view", "kyc.view", "accounts.view", "transactions.view", "cards.view", "subscriptions.view", "support.view", "alfie.view", "audit.view",
  ],
};

export const PERMISSION_LABELS: Record<Permission, string> = {
  "customers.view": "View customer records",
  "customers.edit": "Edit permitted customer information",
  "customers.lifecycle": "Advance customer lifecycle",
  "kyc.view": "View KYC cases",
  "kyc.decide": "Record compliance decisions",
  "accounts.view": "View banking accounts",
  "accounts.manage": "Banking operational actions",
  "transactions.view": "View transactions",
  "transactions.investigate": "Investigate transactions",
  "cards.view": "View cards",
  "cards.lock": "Lock cards",
  "cards.replace": "Create replacement requests",
  "manufacturing.manage": "Manage manufacturing batches",
  "subscriptions.view": "View subscriptions",
  "subscriptions.manage": "Change plans (demo)",
  "support.view": "View support cases",
  "support.manage": "Manage support cases",
  "alfie.view": "View Alfie operations",
  "alfie.sensitive": "Access sensitive Alfie context",
  "employees.manage": "Manage employees & roles",
  "audit.view": "View audit logs",
  "settings.manage": "Change system settings",
};

export const ALL_PERMISSIONS = ALL;

export function can(role: Role, p: Permission) {
  return ROLE_PERMISSIONS[role].includes(p);
}

export class PermissionError extends Error {}
export class RuleError extends Error {}

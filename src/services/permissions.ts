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
  | "roles.manage"
  | "audit.view"
  | "settings.manage";

const ALL: Permission[] = [
  "customers.view", "customers.edit", "customers.lifecycle", "kyc.view", "kyc.decide", "accounts.view", "accounts.manage",
  "transactions.view", "transactions.investigate", "cards.view", "cards.lock", "cards.replace", "manufacturing.manage",
  "subscriptions.view", "subscriptions.manage", "support.view", "support.manage", "alfie.view", "alfie.sensitive",
  "employees.manage", "roles.manage", "audit.view", "settings.manage",
];

/** Default permission sets for the system roles. Live role definitions come from the employee directory. */
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
  "employees.manage": "Manage employee accounts",
  "roles.manage": "Create and edit roles",
  "audit.view": "View audit logs",
  "settings.manage": "Change system settings",
};

/** Permissions grouped by the area of Renda Admin they unlock. */
export const PERMISSION_GROUPS: { area: string; permissions: Permission[] }[] = [
  { area: "Customers", permissions: ["customers.view", "customers.edit", "customers.lifecycle"] },
  { area: "Onboarding & KYC", permissions: ["kyc.view", "kyc.decide"] },
  { area: "Banking & Accounts", permissions: ["accounts.view", "accounts.manage"] },
  { area: "Transactions & Transfers", permissions: ["transactions.view", "transactions.investigate"] },
  { area: "Cards", permissions: ["cards.view", "cards.lock", "cards.replace", "manufacturing.manage"] },
  { area: "Plans & Subscriptions", permissions: ["subscriptions.view", "subscriptions.manage"] },
  { area: "Customer Support", permissions: ["support.view", "support.manage"] },
  { area: "Alfie", permissions: ["alfie.view", "alfie.sensitive"] },
  { area: "Administration", permissions: ["employees.manage", "roles.manage", "audit.view", "settings.manage"] },
];

export const ALL_PERMISSIONS = ALL;
export const isPermission = (p: string): p is Permission => (ALL as string[]).includes(p);

export const DEPARTMENTS = [
  "Customer Support", "Compliance", "Banking Operations", "Card Operations", "Finance", "Risk", "Technology", "Operations", "Executive",
] as const;

export const LANDING_PAGES: { to: string; label: string }[] = [
  { to: "/", label: "Overview" },
  { to: "/customers", label: "Customers" },
  { to: "/onboarding", label: "Onboarding & KYC" },
  { to: "/accounts", label: "Banking & Accounts" },
  { to: "/transactions", label: "Transactions" },
  { to: "/cards", label: "Cards" },
  { to: "/support", label: "Customer Support" },
  { to: "/employees", label: "Employees" },
];

// Live role → permission map, replaced when the employee directory loads.
let registry: Record<string, Permission[]> = { ...ROLE_PERMISSIONS };

export function setRolePermissions(map: Record<string, Permission[]>) {
  registry = map;
}

export function can(role: string, p: Permission) {
  return registry[role]?.includes(p) ?? false;
}

export class PermissionError extends Error {}
export class RuleError extends Error {}

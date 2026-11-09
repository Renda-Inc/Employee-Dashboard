import type { Customer, DB } from "@/types/models";

const cad = new Intl.NumberFormat("en-CA", { style: "currency", currency: "CAD" });
export const fmtMoney = (n: number | null | undefined) => (n == null ? "—" : cad.format(n));
export const fmtDate = (s: string | null | undefined) =>
  s ? new Date(s).toLocaleDateString("en-CA", { year: "numeric", month: "short", day: "numeric" }) : "—";
export const fmtDateTime = (s: string | null | undefined) =>
  s ? new Date(s).toLocaleString("en-CA", { month: "short", day: "numeric", hour: "2-digit", minute: "2-digit" }) : "—";

export function relTime(s: string) {
  const diff = Date.now() - new Date(s).getTime();
  const m = Math.round(diff / 60000);
  if (m < 1) return "just now";
  if (m < 60) return `${m}m ago`;
  const h = Math.round(m / 60);
  if (h < 24) return `${h}h ago`;
  const d = Math.round(h / 24);
  if (d < 30) return `${d}d ago`;
  return fmtDate(s);
}

export const fullName = (c: Pick<Customer, "firstName" | "lastName">) => `${c.firstName} ${c.lastName}`;

// Employee-facing label for internal P2P transfers, branded as RenPay.
export const txTypeLabel = (t: string) => (t === "P2P Sent" ? "RenPay Sent" : t === "P2P Received" ? "RenPay Received" : t);
export const transferTypeLabel = (t: string) => (t === "P2P" ? "RenPay" : t);
export const initials = (n: string) => n.split(" ").map((p) => p[0]).slice(0, 2).join("").toUpperCase();

export function lookup(db: DB) {
  const customers = new Map(db.customers.map((c) => [c.id, c]));
  const employees = new Map(db.employees.map((e) => [e.id, e]));
  const accounts = new Map(db.accounts.map((a) => [a.id, a]));
  return {
    customer: (id: string | null | undefined) => (id ? customers.get(id) : undefined),
    employee: (id: string | null | undefined) => (id ? employees.get(id) : undefined),
    account: (id: string | null | undefined) => (id ? accounts.get(id) : undefined),
    empName: (id: string | null | undefined) => (id === "customer" ? "Customer" : id ? employees.get(id)?.name ?? id : "—"),
  };
}

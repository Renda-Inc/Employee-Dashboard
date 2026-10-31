import { Link } from "@tanstack/react-router";
import type { ReactNode } from "react";
import { Inbox, FlaskConical } from "lucide-react";
import { toast } from "sonner";
import { cn } from "@/lib/utils";
import { fullName, initials } from "@/lib/format";
import type { Customer } from "@/types/models";
import { useDB } from "@/services/store";
import { can, type Permission } from "@/services/permissions";
import { currentEmployee } from "@/services/actions";

export function PageHeader({ title, subtitle, actions, eyebrow }: { title: string; subtitle?: ReactNode; actions?: ReactNode; eyebrow?: ReactNode }) {
  return (
    <div className="mb-5 flex flex-wrap items-end justify-between gap-3">
      <div className="min-w-0">
        {eyebrow && <div className="mb-1">{eyebrow}</div>}
        <h1 className="text-[19px] font-semibold tracking-tight text-foreground">{title}</h1>
        {subtitle && <p className="mt-0.5 text-[13px] text-muted-foreground">{subtitle}</p>}
      </div>
      {actions && <div className="flex flex-wrap items-center gap-2">{actions}</div>}
    </div>
  );
}

export function Panel({ title, actions, children, className, bodyClass }: { title?: ReactNode; actions?: ReactNode; children: ReactNode; className?: string; bodyClass?: string }) {
  return (
    <section className={cn("panel", className)}>
      {(title || actions) && (
        <header className="flex items-center justify-between gap-2 border-b px-4 py-2.5">
          <h2 className="text-[13px] font-semibold">{title}</h2>
          {actions}
        </header>
      )}
      <div className={cn("p-4", bodyClass)}>{children}</div>
    </section>
  );
}

export function EmptyState({ title, description, icon: Icon = Inbox, action }: { title: string; description?: string; icon?: typeof Inbox; action?: ReactNode }) {
  return (
    <div className="flex flex-col items-center justify-center px-6 py-12 text-center">
      <div className="mb-3 rounded-full bg-muted p-2.5 text-muted-foreground"><Icon className="size-5" /></div>
      <p className="text-sm font-medium">{title}</p>
      {description && <p className="mt-1 max-w-sm text-[12.5px] text-muted-foreground">{description}</p>}
      {action && <div className="mt-4">{action}</div>}
    </div>
  );
}

export function KV({ items, cols = 2 }: { items: [string, ReactNode][]; cols?: 1 | 2 | 3 }) {
  return (
    <dl className={cn("grid gap-x-6 gap-y-3", cols === 1 ? "grid-cols-1" : cols === 2 ? "grid-cols-1 sm:grid-cols-2" : "grid-cols-1 sm:grid-cols-3")}>
      {items.map(([k, v]) => (
        <div key={k} className="min-w-0">
          <dt className="eyebrow">{k}</dt>
          <dd className="mt-0.5 truncate text-[13px]">{v ?? "—"}</dd>
        </div>
      ))}
    </dl>
  );
}

export function Avatar({ name, size = "sm" }: { name: string; size?: "sm" | "md" | "lg" }) {
  const s = size === "lg" ? "size-11 text-sm" : size === "md" ? "size-8 text-xs" : "size-6 text-[10px]";
  return <span className={cn("inline-flex shrink-0 items-center justify-center rounded-full bg-ink font-semibold text-ink-foreground", s)}>{initials(name)}</span>;
}

export function CustomerCell({ customer, sub }: { customer: Customer | undefined; sub?: string }) {
  if (!customer) return <span className="text-muted-foreground">Unknown</span>;
  return (
    <Link to="/customers/$customerId" params={{ customerId: customer.id }} onClick={(e) => e.stopPropagation()} className="group flex min-w-0 items-center gap-2">
      <Avatar name={fullName(customer)} />
      <span className="min-w-0">
        <span className="block truncate font-medium group-hover:underline">{fullName(customer)}</span>
        {sub && <span className="block truncate text-[11.5px] text-muted-foreground">{sub}</span>}
      </span>
    </Link>
  );
}

export function SimulatedNote({ children }: { children?: ReactNode }) {
  return (
    <div className="flex items-start gap-2 rounded-md border border-dashed border-info/40 bg-info-soft px-3 py-2 text-[12px] text-info">
      <FlaskConical className="mt-0.5 size-3.5 shrink-0" />
      <span>{children ?? "Demo mode — this action is simulated. No real banking, card, KYC or payment system is contacted."}</span>
    </div>
  );
}

export function Mono({ children }: { children: ReactNode }) {
  return <span className="font-mono text-[12px]">{children}</span>;
}

export function usePermission(p: Permission) {
  const db = useDB();
  const e = currentEmployee(db);
  return e.status === "Active" && can(e.role, p);
}

export function NoAccess({ what }: { what: string }) {
  const db = useDB();
  return (
    <div className="panel">
      <EmptyState title="Access restricted" description={`Your role (${currentEmployee(db).role}) does not include access to ${what}. Switch demo role from the profile menu to test other permission sets.`} />
    </div>
  );
}

/** Runs an action, shows toast feedback, returns true on success. */
export function run(fn: () => unknown, success: string) {
  try {
    fn();
    toast.success(success);
    return true;
  } catch (e) {
    toast.error(e instanceof Error ? e.message : "Something went wrong.");
    return false;
  }
}

export function Amount({ value, direction }: { value: number; direction?: "debit" | "credit" }) {
  const s = new Intl.NumberFormat("en-CA", { style: "currency", currency: "CAD" }).format(value);
  return <span className={cn("tabular font-medium", direction === "credit" && "text-success")}>{direction === "debit" ? `−${s}` : direction === "credit" ? `+${s}` : s}</span>;
}

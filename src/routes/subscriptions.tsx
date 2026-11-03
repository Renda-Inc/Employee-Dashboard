import { createFileRoute } from "@tanstack/react-router";
import { useState } from "react";
import { useDB } from "@/services/store";
import { simulateBillingOutcome } from "@/services/actions";
import { CustomerCell, Mono, NoAccess, PageHeader, usePermission } from "@/components/common";
import { DataTable, FilterSelect, SearchInput, type Column } from "@/components/tables/DataTable";
import { StatusBadge, PlanBadge } from "@/components/status/StatusBadge";
import { ActionDialog } from "@/components/dialogs/ActionDialog";
import { Sheet, SheetContent, SheetHeader, SheetTitle } from "@/components/ui/sheet";
import { Button } from "@/components/ui/button";
import { fmtDate, fmtMoney, fullName, lookup } from "@/lib/format";
import { PLAN_PRICES } from "@/services/rules";
import { MembershipPanel } from "./customers.$customerId";
import type { Subscription } from "@/types/models";

export const Route = createFileRoute("/subscriptions")({
  head: () => ({ meta: [{ title: "Plans & Subscriptions — Renda Operations" }, { name: "description", content: "Renda Everyday and Renda Plus memberships." }, { property: "og:title", content: "Plans & Subscriptions — Renda Operations" }, { property: "og:description", content: "Renda memberships." }] }),
  component: Subscriptions,
});

function Subscriptions() {
  const db = useDB();
  const L = lookup(db);
  const allowed = usePermission("subscriptions.view");
  const canManage = usePermission("subscriptions.manage");
  const [q, setQ] = useState("");
  const [plan, setPlan] = useState("all");
  const [status, setStatus] = useState("all");
  const [open, setOpen] = useState<string | null>(null);
  if (!allowed) return <NoAccess what="subscriptions" />;
  const rows = db.subscriptions.filter((s) => {
    const c = L.customer(s.customerId);
    if (q && !`${c ? fullName(c) : ""} ${c?.userId}`.toLowerCase().includes(q.toLowerCase())) return false;
    if (plan !== "all" && s.plan !== plan) return false;
    if (status !== "all" && s.subscriptionStatus !== status) return false;
    return true;
  });
  const plus = db.subscriptions.filter((s) => s.plan === "Plus" && s.subscriptionStatus !== "Canceled");
  const cols: Column<Subscription>[] = [
    { key: "c", header: "Customer", cell: (s) => <CustomerCell customer={L.customer(s.customerId)} /> },
    { key: "u", header: "User ID", cell: (s) => <Mono>{L.customer(s.customerId)?.userId}</Mono> },
    { key: "p", header: "Plan", cell: (s) => <PlanBadge plan={s.plan} />, sort: (s) => s.plan },
    { key: "s", header: "Status", cell: (s) => <StatusBadge status={s.subscriptionStatus} />, sort: (s) => s.subscriptionStatus },
    { key: "f", header: "Monthly fee", className: "text-right", cell: (s) => <span className="tabular">{fmtMoney(s.monthlyPrice)}</span> },
    { key: "st", header: "Start date", cell: (s) => fmtDate(s.startDate), sort: (s) => s.startDate },
    { key: "n", header: "Next billing", cell: (s) => fmtDate(s.nextBillingDate) },
    { key: "b", header: "Latest billing", cell: (s) => <StatusBadge status={s.latestBillingStatus} /> },
    { key: "r", header: "Setup", cell: (s) => s.cardSelectionRequired ? <StatusBadge status="Card selection pending" tone="warning" /> : <span className="text-muted-foreground">—</span> },
    {
      key: "a", header: "", className: "text-right", cell: (s) => canManage && s.latestBillingStatus === "Pending" ? (
        <span onClick={(e) => e.stopPropagation()} className="inline-flex gap-1">
          <ActionDialog trigger={<Button size="sm" variant="ghost">Billing failed</Button>} title="Record simulated billing failure" simulated="Demo billing outcome — no payment processor is contacted." onConfirm={() => simulateBillingOutcome(s.customerId, false)} success="Billing failure recorded (simulated)" />
          <ActionDialog trigger={<Button size="sm" variant="outline">Billing succeeded</Button>} title="Record simulated billing success" simulated="Demo billing outcome — no payment is collected." onConfirm={() => simulateBillingOutcome(s.customerId, true)} success="Billing success recorded (simulated)" />
        </span>
      ) : null,
    },
  ];
  return (
    <>
      <PageHeader title="Plans & Subscriptions" subtitle="Membership records for Renda Everyday and Renda Plus. Prices in CAD." />
      <div className="mb-5 grid gap-3 md:grid-cols-4">
        <div className="panel px-4 py-3"><div className="text-[12px] text-muted-foreground">Renda Everyday</div><div className="text-[18px] font-semibold">{fmtMoney(PLAN_PRICES.Everyday)}<span className="text-[12px] font-normal text-muted-foreground">/mo · virtual card</span></div></div>
        <div className="panel px-4 py-3"><div className="text-[12px] text-muted-foreground">Renda Plus</div><div className="text-[18px] font-semibold">{fmtMoney(PLAN_PRICES.Plus)}<span className="text-[12px] font-normal text-muted-foreground">/mo · physical card</span></div></div>
        <div className="panel px-4 py-3"><div className="text-[12px] text-muted-foreground">Plus members</div><div className="text-[18px] font-semibold tabular">{plus.length}</div></div>
        <div className="panel px-4 py-3"><div className="text-[12px] text-muted-foreground">Billing pending / issues</div><div className="text-[18px] font-semibold tabular">{db.subscriptions.filter((s) => s.latestBillingStatus === "Pending").length} / {db.subscriptions.filter((s) => s.subscriptionStatus === "Billing Issue").length}</div></div>
      </div>
      <DataTable rows={rows} columns={cols} rowKey={(s) => s.id} onRowClick={(s) => setOpen(s.customerId)} toolbar={
        <>
          <SearchInput value={q} onChange={setQ} placeholder="Search customer or user ID" />
          <FilterSelect label="Plan" value={plan} onChange={setPlan} options={["Everyday", "Plus"]} />
          <FilterSelect label="Status" value={status} onChange={setStatus} options={["Active", "Pending", "Canceled", "Billing Issue"]} />
        </>
      } />
      <Sheet open={!!open} onOpenChange={(o) => !o && setOpen(null)}>
        <SheetContent className="w-full overflow-y-auto sm:max-w-3xl">
          <SheetHeader><SheetTitle>{open && L.customer(open) ? `${fullName(L.customer(open)!)} — membership` : "Membership"}</SheetTitle></SheetHeader>
          <div className="px-4 pb-6">{open && <MembershipPanel customerId={open} />}</div>
        </SheetContent>
      </Sheet>
    </>
  );
}

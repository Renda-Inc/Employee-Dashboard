import { createFileRoute } from "@tanstack/react-router";
import { useState } from "react";
import { useDB } from "@/services/store";
import { operations } from "@/services/api";
import { CustomerCell, Mono, NoAccess, PageHeader, usePermission } from "@/components/common";
import { DataTable, FilterSelect, SearchInput, type Column } from "@/components/tables/DataTable";
import { StatusBadge, PlanBadge } from "@/components/status/StatusBadge";
import { ActionDialog } from "@/components/dialogs/ActionDialog";
import { Sheet, SheetContent, SheetHeader, SheetTitle } from "@/components/ui/sheet";
import { Button } from "@/components/ui/button";
import { fmtDate, fmtMoney, fullName, lookup } from "@/lib/format";
import { billingDowngradeDue, PLAN_PRICES } from "@/services/rules";
import { MembershipPanel } from "./customers.$customerId";
import type { Subscription } from "@/types/models";

export const Route = createFileRoute("/_authenticated/subscriptions")({
  head: () => ({
    meta: [
      { property: "og:type", content: "website" },
      { name: "twitter:card", content: "summary" },
      { title: "Plans & Subscriptions | Renda Admin" },
      { name: "description", content: "Renda Everyday and Renda Plus memberships." },
      { property: "og:title", content: "Plans & Subscriptions | Renda Admin" },
      { property: "og:description", content: "Renda memberships." },
    ],
  }),
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
    if (q && !`${c ? fullName(c) : ""} ${c?.userId}`.toLowerCase().includes(q.toLowerCase()))
      return false;
    if (plan !== "all" && s.plan !== plan) return false;
    if (status !== "all" && s.subscriptionStatus !== status) return false;
    return true;
  });
  const plus = db.subscriptions.filter(
    (s) => s.plan === "Plus" && s.subscriptionStatus !== "Canceled",
  );
  const cols: Column<Subscription>[] = [
    {
      key: "c",
      header: "Customer",
      cell: (s) => <CustomerCell customer={L.customer(s.customerId)} />,
    },
    { key: "u", header: "User ID", cell: (s) => <Mono>{L.customer(s.customerId)?.userId}</Mono> },
    { key: "p", header: "Plan", cell: (s) => <PlanBadge plan={s.plan} />, sort: (s) => s.plan },
    {
      key: "s",
      header: "Status",
      cell: (s) => <StatusBadge status={s.subscriptionStatus} />,
      sort: (s) => s.subscriptionStatus,
    },
    {
      key: "f",
      header: "Monthly fee",
      className: "text-right",
      cell: (s) => <span className="tabular">{fmtMoney(s.monthlyPrice)}</span>,
    },
    {
      key: "st",
      header: "Start date",
      cell: (s) => fmtDate(s.startDate),
      sort: (s) => s.startDate,
    },
    { key: "n", header: "Next billing", cell: (s) => fmtDate(s.nextBillingDate) },
    {
      key: "b",
      header: "Latest billing",
      cell: (s) => (
        <span className="inline-flex flex-col items-start gap-0.5">
          <StatusBadge status={s.latestBillingStatus} />
          {s.billingOutstandingSince && (
            <span className="text-[12px] text-muted-foreground">
              Attempt {s.billingRetryCount} · unpaid since {fmtDate(s.billingOutstandingSince)} ·{" "}
              {billingDowngradeDue(s)
                ? "downgrade due"
                : `downgrades ${fmtDate(s.nextBillingDate)} if unpaid`}
            </span>
          )}
        </span>
      ),
    },
    {
      key: "r",
      header: "Setup",
      cell: (s) =>
        s.cardSelectionRequired ? (
          <StatusBadge status="Card selection pending" tone="warning" />
        ) : (
          <span className="text-muted-foreground">-</span>
        ),
    },
    {
      key: "a",
      header: "",
      className: "text-right",
      cell: (s) => {
        if (!canManage || s.plan !== "Plus" || s.subscriptionStatus !== "Active") return null;
        if (billingDowngradeDue(s))
          return (
            <span onClick={(e) => e.stopPropagation()} className="inline-flex gap-1">
              <ActionDialog
                trigger={
                  <Button size="sm" variant="destructive">
                    Downgrade for non-payment
                  </Button>
                }
                title="Downgrade to Everyday for non-payment"
                description={`The Plus fee has been unpaid since ${fmtDate(s.billingOutstandingSince)} and the new billing date has arrived, closing the retry window. The plan downgrades to Everyday, and any physical cards and open card orders are canceled because Everyday is virtual-only.`}
                onConfirm={() => operations.downgradeForNonPayment(s.customerId)}
                success="Plan downgraded to Everyday for non-payment"
                confirmLabel="Downgrade plan"
                destructive
              />
            </span>
          );
        return (
          <span onClick={(e) => e.stopPropagation()} className="inline-flex gap-1">
            <ActionDialog
              trigger={
                <Button size="sm" variant="ghost">
                  Renewal failed
                </Button>
              }
              title="Record failed renewal charge"
              description={
                s.billingOutstandingSince
                  ? "Records another failed retry. The plan stays on Plus and the fee stays outstanding until it is collected or the new billing date arrives."
                  : "Records a failed renewal charge. The plan stays on Plus, the fee becomes outstanding, and retries run until the new billing date, when the plan downgrades to Everyday if it is still unpaid."
              }
              simulated="Demo billing outcome. No payment processor is contacted."
              onConfirm={() => operations.recordRenewalAttempt(s.customerId, false)}
              success="Failed renewal attempt recorded"
            />
            <ActionDialog
              trigger={
                <Button size="sm" variant="outline">
                  Renewal paid
                </Button>
              }
              title="Record paid renewal charge"
              description="Collects the Plus fee from the customer's Smart Spend account and clears any outstanding fee. Fails if Smart Spend cannot cover the fee."
              simulated="Demo billing outcome. The fee is posted against the demo ledger only."
              onConfirm={() => operations.recordRenewalAttempt(s.customerId, true)}
              success="Plus fee collected from Smart Spend"
            />
          </span>
        );
      },
    },
  ];
  return (
    <>
      <PageHeader
        title="Plans & Subscriptions"
        subtitle="Membership records for Renda Everyday and Renda Plus. Prices in CAD."
      />
      <div className="mb-5 grid gap-3 md:grid-cols-4">
        <div className="panel px-4 py-3">
          <div className="text-[13px] text-muted-foreground">Renda Everyday</div>
          <div className="text-[18px] font-semibold">
            {fmtMoney(PLAN_PRICES.Everyday)}
            <span className="text-[13px] font-normal text-muted-foreground">
              /mo · virtual card
            </span>
          </div>
        </div>
        <div className="panel px-4 py-3">
          <div className="text-[13px] text-muted-foreground">Renda Plus</div>
          <div className="text-[18px] font-semibold">
            {fmtMoney(PLAN_PRICES.Plus)}
            <span className="text-[13px] font-normal text-muted-foreground">
              /mo · physical card
            </span>
          </div>
        </div>
        <div className="panel px-4 py-3">
          <div className="text-[13px] text-muted-foreground">Plus members</div>
          <div className="text-[18px] font-semibold tabular">{plus.length}</div>
        </div>
        <div className="panel px-4 py-3">
          <div className="text-[13px] text-muted-foreground">Plus fees in retry window</div>
          <div className="text-[18px] font-semibold tabular">
            {db.subscriptions.filter((s) => s.billingOutstandingSince).length}
            <span className="text-[13px] font-normal text-muted-foreground">
              {" "}
              · {db.subscriptions.filter((s) => billingDowngradeDue(s)).length} at downgrade date
            </span>
          </div>
        </div>
      </div>
      <DataTable
        rows={rows}
        columns={cols}
        rowKey={(s) => s.id}
        onRowClick={(s) => setOpen(s.customerId)}
        toolbar={
          <>
            <SearchInput value={q} onChange={setQ} placeholder="Search customer or user ID" />
            <FilterSelect
              label="Plan"
              value={plan}
              onChange={setPlan}
              options={["Everyday", "Plus"]}
            />
            <FilterSelect
              label="Status"
              value={status}
              onChange={setStatus}
              options={["Active", "Pending", "Canceled"]}
            />
          </>
        }
      />
      <Sheet open={!!open} onOpenChange={(o) => !o && setOpen(null)}>
        <SheetContent className="w-full overflow-y-auto sm:max-w-3xl">
          <SheetHeader>
            <SheetTitle>
              {open && L.customer(open)
                ? `${fullName(L.customer(open)!)}: membership`
                : "Membership"}
            </SheetTitle>
          </SheetHeader>
          <div className="px-4 pb-6">{open && <MembershipPanel customerId={open} />}</div>
        </SheetContent>
      </Sheet>
    </>
  );
}

import { createFileRoute, Link } from "@tanstack/react-router";
import { useState } from "react";
import { useDB } from "@/services/store";
import { CustomerCell, KV, Mono, NoAccess, PageHeader, usePermission } from "@/components/common";
import { DataTable, FilterSelect, SearchInput, type Column } from "@/components/tables/DataTable";
import { StatusBadge } from "@/components/status/StatusBadge";
import { Sheet, SheetContent, SheetHeader, SheetTitle } from "@/components/ui/sheet";
import { Progress } from "@/components/ui/progress";
import { fmtDate, fmtMoney, fullName, lookup } from "@/lib/format";
import type { SavingsGoal } from "@/types/models";

export const Route = createFileRoute("/_authenticated/savings")({
  head: () => ({
    meta: [
      { property: "og:type", content: "website" },
      { name: "twitter:card", content: "summary" },
      { title: "Savings Goals | Renda Admin" },
      { name: "description", content: "Customer savings goals created with Alfie." },
      { property: "og:title", content: "Savings Goals | Renda Admin" },
      { property: "og:description", content: "Customer savings goals." },
    ],
  }),
  component: Savings,
});

function Savings() {
  const db = useDB();
  const L = lookup(db);
  const allowed = usePermission("customers.view");
  const [q, setQ] = useState("");
  const [status, setStatus] = useState("all");
  const [open, setOpen] = useState<SavingsGoal | null>(null);
  if (!allowed) return <NoAccess what="savings goals" />;
  const rows = db.goals.filter((g) => {
    const c = L.customer(g.customerId);
    return (
      (status === "all" || g.status === status) &&
      (!q ||
        `${c ? fullName(c) : ""} ${c?.userId} ${g.goalName}`
          .toLowerCase()
          .includes(q.toLowerCase()))
    );
  });
  const pct = (g: SavingsGoal) =>
    g.currentAmount == null ? null : Math.min(100, (g.currentAmount / g.targetAmount) * 100);
  const cols: Column<SavingsGoal>[] = [
    {
      key: "c",
      header: "Customer",
      cell: (g) => <CustomerCell customer={L.customer(g.customerId)} />,
    },
    { key: "u", header: "User ID", cell: (g) => <Mono>{L.customer(g.customerId)?.userId}</Mono> },
    {
      key: "n",
      header: "Goal",
      cell: (g) => <span className="font-medium">{g.goalName}</span>,
      sort: (g) => g.goalName,
    },
    {
      key: "t",
      header: "Target",
      className: "text-right",
      cell: (g) => <span className="tabular">{fmtMoney(g.targetAmount)}</span>,
      sort: (g) => g.targetAmount,
    },
    {
      key: "p",
      header: "Progress",
      cell: (g) =>
        pct(g) == null ? (
          <span className="text-muted-foreground">Unavailable</span>
        ) : (
          <span className="flex items-center gap-2">
            <Progress value={pct(g)!} className="h-1.5 w-24" />
            <span className="tabular text-[13px] text-muted-foreground">
              {Math.round(pct(g)!)}%
            </span>
          </span>
        ),
      sort: (g) => pct(g) ?? -1,
    },
    { key: "a", header: "Account", cell: (g) => L.account(g.accountId)?.accountType ?? "-" },
    { key: "d", header: "Created", cell: (g) => fmtDate(g.createdAt), sort: (g) => g.createdAt },
    {
      key: "s",
      header: "Status",
      cell: (g) => <StatusBadge status={g.status} />,
      sort: (g) => g.status,
    },
  ];
  return (
    <>
      <PageHeader
        title="Savings Goals"
        subtitle="Goals customers set up with Alfie. Read-only. Goals do not move funds or change balances."
      />
      <DataTable
        rows={rows}
        columns={cols}
        rowKey={(g) => g.id}
        onRowClick={setOpen}
        toolbar={
          <>
            <SearchInput value={q} onChange={setQ} placeholder="Customer, user ID or goal" />
            <FilterSelect
              label="Status"
              value={status}
              onChange={setStatus}
              options={["Active", "Completed", "Paused", "Closed"]}
            />
          </>
        }
      />
      <Sheet open={!!open} onOpenChange={(o) => !o && setOpen(null)}>
        <SheetContent className="sm:max-w-md">
          {open && (
            <>
              <SheetHeader>
                <SheetTitle>{open.goalName}</SheetTitle>
              </SheetHeader>
              <div className="space-y-6 px-4">
                <div>
                  <div className="mb-1 flex justify-between text-[14px]">
                    <span>{fmtMoney(open.currentAmount)}</span>
                    <span className="text-muted-foreground">of {fmtMoney(open.targetAmount)}</span>
                  </div>
                  <Progress value={pct(open) ?? 0} className="h-2" />
                </div>
                <KV
                  items={[
                    ["Status", <StatusBadge status={open.status} />],
                    ["Created", fmtDate(open.createdAt)],
                    ["Target date", fmtDate(open.targetDate)],
                    [
                      "Associated account",
                      L.account(open.accountId) ? (
                        <Link
                          to="/accounts/$accountId"
                          params={{ accountId: open.accountId }}
                          className="text-primary"
                        >
                          {L.account(open.accountId)!.accountType}
                        </Link>
                      ) : (
                        "-"
                      ),
                    ],
                    ["Currency", open.currency],
                    [
                      "Customer",
                      <Link
                        to="/customers/$customerId"
                        params={{ customerId: open.customerId }}
                        className="text-primary"
                      >
                        {fullName(L.customer(open.customerId)!)}
                      </Link>,
                    ],
                  ]}
                />
                <p className="text-[13px] text-muted-foreground">
                  Goal records are managed by the customer through Alfie. Employees cannot edit
                  goals or move funds.
                </p>
              </div>
            </>
          )}
        </SheetContent>
      </Sheet>
    </>
  );
}

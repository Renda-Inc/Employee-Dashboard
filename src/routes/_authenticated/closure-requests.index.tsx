import { createFileRoute, useNavigate } from "@tanstack/react-router";
import { useMemo, useState } from "react";
import { useDB } from "@/services/store";
import { Avatar, NoAccess, PageHeader, usePermission } from "@/components/common";
import { Button } from "@/components/ui/button";
import { DataTable, FilterSelect, SearchInput, type Column } from "@/components/tables/DataTable";
import { StatusBadge } from "@/components/status/StatusBadge";
import { fmtDate, fmtMoney, fullName, lookup } from "@/lib/format";
import type { Customer } from "@/types/models";

export const Route = createFileRoute("/_authenticated/closure-requests/")({
  head: () => ({
    meta: [
      { property: "og:type", content: "website" },
      { name: "twitter:card", content: "summary" },
      { title: "Closure Requests | Renda Admin" },
      {
        name: "description",
        content:
          "Customers who asked to close their account from the app, waiting to be processed.",
      },
      { property: "og:title", content: "Closure Requests | Renda Admin" },
      { property: "og:description", content: "App closure requests and their processing." },
    ],
  }),
  component: ClosureRequests,
});

const STATUS_ORDER = { Pending: 0, "In Progress": 1, Processed: 2, Cancelled: 3 } as const;

function ClosureRequests() {
  const db = useDB();
  const navigate = useNavigate();
  const allowed = usePermission("customers.view");
  const [q, setQ] = useState("");
  const [status, setStatus] = useState("all");
  const L = lookup(db);

  const all = useMemo(
    () =>
      db.customers
        .filter((c) => c.closureRequest)
        .sort((a, b) => {
          const ra = a.closureRequest!;
          const rb = b.closureRequest!;
          const byStatus = STATUS_ORDER[ra.status] - STATUS_ORDER[rb.status];
          if (byStatus !== 0) return byStatus;
          // Open requests: oldest first, it is a work queue. Resolved: newest first.
          return ra.status === "Pending" || ra.status === "In Progress"
            ? ra.requestedAt.localeCompare(rb.requestedAt)
            : (rb.resolvedAt ?? "").localeCompare(ra.resolvedAt ?? "");
        }),
    [db],
  );
  const counts = useMemo(() => {
    const m = { Pending: 0, "In Progress": 0, Processed: 0, Cancelled: 0 };
    for (const c of all) m[c.closureRequest!.status] += 1;
    return m;
  }, [all]);
  const rows = useMemo(() => {
    const t = q.trim().toLowerCase();
    return all.filter((c) => {
      if (status !== "all" && c.closureRequest!.status !== status) return false;
      if (t && ![fullName(c), c.userId, c.email].some((v) => v.toLowerCase().includes(t)))
        return false;
      return true;
    });
  }, [all, q, status]);

  if (!allowed) return <NoAccess what="closure requests" />;

  const cols: Column<Customer>[] = [
    {
      key: "name",
      header: "Customer",
      // Plain text, no profile link: selecting anywhere on the row opens
      // the closure request itself. The profile is one explicit click
      // away in the last column instead.
      cell: (c) => (
        <span className="flex min-w-0 items-center gap-2">
          <Avatar name={fullName(c)} />
          <span className="min-w-0">
            <span className="block truncate font-medium">{fullName(c)}</span>
            <span className="block truncate text-[12px] text-muted-foreground">
              {c.customerStatus}
            </span>
          </span>
        </span>
      ),
      sort: (c) => fullName(c),
    },
    {
      key: "requested",
      header: "Requested",
      cell: (c) => fmtDate(c.closureRequest!.requestedAt),
      sort: (c) => c.closureRequest!.requestedAt,
    },
    {
      key: "reason",
      header: "Reason for leaving",
      cell: (c) => c.closureRequest!.reason,
    },
    {
      key: "feedback",
      header: "Feedback",
      cell: (c) => (
        <span className="text-muted-foreground">
          {c.closureRequest!.feedback
            ? c.closureRequest!.feedback.length > 60
              ? `${c.closureRequest!.feedback.slice(0, 60)}…`
              : c.closureRequest!.feedback
            : "None given"}
        </span>
      ),
    },
    {
      key: "total",
      header: "Balance to pay out",
      cell: (c) =>
        c.closureRequest!.balances.total > 0 ? fmtMoney(c.closureRequest!.balances.total) : "None",
      sort: (c) => c.closureRequest!.balances.total,
    },
    {
      key: "email",
      header: "Payout email",
      cell: (c) => <span className="text-muted-foreground">{c.closureRequest!.payoutEmail}</span>,
    },
    {
      key: "status",
      header: "Status",
      cell: (c) => <StatusBadge status={c.closureRequest!.status} />,
    },
    {
      key: "assignee",
      header: "Assigned to",
      cell: (c) =>
        c.closureRequest!.assignedTo ? (
          L.empName(c.closureRequest!.assignedTo)
        ) : (
          <span className="text-muted-foreground">Unassigned</span>
        ),
    },
    {
      key: "profile",
      header: "",
      cell: (c) => (
        <Button
          variant="outline"
          size="sm"
          onClick={(e) => {
            e.stopPropagation();
            navigate({ to: "/customers/$customerId", params: { customerId: c.id } });
          }}
        >
          Open full profile
        </Button>
      ),
    },
  ];

  return (
    <>
      <PageHeader
        title="Closure Requests"
        subtitle="Customers who asked to close their account from the app. Select a request to review it, assign it and process it in steps. Open full profile takes you to the customer record instead."
      />
      <div className="mb-4 flex flex-wrap gap-2 text-[13px]">
        <span className="rounded-full bg-warning-soft px-3 py-1 font-medium text-warning">
          {counts.Pending} pending
        </span>
        <span className="rounded-full bg-warning-soft px-3 py-1 font-medium text-warning">
          {counts["In Progress"]} in progress
        </span>
        <span className="rounded-full bg-success-soft px-3 py-1 font-medium text-success">
          {counts.Processed} processed
        </span>
        <span className="rounded-full bg-neutral-soft px-3 py-1 font-medium text-neutral">
          {counts.Cancelled} cancelled
        </span>
      </div>
      <DataTable
        rows={rows}
        columns={cols}
        rowKey={(c) => c.id}
        onRowClick={(c) =>
          navigate({ to: "/closure-requests/$customerId", params: { customerId: c.id } })
        }
        emptyTitle="No closure requests"
        emptyDescription="When a customer asks to close their account from the app, their request appears here."
        toolbar={
          <>
            <SearchInput value={q} onChange={setQ} placeholder="Search name, user ID, email" />
            <FilterSelect
              label="Status"
              value={status}
              onChange={setStatus}
              options={["Pending", "In Progress", "Processed", "Cancelled"]}
            />
          </>
        }
      />
    </>
  );
}

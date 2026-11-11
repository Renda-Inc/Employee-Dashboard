import { createFileRoute, useNavigate } from "@tanstack/react-router";
import { useState } from "react";
import { useDB } from "@/services/store";
import { CustomerCell, Mono, NoAccess, PageHeader, usePermission } from "@/components/common";
import { DataTable, SearchInput, TabBar, type Column } from "@/components/tables/DataTable";
import { StatusBadge } from "@/components/status/StatusBadge";
import { fmtDate, fmtDateTime, fmtMoney, fullName, lookup } from "@/lib/format";
import type { Account } from "@/types/models";

export const Route = createFileRoute("/_authenticated/accounts/")({
  head: () => ({
    meta: [
      { property: "og:type", content: "website" },
      { name: "twitter:card", content: "summary" },
      { title: "Banking & Accounts | Renda Admin" },
      { name: "description", content: "Smart Spend and Sense Save account records." },
      { property: "og:title", content: "Banking & Accounts | Renda Admin" },
      { property: "og:description", content: "Smart Spend and Sense Save account records." },
    ],
  }),
  component: Accounts,
});

const TABS = [
  "All Accounts",
  "Smart Spend",
  "Sense Save",
  "Pending Issuance",
  "Restricted",
  "Closed",
] as const;
type Tab = (typeof TABS)[number];
const match = (t: Tab, a: Account) =>
  t === "All Accounts"
    ? true
    : t === "Smart Spend" || t === "Sense Save"
      ? a.accountType === t
      : t === "Pending Issuance"
        ? a.accountStatus === "Pending Issuance" || a.accountStatus === "Issuance Failed"
        : a.accountStatus === t;

function Accounts() {
  const db = useDB();
  const L = lookup(db);
  const navigate = useNavigate();
  const allowed = usePermission("accounts.view");
  const [tab, setTab] = useState<Tab>("All Accounts");
  const [q, setQ] = useState("");
  if (!allowed) return <NoAccess what="banking accounts" />;
  const rows = db.accounts.filter((a) => {
    if (!match(tab, a)) return false;
    const c = L.customer(a.customerId);
    return (
      !q ||
      `${c ? fullName(c) : ""} ${c?.userId} ${a.maskedAccountIdentifier}`
        .toLowerCase()
        .includes(q.toLowerCase())
    );
  });
  const counts = Object.fromEntries(
    TABS.map((t) => [t, db.accounts.filter((a) => match(t, a)).length]),
  ) as Record<Tab, number>;
  const cols: Column<Account>[] = [
    {
      key: "c",
      header: "Customer",
      cell: (a) => <CustomerCell customer={L.customer(a.customerId)} />,
      sort: (a) => L.customer(a.customerId)?.lastName ?? "",
    },
    { key: "u", header: "User ID", cell: (a) => <Mono>{L.customer(a.customerId)?.userId}</Mono> },
    { key: "t", header: "Account type", cell: (a) => a.accountType, sort: (a) => a.accountType },
    { key: "m", header: "Account", cell: (a) => <Mono>{a.maskedAccountIdentifier ?? "-"}</Mono> },
    {
      key: "s",
      header: "Status",
      cell: (a) => <StatusBadge status={a.accountStatus} />,
      sort: (a) => a.accountStatus,
    },
    {
      key: "b",
      header: "Available",
      className: "text-right",
      cell: (a) => <span className="tabular">{fmtMoney(a.availableBalance)}</span>,
      sort: (a) => a.availableBalance ?? -1,
    },
    {
      key: "o",
      header: "Opened",
      cell: (a) => fmtDate(a.openingDate),
      sort: (a) => a.openingDate ?? "",
    },
    {
      key: "l",
      header: "Last activity",
      cell: (a) => <span className="text-muted-foreground">{fmtDateTime(a.lastActivity)}</span>,
      sort: (a) => a.lastActivity ?? "",
    },
    {
      key: "x",
      header: "",
      className: "text-right",
      cell: () => <span className="text-[13px] font-medium text-primary">View →</span>,
    },
  ];
  return (
    <>
      <PageHeader
        title="Banking & Accounts"
        subtitle="Smart Spend and Sense Save accounts across all customers."
      />
      <TabBar tabs={TABS} value={tab} onChange={setTab} counts={counts} />
      <DataTable
        rows={rows}
        columns={cols}
        rowKey={(a) => a.id}
        onRowClick={(a) => navigate({ to: "/accounts/$accountId", params: { accountId: a.id } })}
        toolbar={
          <SearchInput value={q} onChange={setQ} placeholder="Search customer, user ID, account" />
        }
      />
    </>
  );
}

import { createFileRoute, useNavigate } from "@tanstack/react-router";
import { useState } from "react";
import { useDB } from "@/services/store";
import { Amount, CustomerCell, Mono, NoAccess, PageHeader, usePermission } from "@/components/common";
import { DataTable, FilterSelect, TabBar, type Column } from "@/components/tables/DataTable";
import { StatusBadge } from "@/components/status/StatusBadge";
import { fmtDateTime, lookup } from "@/lib/format";
import type { Transfer } from "@/types/models";

export const Route = createFileRoute("/transfers")({
  head: () => ({ meta: [{ property: "og:type", content: "website" }, { name: "twitter:card", content: "summary" }, { title: "Payments & Transfers — Renda Admin" }, { name: "description", content: "RenPay, Interac and account-to-account transfers." }, { property: "og:title", content: "Payments & Transfers — Renda Admin" }, { property: "og:description", content: "RenPay, Interac and account-to-account transfers." }] }),
  component: Transfers,
});

const TABS = ["All Transfers", "RenPay", "Interac", "Account-to-Account"] as const;
type Tab = (typeof TABS)[number];
const TYPE: Record<Tab, Transfer["transferType"] | null> = { "All Transfers": null, RenPay: "P2P", Interac: "Interac", "Account-to-Account": "Account-to-Account" };

function Transfers() {
  const db = useDB();
  const L = lookup(db);
  const navigate = useNavigate();
  const allowed = usePermission("transactions.view");
  const [tab, setTab] = useState<Tab>("All Transfers");
  const [status, setStatus] = useState("all");
  if (!allowed) return <NoAccess what="transfers" />;
  const rows = db.transfers.filter((t) => (!TYPE[tab] || t.transferType === TYPE[tab]) && (status === "all" || t.status === status));
  const counts = Object.fromEntries(TABS.map((t) => [t, db.transfers.filter((x) => !TYPE[t] || x.transferType === TYPE[t]).length])) as Record<Tab, number>;
  const open = (t: Transfer) => {
    const tx = db.transactions.find((x) => x.transferId === t.id && x.transactionReference === t.transactionReference);
    if (tx) navigate({ to: "/transactions/$transactionId", params: { transactionId: tx.id } });
  };
  const base: Column<Transfer>[] = [
    { key: "ref", header: "Reference", cell: (t) => <Mono>{t.transactionReference}</Mono> },
    { key: "amt", header: "Amount", className: "text-right", cell: (t) => <Amount value={t.amount} />, sort: (t) => t.amount },
    { key: "ts", header: "Timestamp", cell: (t) => <span className="text-muted-foreground">{fmtDateTime(t.createdAt)}</span>, sort: (t) => t.createdAt },
    { key: "st", header: "Status", cell: (t) => <StatusBadge status={t.status} />, sort: (t) => t.status },
  ];
  let cols: Column<Transfer>[];
  if (tab === "RenPay") cols = [
    { key: "s", header: "Sender", cell: (t) => <CustomerCell customer={L.customer(t.senderCustomerId)} sub={L.customer(t.senderCustomerId)?.userId} /> },
    { key: "r", header: "Recipient", cell: (t) => <CustomerCell customer={L.customer(t.recipientCustomerId)} sub={L.customer(t.recipientCustomerId)?.userId} /> },
    ...base,
  ];
  else if (tab === "Interac") cols = [
    { key: "c", header: "Customer", cell: (t) => <CustomerCell customer={L.customer(t.senderCustomerId)} /> },
    { key: "d", header: "Direction", cell: (t) => t.direction },
    { key: "cp", header: "Counterparty", cell: (t) => <span className="text-muted-foreground">{t.counterpartyLabel}</span> },
    ...base,
    { key: "p", header: "Provider ref", cell: (t) => <Mono>{t.providerReference}</Mono> },
  ];
  else if (tab === "Account-to-Account") cols = [
    { key: "c", header: "Customer", cell: (t) => <CustomerCell customer={L.customer(t.senderCustomerId)} /> },
    { key: "src", header: "Source", cell: (t) => L.account(t.sourceAccountId)?.accountType },
    { key: "dst", header: "Destination", cell: (t) => L.account(t.destinationAccountId)?.accountType },
    ...base,
  ];
  else cols = [
    { key: "type", header: "Type", cell: (t) => t.transferType, sort: (t) => t.transferType },
    { key: "c", header: "Customer", cell: (t) => <CustomerCell customer={L.customer(t.senderCustomerId)} /> },
    { key: "to", header: "To", cell: (t) => t.transferType === "P2P" ? <CustomerCell customer={L.customer(t.recipientCustomerId)} /> : t.transferType === "Interac" ? <span className="text-muted-foreground">{t.direction} · {t.counterpartyLabel}</span> : <span className="text-muted-foreground">{L.account(t.destinationAccountId)?.accountType}</span> },
    ...base,
  ];
  return (
    <>
      <PageHeader title="Payments & Transfers" subtitle="View transfer records. Employees cannot initiate transfers from this dashboard." />
      <TabBar tabs={TABS} value={tab} onChange={(t) => setTab(t)} counts={counts} />
      <DataTable key={tab} rows={rows} columns={cols} rowKey={(t) => t.id} defaultSort={{ key: "ts", dir: "desc" }} onRowClick={open} toolbar={<FilterSelect label="Status" value={status} onChange={setStatus} options={["Pending", "Completed", "Failed", "Reversed"]} />} />
      {tab === "Interac" && <p className="mt-3 text-[13px] text-muted-foreground">Interac fields are limited to what the integration provides. Recipient contact details are not displayed.</p>}
    </>
  );
}

import { useNavigate } from "@tanstack/react-router";
import { useDB } from "@/services/store";
import { DataTable, type Column } from "@/components/tables/DataTable";
import { Amount, CustomerCell, Mono } from "@/components/common";
import { StatusBadge } from "@/components/status/StatusBadge";
import { fmtDate, fmtDateTime, lookup, txTypeLabel } from "@/lib/format";
import type { Card, SupportCase, Transaction } from "@/types/models";

export function TransactionTable({ rows, showCustomer = true, pageSize = 10, toolbar }: { rows: Transaction[]; showCustomer?: boolean; pageSize?: number; toolbar?: React.ReactNode }) {
  const db = useDB();
  const navigate = useNavigate();
  const L = lookup(db);
  const cols: Column<Transaction>[] = [
    { key: "ref", header: "Reference", cell: (t) => <Mono>{t.transactionReference}</Mono>, sort: (t) => t.transactionReference },
    ...(showCustomer ? [{ key: "cust", header: "Customer", cell: (t: Transaction) => <CustomerCell customer={L.customer(t.customerId)} /> }] : []),
    { key: "type", header: "Type", cell: (t) => txTypeLabel(t.transactionType), sort: (t) => t.transactionType },
    { key: "desc", header: "Description", cell: (t) => <span className="block max-w-[220px] truncate">{t.description}</span> },
    { key: "amt", header: "Amount", className: "text-right", cell: (t) => <Amount value={t.amount} direction={t.direction} />, sort: (t) => (t.direction === "debit" ? -t.amount : t.amount) },
    { key: "cur", header: "Currency", cell: (t) => <span className="text-muted-foreground">{t.currency}</span> },
    { key: "st", header: "Status", cell: (t) => <StatusBadge status={t.status} />, sort: (t) => t.status },
    { key: "ts", header: "Timestamp", cell: (t) => <span className="tabular text-muted-foreground">{fmtDateTime(t.timestamp)}</span>, sort: (t) => t.timestamp },
    { key: "rail", header: "Rail", cell: (t) => <span className="text-muted-foreground">{t.paymentRail}</span> },
  ];
  return <DataTable rows={rows} columns={cols} rowKey={(t) => t.id} pageSize={pageSize} defaultSort={{ key: "ts", dir: "desc" }} onRowClick={(t) => navigate({ to: "/transactions/$transactionId", params: { transactionId: t.id } })} emptyTitle="No transactions" toolbar={toolbar} />;
}

export function CardTable({ rows, showCustomer = true, toolbar, pageSize = 10 }: { rows: Card[]; showCustomer?: boolean; toolbar?: React.ReactNode; pageSize?: number }) {
  const db = useDB();
  const navigate = useNavigate();
  const L = lookup(db);
  const orderFor = (c: Card) => db.cardOrders.find((o) => o.cardId === c.id && o.orderStatus !== "Canceled");
  const cols: Column<Card>[] = [
    ...(showCustomer ? [{ key: "cust", header: "Customer", cell: (c: Card) => <CustomerCell customer={L.customer(c.customerId)} />, sort: (c: Card) => L.customer(c.customerId)?.lastName ?? "" }] : []),
    ...(showCustomer ? [{ key: "uid", header: "User ID", cell: (c: Card) => <Mono>{L.customer(c.customerId)?.userId}</Mono> }] : []),
    { key: "type", header: "Card", cell: (c) => <span>{c.cardType} <span className="text-muted-foreground">•••• {c.last4}</span></span>, sort: (c) => c.cardType },
    { key: "design", header: "Design", cell: (c) => c.cardDesign, sort: (c) => c.cardDesign },
    { key: "st", header: "Status", cell: (c) => <StatusBadge status={c.cardStatus} />, sort: (c) => c.cardStatus },
    { key: "req", header: "Request date", cell: (c) => fmtDate(orderFor(c)?.requestDate ?? c.issueDate), sort: (c) => orderFor(c)?.requestDate ?? c.issueDate ?? "" },
    { key: "batch", header: "Batch", cell: (c) => <Mono>{db.batches.find((b) => b.id === c.manufacturingBatchId)?.batchReference ?? "—"}</Mono> },
    { key: "ful", header: "Fulfillment", cell: (c) => { const o = orderFor(c); return o ? <StatusBadge status={o.orderStatus} /> : <span className="text-muted-foreground">{c.cardType === "Virtual" ? "Digital" : "—"}</span>; } },
  ];
  return <DataTable rows={rows} columns={cols} rowKey={(c) => c.id} pageSize={pageSize} onRowClick={(c) => navigate({ to: "/cards/$cardId", params: { cardId: c.id } })} emptyTitle="No cards" toolbar={toolbar} />;
}

export function CaseTable({ rows, showCustomer = true, toolbar, pageSize = 10 }: { rows: SupportCase[]; showCustomer?: boolean; toolbar?: React.ReactNode; pageSize?: number }) {
  const db = useDB();
  const navigate = useNavigate();
  const L = lookup(db);
  const PR = { Urgent: 4, High: 3, Normal: 2, Low: 1 } as const;
  const cols: Column<SupportCase>[] = [
    { key: "ref", header: "Case", cell: (s) => <Mono>{s.caseReference}</Mono>, sort: (s) => s.caseReference },
    ...(showCustomer ? [{ key: "cust", header: "Customer", cell: (s: SupportCase) => <CustomerCell customer={L.customer(s.customerId)} /> }] : []),
    { key: "sub", header: "Subject", cell: (s) => <span className="block max-w-[260px] truncate font-medium">{s.subject}</span> },
    { key: "cat", header: "Category", cell: (s) => s.category, sort: (s) => s.category },
    { key: "pr", header: "Priority", cell: (s) => <StatusBadge status={s.priority} />, sort: (s) => PR[s.priority] },
    { key: "st", header: "Status", cell: (s) => <StatusBadge status={s.status} />, sort: (s) => s.status },
    { key: "as", header: "Assigned to", cell: (s) => (s.assignedEmployeeId ? L.empName(s.assignedEmployeeId) : <span className="text-muted-foreground">Unassigned</span>) },
    { key: "cr", header: "Created", cell: (s) => fmtDate(s.createdAt), sort: (s) => s.createdAt },
    { key: "up", header: "Last updated", cell: (s) => <span className="text-muted-foreground">{fmtDateTime(s.updatedAt)}</span>, sort: (s) => s.updatedAt },
  ];
  return <DataTable rows={rows} columns={cols} rowKey={(s) => s.id} pageSize={pageSize} defaultSort={{ key: "up", dir: "desc" }} onRowClick={(s) => navigate({ to: "/support/$caseId", params: { caseId: s.id } })} emptyTitle="No support cases" toolbar={toolbar} />;
}

import { createFileRoute, useNavigate } from "@tanstack/react-router";
import { useEffect, useState } from "react";
import { CalendarClock, AlertTriangle } from "lucide-react";
import { useDB } from "@/services/store";
import { createBatch } from "@/services/actions";
import { batchIneligibility, nextFriday } from "@/services/rules";
import { CustomerCell, Mono, NoAccess, PageHeader, run, usePermission } from "@/components/common";
import { DataTable, TabBar, type Column } from "@/components/tables/DataTable";
import { StatusBadge } from "@/components/status/StatusBadge";
import { ActionDialog } from "@/components/dialogs/ActionDialog";
import { Button } from "@/components/ui/button";
import { fmtDate, fmtDateTime, lookup } from "@/lib/format";
import type { CardOrder, ManufacturingBatch } from "@/types/models";

export const Route = createFileRoute("/cards/manufacturing/")({
  head: () => ({ meta: [{ property: "og:type", content: "website" }, { name: "twitter:card", content: "summary" }, { title: "Card Manufacturing — Renda Admin" }, { name: "description", content: "Review physical card orders and prepare manufacturing batches." }, { property: "og:title", content: "Card Manufacturing — Renda Admin" }, { property: "og:description", content: "Prepare Friday manufacturing batches." }] }),
  component: Manufacturing,
});

const TABS = ["Eligible Orders", "Draft Batches", "Ready for Submission", "Submitted Batches", "Historical Batches"] as const;
type Tab = (typeof TABS)[number];

function Manufacturing() {
  const db = useDB();
  const L = lookup(db);
  const navigate = useNavigate();
  const canView = usePermission("cards.view");
  const canManage = usePermission("manufacturing.manage");
  const [tab, setTab] = useState<Tab>("Eligible Orders");
  const [sel, setSel] = useState<string[]>([]);
  const [friday, setFriday] = useState("");
  useEffect(() => setFriday(nextFriday().toLocaleDateString(undefined, { weekday: "long", month: "long", day: "numeric" })), []);
  if (!canView) return <NoAccess what="card manufacturing" />;

  const eligible = db.cardOrders.filter((o) => o.orderStatus === "Eligible");
  const attention = db.cardOrders.filter((o) => o.orderStatus === "Failed");
  const twoWeeks = Date.now() - 14 * 864e5;
  const byStatus = (s: ManufacturingBatch["status"]) => db.batches.filter((b) => b.status === s);
  const submittedRecent = byStatus("Submitted").filter((b) => new Date(b.submittedAt!).getTime() >= twoWeeks);
  const historical = byStatus("Submitted").filter((b) => new Date(b.submittedAt!).getTime() < twoWeeks);
  const counts: Record<Tab, number> = { "Eligible Orders": eligible.length, "Draft Batches": byStatus("Draft").length, "Ready for Submission": byStatus("Ready for Submission").length, "Submitted Batches": submittedRecent.length, "Historical Batches": historical.length };

  const orderCols: Column<CardOrder>[] = [
    { key: "c", header: "Customer", cell: (o) => <CustomerCell customer={L.customer(o.customerId)} /> },
    { key: "u", header: "Renda User ID", cell: (o) => <Mono>{L.customer(o.customerId)?.userId}</Mono> },
    { key: "ref", header: "Order", cell: (o) => <Mono>{o.orderReference}</Mono> },
    { key: "d", header: "Card design", cell: (o) => o.requestedDesign, sort: (o) => o.requestedDesign },
    { key: "t", header: "Order type", cell: (o) => o.orderType, sort: (o) => o.orderType },
    { key: "dt", header: "Order date", cell: (o) => fmtDate(o.requestDate), sort: (o) => o.requestDate },
    { key: "r", header: "Replacement ref", cell: (o) => <Mono>{o.replacementReference ?? "—"}</Mono> },
    { key: "e", header: "Eligibility", cell: (o) => { const why = batchIneligibility(o); return why ? <span title={why}><StatusBadge status="Blocked" /></span> : <StatusBadge status="Eligible" />; } },
    { key: "a", header: "", className: "text-right", cell: (o) => <Button variant="ghost" className="text-[13px] font-medium text-primary" onClick={(e) => { e.stopPropagation(); navigate({ to: "/cards/$cardId", params: { cardId: o.cardId } }); }}>View card</Button> },
  ];
  const batchCols: Column<ManufacturingBatch>[] = [
    { key: "r", header: "Batch", cell: (b) => <Mono>{b.batchReference}</Mono>, sort: (b) => b.batchReference },
    { key: "c", header: "Created", cell: (b) => fmtDateTime(b.createdAt), sort: (b) => b.createdAt },
    { key: "by", header: "Created by", cell: (b) => L.empName(b.createdBy) },
    { key: "n", header: "Orders", cell: (b) => <span className="tabular">{b.orderCount}</span> },
    { key: "d", header: "Designs", cell: (b) => { const m: Record<string, number> = {}; b.orderIds.forEach((id) => { const o = db.cardOrders.find((x) => x.id === id); if (o) m[o.requestedDesign] = (m[o.requestedDesign] ?? 0) + 1; }); return <span className="text-muted-foreground">{Object.entries(m).map(([k, v]) => `${k} ×${v}`).join(", ")}</span>; } },
    { key: "p", header: "PDF", cell: (b) => <StatusBadge status={b.pdfReference ? "Completed" : "Not Started"} /> },
    { key: "s", header: "Status", cell: (b) => <StatusBadge status={b.status} /> },
    { key: "sub", header: "Submitted", cell: (b) => fmtDateTime(b.submittedAt), sort: (b) => b.submittedAt ?? "" },
  ];
  const batchRows = tab === "Draft Batches" ? byStatus("Draft") : tab === "Ready for Submission" ? byStatus("Ready for Submission") : tab === "Submitted Batches" ? submittedRecent : historical;

  return (
    <>
      <PageHeader title="Card Manufacturing" subtitle="Review physical card orders and prepare manufacturing batches." />
      <div className="mb-4 grid gap-3 md:grid-cols-[1.3fr_repeat(4,1fr)]">
        <div className="panel flex items-center gap-3 px-4 py-3">
          <CalendarClock className="size-5 text-primary" />
          <div><div className="text-[12px] text-muted-foreground">Next Friday processing</div><div className="font-semibold">{friday}</div><div className="text-[12px] text-muted-foreground">Manual workflow — no automatic generation or submission</div></div>
        </div>
        {[["Eligible orders", eligible.length], ["Draft batches", counts["Draft Batches"]], ["Ready for submission", counts["Ready for Submission"]], ["Orders requiring attention", attention.length]].map(([l, v]) => (
          <div key={l} className="panel px-4 py-3"><div className="text-[12px] text-muted-foreground">{l}</div><div className="text-[20px] font-semibold tabular">{v}</div></div>
        ))}
      </div>
      <TabBar tabs={TABS} value={tab} onChange={setTab} counts={counts} />
      {tab === "Eligible Orders" ? (
        <DataTable
          rows={eligible} columns={orderCols} rowKey={(o) => o.id}
          selectable={canManage} selected={sel} onSelectedChange={setSel} isSelectable={(o) => !batchIneligibility(o)}
          emptyTitle="No eligible orders" emptyDescription="New Plus card selections and replacement requests appear here until batched."
          toolbar={
            <>
              <span className="text-[13px] text-muted-foreground">{canManage ? `${sel.length} of ${eligible.length} selected` : "Your role can view orders but cannot create batches."}</span>
              {canManage && (
                <div className="ml-auto flex gap-2">
                  <Button size="sm" variant="outline" onClick={() => setSel(eligible.filter((o) => !batchIneligibility(o)).map((o) => o.id))}>Select all eligible</Button>
                  <ActionDialog
                    disabled={!sel.length}
                    trigger={<Button variant="ghost" size="sm" disabled={!sel.length}>Create batch ({sel.length})</Button>}
                    title="Create manufacturing batch"
                    description={`${sel.length} order(s) will be linked to a new draft batch. You can review it and generate the PDF next.`}
                    confirmLabel="Create batch"
                    onConfirm={() => { const r = createBatch(sel); setSel([]); navigate({ to: "/cards/manufacturing/$batchId", params: { batchId: r.id } }); }}
                    success="Draft batch created"
                  />
                </div>
              )}
            </>
          }
        />
      ) : (
        <DataTable key={tab} rows={batchRows} columns={batchCols} rowKey={(b) => b.id} defaultSort={{ key: "c", dir: "desc" }} onRowClick={(b) => navigate({ to: "/cards/manufacturing/$batchId", params: { batchId: b.id } })} emptyTitle="No batches" />
      )}
      {attention.length > 0 && <p className="mt-3 flex items-center gap-1 text-[13px] text-warning"><AlertTriangle className="size-3.5" />{attention.length} orders failed and require attention.</p>}
      <span className="hidden">{String(run)}</span>
    </>
  );
}

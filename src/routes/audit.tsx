import { createFileRoute } from "@tanstack/react-router";
import { useState } from "react";
import { useDB } from "@/services/store";
import { KV, Mono, NoAccess, PageHeader, usePermission } from "@/components/common";
import { DataTable, FilterSelect, SearchInput, type Column } from "@/components/tables/DataTable";
import { StatusBadge } from "@/components/status/StatusBadge";
import { Sheet, SheetContent, SheetHeader, SheetTitle } from "@/components/ui/sheet";
import { fmtDateTime, lookup } from "@/lib/format";
import type { AuditEvent } from "@/types/models";

export const Route = createFileRoute("/audit")({
  head: () => ({ meta: [{ title: "Audit Logs — Renda Operations" }, { name: "description", content: "Traceability for sensitive operations." }, { property: "og:title", content: "Audit Logs — Renda Operations" }, { property: "og:description", content: "Audit trail." }] }),
  component: Audit,
});

function Audit() {
  const db = useDB();
  const L = lookup(db);
  const allowed = usePermission("audit.view");
  const [q, setQ] = useState("");
  const [emp, setEmp] = useState("all");
  const [mod, setMod] = useState("all");
  const [out, setOut] = useState("all");
  const [act, setAct] = useState("all");
  const [days, setDays] = useState("all");
  const [open, setOpen] = useState<AuditEvent | null>(null);
  if (!allowed) return <NoAccess what="audit logs" />;
  const modules = Array.from(new Set(db.audit.map((a) => a.module))).sort();
  const actions = Array.from(new Set(db.audit.map((a) => a.action))).sort();
  const rows = db.audit.filter((a) =>
    (emp === "all" || L.empName(a.employeeId) === emp) && (mod === "all" || a.module === mod) && (out === "all" || a.outcome === out) && (act === "all" || a.action === act) &&
    (days === "all" || Date.now() - new Date(a.timestamp).getTime() <= Number(days) * 864e5) &&
    (!q || `${a.action} ${a.entityLabel} ${a.details}`.toLowerCase().includes(q.toLowerCase())));
  const cols: Column<AuditEvent>[] = [
    { key: "t", header: "Timestamp", cell: (a) => <span className="tabular text-muted-foreground">{fmtDateTime(a.timestamp)}</span>, sort: (a) => a.timestamp },
    { key: "e", header: "Employee", cell: (a) => L.empName(a.employeeId), sort: (a) => L.empName(a.employeeId) },
    { key: "a", header: "Action", cell: (a) => <span className="font-medium">{a.action}</span>, sort: (a) => a.action },
    { key: "r", header: "Affected record", cell: (a) => <span>{a.entityType}: <Mono>{a.entityLabel}</Mono></span> },
    { key: "m", header: "Module", cell: (a) => a.module, sort: (a) => a.module },
    { key: "o", header: "Outcome", cell: (a) => <StatusBadge status={a.outcome} />, sort: (a) => a.outcome },
    { key: "d", header: "Details", cell: (a) => <span className="block max-w-[260px] truncate text-muted-foreground">{a.details}</span> },
  ];
  const fmt = (v: Record<string, unknown> | undefined) => (v ? Object.entries(v).map(([k, x]) => `${k}: ${x === null ? "—" : String(x)}`).join("\n") : "—");
  return (
    <>
      <PageHeader title="Audit Logs" subtitle="Every sensitive action, including denied attempts. Secrets are never recorded." />
      <DataTable rows={rows} columns={cols} rowKey={(a) => a.id} pageSize={25} defaultSort={{ key: "t", dir: "desc" }} onRowClick={setOpen} toolbar={
        <>
          <SearchInput value={q} onChange={setQ} placeholder="Search action, record, details" />
          <FilterSelect label="Employee" value={emp} onChange={setEmp} options={db.employees.map((e) => e.name)} />
          <FilterSelect label="Action" value={act} onChange={setAct} options={actions} />
          <FilterSelect label="Module" value={mod} onChange={setMod} options={modules} />
          <FilterSelect label="Outcome" value={out} onChange={setOut} options={["Success", "Simulated", "Denied", "Failed"]} />
          <select aria-label="Date range" value={days} onChange={(e) => setDays(e.target.value)} className="h-8 rounded-md border bg-card px-2 text-[12.5px]"><option value="all">Any date</option><option value="1">Last 24h</option><option value="7">Last 7 days</option><option value="30">Last 30 days</option></select>
        </>
      } />
      <p className="mt-3 text-[12px] text-muted-foreground">In production, audit records must be written by trusted backend services and protected from modification.</p>
      <Sheet open={!!open} onOpenChange={(o) => !o && setOpen(null)}>
        <SheetContent className="sm:max-w-md">
          {open && (
            <>
              <SheetHeader><SheetTitle>{open.action}</SheetTitle></SheetHeader>
              <div className="space-y-4 px-4">
                <KV cols={1} items={[["Timestamp", fmtDateTime(open.timestamp)], ["Employee", `${L.empName(open.employeeId)} (${L.employee(open.employeeId)?.role ?? ""})`], ["Module", open.module], ["Record", `${open.entityType} · ${open.entityLabel}`], ["Outcome", <StatusBadge status={open.outcome} />], ["Details", open.details || "—"], ["Event ID", <Mono>{open.id}</Mono>]]} />
                {(open.before || open.after) && (
                  <div className="grid grid-cols-2 gap-3">
                    <div><div className="eyebrow mb-1">Before</div><pre className="whitespace-pre-wrap rounded bg-secondary p-2 font-mono text-[11.5px]">{fmt(open.before)}</pre></div>
                    <div><div className="eyebrow mb-1">After</div><pre className="whitespace-pre-wrap rounded bg-secondary p-2 font-mono text-[11.5px]">{fmt(open.after)}</pre></div>
                  </div>
                )}
              </div>
            </>
          )}
        </SheetContent>
      </Sheet>
    </>
  );
}

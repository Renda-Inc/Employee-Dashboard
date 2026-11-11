import { SelectField } from "@/components/ui/select-field";
import { createFileRoute, Link } from "@tanstack/react-router";
import { useEffect, useState } from "react";
import { useDB } from "@/services/store";
import { currentEmployee } from "@/services/actions";
import { operations } from "@/services/api";
import { can } from "@/services/permissions";
import { Avatar, EmptyState, KV, Mono, NoAccess, PageHeader, Panel, run, usePermission } from "@/components/common";
import { StatusBadge } from "@/components/status/StatusBadge";
import { Button } from "@/components/ui/button";
import { Textarea } from "@/components/ui/textarea";
import { Label } from "@/components/ui/label";
import { fmtDateTime, fullName, lookup } from "@/lib/format";
import type { CasePriority, CaseStatus } from "@/types/models";

export const Route = createFileRoute("/_authenticated/support/$caseId")({
  head: () => ({ meta: [{ property: "og:type", content: "website" }, { name: "twitter:card", content: "summary" }, { title: "Support case — Renda Admin" }, { name: "description", content: "Support case details, notes and resolution." }, { property: "og:title", content: "Support case — Renda Admin" }, { property: "og:description", content: "Support case details." }] }),
  component: CaseDetail,
});

const STATUSES: CaseStatus[] = ["Open", "In Progress", "Awaiting Customer", "Escalated", "Resolved", "Closed"];

function CaseDetail() {
  const { caseId } = Route.useParams();
  const db = useDB();
  const L = lookup(db);
  const allowed = usePermission("support.view");
  const canManage = usePermission("support.manage");
  const me = currentEmployee(db);
  const sc = db.supportCases.find((s) => s.id === caseId);
  const [note, setNote] = useState("");
  const [resolution, setResolution] = useState(sc?.resolution ?? "");
  const [link, setLink] = useState("");
  useEffect(() => setResolution(sc?.resolution ?? ""), [sc?.resolution]);
  if (!allowed) return <NoAccess what="support cases" />;
  if (!sc) return <div className="panel"><EmptyState title="Case not found" /></div>;
  const c = L.customer(sc.customerId)!;
  const assignable = db.employees.filter((e) => e.directory && e.status === "Active" && can(e.role, "support.manage"));
  const linkOptions = [
    ...db.transactions.filter((t) => t.customerId === c.id).slice(0, 15).map((t) => ({ v: `transaction:${t.id}`, l: `Transaction ${t.transactionReference} · ${t.description}` })),
    ...db.cards.filter((x) => x.customerId === c.id).map((x) => ({ v: `card:${x.id}`, l: `Card ${x.cardDesign} •••• ${x.last4}` })),
    ...db.accounts.filter((a) => a.customerId === c.id).map((a) => ({ v: `account:${a.id}`, l: `Account ${a.accountType} ${a.maskedAccountIdentifier ?? ""}` })),
  ].filter((o) => !sc.links.some((l) => `${l.type}:${l.id}` === o.v));
  const linkLabel = (type: string, id: string) => {
    if (type === "transaction") { const t = db.transactions.find((x) => x.id === id); return t ? <Link to="/transactions/$transactionId" params={{ transactionId: id }} className="text-primary">{t.transactionReference}</Link> : id; }
    if (type === "card") { const x = db.cards.find((y) => y.id === id); return x ? <Link to="/cards/$cardId" params={{ cardId: id }} className="text-primary">{x.cardDesign} •••• {x.last4}</Link> : id; }
    const a = db.accounts.find((y) => y.id === id); return a ? <Link to="/accounts/$accountId" params={{ accountId: id }} className="text-primary">{a.accountType} {a.maskedAccountIdentifier}</Link> : id;
  };

  return (
    <>
      <PageHeader eyebrow={<Mono>{sc.caseReference}</Mono>} title={sc.subject} subtitle={<span className="inline-flex items-center gap-2"><StatusBadge status={sc.status} /><StatusBadge status={sc.priority} /> {sc.category} · opened {fmtDateTime(sc.createdAt)}</span>}
        actions={canManage && sc.assignedEmployeeId !== me.id && <Button size="sm" variant="outline" onClick={() => run(() => operations.updateCase(sc.id, { assignedEmployeeId: me.id }), "Assigned to you")}>Assign to me</Button>} />
      <div className="grid gap-6 lg:grid-cols-[1.6fr_1fr]">
        <div className="space-y-6">
          <Panel title="Customer message">
            <div className="flex gap-3"><Avatar name={fullName(c)} size="md" /><div><div className="text-[13px] text-muted-foreground">{fullName(c)} · submitted via in-app Help</div><p className="mt-1 whitespace-pre-wrap text-[14px]">{sc.message}</p></div></div>
          </Panel>
          <Panel title={<>Internal notes <span className="ml-1 text-[12px] font-normal text-muted-foreground">Not visible to customer</span></>}>
            {canManage && <div className="mb-3 space-y-2"><Textarea rows={2} placeholder="Add internal note…" value={note} onChange={(e) => setNote(e.target.value)} /><Button size="sm" onClick={async () => { if (await run(() => operations.addCaseNote(sc.id, note), "Internal note added")) setNote(""); }}>Add note</Button></div>}
            {sc.notes.length ? sc.notes.map((n) => <div key={n.id} className="border-t bg-warning-soft/40 px-2 py-2"><div className="text-[14px]">{n.text}</div><div className="text-[12px] text-muted-foreground">{L.empName(n.by)} · {fmtDateTime(n.at)}</div></div>) : <p className="text-muted-foreground">No internal notes.</p>}
          </Panel>
          <Panel title="Resolution">
            {canManage ? (
              <div className="space-y-2">
                <Label htmlFor="res">Resolution details (required to resolve or close)</Label>
                <Textarea id="res" rows={3} value={resolution} onChange={(e) => setResolution(e.target.value)} />
                <div className="flex gap-2">
                  <Button size="sm" variant="outline" onClick={() => run(() => operations.updateCase(sc.id, { resolution }), "Resolution saved")}>Save</Button>
                  <Button size="sm" onClick={() => run(() => operations.updateCase(sc.id, { resolution, status: "Resolved" }), "Case resolved")} disabled={sc.status === "Resolved"}>Save & resolve</Button>
                </div>
                <p className="text-[12px] text-muted-foreground">Resolving a case does not send an email or notification to the customer in this demo.</p>
              </div>
            ) : <p>{sc.resolution ?? <span className="text-muted-foreground">Not resolved.</span>}</p>}
          </Panel>
        </div>
        <div className="space-y-6">
          <Panel title="Case details">
            <KV cols={1} items={[["Customer", <Link to="/customers/$customerId" params={{ customerId: c.id }} className="text-primary">{fullName(c)} · {c.userId}</Link>]]} />
            {canManage ? (
              <div className="mt-3 grid gap-3">
                <div className="space-y-1"><Label htmlFor="st">Status</Label><SelectField id="st" className="h-9 w-full rounded-md border bg-card px-2" value={sc.status} onChange={(e) => run(() => operations.updateCase(sc.id, { status: e.target.value as CaseStatus }), "Status updated")}>{STATUSES.map((s) => <option key={s}>{s}</option>)}</SelectField></div>
                <div className="space-y-1"><Label htmlFor="pr">Priority</Label><SelectField id="pr" className="h-9 w-full rounded-md border bg-card px-2" value={sc.priority} onChange={(e) => run(() => operations.updateCase(sc.id, { priority: e.target.value as CasePriority }), "Priority updated")}>{["Low", "Normal", "High", "Urgent"].map((s) => <option key={s}>{s}</option>)}</SelectField></div>
                <div className="space-y-1"><Label htmlFor="as">Assigned to</Label><SelectField id="as" className="h-9 w-full rounded-md border bg-card px-2" value={sc.assignedEmployeeId ?? ""} onChange={(e) => run(() => operations.updateCase(sc.id, { assignedEmployeeId: e.target.value || null }), "Assignment updated")}><option value="">Unassigned</option>{assignable.map((e) => <option key={e.id} value={e.id}>{e.name} · {e.role}</option>)}</SelectField></div>
              </div>
            ) : <div className="mt-3"><KV cols={1} items={[["Status", <StatusBadge status={sc.status} />], ["Priority", sc.priority], ["Assigned to", L.empName(sc.assignedEmployeeId)]]} /></div>}
          </Panel>
          <Panel title="Linked records">
            {sc.links.length ? <ul className="space-y-1">{sc.links.map((l) => <li key={l.type + l.id} className="flex gap-2 text-[14px]"><span className="w-20 capitalize text-muted-foreground">{l.type}</span>{linkLabel(l.type, l.id)}</li>)}</ul> : <p className="text-muted-foreground">None.</p>}
            {canManage && linkOptions.length > 0 && (
              <div className="mt-3 flex gap-2 border-t pt-3">
                <SelectField aria-label="Link record" className="h-8 min-w-0 flex-1 rounded-md border bg-card px-2 text-[13px]" value={link} onChange={(e) => setLink(e.target.value)}><option value="">Link a record…</option>{linkOptions.map((o) => <option key={o.v} value={o.v}>{o.l}</option>)}</SelectField>
                <Button size="sm" variant="outline" disabled={!link} onClick={async () => { const [type, id] = link.split(":"); if (await run(() => operations.linkCaseRecord(sc.id, { type: type as "card", id }), "Record linked")) setLink(""); }}>Link</Button>
              </div>
            )}
          </Panel>
          <Panel title="Timeline">
            <ol className="relative space-y-3 border-l pl-4">{[...sc.timeline].reverse().map((t, i) => <li key={i} className="relative"><span className="absolute -left-[21px] top-1.5 size-2 rounded-full border-2 border-card bg-foreground/40" /><div className="text-[14px]">{t.text}</div><div className="text-[12px] text-muted-foreground">{t.by ? L.empName(t.by) : "Customer"} · {fmtDateTime(t.at)}</div></li>)}</ol>
          </Panel>
        </div>
      </div>
    </>
  );
}

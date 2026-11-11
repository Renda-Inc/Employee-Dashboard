import { SelectField } from "@/components/ui/select-field";
import { createFileRoute, Link } from "@tanstack/react-router";
import { useState } from "react";
import { useDB } from "@/services/store";
import { operations } from "@/services/api";
import { Amount, EmptyState, KV, Mono, NoAccess, PageHeader, Panel, run, usePermission } from "@/components/common";
import { StatusBadge } from "@/components/status/StatusBadge";
import { NewCaseDialog } from "@/components/dialogs/NewCaseDialog";
import { Button } from "@/components/ui/button";
import { Textarea } from "@/components/ui/textarea";
import { fmtDateTime, fullName, lookup, transferTypeLabel, txTypeLabel } from "@/lib/format";

export const Route = createFileRoute("/_authenticated/transactions/$transactionId")({
  head: () => ({ meta: [{ property: "og:type", content: "website" }, { name: "twitter:card", content: "summary" }, { title: "Transaction — Renda Admin" }, { name: "description", content: "Transaction details and investigation." }, { property: "og:title", content: "Transaction — Renda Admin" }, { property: "og:description", content: "Transaction details." }] }),
  component: TxnDetail,
});

function TxnDetail() {
  const { transactionId } = Route.useParams();
  const db = useDB();
  const L = lookup(db);
  const allowed = usePermission("transactions.view");
  const canInv = usePermission("transactions.investigate");
  const canCase = usePermission("support.manage");
  const [note, setNote] = useState("");
  const [linkTo, setLinkTo] = useState("");
  const t = db.transactions.find((x) => x.id === transactionId);
  if (!allowed) return <NoAccess what="transactions" />;
  if (!t) return <div className="panel"><EmptyState title="Transaction not found" /></div>;
  const c = L.customer(t.customerId)!;
  const acc = L.account(t.accountId);
  const cases = db.supportCases.filter((s) => s.links.some((l) => l.type === "transaction" && l.id === t.id));
  const openCustomerCases = db.supportCases.filter((s) => s.customerId === c.id && !cases.includes(s) && !["Closed"].includes(s.status));
  const transfer = t.transferId ? db.transfers.find((x) => x.id === t.transferId) : undefined;
  return (
    <>
      <PageHeader
        title={t.transactionReference}
        subtitle={<span className="inline-flex items-center gap-2"><Amount value={t.amount} direction={t.direction} /> <StatusBadge status={t.status} /> · {t.description}</span>}
        actions={canCase && <NewCaseDialog customerId={c.id} link={{ type: "transaction", id: t.id }} defaultCategory="Transaction" defaultSubject={`Investigation: ${t.transactionReference}`} title="Create investigation case" trigger={<Button size="sm">Create investigation case</Button>} />}
      />
      <div className="grid gap-6 lg:grid-cols-[1.5fr_1fr]">
        <div className="space-y-6">
          <Panel title="Transaction details">
            <KV cols={3} items={[
              ["Customer", <Link to="/customers/$customerId" params={{ customerId: c.id }} className="text-primary">{fullName(c)}</Link>],
              ["Related account", acc ? <Link to="/accounts/$accountId" params={{ accountId: acc.id }} className="text-primary">{acc.accountType} {acc.maskedAccountIdentifier}</Link> : "—"],
              ["Amount", <span>{t.amount.toFixed(2)} {t.currency} ({t.direction})</span>],
              ["Type", txTypeLabel(t.transactionType)], ["Status", <StatusBadge status={t.status} />], ["Payment rail", t.paymentRail],
              ["Created", fmtDateTime(t.timestamp)], ["Completed", fmtDateTime(t.completedAt)], ["Provider reference", <Mono>{t.providerReference}</Mono>],
            ]} />
            {t.errorMessage && <div className="mt-4 rounded-md bg-danger-soft px-3 py-2 text-[13px] text-danger"><strong>Error:</strong> {t.errorMessage}</div>}
            {transfer && <p className="mt-3 text-[13px] text-muted-foreground">Part of {transferTypeLabel(transfer.transferType)} transfer <Mono>{transfer.transactionReference}</Mono>. <Link to="/transfers" className="text-primary">View transfers</Link></p>}
            <p className="mt-4 text-[13px] text-muted-foreground">Historical transaction statuses cannot be edited. Refunds, reversals and adjustments must be performed through the payment provider and are not available in this demo.</p>
          </Panel>
          <Panel title="Internal notes">
            {canInv && (
              <div className="mb-3 space-y-2">
                <Textarea rows={2} placeholder="Add an internal investigation note…" value={note} onChange={(e) => setNote(e.target.value)} />
                <Button size="sm" onClick={async () => { if (await run(() => operations.addTransactionNote(t.id, note), "Note added")) setNote(""); }}>Add note</Button>
              </div>
            )}
            {t.notes.length ? t.notes.map((n) => <div key={n.id} className="border-t py-2 text-[14px]"><div>{n.text}</div><div className="text-[12px] text-muted-foreground">{L.empName(n.by)} · {fmtDateTime(n.at)}</div></div>) : <p className="text-muted-foreground">No notes.</p>}
          </Panel>
        </div>
        <Panel title="Related support cases">
          {cases.length ? cases.map((s) => <Link key={s.id} to="/support/$caseId" params={{ caseId: s.id }} className="flex items-center justify-between py-1.5 hover:underline"><span><Mono>{s.caseReference}</Mono> {s.subject}</span><StatusBadge status={s.status} /></Link>) : <p className="text-muted-foreground">No linked cases.</p>}
          {canCase && openCustomerCases.length > 0 && (
            <div className="mt-4 flex gap-2 border-t pt-3">
              <SelectField aria-label="Existing case" value={linkTo} onChange={(e) => setLinkTo(e.target.value)} className="h-8 flex-1 rounded-md border bg-card px-2 text-[13px]"><option value="">Link existing case…</option>{openCustomerCases.map((s) => <option key={s.id} value={s.id}>{s.caseReference} · {s.subject}</option>)}</SelectField>
              <Button size="sm" variant="outline" disabled={!linkTo} onClick={async () => { if (await run(() => operations.linkCaseRecord(linkTo, { type: "transaction", id: t.id }), "Case linked")) setLinkTo(""); }}>Link</Button>
            </div>
          )}
        </Panel>
      </div>
    </>
  );
}

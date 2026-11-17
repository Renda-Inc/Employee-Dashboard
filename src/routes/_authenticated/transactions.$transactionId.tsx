import { SelectField } from "@/components/ui/select-field";
import { createFileRoute, Link } from "@tanstack/react-router";
import { useState } from "react";
import { useDB } from "@/services/store";
import { operations } from "@/services/api";
import {
  Amount,
  EmptyState,
  KV,
  Mono,
  NoAccess,
  PageHeader,
  Panel,
  run,
  usePermission,
} from "@/components/common";
import { StatusBadge } from "@/components/status/StatusBadge";
import { NewCaseDialog } from "@/components/dialogs/NewCaseDialog";
import { ActionDialog } from "@/components/dialogs/ActionDialog";
import { Button } from "@/components/ui/button";
import { Textarea } from "@/components/ui/textarea";
import { fmtDateTime, fullName, lookup, transferTypeLabel, txTypeLabel } from "@/lib/format";

export const Route = createFileRoute("/_authenticated/transactions/$transactionId")({
  head: () => ({
    meta: [
      { property: "og:type", content: "website" },
      { name: "twitter:card", content: "summary" },
      { title: "Transaction | Renda Admin" },
      { name: "description", content: "Transaction details and investigation." },
      { property: "og:title", content: "Transaction | Renda Admin" },
      { property: "og:description", content: "Transaction details." },
    ],
  }),
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
  if (!t)
    return (
      <div className="panel">
        <EmptyState title="Transaction not found" />
      </div>
    );
  const c = L.customer(t.customerId)!;
  const acc = L.account(t.accountId);
  const cases = db.supportCases.filter((s) =>
    s.links.some((l) => l.type === "transaction" && l.id === t.id),
  );
  const openCustomerCases = db.supportCases.filter(
    (s) => s.customerId === c.id && !cases.includes(s) && !["Closed"].includes(s.status),
  );
  const transfer = t.transferId ? db.transfers.find((x) => x.id === t.transferId) : undefined;
  return (
    <>
      <PageHeader
        title={t.transactionReference}
        subtitle={
          <span className="inline-flex items-center gap-2">
            <Amount value={t.amount} direction={t.direction} /> <StatusBadge status={t.status} /> ·{" "}
            {t.description}
          </span>
        }
        actions={
          canCase && (
            <NewCaseDialog
              customerId={c.id}
              link={{ type: "transaction", id: t.id }}
              defaultCategory="Transaction"
              defaultSubject={`Investigation: ${t.transactionReference}`}
              title="Create investigation case"
              trigger={<Button size="sm">Create investigation case</Button>}
            />
          )
        }
      />
      <div className="grid gap-6 lg:grid-cols-[1.5fr_1fr]">
        <div className="space-y-6">
          <Panel title="Transaction details">
            <KV
              cols={3}
              items={[
                [
                  "Customer",
                  <Link
                    to="/customers/$customerId"
                    params={{ customerId: c.id }}
                    className="text-primary"
                  >
                    {fullName(c)}
                  </Link>,
                ],
                [
                  "Related account",
                  acc ? (
                    <Link
                      to="/accounts/$accountId"
                      params={{ accountId: acc.id }}
                      className="text-primary"
                    >
                      {acc.accountType} {acc.maskedAccountIdentifier}
                    </Link>
                  ) : (
                    "-"
                  ),
                ],
                [
                  "Amount",
                  <span>
                    {t.amount.toFixed(2)} {t.currency} ({t.direction})
                  </span>,
                ],
                ["Type", txTypeLabel(t.transactionType)],
                ["Status", <StatusBadge status={t.status} />],
                ["Payment rail", t.paymentRail],
                ["Created", fmtDateTime(t.timestamp)],
                ["Completed", fmtDateTime(t.completedAt)],
                ["Provider reference", <Mono>{t.providerReference}</Mono>],
              ]}
            />
            {t.errorMessage && (
              <div className="mt-4 rounded-md bg-danger-soft px-3 py-2 text-[13px] text-danger">
                <strong>Error:</strong> {t.errorMessage}
              </div>
            )}
            {transfer && (
              <p className="mt-3 text-[13px] text-muted-foreground">
                Part of {transferTypeLabel(transfer.transferType)} transfer{" "}
                <Mono>{transfer.transactionReference}</Mono>.{" "}
                <Link to="/transfers" className="text-primary">
                  View transfers
                </Link>
              </p>
            )}
            <p className="mt-4 text-[13px] text-muted-foreground">
              Transactions are never reversed, and historical statuses cannot be edited. A completed
              RenPay payment can only come back if the recipient agrees to return it, and a pending
              Interac transfer can be cancelled before it is accepted. Both are handled under
              Transfer actions.
            </p>
          </Panel>
          {transfer && (
            <Panel title="Transfer actions">
              {transfer.transferType === "P2P" && transfer.status === "Completed" && (
                <>
                  <p className="text-[13px] text-muted-foreground">
                    RenPay payments are instant and cannot be cancelled or reversed. Following the
                    Revolut model, Renda can ask the recipient to return the money on the
                    sender&apos;s behalf; the funds move only if the recipient agrees.
                  </p>
                  {!transfer.returnRequest && canInv && (
                    <div className="mt-3">
                      <ActionDialog
                        trigger={<Button size="sm">Request return from recipient</Button>}
                        title="Request return of RenPay payment"
                        description="Renda will contact the recipient and ask them to return this payment. Nothing is debited from the recipient; they choose whether to send it back."
                        reasonLabel="Reason for the request"
                        minReason={5}
                        onConfirm={(r) => operations.requestTransferReturn(transfer.id, r)}
                        success="Return requested: recipient will be contacted"
                        confirmLabel="Request return"
                      />
                    </div>
                  )}
                  {transfer.returnRequest?.status === "Requested" && (
                    <div className="mt-3 space-y-3">
                      <p className="text-[14px]">
                        <StatusBadge status="Requested" tone="warning" />{" "}
                        <span className="text-muted-foreground">
                          Return requested {fmtDateTime(transfer.returnRequest.requestedAt)} by{" "}
                          {L.empName(transfer.returnRequest.requestedBy)}:{" "}
                          {transfer.returnRequest.note}
                        </span>
                      </p>
                      {canInv && (
                        <div className="flex flex-wrap gap-2">
                          <ActionDialog
                            trigger={
                              <Button size="sm" variant="outline">
                                Recipient returned it
                              </Button>
                            }
                            title="Record return received"
                            description="The recipient agreed and sent the money back. This posts the return as a new RenPay transfer from the recipient to the sender."
                            reasonLabel="How was it confirmed?"
                            minReason={5}
                            onConfirm={(r) =>
                              operations.recordReturnOutcome(transfer.id, "Returned", r)
                            }
                            success="Return recorded"
                            confirmLabel="Record return"
                          />
                          <ActionDialog
                            trigger={
                              <Button size="sm" variant="ghost">
                                Recipient declined
                              </Button>
                            }
                            title="Record return declined"
                            description="The recipient refused to return the payment. Without their consent the funds cannot be retrieved, and the request closes."
                            reasonLabel="What did the recipient say?"
                            minReason={5}
                            onConfirm={(r) =>
                              operations.recordReturnOutcome(transfer.id, "Declined", r)
                            }
                            success="Outcome recorded"
                            confirmLabel="Record decline"
                          />
                          <ActionDialog
                            trigger={
                              <Button size="sm" variant="ghost">
                                No response
                              </Button>
                            }
                            title="Close request: no response"
                            description="The recipient did not respond. The request closes without the funds moving; a new request can be opened later."
                            reasonLabel="Attempts made to reach them"
                            minReason={5}
                            onConfirm={(r) =>
                              operations.recordReturnOutcome(transfer.id, "No Response", r)
                            }
                            success="Request closed"
                            confirmLabel="Close request"
                          />
                        </div>
                      )}
                    </div>
                  )}
                  {transfer.returnRequest && transfer.returnRequest.status !== "Requested" && (
                    <p className="mt-3 text-[14px]">
                      <StatusBadge
                        status={transfer.returnRequest.status}
                        tone={transfer.returnRequest.status === "Returned" ? "success" : "neutral"}
                      />{" "}
                      <span className="text-muted-foreground">
                        Closed {fmtDateTime(transfer.returnRequest.resolvedAt)}:{" "}
                        {transfer.returnRequest.resolutionNote}
                      </span>
                    </p>
                  )}
                </>
              )}
              {transfer.transferType === "Interac" && transfer.status === "Pending" && (
                <>
                  <p className="text-[13px] text-muted-foreground">
                    This Interac transfer is still pending. Interac transfers can be cancelled
                    before they are accepted or deposited; once completed, they are final.
                  </p>
                  {canInv && (
                    <div className="mt-3">
                      <ActionDialog
                        trigger={
                          <Button size="sm" variant="destructive">
                            Cancel pending Interac transfer
                          </Button>
                        }
                        title="Cancel pending Interac transfer"
                        description="The transfer is cancelled before acceptance, and the pending transaction is cancelled with it. This cannot be done once the transfer completes."
                        reasonLabel="Reason for cancellation"
                        minReason={5}
                        onConfirm={(r) => operations.cancelInteracTransfer(transfer.id, r)}
                        success="Interac transfer cancelled"
                        confirmLabel="Cancel transfer"
                        destructive
                      />
                    </div>
                  )}
                </>
              )}
              {transfer.transferType === "Interac" && transfer.status !== "Pending" && (
                <p className="text-[13px] text-muted-foreground">
                  This Interac transfer is {transfer.status.toLowerCase()}. Only pending Interac
                  transfers can be cancelled; completed ones are final and can only be investigated.
                </p>
              )}
              {transfer.transferType === "Account-to-Account" && (
                <p className="text-[13px] text-muted-foreground">
                  Account-to-account transfers move between the customer&apos;s own Renda accounts
                  and are final once completed.
                </p>
              )}
            </Panel>
          )}
          <Panel title="Internal notes">
            {canInv && (
              <div className="mb-3 space-y-2">
                <Textarea
                  rows={2}
                  placeholder="Add an internal investigation note…"
                  value={note}
                  onChange={(e) => setNote(e.target.value)}
                />
                <Button
                  size="sm"
                  onClick={async () => {
                    if (await run(() => operations.addTransactionNote(t.id, note), "Note added"))
                      setNote("");
                  }}
                >
                  Add note
                </Button>
              </div>
            )}
            {t.notes.length ? (
              t.notes.map((n) => (
                <div key={n.id} className="border-t py-2 text-[14px]">
                  <div>{n.text}</div>
                  <div className="text-[12px] text-muted-foreground">
                    {L.empName(n.by)} · {fmtDateTime(n.at)}
                  </div>
                </div>
              ))
            ) : (
              <p className="text-muted-foreground">No notes.</p>
            )}
          </Panel>
        </div>
        <Panel title="Related support cases">
          {cases.length ? (
            cases.map((s) => (
              <Link
                key={s.id}
                to="/support/$caseId"
                params={{ caseId: s.id }}
                className="flex items-center justify-between py-1.5 hover:underline"
              >
                <span>
                  <Mono>{s.caseReference}</Mono> {s.subject}
                </span>
                <StatusBadge status={s.status} />
              </Link>
            ))
          ) : (
            <p className="text-muted-foreground">No linked cases.</p>
          )}
          {canCase && openCustomerCases.length > 0 && (
            <div className="mt-4 flex gap-2 border-t pt-3">
              <SelectField
                aria-label="Existing case"
                value={linkTo}
                onChange={(e) => setLinkTo(e.target.value)}
                className="h-8 flex-1 rounded-md border bg-card px-2 text-[13px]"
              >
                <option value="">Link existing case…</option>
                {openCustomerCases.map((s) => (
                  <option key={s.id} value={s.id}>
                    {s.caseReference} · {s.subject}
                  </option>
                ))}
              </SelectField>
              <Button
                size="sm"
                variant="outline"
                disabled={!linkTo}
                onClick={async () => {
                  if (
                    await run(
                      () => operations.linkCaseRecord(linkTo, { type: "transaction", id: t.id }),
                      "Case linked",
                    )
                  )
                    setLinkTo("");
                }}
              >
                Link
              </Button>
            </div>
          )}
        </Panel>
      </div>
    </>
  );
}

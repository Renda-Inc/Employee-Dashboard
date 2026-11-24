import { SelectField } from "@/components/ui/select-field";
import { createFileRoute, Link, useNavigate } from "@tanstack/react-router";
import { useState } from "react";
import { ArrowLeft } from "lucide-react";
import { useDB } from "@/services/store";
import { operations } from "@/services/api";
import { closureBalanceSnapshot, payableBalance } from "@/services/rules";
import { can } from "@/services/permissions";
import { Avatar, EmptyState, KV, NoAccess, Panel, run, usePermission } from "@/components/common";
import { StatusBadge, PlanBadge } from "@/components/status/StatusBadge";
import { ActionDialog } from "@/components/dialogs/ActionDialog";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { fmtDate, fmtDateTime, fmtMoney, fullName, lookup } from "@/lib/format";

export const Route = createFileRoute("/_authenticated/closure-requests/$customerId")({
  head: () => ({
    meta: [
      { property: "og:type", content: "website" },
      { name: "twitter:card", content: "summary" },
      { title: "Process Closure Request | Renda Admin" },
      {
        name: "description",
        content: "Review, assign and process a customer's app closure request in steps.",
      },
      { property: "og:title", content: "Process Closure Request | Renda Admin" },
      { property: "og:description", content: "Closure request processing." },
    ],
  }),
  component: ClosureRequestDetailPage,
});
/**
 * Record pages hold per-record form state (drafts, pre-filled emails,
 * edit forms). Keying the page by its route param forces a remount when
 * navigating directly from one record to another on the same route, so
 * state from the previous record can never be submitted for the next.
 */
function ClosureRequestDetailPage() {
  const { customerId } = Route.useParams();
  return <ClosureRequestDetail key={customerId} />;
}

function StepHeading({
  n,
  title,
  state,
}: {
  n: number;
  title: string;
  state: "done" | "current" | "upcoming";
}) {
  return (
    <div className="flex items-center gap-2.5">
      <span
        className={`flex size-6 items-center justify-center rounded-full border text-[12px] font-semibold ${
          state === "done"
            ? "border-foreground bg-foreground text-background"
            : state === "current"
              ? "border-primary text-primary"
              : "text-muted-foreground"
        }`}
      >
        {n}
      </span>
      <span className={state === "upcoming" ? "text-muted-foreground" : ""}>{title}</span>
    </div>
  );
}

function ClosureRequestDetail() {
  const { customerId } = Route.useParams();
  const navigate = useNavigate();
  const db = useDB();
  const allowed = usePermission("customers.view");
  const canLifecycle = usePermission("customers.lifecycle");
  const L = lookup(db);
  const c = db.customers.find((x) => x.id === customerId);
  const req = c?.closureRequest ?? null;
  const [assigneeId, setAssigneeId] = useState("");
  const [payoutEmail, setPayoutEmail] = useState(req?.payoutEmail ?? "");
  const [method, setMethod] = useState<"Automated" | "Manual">("Automated");
  const [manualRef, setManualRef] = useState("");

  if (!allowed) return <NoAccess what="closure requests" />;
  if (!c || !req)
    return (
      <div className="panel">
        <EmptyState
          title="No closure request"
          description="This customer has not asked to close their account from the app."
          action={
            <Link to="/closure-requests" className="text-primary">
              Back to closure requests
            </Link>
          }
        />
      </div>
    );

  const sub = db.subscriptions.find((s) => s.customerId === c.id);
  const live = closureBalanceSnapshot(db.accounts, db.goals, c.id);
  const open = req.status === "Pending" || req.status === "In Progress";
  const step = req.status === "Pending" ? 1 : req.status === "In Progress" ? 2 : 3;
  // Only employees whose role can actually process a closure are
  // offered; the service enforces the same rule on assignment.
  const employees = db.employees.filter(
    (e) => e.status === "Active" && can(e.role, "customers.lifecycle"),
  );
  // A zero balance needs no Interac payout at all: the payout step
  // becomes a simple confirmation that nothing will be sent. The check
  // uses payableBalance, the same definition the service enforces for
  // the None method, not the display snapshot.
  const zeroBalance = payableBalance(db.accounts, c.id) < 0.01;
  const balancesMoved =
    Math.abs(live.total - req.balances.total) > 0.009 ||
    Math.abs(live.smartSpend - req.balances.smartSpend) > 0.009 ||
    Math.abs(live.senseSave - req.balances.senseSave) > 0.009;

  return (
    <>
      <Link
        to="/closure-requests"
        className="mb-4 inline-flex items-center gap-1.5 text-[13px] text-muted-foreground hover:text-foreground"
      >
        <ArrowLeft className="size-4" /> All closure requests
      </Link>
      <div className="mb-6 flex flex-wrap items-start justify-between gap-4 border-b pb-7">
        <div className="flex items-center gap-3.5">
          <Avatar name={fullName(c)} size="lg" />
          <div>
            <h1 className="text-[28px] font-semibold tracking-normal">{fullName(c)}</h1>
            <div className="mt-1 flex flex-wrap items-center gap-2 text-[13px] text-muted-foreground">
              <StatusBadge status={c.customerStatus} />
              <PlanBadge plan={sub?.plan} />
              <span>·</span>
              <span>Requested closure {fmtDate(req.requestedAt)}</span>
              <span>·</span>
              <StatusBadge status={req.status} />
            </div>
          </div>
        </div>
        <Button
          variant="outline"
          size="sm"
          onClick={() => navigate({ to: "/customers/$customerId", params: { customerId: c.id } })}
        >
          Open full profile
        </Button>
      </div>

      {req.status === "Processed" && (
        <div className="mb-4 rounded-md bg-success-soft px-4 py-3 text-[13px]">
          <strong>Processed{req.resolvedAt ? ` on ${fmtDate(req.resolvedAt)}` : ""}</strong>
          {req.resolvedBy ? ` by ${L.empName(req.resolvedBy)}` : ""}.{" "}
          {req.processingMethod === "None" ? (
            <>No payout was needed: the balance was zero. </>
          ) : (
            <>
              Method: {req.processingMethod ?? "Automated"}.{" "}
              {c.closure && c.closure.payoutAmount > 0 ? (
                <>
                  {fmtMoney(c.closure.payoutAmount)} was paid out by Interac to{" "}
                  {c.closure.payoutEmail}
                  {req.payoutReference ? ` (reference ${req.payoutReference})` : ""}.{" "}
                </>
              ) : (
                <>There was no balance to pay out. </>
              )}
            </>
          )}
          The account is closed; this request cannot be processed again.
        </div>
      )}
      {req.status === "Cancelled" && (
        <div className="mb-4 rounded-md bg-muted px-4 py-3 text-[13px]">
          <strong>Cancelled{req.resolvedAt ? ` on ${fmtDate(req.resolvedAt)}` : ""}</strong>
          {req.resolvedBy ? ` by ${L.empName(req.resolvedBy)}` : ""}. {req.resolutionNote} The
          account was not closed.
        </div>
      )}

      <div className="space-y-6">
        <Panel title="Request summary">
          <div className="grid gap-6 lg:grid-cols-3">
            <KV
              cols={1}
              items={[
                ["Requested", fmtDateTime(req.requestedAt)],
                ["Reason for leaving", req.reason],
                ["Feedback", req.feedback || "None given"],
                ["Payout email chosen by customer", req.payoutEmail],
              ]}
            />
            <KV
              cols={1}
              items={[
                ["Smart Spend, when requested", fmtMoney(req.balances.smartSpend)],
                ["Sense Save, when requested", fmtMoney(req.balances.senseSave)],
                ["Of which in savings goals", fmtMoney(req.balances.goals)],
                ["Total, when requested", fmtMoney(req.balances.total)],
                ["Total balance now", fmtMoney(live.total)],
              ]}
            />
            <KV
              cols={1}
              items={[
                ["Request status", <StatusBadge key="rs" status={req.status} />],
                ["Customer status", <StatusBadge key="cs" status={c.customerStatus} />],
                ["Plan", sub ? `${sub.plan} (${sub.subscriptionStatus})` : "None"],
                [
                  "Assigned to",
                  req.assignedTo
                    ? `${L.empName(req.assignedTo)}${req.assignedAt ? ` since ${fmtDate(req.assignedAt)}` : ""}${req.assignedBy ? `, by ${L.empName(req.assignedBy)}` : ""}`
                    : "Unassigned",
                ],
              ]}
            />
          </div>
        </Panel>

        <Panel title={<StepHeading n={1} title="Assign" state={step > 1 ? "done" : "current"} />}>
          {open && canLifecycle ? (
            <div>
              {req.status === "In Progress" && req.assignedTo ? (
                <p className="mb-3 text-[13px]">
                  <strong>In progress.</strong> Assigned to {L.empName(req.assignedTo)}
                  {req.assignedAt ? ` on ${fmtDate(req.assignedAt)}` : ""}
                  {req.assignedBy ? ` by ${L.empName(req.assignedBy)}` : ""}. You can reassign it
                  below, or continue to step 2.
                </p>
              ) : (
                <p className="mb-3 text-[13px]">
                  Nobody is working this request yet. Assign it to yourself to start processing, or
                  hand it to the employee who will handle it.
                </p>
              )}
              <div className="flex flex-wrap items-end gap-2">
                {db.currentEmployeeId && req.assignedTo !== db.currentEmployeeId && (
                  <Button
                    size="sm"
                    onClick={() =>
                      void run(
                        () => operations.assignClosureRequest(c.id, db.currentEmployeeId, ""),
                        "Closure request assigned to you",
                      )
                    }
                  >
                    Assign to me
                  </Button>
                )}
                <div className="space-y-1">
                  <Label htmlFor="assignee">Assign to</Label>
                  <SelectField
                    id="assignee"
                    value={assigneeId}
                    onChange={(e) => setAssigneeId(e.target.value)}
                    className="h-9 w-56 rounded-md border bg-card px-2"
                  >
                    <option value="">Choose an employee…</option>
                    {employees.map((e) => (
                      <option key={e.id} value={e.id}>
                        {e.name} · {e.role}
                      </option>
                    ))}
                  </SelectField>
                </div>
                <Button
                  size="sm"
                  variant="outline"
                  disabled={!assigneeId || assigneeId === req.assignedTo}
                  onClick={() =>
                    void run(
                      () => operations.assignClosureRequest(c.id, assigneeId, ""),
                      "Closure request assigned",
                    )
                  }
                >
                  {req.assignedTo ? "Reassign" : "Assign"}
                </Button>
                <span className="mx-1 hidden h-6 w-px bg-border sm:block" />
                <ActionDialog
                  trigger={
                    <Button size="sm" variant="ghost">
                      Cancel request
                    </Button>
                  }
                  title="Cancel closure request"
                  description="Cancels the request without closing the account, for example when the customer changes their mind. The request stays on the record as cancelled."
                  reasonLabel="Reason (required)"
                  minReason={5}
                  confirmLabel="Cancel request"
                  onConfirm={(note) => operations.cancelClosureRequest(c.id, note)}
                  success="Closure request cancelled"
                />
              </div>
            </div>
          ) : open ? (
            <p className="text-[13px] text-muted-foreground">
              {req.assignedTo
                ? `Assigned to ${L.empName(req.assignedTo)}. Your role can view this request but not process it.`
                : "Your role can view this request but not process it."}
            </p>
          ) : (
            <p className="text-[13px] text-muted-foreground">
              This request is {req.status.toLowerCase()}, so there is nothing left to assign.
            </p>
          )}
        </Panel>

        <Panel
          title={
            <StepHeading
              n={2}
              title={zeroBalance && open ? "Payout: none needed" : "Prepare the payout"}
              state={step > 2 ? "done" : step === 2 ? "current" : "upcoming"}
            />
          }
        >
          {req.status === "Pending" ? (
            <p className="text-[13px] text-muted-foreground">
              Assign the request in step 1 first. The payout is prepared once someone is working it.
            </p>
          ) : req.status !== "In Progress" ? (
            <p className="text-[13px] text-muted-foreground">This request is already resolved.</p>
          ) : zeroBalance ? (
            <div className="space-y-3">
              <p className="text-[13px]">
                The balance is <strong>$0.00</strong>, so there is no Interac payout for this
                closure and nothing to prepare here. Step 3 just confirms the closure.
              </p>
              {req.balances.total > 0 && (
                <p className="text-[13px] text-warning">
                  The customer had {fmtMoney(req.balances.total)} when they asked; the balance has
                  since gone to zero, so no payout is due.
                </p>
              )}
            </div>
          ) : (
            <div className="space-y-5">
              <KV
                cols={3}
                items={[
                  ["Smart Spend, now", fmtMoney(live.smartSpend)],
                  ["Sense Save, now", fmtMoney(live.senseSave)],
                  ["Total to pay out, now", fmtMoney(live.total)],
                ]}
              />
              {balancesMoved && (
                <p className="text-[13px] text-warning">
                  Balances have moved since the customer asked ({fmtMoney(req.balances.total)} then,{" "}
                  {fmtMoney(live.total)} now). The payout uses the balances as they stand at
                  processing.
                </p>
              )}
              <div className="grid gap-4 sm:grid-cols-2">
                <div className="space-y-1">
                  <Label htmlFor="payout-email">Interac payout email</Label>
                  <Input
                    id="payout-email"
                    value={payoutEmail}
                    onChange={(e) => setPayoutEmail(e.target.value)}
                    disabled={!canLifecycle}
                  />
                  <p className="text-[12px] text-muted-foreground">
                    The email the customer chose in the app. Correct it here only if they gave a
                    wrong one; the correction is recorded on the closure.
                  </p>
                </div>
                <div className="space-y-2">
                  <Label>How the payout is made</Label>
                  <div className="flex gap-2">
                    <Button
                      type="button"
                      size="sm"
                      variant={method === "Automated" ? "default" : "outline"}
                      onClick={() => setMethod("Automated")}
                      disabled={!canLifecycle}
                    >
                      Automated
                    </Button>
                    <Button
                      type="button"
                      size="sm"
                      variant={method === "Manual" ? "default" : "outline"}
                      onClick={() => setMethod("Manual")}
                      disabled={!canLifecycle}
                    >
                      Manual
                    </Button>
                  </div>
                  <p className="text-[12px] text-muted-foreground">
                    {method === "Automated"
                      ? "The system sends the Interac payout when you complete step 3."
                      : "The assignee sends the Interac payout outside the admin and records its reference in step 3; the closure then adopts that payout instead of creating another one."}
                  </p>
                </div>
              </div>
            </div>
          )}
        </Panel>

        <Panel
          title={
            <StepHeading
              n={3}
              title="Complete the closure"
              state={step === 3 ? "done" : step === 2 ? "current" : "upcoming"}
            />
          }
        >
          {req.status === "Processed" ? (
            <p className="text-[13px] text-muted-foreground">
              Completed{req.resolvedAt ? ` on ${fmtDate(req.resolvedAt)}` : ""}. The account is
              closed and this step cannot run again.
            </p>
          ) : req.status === "Cancelled" ? (
            <p className="text-[13px] text-muted-foreground">
              This request was cancelled, so there is nothing to complete.
            </p>
          ) : req.status === "Pending" ? (
            <p className="text-[13px] text-muted-foreground">
              Available once the request is assigned in step 1.
            </p>
          ) : zeroBalance ? (
            <div className="space-y-4">
              <p className="text-[13px]">
                There is no balance to pay out. Confirming closes the savings goals, cancels the{" "}
                {sub?.plan ?? "current"} subscription with no refund, inactivates every card and
                closes the account. This runs once and cannot be repeated.
              </p>
              {canLifecycle && (
                <ActionDialog
                  trigger={<Button variant="destructive">Confirm closure</Button>}
                  title="Confirm the closure"
                  description="No Interac payout will be sent, because the balance is zero. The account closes in this step, and the request cannot be processed again."
                  confirmLabel="Confirm closure"
                  destructive
                  onConfirm={() => operations.processClosureRequest(c.id, { method: "None" })}
                  success="Closure processed: account closed"
                />
              )}
            </div>
          ) : (
            <div className="space-y-4">
              <p className="text-[13px]">
                Completing pays out <strong>{fmtMoney(live.total)}</strong> by Interac to{" "}
                <strong>{payoutEmail || req.payoutEmail}</strong>
                {method === "Manual" ? " (manual payout, reference below)" : " (automated)"}, closes
                the savings goals, cancels the {sub?.plan ?? "current"} subscription with no refund,
                inactivates every card and closes the account. This runs once and cannot be
                repeated.
              </p>
              {method === "Manual" && (
                <div className="max-w-sm space-y-1">
                  <Label htmlFor="manual-ref">Interac reference of the manual payout</Label>
                  <Input
                    id="manual-ref"
                    value={manualRef}
                    onChange={(e) => setManualRef(e.target.value)}
                    placeholder="e.g. INT-2026-88412"
                    disabled={!canLifecycle}
                  />
                </div>
              )}
              {canLifecycle && (
                <ActionDialog
                  trigger={<Button variant="destructive">Process closure</Button>}
                  title="Complete the closure"
                  description={`This is the final step. ${method === "Manual" ? `The manual payout reference ${manualRef || "(not entered yet)"} will be recorded on the closure.` : "The Interac payout will be sent now."} The account closes in the same step, and the request cannot be processed again.`}
                  confirmLabel="Process closure"
                  destructive
                  onConfirm={() =>
                    operations.processClosureRequest(c.id, {
                      method,
                      payoutReference: method === "Manual" ? manualRef : undefined,
                      payoutEmail: payoutEmail || req.payoutEmail,
                    })
                  }
                  success="Closure processed: account closed"
                />
              )}
            </div>
          )}
        </Panel>
      </div>
    </>
  );
}

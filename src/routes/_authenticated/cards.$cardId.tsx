import { SelectField } from "@/components/ui/select-field";
import { createFileRoute, Link, useNavigate } from "@tanstack/react-router";
import { useState } from "react";
import { useDB } from "@/services/store";
import { operations } from "@/services/api";
import {
  EmptyState,
  KV,
  Mono,
  NoAccess,
  PageHeader,
  Panel,
  run,
  usePermission,
} from "@/components/common";
import { ActionDialog } from "@/components/dialogs/ActionDialog";
import { StatusBadge } from "@/components/status/StatusBadge";
import { Button } from "@/components/ui/button";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { SimulatedNote } from "@/components/common";
import { fmtDate, fmtDateTime, fullName, lookup } from "@/lib/format";
import { CARD_DESIGNS, type CardDesign, type ReplacementReason } from "@/types/models";

export const Route = createFileRoute("/_authenticated/cards/$cardId")({
  head: () => ({
    meta: [
      { property: "og:type", content: "website" },
      { name: "twitter:card", content: "summary" },
      { title: "Card details — Renda Admin" },
      { name: "description", content: "Card details, replacement and fulfillment." },
      { property: "og:title", content: "Card details — Renda Admin" },
      { property: "og:description", content: "Card details." },
    ],
  }),
  component: CardDetail,
});

const REASONS: ReplacementReason[] = [
  "Lost card",
  "Damaged card",
  "Suspected compromise",
  "Customer-requested design change",
  "Other",
];

function CardDetail() {
  const { cardId } = Route.useParams();
  const db = useDB();
  const L = lookup(db);
  const navigate = useNavigate();
  const allowed = usePermission("cards.view");
  const canLock = usePermission("cards.lock");
  const canReplace = usePermission("cards.replace");
  const [open, setOpen] = useState(false);
  const [design, setDesign] = useState<CardDesign>("Classic");
  const [reason, setReason] = useState<ReplacementReason>("Damaged card");
  const [notes, setNotes] = useState("");
  const card = db.cards.find((c) => c.id === cardId);
  if (!allowed) return <NoAccess what="card records" />;
  if (!card)
    return (
      <div className="panel">
        <EmptyState title="Card not found" />
      </div>
    );
  const c = L.customer(card.customerId)!;
  const acc = L.account(card.accountId);
  const order = db.cardOrders.find((o) => o.cardId === card.id && o.orderStatus !== "Canceled");
  const batch = db.batches.find((b) => b.id === card.manufacturingBatchId);
  // replacement chain
  const chain: typeof db.cards = [];
  let cur: typeof card | undefined = card;
  while (cur?.replacesCardId) {
    cur = db.cards.find((x) => x.id === cur!.replacesCardId);
    if (cur) chain.push(cur);
  }
  const successor = card.replacedByCardId
    ? db.cards.find((x) => x.id === card.replacedByCardId)
    : undefined;
  const orders = db.cardOrders.filter(
    (o) => o.customerId === c.id && o.orderType === "Replacement Card",
  );

  const submitReplacement = async () => {
    let id = "";
    if (
      await run(async () => {
        id = await operations.createReplacement({ cardId: card.id, design, reason, notes });
      }, "Replacement request created")
    ) {
      setOpen(false);
      navigate({ to: "/cards/$cardId", params: { cardId: id } });
    }
  };

  return (
    <>
      <PageHeader
        title={`${card.cardDesign} ${card.cardType === "Virtual" ? "virtual" : "physical"} card •••• ${card.last4}`}
        subtitle={
          <span className="inline-flex items-center gap-2">
            <StatusBadge status={card.cardStatus} />
            <Link
              to="/customers/$customerId"
              params={{ customerId: c.id }}
              className="text-primary"
            >
              {fullName(c)}
            </Link>
          </span>
        }
        actions={
          <>
            {canLock && card.cardStatus === "Active" && (
              <ActionDialog
                trigger={
                  <Button size="sm" variant="outline">
                    Lock card
                  </Button>
                }
                title="Lock card"
                description={`Lock ${card.cardDesign} •••• ${card.last4} for ${fullName(c)}.`}
                reasonLabel="Reason for locking"
                simulated="Demo mode — the card processor is not contacted. The lock is recorded as a simulated outcome."
                destructive
                confirmLabel="Lock card"
                onConfirm={(r) => operations.lockCard(card.id, r)}
                success="Card locked (simulated) — audit event recorded"
              />
            )}
            {canLock && card.cardStatus === "Locked" && (
              <ActionDialog
                trigger={
                  <Button size="sm" variant="outline">
                    Unlock card
                  </Button>
                }
                title="Unlock card"
                reasonLabel="Reason for unlocking"
                simulated
                onConfirm={(r) => operations.unlockCard(card.id, r)}
                success="Card unlocked (simulated)"
              />
            )}
            {canReplace &&
              card.cardType === "Physical" &&
              (card.cardStatus === "Active" || card.cardStatus === "Locked") &&
              !successor && (
                <Button
                  size="sm"
                  onClick={() => {
                    setDesign(CARD_DESIGNS.find((d) => d !== card.cardDesign) ?? "Classic");
                    setOpen(true);
                  }}
                >
                  Request replacement
                </Button>
              )}
            {canReplace && order?.orderStatus === "Eligible" && (
              <ActionDialog
                trigger={
                  <Button size="sm" variant="outline">
                    Cancel order
                  </Button>
                }
                title={`Cancel ${order.orderReference}`}
                description="The order and card history are preserved with a Canceled outcome."
                reasonLabel="Reason"
                destructive
                onConfirm={(r) => operations.cancelOrder(order.id, r)}
                success="Order canceled"
              />
            )}
          </>
        }
      />
      <div className="grid gap-6 lg:grid-cols-[1.5fr_1fr]">
        <div className="space-y-6">
          <Panel title="Card details">
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
                  "Associated account",
                  acc ? (
                    <Link
                      to="/accounts/$accountId"
                      params={{ accountId: acc.id }}
                      className="text-primary"
                    >
                      {acc.accountType} {acc.maskedAccountIdentifier}
                    </Link>
                  ) : (
                    "—"
                  ),
                ],
                ["Card type", card.cardType],
                ["Card design", card.cardDesign],
                ["Status", <StatusBadge status={card.cardStatus} />],
                ["Issue date", fmtDate(card.issueDate)],
                [
                  "Replacement ref",
                  card.replacementReference ? <Mono>{card.replacementReference}</Mono> : "—",
                ],
                [
                  "Manufacturing batch",
                  batch ? (
                    <Link
                      to="/cards/manufacturing/$batchId"
                      params={{ batchId: batch.id }}
                      className="text-primary"
                    >
                      {batch.batchReference}
                    </Link>
                  ) : (
                    "—"
                  ),
                ],
                [
                  "Fulfillment",
                  order ? (
                    <StatusBadge status={order.orderStatus} />
                  ) : card.cardType === "Virtual" ? (
                    "Digital"
                  ) : (
                    "—"
                  ),
                ],
              ]}
            />
            <p className="mt-4 text-[13px] text-muted-foreground">
              Full card numbers, CVV and PIN are never displayed.
            </p>
          </Panel>
          <Panel title="Operational notes">
            {card.notes.length ? (
              card.notes.map((n) => (
                <div key={n.id} className="border-b py-2 last:border-0">
                  <div>{n.text}</div>
                  <div className="text-[12px] text-muted-foreground">
                    {L.empName(n.by)} · {fmtDateTime(n.at)}
                  </div>
                </div>
              ))
            ) : (
              <p className="text-muted-foreground">No notes.</p>
            )}
            {order?.notes && (
              <p className="mt-2 text-[13px] text-muted-foreground">Order note: {order.notes}</p>
            )}
          </Panel>
        </div>
        <Panel title="Replacement history">
          {successor && (
            <p className="mb-3 rounded bg-info-soft px-2 py-1.5 text-[13px] text-info">
              Replaced by{" "}
              <Link to="/cards/$cardId" params={{ cardId: successor.id }} className="underline">
                {successor.cardDesign} •••• {successor.last4}
              </Link>{" "}
              ({successor.cardStatus})
            </p>
          )}
          {chain.length > 0 && (
            <div className="mb-3">
              <div className="eyebrow mb-1">Previous cards</div>
              {chain.map((p) => (
                <Link
                  key={p.id}
                  to="/cards/$cardId"
                  params={{ cardId: p.id }}
                  className="flex justify-between py-1 hover:underline"
                >
                  <span>
                    {p.cardDesign} •••• {p.last4}
                  </span>
                  <StatusBadge status={p.cardStatus} />
                </Link>
              ))}
            </div>
          )}
          <div className="eyebrow mb-1">Customer replacement requests</div>
          {orders.length ? (
            orders.map((o) => (
              <div key={o.id} className="border-t py-2 text-[13px]">
                <div className="flex justify-between">
                  <Mono>{o.replacementReference}</Mono>
                  <StatusBadge status={o.orderStatus} />
                </div>
                <div>
                  {o.previousDesign} → <strong>{o.requestedDesign}</strong> · {o.replacementReason}
                </div>
                <div className="text-muted-foreground">{fmtDate(o.requestDate)}</div>
              </div>
            ))
          ) : (
            <p className="text-muted-foreground">None.</p>
          )}
        </Panel>
      </div>

      <Dialog open={open} onOpenChange={setOpen}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Request replacement card</DialogTitle>
            <DialogDescription>
              The existing card record and history are retained. The new card joins the next
              eligible manufacturing batch.
            </DialogDescription>
          </DialogHeader>
          <div className="grid gap-3">
            <div className="grid grid-cols-2 gap-3 text-[14px]">
              <div>
                <div className="eyebrow">Customer</div>
                {fullName(c)}
              </div>
              <div>
                <div className="eyebrow">Existing card</div>
                {card.cardDesign} •••• {card.last4}
              </div>
            </div>
            <div className="grid grid-cols-2 gap-3">
              <div className="space-y-1">
                <Label htmlFor="rd">Replacement design</Label>
                <SelectField
                  id="rd"
                  className="h-9 w-full rounded-md border bg-card px-2"
                  value={design}
                  onChange={(e) => setDesign(e.target.value as CardDesign)}
                >
                  {CARD_DESIGNS.map((d) => (
                    <option key={d}>{d}</option>
                  ))}
                </SelectField>
              </div>
              <div className="space-y-1">
                <Label htmlFor="rr">Reason</Label>
                <SelectField
                  id="rr"
                  className="h-9 w-full rounded-md border bg-card px-2"
                  value={reason}
                  onChange={(e) => setReason(e.target.value as ReplacementReason)}
                >
                  {REASONS.map((d) => (
                    <option key={d}>{d}</option>
                  ))}
                </SelectField>
              </div>
            </div>
            {(reason === "Lost card" || reason === "Suspected compromise") && (
              <p className="text-[13px] text-warning">
                The existing card will be locked (simulated).
              </p>
            )}
            <div className="space-y-1">
              <Label htmlFor="rn">Notes</Label>
              <Textarea id="rn" rows={2} value={notes} onChange={(e) => setNotes(e.target.value)} />
            </div>
            <SimulatedNote>
              Card processor actions are simulated. Manufacturing proceeds via the Friday batch
              workflow.
            </SimulatedNote>
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setOpen(false)}>
              Cancel
            </Button>
            <Button onClick={submitReplacement}>Create request</Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </>
  );
}

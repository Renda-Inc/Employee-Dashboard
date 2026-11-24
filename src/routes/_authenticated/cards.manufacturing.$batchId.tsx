import { createFileRoute, Link } from "@tanstack/react-router";
import { Download, FileText } from "lucide-react";
import { ACTIVATION_FOLLOWUP_DAYS } from "@/services/rules";
import { useDB, getState } from "@/services/store";
import { operations } from "@/services/api";
import { buildBatchPdf } from "@/services/pdf";
import {
  CustomerCell,
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
import { fmtDate, fmtDateTime, lookup } from "@/lib/format";

export const Route = createFileRoute("/_authenticated/cards/manufacturing/$batchId")({
  head: () => ({
    meta: [
      { property: "og:type", content: "website" },
      { name: "twitter:card", content: "summary" },
      { title: "Manufacturing batch | Renda Admin" },
      {
        name: "description",
        content: "Review, export and record submission of a manufacturing batch.",
      },
      { property: "og:title", content: "Manufacturing batch | Renda Admin" },
      { property: "og:description", content: "Manufacturing batch review." },
    ],
  }),
  component: BatchDetail,
});

function BatchDetail() {
  const { batchId } = Route.useParams();
  const db = useDB();
  const L = lookup(db);
  const canView = usePermission("cards.view");
  const canManage = usePermission("manufacturing.manage");
  const b = db.batches.find((x) => x.id === batchId);
  if (!canView) return <NoAccess what="manufacturing batches" />;
  if (!b)
    return (
      <div className="panel">
        <EmptyState title="Batch not found" />
      </div>
    );
  const orders = b.orderIds.map((id) => db.cardOrders.find((o) => o.id === id)!).filter(Boolean);
  const breakdown: Record<string, number> = {};
  orders.forEach((o) => (breakdown[o.requestedDesign] = (breakdown[o.requestedDesign] ?? 0) + 1));

  const generate = () =>
    run(async () => {
      await operations.recordPdfExport(b.id); // authorizes + audits first
      buildBatchPdf(
        getState(),
        getState().batches.find((x) => x.id === b.id)!,
      ).save(`${b.batchReference}.pdf`);
    }, "Manufacturing PDF generated and downloaded");
  const download = () =>
    run(() => buildBatchPdf(db, b).save(`${b.batchReference}.pdf`), "PDF downloaded");

  return (
    <>
      <PageHeader
        title={b.batchReference}
        subtitle={
          <span className="inline-flex items-center gap-2">
            <StatusBadge status={b.status} /> {b.orderCount} orders · created{" "}
            {fmtDateTime(b.createdAt)} by {L.empName(b.createdBy)}
          </span>
        }
        actions={
          canManage ? (
            <>
              {b.status === "Draft" && (
                <Button size="sm" variant="outline" onClick={generate}>
                  <FileText /> {b.pdfReference ? "Regenerate PDF" : "Generate PDF"}
                </Button>
              )}
              {b.pdfReference && (
                <Button size="sm" variant="outline" onClick={download}>
                  <Download /> Download PDF
                </Button>
              )}
              {b.status === "Draft" && (
                <ActionDialog
                  trigger={
                    <Button variant="ghost" size="sm" disabled={!b.pdfReference}>
                      Mark ready for submission
                    </Button>
                  }
                  disabled={!b.pdfReference}
                  title="Mark batch ready"
                  description="Confirms the batch and PDF have been reviewed. This does not submit anything to the manufacturer."
                  onConfirm={() => operations.markBatchReady(b.id)}
                  success="Batch marked ready for submission"
                />
              )}
              {b.status === "Ready for Submission" && (
                <ActionDialog
                  trigger={
                    <Button variant="ghost" size="sm">
                      Record submission
                    </Button>
                  }
                  title="Record submission to manufacturer"
                  description="Only confirm once the PDF has actually been sent. Orders will move to Submitted and cannot be batched again."
                  reasonLabel="How was it sent? (e.g. emailed to production desk)"
                  confirmLabel="Record submission"
                  onConfirm={(r) => operations.recordBatchSubmission(b.id, r)}
                  success="Submission recorded. Audit event created"
                />
              )}
            </>
          ) : b.pdfReference ? (
            <Button size="sm" variant="outline" onClick={download}>
              <Download /> Download PDF
            </Button>
          ) : null
        }
      />
      {b.status === "Draft" && !b.pdfReference && (
        <p className="mb-4 rounded-md bg-warning-soft px-3 py-2 text-[13px] text-warning">
          Generate the manufacturing PDF to continue. Downloading a PDF does not mark the batch as
          submitted.
        </p>
      )}
      {b.status === "Submitted" && (
        <p className="mb-4 rounded-md bg-info-soft px-3 py-2 text-[13px] text-info">
          This batch is with the manufacturer, who prints the cards and mails them to customers
          directly. Renda does not track delivery: each card becomes Active when its customer
          activates it, and a card still not activated after {ACTIVATION_FOLLOWUP_DAYS} days appears
          in the Requires attention queue.
        </p>
      )}
      <div className="grid gap-6 lg:grid-cols-[1.6fr_1fr]">
        <div className="space-y-6">
          <Panel title="Batch review">
            <KV
              cols={3}
              items={[
                ["Batch reference", <Mono>{b.batchReference}</Mono>],
                ["Created", fmtDateTime(b.createdAt)],
                ["Order count", b.orderCount],
                [
                  "PDF export",
                  b.pdfReference ? (
                    <span>
                      <StatusBadge status="Completed" />{" "}
                      <span className="text-muted-foreground">{fmtDateTime(b.exportedAt)}</span>
                    </span>
                  ) : (
                    <StatusBadge status="Not Started" />
                  ),
                ],
                [
                  "Submission",
                  b.submittedAt ? (
                    <span>
                      <StatusBadge status="Submitted" />{" "}
                      <span className="text-muted-foreground">{fmtDateTime(b.submittedAt)}</span>
                    </span>
                  ) : (
                    <StatusBadge status="Pending" />
                  ),
                ],
                ["Created by", L.empName(b.createdBy)],
                ["Reviewed by", L.empName(b.reviewedBy)],
                ["Submitted by", L.empName(b.submittedBy)],
                ["Submission note", b.submissionNote ?? "-"],
              ]}
            />
            <div className="mt-4 flex flex-wrap gap-2">
              {Object.entries(breakdown).map(([d, n]) => (
                <span key={d} className="rounded border px-2 py-1 text-[13px]">
                  {d} <strong className="tabular">×{n}</strong>
                </span>
              ))}
            </div>
          </Panel>
          <div className="panel overflow-hidden">
            <div className="border-b px-4 py-2.5 text-[14px] font-semibold">Orders</div>
            <table className="w-full text-[14px]">
              <thead>
                <tr className="border-b bg-secondary/60 text-left text-[12px] text-muted-foreground">
                  <th className="px-3 py-2 font-medium">Order</th>
                  <th className="px-3 py-2 font-medium">Customer</th>
                  <th className="px-3 py-2 font-medium">Design</th>
                  <th className="px-3 py-2 font-medium">Type</th>
                  <th className="px-3 py-2 font-medium">Requested</th>
                  <th className="px-3 py-2 font-medium">Status</th>
                  <th />
                </tr>
              </thead>
              <tbody>
                {orders.map((o) => (
                  <tr key={o.id} className="border-b last:border-0">
                    <td className="px-3 py-2">
                      <Link
                        to="/cards/$cardId"
                        params={{ cardId: o.cardId }}
                        className="font-mono text-[13px] hover:underline"
                      >
                        {o.orderReference}
                      </Link>
                    </td>
                    <td className="px-3 py-2">
                      <CustomerCell customer={L.customer(o.customerId)} />
                    </td>
                    <td className="px-3 py-2">{o.requestedDesign}</td>
                    <td className="px-3 py-2">
                      {o.orderType}
                      {o.replacementReference && (
                        <span className="text-muted-foreground"> · {o.replacementReference}</span>
                      )}
                    </td>
                    <td className="px-3 py-2">{fmtDate(o.requestDate)}</td>
                    <td className="px-3 py-2">
                      <StatusBadge status={o.orderStatus} />
                    </td>
                    <td className="px-3 py-2 text-right">
                      {canManage && b.status === "Draft" && (
                        <Button
                          variant="ghost"
                          className="text-[13px] text-danger hover:underline"
                          onClick={() =>
                            run(
                              () => operations.removeOrderFromBatch(b.id, o.id),
                              "Order returned to eligible queue",
                            )
                          }
                        >
                          Remove
                        </Button>
                      )}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
            {!orders.length && <EmptyState title="No orders in this batch" />}
          </div>
        </div>
        <Panel title="Batch history">
          <ol className="relative space-y-3 border-l pl-4">
            {[...b.history].reverse().map((h, i) => (
              <li key={i} className="relative">
                <span className="absolute -left-[21px] top-1.5 size-2 rounded-full border-2 border-card bg-foreground/40" />
                <div className="text-[14px]">{h.action}</div>
                <div className="text-[12px] text-muted-foreground">
                  {L.empName(h.by)} · {fmtDateTime(h.at)}
                </div>
              </li>
            ))}
          </ol>
          <p className="mt-4 text-[13px] text-muted-foreground">
            PDF contains order references, designs and placeholder customer tokens only. No shipping
            or tracking references are included. Fields are configurable once the manufacturer
            confirms specifications.
          </p>
        </Panel>
      </div>
    </>
  );
}

import { createFileRoute, Link } from "@tanstack/react-router";
import { useState } from "react";
import { Lock } from "lucide-react";
import { useDB } from "@/services/store";
import { operations } from "@/services/api";
import { ActionDialog } from "@/components/dialogs/ActionDialog";
import { Button } from "@/components/ui/button";
import { NoAccess, PageHeader, Panel, SimulatedNote, usePermission } from "@/components/common";
import { FilterSelect } from "@/components/tables/DataTable";
import { CaseTable } from "@/components/tables/RecordTables";
import { StatusBadge } from "@/components/status/StatusBadge";
import { fmtDateTime, fullName, lookup } from "@/lib/format";

export const Route = createFileRoute("/_authenticated/alfie")({
  head: () => ({
    meta: [
      { property: "og:type", content: "website" },
      { name: "twitter:card", content: "summary" },
      { title: "Alfie Operations | Renda Admin" },
      {
        name: "description",
        content: "Operational monitoring for Alfie, Renda's financial intelligence engine.",
      },
      { property: "og:title", content: "Alfie Operations | Renda Admin" },
      { property: "og:description", content: "Alfie operational monitoring." },
    ],
  }),
  component: Alfie,
});

function Alfie() {
  const db = useDB();
  const L = lookup(db);
  const allowed = usePermission("alfie.view");
  const canManage = usePermission("alfie.manage");
  const canCustomer = usePermission("customers.view");
  const sensitive = usePermission("alfie.sensitive");
  const [wf, setWf] = useState("all");
  const [sev, setSev] = useState("all");
  if (!allowed) return <NoAccess what="Alfie operations" />;
  const events = db.alfieEvents.filter(
    (e) => (wf === "all" || e.workflow === wf) && (sev === "all" || e.severity === sev),
  );
  const failed = db.alfieEvents.filter((e) => e.severity !== "Info" && e.status === "Open");
  const cases = db.supportCases.filter((s) => s.category === "Alfie" || s.category === "Savings");
  return (
    <>
      <PageHeader
        title="Alfie"
        subtitle="Operational health of Alfie workflows: subscriptions, savings goals and financial insights."
      />
      <div className="mb-4">
        <SimulatedNote>
          Service health and events are simulated demo data. Alfie does not initiate transactions or
          move funds.
        </SimulatedNote>
      </div>
      <div className="mb-5 grid gap-3 md:grid-cols-2 xl:grid-cols-4">
        {db.alfieServices.map((s) => (
          <div key={s.name} className="panel px-4 py-3">
            <div className="flex items-center justify-between">
              <span className="text-[14px] font-medium">{s.name}</span>
              <StatusBadge status={s.status} />
            </div>
            <div className="mt-2 flex gap-4 text-[13px] text-muted-foreground">
              <span>
                <span className="tabular text-foreground">{s.latencyMs}</span> ms p95
              </span>
              <span>
                <span className="tabular text-foreground">{s.successRate}%</span> success
              </span>
            </div>
          </div>
        ))}
      </div>
      <div className="grid gap-4 xl:grid-cols-[1.6fr_1fr]">
        <Panel
          title="Recent operational events"
          actions={
            <div className="flex gap-2">
              <FilterSelect
                label="Workflow"
                value={wf}
                onChange={setWf}
                options={[
                  "Savings Goals",
                  "Subscription Analysis",
                  "Spending Insights",
                  "Conversation",
                  "Integration",
                ]}
              />
              <FilterSelect
                label="Severity"
                value={sev}
                onChange={setSev}
                options={["Info", "Warning", "Error"]}
              />
            </div>
          }
          bodyClass="p-0"
        >
          <table className="w-full text-[14px]">
            <tbody>
              {events.map((e) => {
                const c = L.customer(e.customerId);
                return (
                  <tr key={e.id} className="border-b last:border-0">
                    <td className="px-4 py-2.5">
                      <StatusBadge status={e.severity} />
                    </td>
                    <td className="py-2.5">
                      <div>{e.description}</div>
                      <div className="text-[13px] text-muted-foreground">
                        {e.workflow}
                        {c && (
                          <>
                            {" "}
                            ·{" "}
                            {canCustomer ? (
                              <Link
                                to="/customers/$customerId"
                                params={{ customerId: c.id }}
                                className="text-primary"
                              >
                                {fullName(c)}
                              </Link>
                            ) : (
                              "Customer (restricted)"
                            )}
                          </>
                        )}
                      </div>
                    </td>
                    <td className="px-3 py-2.5">
                      <StatusBadge status={e.status} />
                      {e.status === "Resolved" && (
                        <div className="mt-1 max-w-56 text-[12px] text-muted-foreground">
                          {L.empName(e.resolvedBy)} · {fmtDateTime(e.resolvedAt)}
                          {e.resolutionNote ? `: ${e.resolutionNote}` : ""}
                        </div>
                      )}
                    </td>
                    <td className="whitespace-nowrap px-4 py-2.5 text-[13px] text-muted-foreground">
                      {fmtDateTime(e.timestamp)}
                    </td>
                    <td className="px-4 py-2.5 text-right">
                      {canManage &&
                        (e.status === "Open" ? (
                          <ActionDialog
                            trigger={
                              <Button size="sm" variant="outline">
                                Resolve
                              </Button>
                            }
                            title="Resolve Alfie event"
                            description="Record what happened so the event can leave the open queue. The note, your name and the time are kept on the event."
                            reasonLabel="Resolution note"
                            minReason={5}
                            onConfirm={(r) => operations.resolveAlfieEvent(e.id, r)}
                            success="Event resolved"
                            confirmLabel="Resolve event"
                          />
                        ) : (
                          <ActionDialog
                            trigger={
                              <Button size="sm" variant="ghost">
                                Reopen
                              </Button>
                            }
                            title="Reopen Alfie event"
                            description="Use this when the issue has come back. The previous resolution stays in the audit log."
                            reasonLabel="Why is this reopening?"
                            minReason={5}
                            onConfirm={(r) => operations.reopenAlfieEvent(e.id, r)}
                            success="Event reopened"
                            confirmLabel="Reopen event"
                          />
                        ))}
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </Panel>
        <div className="space-y-6">
          <Panel title="Failed workflows & customer issues">
            {failed.length ? (
              failed.map((e) => (
                <div key={e.id} className="border-b py-2 last:border-0">
                  <div className="text-[14px]">{e.description}</div>
                  <div className="text-[12px] text-muted-foreground">
                    {e.workflow} · {fmtDateTime(e.timestamp)}
                  </div>
                </div>
              ))
            ) : (
              <p className="text-muted-foreground">No open issues.</p>
            )}
          </Panel>
          <Panel title="Conversation access">
            {sensitive ? (
              <p className="text-[13px]">
                Your role may request conversational context for a specific case. Access is logged
                per request. <span className="text-muted-foreground">(Not enabled in demo.)</span>
              </p>
            ) : (
              <p className="flex items-center gap-2 text-[13px] text-muted-foreground">
                <Lock className="size-3.5" /> Customer conversations are not shown. Your role lacks
                sensitive-context access.
              </p>
            )}
          </Panel>
        </div>
      </div>
      <h2 className="mb-2 mt-6 text-[14px] font-semibold">Related support cases</h2>
      <CaseTable rows={cases} />
    </>
  );
}

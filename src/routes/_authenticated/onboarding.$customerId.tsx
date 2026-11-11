import { createFileRoute, Link } from "@tanstack/react-router";
import { AlertTriangle } from "lucide-react";
import { useDB } from "@/services/store";
import { operations } from "@/services/api";
import { activationBlocker } from "@/services/rules";
import { EmptyState, KV, Mono, NoAccess, PageHeader, Panel, SimulatedNote, usePermission } from "@/components/common";
import { ActionDialog } from "@/components/dialogs/ActionDialog";
import { StatusBadge } from "@/components/status/StatusBadge";
import { Button } from "@/components/ui/button";
import { fmtDateTime, fullName } from "@/lib/format";
import { outstanding } from "./onboarding.index";

export const Route = createFileRoute("/_authenticated/onboarding/$customerId")({
  head: () => ({ meta: [{ property: "og:type", content: "website" }, { name: "twitter:card", content: "summary" }, { title: "Verification case — Renda Admin" }, { name: "description", content: "Customer verification and onboarding case." }, { property: "og:title", content: "Verification case — Renda Admin" }, { property: "og:description", content: "Customer verification case." }] }),
  component: VerificationCase,
});

function VerificationCase() {
  const { customerId } = Route.useParams();
  const db = useDB();
  const allowed = usePermission("kyc.view");
  const canDecide = usePermission("kyc.decide");
  const canBank = usePermission("accounts.manage");
  const canLife = usePermission("customers.lifecycle");
  const c = db.customers.find((x) => x.id === customerId);
  if (!allowed) return <NoAccess what="verification cases" />;
  if (!c) return <div className="panel"><EmptyState title="Case not found" /></div>;
  const k = db.kycCases.find((x) => x.customerId === c.id);
  const timeline = db.activity.filter((a) => a.customerId === c.id && ["Registration", "Verification", "KYC", "Accounts", "Profile"].includes(a.type)).slice().reverse();
  const blocked = c.customerStatus.includes("Failed") || c.kycStatus === "Pending" || c.kycStatus === "Under Review" || c.accountIssuanceStatus === "Pending";
  const reason =
    c.kycStatus === "Pending" ? "KYC Pending — Awaiting identity verification result."
    : c.kycStatus === "Under Review" ? "KYC Under Review — Manual compliance review required."
    : c.kycStatus === "Failed" ? `KYC Failed — ${k?.providerMessages.at(-1) ?? "Verification unsuccessful."}`
    : c.accountIssuanceStatus === "Failed" ? "Account Issuance Failed — Banking provider returned an error."
    : c.accountIssuanceStatus === "Pending" ? "Account Issuance Pending — Awaiting banking provider confirmation."
    : null;
  const eligible = c.kycStatus === "Approved" && c.emailVerified && c.phoneVerified;

  return (
    <>
      <PageHeader
        title={`Verification case · ${fullName(c)}`}
        subtitle={<><Mono>{c.userId}</Mono> · <Link to="/customers/$customerId" params={{ customerId: c.id }} className="text-primary">Open customer profile</Link></>}
        actions={
          <>
            {c.kycStatus === "Pending" && canDecide && <ActionDialog trigger={<Button size="sm" variant="outline">Escalate to manual review</Button>} title="Escalate to manual review" reasonLabel="Documented reason" minReason={10} onConfirm={(r) => operations.escalateKyc(c.id, r)} success="Escalated to manual review" />}
            {c.kycStatus === "Under Review" && canDecide && (
              <>
                <ActionDialog trigger={<Button size="sm" variant="outline">Decline</Button>} title="Decline after manual review" description="Records a compliance decision. The customer will need to resubmit." reasonLabel="Documented reason" minReason={10} destructive onConfirm={(r) => operations.recordKycDecision(c.id, "Failed", r)} success="KYC declined" confirmLabel="Record decline" />
                <ActionDialog trigger={<Button size="sm">Approve</Button>} title="Approve after manual review" description="Authorized manual review decision. This does not activate the customer — account issuance and setup must still complete." reasonLabel="Documented reason (required for audit)" minReason={10} onConfirm={(r) => operations.recordKycDecision(c.id, "Approved", r)} success="KYC approved — audit event recorded" confirmLabel="Record approval" />
              </>
            )}
            {c.kycStatus === "Failed" && canDecide && <ActionDialog trigger={<Button size="sm" variant="outline">Request resubmission</Button>} title="Request document resubmission" description="Failed checks cannot be marked as passed. This returns the case to KYC Pending until the provider returns a new result." simulated onConfirm={() => operations.requestKycResubmission(c.id)} success="Resubmission requested" />}
            {canBank && c.kycStatus === "Approved" && (c.accountIssuanceStatus === "Not Started" || c.accountIssuanceStatus === "Failed") && <ActionDialog trigger={<Button size="sm">{c.accountIssuanceStatus === "Failed" ? "Retry issuance" : "Request account issuance"}</Button>} title="Request Smart Spend & Sense Save issuance" simulated onConfirm={() => operations.requestAccountIssuance(c.id)} success="Issuance requested" />}
            {canBank && c.accountIssuanceStatus === "Pending" && (
              <>
                <ActionDialog trigger={<Button size="sm" variant="outline">Simulate provider error</Button>} title="Simulate issuance failure" simulated="Demo only — records a simulated provider error response." onConfirm={() => operations.simulateIssuanceResult(c.id, false)} success="Simulated failure recorded" />
                <ActionDialog trigger={<Button size="sm">Simulate provider confirmation</Button>} title="Simulate issuance confirmation" simulated="Demo only — records a simulated successful provider response. No real account is opened." onConfirm={() => operations.simulateIssuanceResult(c.id, true)} success="Accounts issued (simulated)" />
              </>
            )}
            {canLife && c.customerStatus === "Setup In Progress" && <ActionDialog trigger={<Button size="sm">Complete setup</Button>} title="Activate customer" description={activationBlocker(c, db.accounts) ?? "All requirements satisfied."} onConfirm={() => operations.completeSetup(c.id)} success="Customer is now Active" />}
          </>
        }
      />
      {reason && blocked && (
        <div className="mb-4 flex items-start gap-2 rounded-md border border-warning/30 bg-warning-soft px-3 py-2.5 text-[14px] text-warning">
          <AlertTriangle className="mt-0.5 size-4 shrink-0" /> <span><strong>Blocked:</strong> {reason}</span>
        </div>
      )}
      <div className="grid gap-6 lg:grid-cols-[1.4fr_1fr]">
        <div className="space-y-6">
          <Panel title="Identity summary">
            <KV cols={3} items={[["Name", fullName(c)], ["Date of birth", c.dateOfBirth], ["Province", c.province], ["Email", <StatusBadge status={c.emailVerified ? "Verified" : "Pending"} />], ["Phone", <StatusBadge status={c.phoneVerified ? "Verified" : "Pending"} />], ["Onboarding", <StatusBadge status={c.onboardingStatus} />]]} />
          </Panel>
          <Panel title="Verification">
            {k ? (
              <>
                <KV cols={3} items={[["Current stage", <StatusBadge status={c.customerStatus} />], ["KYC status", <StatusBadge status={k.status} />], ["Provider", k.provider], ["Provider reference", <Mono>{k.providerReference}</Mono>], ["Initiated", fmtDateTime(k.initiatedAt)], ["Last update", fmtDateTime(k.lastUpdated)]]} />
                <div className="mt-4 grid gap-4 sm:grid-cols-2">
                  <div><div className="eyebrow mb-1">Outstanding requirements</div>{k.outstandingRequirements.length ? <ul className="list-disc pl-4 text-[14px]">{k.outstandingRequirements.map((r) => <li key={r}>{r}</li>)}</ul> : <p className="text-muted-foreground">None</p>}</div>
                  <div><div className="eyebrow mb-1">Provider messages</div><ul className="space-y-1 text-[13px]">{k.providerMessages.map((m, i) => <li key={i} className="rounded bg-secondary px-2 py-1 font-mono text-[12px]">{m}</li>)}</ul></div>
                </div>
                {k.decisionReason && <p className="mt-3 text-[13px]"><span className="eyebrow">Decision reason</span><br />{k.decisionReason}</p>}
              </>
            ) : <p className="text-muted-foreground">KYC not yet initiated. Outstanding: {outstanding(c)}.</p>}
          </Panel>
          <Panel title="Account issuance eligibility">
            <KV cols={3} items={[["Eligible", eligible ? <StatusBadge status="Approved" /> : <StatusBadge status="Not Started" tone="neutral" />], ["Issuance status", <StatusBadge status={c.accountIssuanceStatus} />], ["Next step", outstanding(c)]]} />
            <div className="mt-3"><SimulatedNote>Provider responses in this demo are simulated. No identity provider or banking system is connected.</SimulatedNote></div>
          </Panel>
        </div>
        <Panel title="Case timeline">
          <ol className="relative space-y-3 border-l pl-4">
            {timeline.map((a) => (
              <li key={a.id} className="relative">
                <span className="absolute -left-[21px] top-1.5 size-2 rounded-full border-2 border-card bg-foreground/40" />
                <div className="text-[14px]">{a.description}</div>
                <div className="text-[12px] text-muted-foreground">{fmtDateTime(a.timestamp)}</div>
              </li>
            ))}
          </ol>
        </Panel>
      </div>
    </>
  );
}

import { createFileRoute, Link } from "@tanstack/react-router";
import { useState } from "react";
import { useDB, resetDemo } from "@/services/store";
import { currentEmployee, updateOperationalSettings, updatePreferences } from "@/services/actions";
import { KV, PageHeader, Panel, run, usePermission } from "@/components/common";
import { StatusBadge } from "@/components/status/StatusBadge";
import { ActionDialog } from "@/components/dialogs/ActionDialog";
import { Switch } from "@/components/ui/switch";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";

export const Route = createFileRoute("/settings")({
  head: () => ({ meta: [{ title: "Settings — Renda Operations" }, { name: "description", content: "Organization, preferences and operational configuration." }, { property: "og:title", content: "Settings — Renda Operations" }, { property: "og:description", content: "Operations settings." }] }),
  component: Settings,
});

const STATUS_DEFS = [
  ["Registered", "Account created; email not yet verified."], ["Email Verified", "Email confirmed; onboarding not started."], ["Onboarding In Progress", "Questionnaire underway."],
  ["KYC Pending", "Awaiting identity provider result."], ["KYC Under Review", "Manual compliance review."], ["KYC Failed", "Verification unsuccessful; resubmission required."],
  ["KYC Approved", "Identity verified. Not the same as activation."], ["Account Issuance Pending", "Awaiting banking provider."], ["Account Issuance Failed", "Provider error; retry required."],
  ["Setup In Progress", "Accounts issued; final setup outstanding."], ["Active", "All requirements satisfied."], ["Restricted", "Operations limited pending review."], ["Closed", "Relationship ended."],
];

function Settings() {
  const db = useDB();
  const s = db.settings;
  const me = currentEmployee(db);
  const canOps = usePermission("settings.manage");
  const [kyc, setKyc] = useState(String(s.kycReviewSlaHours));
  const [sup, setSup] = useState(String(s.supportResponseSlaHours));
  const [mfr, setMfr] = useState(s.manufacturerName);
  return (
    <>
      <PageHeader title="Settings" subtitle="Preferences and configuration meaningful to this prototype." />
      <div className="grid gap-4 lg:grid-cols-2">
        <Panel title="Organization"><KV items={[["Organization", s.organizationName], ["Timezone", s.timezone], ["Currency", "CAD"], ["Environment", <StatusBadge status="Demo" tone="info" />]]} /></Panel>
        <Panel title="Employee preferences">
          <KV items={[["Signed in as", me.name], ["Role", me.role]]} />
          <div className="mt-4 flex items-center justify-between"><Label htmlFor="dens">Compact table density</Label><Switch id="dens" checked={s.density === "compact"} onCheckedChange={(v) => updatePreferences({ density: v ? "compact" : "comfortable" })} /></div>
        </Panel>
        <Panel title="Notification preferences">
          {([["notifyKyc", "KYC & onboarding issues"], ["notifySupport", "Support cases & transaction investigations"], ["notifyManufacturing", "Card orders & manufacturing batches"]] as const).map(([k, l]) => (
            <div key={k} className="flex items-center justify-between py-1.5"><Label htmlFor={k}>{l}</Label><Switch id={k} checked={s[k]} onCheckedChange={(v) => updatePreferences({ [k]: v })} /></div>
          ))}
          <p className="mt-2 text-[12px] text-muted-foreground">Controls the in-app notification bell. No emails are sent.</p>
        </Panel>
        <Panel title="Role & permission configuration">
          <p className="text-[13px]">Six initial roles are defined. Review the matrix and assign roles on <Link to="/employees" className="text-primary">Employees &amp; Permissions</Link>.</p>
        </Panel>
        <Panel title="Operational configuration" className="lg:col-span-2" actions={!canOps && <span className="text-[12px] text-muted-foreground">Administrator only</span>}>
          <div className="grid gap-3 sm:grid-cols-3">
            <div className="space-y-1"><Label htmlFor="kyc">KYC review SLA (hours)</Label><Input id="kyc" type="number" value={kyc} onChange={(e) => setKyc(e.target.value)} disabled={!canOps} /></div>
            <div className="space-y-1"><Label htmlFor="sup">Support first-response SLA (hours)</Label><Input id="sup" type="number" value={sup} onChange={(e) => setSup(e.target.value)} disabled={!canOps} /></div>
            <div className="space-y-1"><Label htmlFor="mfr">Manufacturer name (on PDF)</Label><Input id="mfr" value={mfr} onChange={(e) => setMfr(e.target.value)} disabled={!canOps} /></div>
          </div>
          <div className="mt-3 flex items-center justify-between">
            <div className="flex items-center gap-2"><Switch id="ship" checked={s.pdfIncludeShippingReference} disabled={!canOps} onCheckedChange={(v) => run(() => updateOperationalSettings({ pdfIncludeShippingReference: v }), "PDF fields updated")} /><Label htmlFor="ship">Include shipping reference in manufacturing PDF</Label></div>
            <Button size="sm" disabled={!canOps} onClick={() => run(() => updateOperationalSettings({ kycReviewSlaHours: Number(kyc), supportResponseSlaHours: Number(sup), manufacturerName: mfr.trim() || s.manufacturerName }), "Operational settings saved")}>Save configuration</Button>
          </div>
          <p className="mt-3 text-[12px] text-muted-foreground">Batch processing day: Friday (manual). These settings do not modify any real banking infrastructure.</p>
        </Panel>
        <Panel title="Supported status definitions" className="lg:col-span-2" bodyClass="p-0">
          <table className="w-full text-[12.5px]"><tbody>{STATUS_DEFS.map(([k, v]) => <tr key={k} className="border-b last:border-0"><td className="w-56 px-4 py-1.5"><StatusBadge status={k} /></td><td className="px-3 py-1.5 text-muted-foreground">{v}</td></tr>)}</tbody></table>
        </Panel>
        <Panel title="Demo environment" className="lg:col-span-2">
          <div className="flex items-center justify-between gap-3">
            <p className="text-[13px] text-muted-foreground">Data is stored in this browser. Resetting restores the original sample dataset.</p>
            <ActionDialog trigger={<Button variant="outline" size="sm">Reset demo data</Button>} title="Reset demo data?" description="All changes made in this browser will be discarded." destructive confirmLabel="Reset" onConfirm={() => resetDemo()} success="Demo data reset" />
          </div>
        </Panel>
      </div>
    </>
  );
}

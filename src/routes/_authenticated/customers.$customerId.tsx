import { SelectField } from "@/components/ui/select-field";
import { createFileRoute, Link, useNavigate } from "@tanstack/react-router";
import { useState } from "react";
import { ChevronDown, Pencil } from "lucide-react";
import { useDB } from "@/services/store";
import { EDITABLE_FIELDS, type EditableField } from "@/services/contracts/operations";
import { operations } from "@/services/api";
import { activationBlocker } from "@/services/rules";
import { Avatar, EmptyState, KV, Mono, NoAccess, Panel, run, SimulatedNote, usePermission, Amount } from "@/components/common";
import { TabBar } from "@/components/tables/DataTable";
import { CardTable, CaseTable, TransactionTable } from "@/components/tables/RecordTables";
import { StatusBadge, PlanBadge } from "@/components/status/StatusBadge";
import { NewCaseDialog } from "@/components/dialogs/NewCaseDialog";
import { ActionDialog } from "@/components/dialogs/ActionDialog";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Progress } from "@/components/ui/progress";
import { DropdownMenu, DropdownMenuContent, DropdownMenuItem, DropdownMenuSeparator, DropdownMenuTrigger } from "@/components/ui/dropdown-menu";
import { fmtDate, fmtDateTime, fmtMoney, fullName, lookup } from "@/lib/format";
import { CARD_DESIGNS, type CardDesign, type Customer } from "@/types/models";

const TABS = ["Overview", "Personal Information", "Accounts", "Transactions", "Cards", "Membership", "Savings Goals", "Support Cases", "Activity History"] as const;
type Tab = (typeof TABS)[number];

export const Route = createFileRoute("/_authenticated/customers/$customerId")({
  validateSearch: (s: Record<string, unknown>): { tab?: Tab } => ({ tab: TABS.includes(s.tab as Tab) ? (s.tab as Tab) : undefined }),
  head: () => ({ meta: [{ property: "og:type", content: "website" }, { name: "twitter:card", content: "summary" }, { title: "Customer profile — Renda Admin" }, { name: "description", content: "Central customer record across banking, cards, plans and support." }, { property: "og:title", content: "Customer profile — Renda Admin" }, { property: "og:description", content: "Central customer record." }] }),
  component: CustomerProfile,
});

const LIFECYCLE = ["Registered", "Email Verified", "Onboarding", "KYC Approved", "Accounts Issued", "Setup", "Active"];
function lifecycleIndex(c: Customer) {
  if (c.customerStatus === "Active" || c.customerStatus === "Restricted" || c.customerStatus === "Closed") return 6;
  if (c.customerStatus === "Setup In Progress") return 5;
  if (c.accountIssuanceStatus === "Issued") return 4;
  if (c.kycStatus === "Approved") return 3;
  if (c.onboardingStatus !== "Not Started") return 2;
  if (c.emailVerified) return 1;
  return 0;
}

function CustomerProfile() {
  const { customerId } = Route.useParams();
  const { tab = "Overview" } = Route.useSearch();
  const navigate = useNavigate();
  const db = useDB();
  const allowed = usePermission("customers.view");
  const canLifecycle = usePermission("customers.lifecycle");
  const canCase = usePermission("support.manage");
  const c = db.customers.find((x) => x.id === customerId);
  if (!allowed) return <NoAccess what="customer records" />;
  if (!c) return <div className="panel"><EmptyState title="Customer not found" description="This record may have been removed." action={<Link to="/customers" className="text-primary">Back to customers</Link>} /></div>;
  const sub = db.subscriptions.find((s) => s.customerId === c.id);
  const setTab = (t: Tab) => navigate({ to: "/customers/$customerId", params: { customerId }, search: { tab: t }, replace: true });
  const blocker = activationBlocker(c, db.accounts);

  return (
    <>
      <div className="mb-6 border-b pb-7">
        <div className="flex flex-wrap items-start justify-between gap-4">
          <div className="flex items-center gap-3.5">
            <Avatar name={fullName(c)} size="lg" />
            <div>
              <h1 className="text-[28px] font-semibold tracking-normal">{fullName(c)}</h1>
              <div className="mt-1 flex flex-wrap items-center gap-2 text-[13px] text-muted-foreground">
                <Mono>{c.userId}</Mono>
                <span>·</span>
                <StatusBadge status={c.customerStatus} />
                <PlanBadge plan={sub?.plan} />
                <span>·</span>
                <span>Registered {fmtDate(c.registrationDate)}</span>
              </div>
            </div>
          </div>
          <div className="flex flex-wrap items-center gap-2">
            {c.customerStatus === "Setup In Progress" && canLifecycle && (
              <ActionDialog
                trigger={<Button size="sm">Complete setup</Button>}
                title="Activate customer"
                description={blocker ?? "All onboarding, KYC, issuance and setup conditions are satisfied. The customer will become Active."}
                confirmLabel="Activate"
                onConfirm={() => operations.completeSetup(c.id)}
                success="Customer is now Active"
              />
            )}
            <DropdownMenu>
              <DropdownMenuTrigger asChild><Button variant="outline" size="sm">Actions <ChevronDown /></Button></DropdownMenuTrigger>
              <DropdownMenuContent align="end">
                <DropdownMenuItem onClick={() => setTab("Personal Information")}>Edit customer information</DropdownMenuItem>
                <DropdownMenuItem onClick={() => setTab("Accounts")}>Open banking accounts</DropdownMenuItem>
                <DropdownMenuItem onClick={() => setTab("Transactions")}>Review transactions</DropdownMenuItem>
                <DropdownMenuItem onClick={() => setTab("Cards")}>View cards</DropdownMenuItem>
                <DropdownMenuItem onClick={() => setTab("Activity History")}>Activity history</DropdownMenuItem>
                <DropdownMenuSeparator />
                <DropdownMenuItem onClick={() => navigate({ to: "/onboarding/$customerId", params: { customerId } })}>Verification case</DropdownMenuItem>
              </DropdownMenuContent>
            </DropdownMenu>
            {canCase && <NewCaseDialog customerId={c.id} trigger={<Button variant="outline" size="sm">Open support case</Button>} />}
          </div>
        </div>
      </div>
      <TabBar tabs={TABS} value={tab} onChange={setTab} />
      {tab === "Overview" && <OverviewTab c={c} />}
      {tab === "Personal Information" && <PersonalTab c={c} />}
      {tab === "Accounts" && <AccountsTab c={c} />}
      {tab === "Transactions" && <TransactionTable rows={db.transactions.filter((t) => t.customerId === c.id)} showCustomer={false} />}
      {tab === "Cards" && <CardTable rows={db.cards.filter((x) => x.customerId === c.id)} showCustomer={false} />}
      {tab === "Membership" && <MembershipPanel customerId={c.id} />}
      {tab === "Savings Goals" && <GoalsTab c={c} />}
      {tab === "Support Cases" && <CaseTable rows={db.supportCases.filter((s) => s.customerId === c.id)} showCustomer={false} />}
      {tab === "Activity History" && <ActivityTab c={c} />}
    </>
  );
}

function OverviewTab({ c }: { c: Customer }) {
  const db = useDB();
  const accs = db.accounts.filter((a) => a.customerId === c.id);
  const ss = accs.find((a) => a.accountType === "Smart Spend");
  const sv = accs.find((a) => a.accountType === "Sense Save");
  const sub = db.subscriptions.find((s) => s.customerId === c.id);
  const cards = db.cards.filter((x) => x.customerId === c.id);
  const kyc = db.kycCases.find((k) => k.customerId === c.id);
  const open = db.supportCases.filter((s) => s.customerId === c.id && !["Resolved", "Closed"].includes(s.status));
  const idx = lifecycleIndex(c);
  const failed = c.customerStatus.includes("Failed");
  return (
    <div className="space-y-6">
      <Panel title="Customer lifecycle">
        <ol className="flex flex-wrap items-center gap-y-3">
          {LIFECYCLE.map((s, i) => (
            <li key={s} className="flex items-center">
              <span className={`flex items-center gap-2 text-[13px] ${i <= idx ? "text-foreground" : "text-muted-foreground"}`}>
                <span className={`flex size-5 items-center justify-center rounded-full border text-[12px] font-semibold ${i < idx ? "border-foreground bg-foreground text-background" : i === idx ? (failed ? "border-danger text-danger" : "border-primary text-primary") : ""}`}>{i + 1}</span>
                {s}
              </span>
              {i < LIFECYCLE.length - 1 && <span className={`mx-3 h-px w-8 ${i < idx ? "bg-foreground" : "bg-border"}`} />}
            </li>
          ))}
        </ol>
        <p className="mt-3 text-[13px] text-muted-foreground">Current status: <StatusBadge status={c.customerStatus} />{" "}{activationBlocker(c, db.accounts) && c.customerStatus !== "Active" && c.customerStatus !== "Restricted" && c.customerStatus !== "Closed" ? <span className="ml-1">— {activationBlocker(c, db.accounts)}</span> : null}</p>
      </Panel>
      <div className="customer-summary grid divide-y overflow-hidden rounded-lg border bg-card md:grid-cols-2 xl:grid-cols-3">
        <Panel title="Registration & verification"><KV cols={1} items={[["Email", <StatusBadge status={c.emailVerified ? "Verified" : "Unverified"} />], ["Phone", <StatusBadge status={c.phoneVerified ? "Verified" : "Unverified"} />], ["Onboarding", <StatusBadge status={c.onboardingStatus} />]]} /></Panel>
        <Panel title="KYC" actions={<Link to="/onboarding/$customerId" params={{ customerId: c.id }} className="text-[13px] text-primary">Case →</Link>}><KV cols={1} items={[["Status", <StatusBadge status={c.kycStatus} />], ["Provider ref", kyc ? <Mono>{kyc.providerReference}</Mono> : "—"], ["Last update", fmtDateTime(kyc?.lastUpdated)]]} /></Panel>
        <Panel title="Smart Spend">{ss ? <KV cols={1} items={[["Status", <StatusBadge status={ss.accountStatus} />], ["Account", ss.maskedAccountIdentifier ?? "Pending"], ["Available", fmtMoney(ss.availableBalance)]]} /> : <p className="text-muted-foreground">Not issued</p>}</Panel>
        <Panel title="Sense Save">{sv ? <KV cols={1} items={[["Status", <StatusBadge status={sv.accountStatus} />], ["Account", sv.maskedAccountIdentifier ?? "Pending"], ["Available", fmtMoney(sv.availableBalance)]]} /> : <p className="text-muted-foreground">Not issued</p>}</Panel>
        <Panel title="Current plan"><KV cols={1} items={[["Plan", <PlanBadge plan={sub?.plan} />], ["Status", sub ? <StatusBadge status={sub.subscriptionStatus} /> : "—"], ["Monthly fee", sub ? fmtMoney(sub.monthlyPrice) : "—"]]} /></Panel>
        <Panel title="Cards"><KV cols={1} items={[["Total", cards.length], ["Active", cards.filter((x) => x.cardStatus === "Active").length], ["In fulfillment", cards.filter((x) => x.cardStatus === "Awaiting Manufacturing" || x.cardStatus === "In Production").length]]} /></Panel>
        <Panel title="Open support cases" className="md:col-span-2">
          {open.length === 0 ? <p className="text-muted-foreground">No open cases.</p> : (
            <ul className="space-y-1.5">{open.map((s) => <li key={s.id}><Link to="/support/$caseId" params={{ caseId: s.id }} className="flex items-center gap-2 hover:underline"><Mono>{s.caseReference}</Mono><span className="truncate">{s.subject}</span><StatusBadge status={s.status} /></Link></li>)}</ul>
          )}
        </Panel>
      </div>
    </div>
  );
}

const LABELS: Record<string, string> = {
  firstName: "First name", lastName: "Last name", email: "Email address", phone: "Phone number", address: "Residential address", city: "City", province: "Province",
  postalCode: "Postal code", dateOfBirth: "Date of birth", maritalStatus: "Marital status", employmentType: "Employment type", occupation: "Occupation", industry: "Industry", annualIncome: "Annual income",
};

function PersonalTab({ c }: { c: Customer }) {
  const canEdit = usePermission("customers.edit");
  const [editing, setEditing] = useState(false);
  const [form, setForm] = useState<Record<EditableField, string>>(() => Object.fromEntries(EDITABLE_FIELDS.map((k) => [k, String(c[k])])) as Record<EditableField, string>);
  const [errors, setErrors] = useState<Record<string, string>>({});

  const validate = () => {
    const e: Record<string, string> = {};
    if (!form.firstName.trim()) e.firstName = "Required";
    if (!form.lastName.trim()) e.lastName = "Required";
    if (!/^[^@\s]+@[^@\s]+\.[^@\s]+$/.test(form.email)) e.email = "Enter a valid email address";
    if (form.phone.replace(/\D/g, "").length < 10) e.phone = "Enter a valid phone number";
    if (!/^[A-Z]{2}$/.test(form.province)) e.province = "Use a 2-letter province code";
    if (isNaN(Number(form.annualIncome)) || Number(form.annualIncome) < 0) e.annualIncome = "Enter a positive number";
    setErrors(e);
    return !Object.keys(e).length;
  };
  const save = async () => {
    if (!validate()) return;
    const patch = { ...form, annualIncome: Number(form.annualIncome) };
    if (await run(() => operations.updateCustomer(c.id, patch), "Customer information updated — audit event recorded")) setEditing(false);
  };

  if (!editing) {
    return (
      <Panel title="Personal information" actions={canEdit ? <Button size="sm" variant="outline" onClick={() => setEditing(true)}><Pencil /> Edit</Button> : <span className="text-[13px] text-muted-foreground">Read-only for your role</span>}>
        <KV cols={3} items={[
          ["First name", c.firstName], ["Last name", c.lastName], ["Email address", c.email], ["Phone number", c.phone],
          ["Residential address", c.address], ["City", c.city], ["Province", c.province], ["Postal code", c.postalCode],
          ["Date of birth", fmtDate(c.dateOfBirth)], ["Marital status", c.maritalStatus], ["Employment type", c.employmentType],
          ["Occupation", c.occupation], ["Industry", c.industry], ["Annual income", fmtMoney(c.annualIncome)],
        ]} />
        <p className="mt-4 text-[13px] text-muted-foreground">Passwords, authentication PINs, biometric credentials and security answers are never displayed.</p>
      </Panel>
    );
  }
  return (
    <Panel title="Edit personal information">
      <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-3">
        {EDITABLE_FIELDS.map((k) => (
          <div key={k} className="space-y-1">
            <Label htmlFor={k}>{LABELS[k]}</Label>
            <Input id={k} value={form[k]} onChange={(e) => setForm({ ...form, [k]: e.target.value })} aria-invalid={!!errors[k]} />
            {errors[k] && <p className="text-[13px] text-danger">{errors[k]}</p>}
          </div>
        ))}
        <div className="space-y-1">
          <Label>Date of birth</Label>
          <Input value={fmtDate(c.dateOfBirth)} disabled />
          <p className="text-[12px] text-muted-foreground">Identity field — changes require KYC re-verification.</p>
        </div>
      </div>
      <p className="mt-3 text-[13px] text-muted-foreground">Changing email or phone resets its verification status.</p>
      <div className="mt-4 flex gap-2">
        <Button onClick={save}>Save changes</Button>
        <Button variant="outline" onClick={() => { setEditing(false); setErrors({}); }}>Cancel</Button>
      </div>
    </Panel>
  );
}

function AccountsTab({ c }: { c: Customer }) {
  const db = useDB();
  const accs = db.accounts.filter((a) => a.customerId === c.id);
  if (!accs.length) return <div className="panel"><EmptyState title="No banking accounts" description="Accounts are issued after KYC approval." /></div>;
  return (
    <div className="grid gap-4 md:grid-cols-2">
      {accs.map((a) => {
        const recent = db.transactions.filter((t) => t.accountId === a.id).slice(0, 4);
        return (
          <Panel key={a.id} title={a.accountType} actions={<Link to="/accounts/$accountId" params={{ accountId: a.id }} className="text-[13px] font-medium text-primary">Open account →</Link>}>
            <KV items={[["Account", a.maskedAccountIdentifier ?? "Pending"], ["Status", <StatusBadge status={a.accountStatus} />], ["Opened", fmtDate(a.openingDate)], ["Available balance", fmtMoney(a.availableBalance)], ["Restrictions", a.restrictions.length ? a.restrictions.join("; ") : "None"]]} />
            <div className="mt-4 border-t pt-3">
              <div className="eyebrow mb-2">Recent activity</div>
              {recent.length ? recent.map((t) => (
                <Link key={t.id} to="/transactions/$transactionId" params={{ transactionId: t.id }} className="flex justify-between py-1 text-[13px] hover:underline">
                  <span className="truncate">{t.description}</span><Amount value={t.amount} direction={t.direction} />
                </Link>
              )) : <p className="text-[13px] text-muted-foreground">No transactions yet.</p>}
            </div>
          </Panel>
        );
      })}
    </div>
  );
}

export function MembershipPanel({ customerId }: { customerId: string }) {
  const db = useDB();
  const L = lookup(db);
  const canManage = usePermission("subscriptions.manage");
  const canCard = usePermission("cards.replace");
  const [design, setDesign] = useState<CardDesign>("Classic");
  const sub = db.subscriptions.find((s) => s.customerId === customerId);
  if (!sub) return <div className="panel"><EmptyState title="No subscription" description="A plan is selected once accounts are issued and setup begins." /></div>;
  const physical = db.cards.filter((x) => x.customerId === customerId && x.cardType === "Physical");
  const billing = db.transactions.filter((t) => t.customerId === customerId && t.transactionType === "Plan Fee");
  const target = sub.plan === "Plus" ? "Everyday" : "Plus";
  return (
    <div className="grid gap-6 lg:grid-cols-[1.2fr_1fr]">
      <div className="space-y-6">
        <Panel title="Current membership" actions={canManage && sub.subscriptionStatus !== "Canceled" && (
          <ActionDialog trigger={<Button size="sm" variant="outline">{target === "Plus" ? "Upgrade to Plus" : "Downgrade to Everyday"}</Button>} title={`Change plan to Renda ${target}`} description={target === "Plus" ? "Renda Plus is CAD $9.96/month. Billing remains pending until the billing outcome is recorded. A physical card selection will be required if none exists." : "Downgrading removes the monthly fee. Existing physical cards are unaffected."} reasonLabel="Note (reason for change)" minReason={5} simulated onConfirm={(r) => operations.changePlan(customerId, target, r)} success={`Plan changed to ${target}`} confirmLabel="Change plan" />
        )}>
          <KV cols={3} items={[["Plan", <PlanBadge plan={sub.plan} />], ["Status", <StatusBadge status={sub.subscriptionStatus} />], ["Monthly fee", `${fmtMoney(sub.monthlyPrice)} ${sub.currency}`], ["Start date", fmtDate(sub.startDate)], ["Next billing", fmtDate(sub.nextBillingDate)], ["Latest billing", <StatusBadge status={sub.latestBillingStatus} />]]} />
        </Panel>
        <Panel title="Card selection & setup requirements">
          {sub.cardSelectionRequired ? (
            <div className="space-y-3">
              <p className="text-[14px]"><StatusBadge status="Pending" /> <span className="ml-1">Physical card design not yet selected by the customer.</span></p>
              {canCard ? (
                <div className="flex flex-wrap items-end gap-2">
                  <div className="space-y-1">
                    <Label htmlFor="design">Customer's selected design</Label>
                    <SelectField id="design" value={design} onChange={(e) => setDesign(e.target.value as CardDesign)} className="h-9 rounded-md border bg-card px-2">{CARD_DESIGNS.map((d) => <option key={d}>{d}</option>)}</SelectField>
                  </div>
                  <Button onClick={() => run(() => operations.recordCardSelection(customerId, design), `${design} card order created`)}>Record selection & create order</Button>
                </div>
              ) : <p className="text-[13px] text-muted-foreground">Your role cannot record card selections.</p>}
              <p className="text-[13px] text-muted-foreground">Record only a design the customer confirmed. Duplicate initial orders are blocked.</p>
            </div>
          ) : physical.length ? (
            <ul className="space-y-1">{physical.map((p) => <li key={p.id}><Link to="/cards/$cardId" params={{ cardId: p.id }} className="hover:underline">{p.cardDesign} •••• {p.last4}</Link> <StatusBadge status={p.cardStatus} /></li>)}</ul>
          ) : <p className="text-muted-foreground">{sub.plan === "Everyday" ? "Everyday members receive a virtual card." : "No outstanding requirements."}</p>}
        </Panel>
        <Panel title="Billing records">
          {billing.length ? billing.map((t) => <Link key={t.id} to="/transactions/$transactionId" params={{ transactionId: t.id }} className="flex justify-between py-1 hover:underline"><span>{fmtDate(t.timestamp)} · {t.description}</span><span className="flex gap-2"><Amount value={t.amount} /> <StatusBadge status={t.status} /></span></Link>) : <p className="text-muted-foreground">No billing records in the demo dataset.</p>}
        </Panel>
      </div>
      <Panel title="Plan history">
        <ol className="space-y-3">
          {[...sub.history].reverse().map((h, i) => (
            <li key={i} className="border-l-2 pl-3">
              <div className="text-[14px] font-medium">{h.from ? `${h.from} → ${h.to}` : `Started on ${h.to}`}</div>
              <div className="text-[13px] text-muted-foreground">{fmtDateTime(h.at)} · {L.empName(h.by)}</div>
              <div className="text-[13px]">{h.note}</div>
            </li>
          ))}
        </ol>
        {sub.latestBillingStatus === "Pending" && <div className="mt-4"><SimulatedNote>Billing outcome pending. Record it from Plans &amp; Subscriptions.</SimulatedNote></div>}
      </Panel>
    </div>
  );
}

function GoalsTab({ c }: { c: Customer }) {
  const db = useDB();
  const goals = db.goals.filter((g) => g.customerId === c.id);
  if (!goals.length) return <div className="panel"><EmptyState title="No savings goals" description="Customers create goals with Alfie in the Renda app." /></div>;
  return (
    <div className="grid gap-4 md:grid-cols-2 xl:grid-cols-3">
      {goals.map((g) => (
        <Panel key={g.id} title={g.goalName} actions={<StatusBadge status={g.status} />}>
          <div className="mb-2 flex justify-between text-[13px]"><span>{g.currentAmount == null ? "Progress unavailable" : fmtMoney(g.currentAmount)}</span><span className="text-muted-foreground">of {fmtMoney(g.targetAmount)}</span></div>
          <Progress value={g.currentAmount == null ? 0 : (g.currentAmount / g.targetAmount) * 100} className="h-1.5" />
          <p className="mt-3 text-[13px] text-muted-foreground">Created {fmtDate(g.createdAt)} · Sense Save</p>
        </Panel>
      ))}
    </div>
  );
}

function ActivityTab({ c }: { c: Customer }) {
  const db = useDB();
  const [type, setType] = useState("all");
  const [days, setDays] = useState("all");
  const ev = db.activity.filter((a) => a.customerId === c.id && (type === "all" || a.type === type) && (days === "all" || Date.now() - new Date(a.timestamp).getTime() <= Number(days) * 864e5));
  return (
    <Panel title="Activity history" actions={
      <div className="flex gap-2">
        <SelectField aria-label="Event type" value={type} onChange={(e) => setType(e.target.value)} className="h-10 w-auto max-w-full rounded-md border bg-card px-3 text-[13px]"><option value="all">All events</option>{["Registration", "Verification", "KYC", "Accounts", "Membership", "Cards", "Support", "Profile"].map((t) => <option key={t}>{t}</option>)}</SelectField>
        <SelectField aria-label="Date range" value={days} onChange={(e) => setDays(e.target.value)} className="h-10 w-auto max-w-full rounded-md border bg-card px-3 text-[13px]"><option value="all">Any time</option><option value="7">Last 7 days</option><option value="30">Last 30 days</option></SelectField>
      </div>
    }>
      {ev.length === 0 ? <EmptyState title="No events" /> : (
        <ol className="relative space-y-3 border-l pl-4">
          {ev.map((a) => (
            <li key={a.id} className="relative">
              <span className="absolute -left-[21px] top-1.5 size-2 rounded-full border-2 border-card bg-foreground/40" />
              <div className="flex flex-wrap items-baseline gap-2">
                <span className="rounded bg-secondary px-1.5 text-[12px] text-muted-foreground">{a.type}</span>
                {a.link ? <Link to={a.link.to} params={a.link.params} className="text-[14px] hover:underline">{a.description}</Link> : <span className="text-[14px]">{a.description}</span>}
              </div>
              <div className="text-[12px] text-muted-foreground">{fmtDateTime(a.timestamp)}</div>
            </li>
          ))}
        </ol>
      )}
    </Panel>
  );
}

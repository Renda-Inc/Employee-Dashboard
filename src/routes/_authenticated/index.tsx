import { SelectField } from "@/components/ui/select-field";
import { createFileRoute, Link, useNavigate } from "@tanstack/react-router";
import { useEffect, useMemo, useState } from "react";
import { Bar, BarChart, ResponsiveContainer, Tooltip, XAxis, YAxis } from "recharts";
import { ArrowRight, Users, UserCheck, ShieldCheck, BadgeCheck, LifeBuoy, Clock3 } from "lucide-react";
import { useDB } from "@/services/store";
import { attentionQueue } from "@/services/selectors";
import { PageHeader, Panel, EmptyState } from "@/components/common";
import { StatusBadge } from "@/components/status/StatusBadge";
import { fullName, relTime } from "@/lib/format";
import { Button } from "@/components/ui/button";
import { cn } from "@/lib/utils";

export const Route = createFileRoute("/_authenticated/")({
  head: () => ({
    meta: [{ property: "og:type", content: "website" }, { name: "twitter:card", content: "summary" }, 
      { title: "Overview — Renda Admin" },
      { name: "description", content: "Customer activity, banking operations and outstanding tasks at a glance." },
      { property: "og:title", content: "Overview — Renda Admin" },
      { property: "og:description", content: "Customer activity, banking operations and outstanding tasks at a glance." },
    ],
  }),
  component: Overview,
});

const STAGES = [
  ["Registered", ["Registered", "Email Verification Pending", "Email Verified"]],
  ["Onboarding", ["Onboarding In Progress"]],
  ["KYC", ["KYC Pending", "KYC Under Review", "KYC Failed"]],
  ["Issuance", ["KYC Approved", "Account Issuance Pending", "Account Issuance Failed"]],
  ["Setup", ["Setup In Progress"]],
  ["Active", ["Active"]],
] as const;

function Overview() {
  const db = useDB();
  const navigate = useNavigate();
  const [today, setToday] = useState("");
  const [range, setRange] = useState<"7" | "30" | "all">("30");
  useEffect(() => setToday(new Date().toLocaleDateString(undefined, { weekday: "long", year: "numeric", month: "long", day: "numeric" })), []);

  const kpis = useMemo(() => {
    const c = db.customers;
    const plus = db.subscriptions.filter((s) => s.plan === "Plus" && s.subscriptionStatus !== "Canceled").length;
    return [
      { label: "Total customers", value: c.length, note: "All registered customer records" },
      { label: "Active customers", value: c.filter((x) => x.customerStatus === "Active").length, note: "Onboarding, issuance and setup complete" },
      { label: "Onboarding in progress", value: c.filter((x) => ["Registered", "Email Verification Pending", "Email Verified", "Onboarding In Progress", "Setup In Progress"].includes(x.customerStatus)).length, note: "Registered but not yet active" },
      { label: "KYC pending", value: c.filter((x) => x.kycStatus === "Pending" || x.kycStatus === "Under Review").length, note: `${c.filter((x) => x.kycStatus === "Under Review").length} in manual review` },
      { label: "Active Renda Plus", value: plus, note: `${db.subscriptions.filter((s) => s.cardSelectionRequired).length} awaiting card selection` },
      { label: "Open support cases", value: db.supportCases.filter((s) => !["Resolved", "Closed"].includes(s.status)).length, note: `${db.supportCases.filter((s) => s.status === "Escalated").length} escalated` },
    ];
  }, [db]);

  const queue = attentionQueue(db);
  const since = range === "all" ? 0 : Date.now() - Number(range) * 864e5;
  const feed = db.activity.filter((a) => new Date(a.timestamp).getTime() >= since).slice(0, 14);
  const stageData = STAGES.map(([label, sts]) => ({ label, count: db.customers.filter((c) => (sts as readonly string[]).includes(c.customerStatus)).length }));
  const cardStages = [
    { label: "Eligible", count: db.cardOrders.filter((o) => o.orderStatus === "Eligible").length },
    { label: "Batched", count: db.cardOrders.filter((o) => o.orderStatus === "Batched").length },
    { label: "Submitted", count: db.cardOrders.filter((o) => o.orderStatus === "Submitted").length },
    { label: "Delivered", count: db.cardOrders.filter((o) => o.orderStatus === "Delivered").length },
  ];

  return (
    <>
      <PageHeader
        title="Overview"
        subtitle="Monitor customer activity, banking operations, and outstanding tasks."
        actions={
          <>
            <span className="text-[13px] text-muted-foreground">{today}</span>
            <SelectField aria-label="Activity period" value={range} onChange={(e) => setRange(e.target.value as typeof range)} className="h-10 w-auto max-w-full rounded-md border bg-card px-3 text-[13px]">
              <option value="7">Activity: last 7 days</option>
              <option value="30">Activity: last 30 days</option>
              <option value="all">Activity: all time</option>
            </SelectField>
          </>
        }
      />
      <div className="mb-8 grid grid-cols-1 gap-4 sm:grid-cols-2 xl:grid-cols-3 2xl:grid-cols-6">
        {kpis.map((k, i) => (
          <div key={k.label} className="panel min-w-0 px-5 py-5">
            <div className="flex items-center justify-between gap-2 text-[14px] text-muted-foreground"><span>{k.label}</span>{(() => { const Icon = [Users, UserCheck, Clock3, ShieldCheck, BadgeCheck, LifeBuoy][i]; return Icon ? <Icon className="size-4 shrink-0" /> : null; })()}</div>
            <div className="mt-1 text-[32px] font-semibold tabular tracking-normal">{k.value}</div>
            <div className="mt-2 text-[13px] text-muted-foreground">{k.note}</div>
          </div>
        ))}
      </div>

      <div className="grid gap-6 2xl:grid-cols-[1.45fr_1fr]">
        <Panel title={<>Requires attention <span className="ml-1 rounded bg-secondary px-1.5 text-[12px] tabular text-muted-foreground">{queue.length}</span></>} bodyClass="p-0">
          {queue.length === 0 ? <EmptyState title="Nothing requires attention" /> : (
            <div className="max-h-[460px] overflow-auto">
              <table className="w-full text-[14px]">
                <tbody>
                  {queue.map((q) => (
                    <tr key={q.id} tabIndex={0} onKeyDown={(e) => { if (e.key === "Enter") navigate({ to: q.to, params: q.params }); }} className="cursor-pointer border-b last:border-0 hover:bg-secondary/60" onClick={() => navigate({ to: q.to, params: q.params })}>
                      <td className="py-2 pl-4 pr-2">
                        <span className={cn("inline-block size-1.5 rounded-full", q.tone === "danger" ? "bg-danger" : q.tone === "warning" ? "bg-warning" : "bg-info")} />
                      </td>
                      <td className="px-2 py-2">
                        <div className="font-medium">{q.type}</div>
                        <div className="min-w-[210px] max-w-[340px] text-[13px] text-muted-foreground">{q.detail}</div>
                      </td>
                      <td className="min-w-[130px] px-4 py-2 text-[13px]">{q.record}</td>
                      <td className="whitespace-nowrap px-2 py-2 text-[13px] text-muted-foreground">{relTime(q.at)}</td>
                      <td className="whitespace-nowrap py-2 pl-2 pr-4 text-right text-[13px] font-medium text-primary">{q.action} <ArrowRight className="inline size-3" /></td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}
        </Panel>

        <Panel title="Recent activity" bodyClass="p-0">
          {feed.length === 0 ? <EmptyState title="No activity in this period" /> : (
            <ol className="max-h-[460px] overflow-auto">
              {feed.map((a) => {
                const c = db.customers.find((x) => x.id === a.customerId);
                return (
                  <li key={a.id} className="flex gap-3 border-b px-6 py-4 last:border-0">
                    <span className="mt-1.5 size-1.5 shrink-0 rounded-full bg-foreground/30" />
                    <div className="min-w-0 flex-1">
                      {a.link ? <Link to={a.link.to} params={a.link.params} className="block text-[14px] hover:underline">{a.description}</Link> : <div className="text-[14px]">{a.description}</div>}
                      {c && <Link to="/customers/$customerId" params={{ customerId: c.id }} className="text-[13px] text-muted-foreground hover:text-foreground">{fullName(c)} · {c.userId}</Link>}
                    </div>
                    <span className="shrink-0 text-[12px] text-muted-foreground">{relTime(a.timestamp)}</span>
                  </li>
                );
              })}
            </ol>
          )}
        </Panel>
      </div>

      <div className="mt-6 grid gap-6 xl:grid-cols-2">
        <Panel title="Customers by lifecycle stage">
          <div className="h-60">
            <ResponsiveContainer>
              <BarChart data={stageData} margin={{ left: -24, right: 8 }}>
                <XAxis dataKey="label" tickLine={false} axisLine={false} fontSize={13} interval={0} />
                <YAxis allowDecimals={false} tickLine={false} axisLine={false} fontSize={13} />
                <Tooltip cursor={{ fill: "var(--color-secondary)" }} contentStyle={{ fontSize: 14, background: "var(--card)", color: "var(--foreground)", borderRadius: 6, border: "1px solid var(--color-border)" }} />
                <Bar dataKey="count" name="Customers" fill="var(--color-chart-2)" radius={[3, 3, 0, 0]} />
              </BarChart>
            </ResponsiveContainer>
          </div>
        </Panel>
        <Panel title="Physical card orders by fulfillment stage" actions={<Link to="/cards/manufacturing" className="text-[13px] font-medium text-primary">Manufacturing →</Link>}>
          <div className="grid grid-cols-2 gap-6 sm:grid-cols-4">
            {cardStages.map((s) => (
              <div key={s.label} className="border-l px-4 py-3">
                <StatusBadge status={s.label} />
                <div className="mt-2 text-[30px] font-semibold tabular">{s.count}</div>
              </div>
            ))}
          </div>
          <p className="mt-3 text-[13px] text-muted-foreground">Counts update as orders are batched and submissions are recorded.</p>
        </Panel>
      </div>
    </>
  );
}

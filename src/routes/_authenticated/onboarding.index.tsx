import { createFileRoute, useNavigate } from "@tanstack/react-router";
import { useMemo, useState } from "react";
import { useDB } from "@/services/store";
import { CustomerCell, Mono, NoAccess, PageHeader, usePermission } from "@/components/common";
import { DataTable, SearchInput, TabBar, type Column } from "@/components/tables/DataTable";
import { StatusBadge } from "@/components/status/StatusBadge";
import { fmtDate, fmtDateTime, fullName } from "@/lib/format";
import type { Customer, DB } from "@/types/models";

export const Route = createFileRoute("/_authenticated/onboarding/")({
  head: () => ({
    meta: [
      { property: "og:type", content: "website" },
      { name: "twitter:card", content: "summary" },
      { title: "Onboarding & KYC | Renda Admin" },
      { name: "description", content: "Verification and onboarding queue." },
      { property: "og:title", content: "Onboarding & KYC | Renda Admin" },
      { property: "og:description", content: "Verification and onboarding queue." },
    ],
  }),
  component: Onboarding,
});

const TABS = [
  "All Cases",
  "Email Verification",
  "Phone Verification",
  "Onboarding Incomplete",
  "KYC Pending",
  "KYC Under Review",
  "KYC Failed",
  "Account Issuance",
] as const;
type Tab = (typeof TABS)[number];

export function outstanding(c: Customer): string {
  if (!c.emailVerified) return "Email verification";
  if (!c.phoneVerified) return "Phone verification";
  if (c.onboardingStatus === "In Progress" || c.onboardingStatus === "Not Started")
    return "Complete onboarding questionnaire";
  if (c.kycStatus === "Pending") return "Awaiting identity verification result";
  if (c.kycStatus === "Under Review") return "Manual compliance review";
  if (c.kycStatus === "Failed") return "Resubmit identity documents";
  if (c.accountIssuanceStatus === "Not Started") return "Request account issuance";
  if (c.accountIssuanceStatus === "Pending") return "Awaiting banking provider";
  if (c.accountIssuanceStatus === "Failed") return "Retry issuance. Provider error";
  if (c.customerStatus === "Setup In Progress") return "Complete setup";
  return "-";
}

const match = (t: Tab, c: Customer) => {
  switch (t) {
    case "All Cases":
      return (
        c.customerStatus !== "Active" &&
        c.customerStatus !== "Closed" &&
        c.customerStatus !== "Restricted"
      );
    case "Email Verification":
      return !c.emailVerified;
    case "Phone Verification":
      return c.emailVerified && !c.phoneVerified;
    case "Onboarding Incomplete":
      return (
        c.onboardingStatus === "In Progress" ||
        c.onboardingStatus === "Blocked" ||
        (c.emailVerified && c.onboardingStatus === "Not Started")
      );
    case "KYC Pending":
      return c.kycStatus === "Pending";
    case "KYC Under Review":
      return c.kycStatus === "Under Review";
    case "KYC Failed":
      return c.kycStatus === "Failed";
    case "Account Issuance":
      return c.kycStatus === "Approved" && c.accountIssuanceStatus !== "Issued";
  }
};

function Onboarding() {
  const db: DB = useDB();
  const navigate = useNavigate();
  const allowed = usePermission("kyc.view");
  const [tab, setTab] = useState<Tab>("All Cases");
  const [q, setQ] = useState("");
  const counts = Object.fromEntries(
    TABS.map((t) => [t, db.customers.filter((c) => match(t, c)).length]),
  ) as Record<Tab, number>;
  const rows = useMemo(
    () =>
      db.customers.filter(
        (c) =>
          match(tab, c) &&
          (!q || `${fullName(c)} ${c.userId}`.toLowerCase().includes(q.toLowerCase())),
      ),
    [db, tab, q],
  );
  if (!allowed) return <NoAccess what="onboarding and KYC cases" />;
  const cols: Column<Customer>[] = [
    {
      key: "c",
      header: "Customer",
      cell: (c) => <CustomerCell customer={c} />,
      sort: (c) => fullName(c),
    },
    { key: "u", header: "User ID", cell: (c) => <Mono>{c.userId}</Mono> },
    {
      key: "r",
      header: "Registered",
      cell: (c) => fmtDate(c.registrationDate),
      sort: (c) => c.registrationDate,
    },
    {
      key: "e",
      header: "Email",
      cell: (c) => <StatusBadge status={c.emailVerified ? "Verified" : "Pending"} />,
    },
    {
      key: "p",
      header: "Phone",
      cell: (c) => (
        <StatusBadge
          status={c.phoneVerified ? "Verified" : c.emailVerified ? "Pending" : "Not Started"}
        />
      ),
    },
    {
      key: "k",
      header: "KYC",
      cell: (c) => <StatusBadge status={c.kycStatus} />,
      sort: (c) => c.kycStatus,
    },
    {
      key: "s",
      header: "Current stage",
      cell: (c) => <StatusBadge status={c.customerStatus} />,
      sort: (c) => c.customerStatus,
    },
    {
      key: "o",
      header: "Outstanding requirement",
      cell: (c) => <span className="text-muted-foreground">{outstanding(c)}</span>,
    },
    {
      key: "l",
      header: "Last updated",
      cell: (c) => <span className="text-muted-foreground">{fmtDateTime(c.updatedAt)}</span>,
      sort: (c) => c.updatedAt,
    },
    {
      key: "a",
      header: "",
      className: "text-right",
      cell: () => <span className="text-[13px] font-medium text-primary">Open →</span>,
    },
  ];
  return (
    <>
      <PageHeader
        title="Onboarding & KYC"
        subtitle="Track verification progress and resolve blocked onboarding."
      />
      <TabBar tabs={TABS} value={tab} onChange={setTab} counts={counts} />
      <DataTable
        rows={rows}
        columns={cols}
        rowKey={(c) => c.id}
        defaultSort={{ key: "l", dir: "desc" }}
        onRowClick={(c) =>
          navigate({ to: "/onboarding/$customerId", params: { customerId: c.id } })
        }
        emptyTitle="No cases in this queue"
        toolbar={<SearchInput value={q} onChange={setQ} placeholder="Search name or user ID" />}
      />
    </>
  );
}

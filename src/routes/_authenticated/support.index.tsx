import { SelectField } from "@/components/ui/select-field";
import { createFileRoute } from "@tanstack/react-router";
import { useState } from "react";
import { Plus } from "lucide-react";
import { useDB } from "@/services/store";
import { currentEmployee } from "@/services/actions";
import { NoAccess, PageHeader, usePermission } from "@/components/common";
import { FilterSelect, SearchInput, TabBar } from "@/components/tables/DataTable";
import { CaseTable } from "@/components/tables/RecordTables";
import { NewCaseDialog } from "@/components/dialogs/NewCaseDialog";
import { Button } from "@/components/ui/button";
import { fullName, lookup } from "@/lib/format";

export const Route = createFileRoute("/_authenticated/support/")({
  head: () => ({
    meta: [
      { property: "og:type", content: "website" },
      { name: "twitter:card", content: "summary" },
      { title: "Customer Support — Renda Admin" },
      { name: "description", content: "Receive, investigate, assign and resolve customer cases." },
      { property: "og:title", content: "Customer Support — Renda Admin" },
      { property: "og:description", content: "Customer support cases." },
    ],
  }),
  component: Support,
});

const TABS = [
  "All",
  "Open",
  "In Progress",
  "Awaiting Customer",
  "Escalated",
  "Resolved",
  "Closed",
] as const;
type Tab = (typeof TABS)[number];

function Support() {
  const db = useDB();
  const L = lookup(db);
  const allowed = usePermission("support.view");
  const canManage = usePermission("support.manage");
  const me = currentEmployee(db);
  const [tab, setTab] = useState<Tab>("All");
  const [q, setQ] = useState("");
  const [pr, setPr] = useState("all");
  const [cat, setCat] = useState("all");
  const [as, setAs] = useState("all");
  const [days, setDays] = useState("all");
  if (!allowed) return <NoAccess what="support cases" />;
  const rows = db.supportCases.filter((s) => {
    const c = L.customer(s.customerId);
    if (tab !== "All" && s.status !== tab) return false;
    if (
      q &&
      !`${s.caseReference} ${s.subject} ${c ? fullName(c) : ""}`
        .toLowerCase()
        .includes(q.toLowerCase())
    )
      return false;
    if (pr !== "all" && s.priority !== pr) return false;
    if (cat !== "all" && s.category !== cat) return false;
    if (as === "Me" && s.assignedEmployeeId !== me.id) return false;
    if (as === "Unassigned" && s.assignedEmployeeId) return false;
    if (
      as !== "all" &&
      as !== "Me" &&
      as !== "Unassigned" &&
      L.empName(s.assignedEmployeeId) !== as
    )
      return false;
    if (days !== "all" && Date.now() - new Date(s.createdAt).getTime() > Number(days) * 864e5)
      return false;
    return true;
  });
  const counts = Object.fromEntries(
    TABS.map((t) => [
      t,
      t === "All" ? db.supportCases.length : db.supportCases.filter((s) => s.status === t).length,
    ]),
  ) as Record<Tab, number>;
  return (
    <>
      <PageHeader
        title="Customer Support"
        subtitle="Inquiries submitted from the in-app Help section."
        actions={
          canManage && (
            <NewCaseDialog
              trigger={
                <Button size="sm">
                  <Plus /> New case
                </Button>
              }
            />
          )
        }
      />
      <TabBar tabs={TABS} value={tab} onChange={setTab} counts={counts} />
      <CaseTable
        rows={rows}
        pageSize={15}
        toolbar={
          <>
            <SearchInput value={q} onChange={setQ} placeholder="Case ref, subject, customer" />
            <FilterSelect
              label="Priority"
              value={pr}
              onChange={setPr}
              options={["Urgent", "High", "Normal", "Low"]}
            />
            <FilterSelect
              label="Category"
              value={cat}
              onChange={setCat}
              options={[
                "Account Access",
                "Verification",
                "Banking Account",
                "Transaction",
                "Transfer",
                "Card",
                "Membership",
                "Savings",
                "Alfie",
                "General Inquiry",
              ]}
            />
            <FilterSelect
              label="Assigned"
              value={as}
              onChange={setAs}
              options={["Me", "Unassigned", ...db.employees.map((e) => e.name)]}
            />
            <SelectField
              aria-label="Date range"
              value={days}
              onChange={(e) => setDays(e.target.value)}
              className="h-10 w-auto max-w-full rounded-md border bg-card px-3 text-[13px]"
            >
              <option value="all">Any date</option>
              <option value="1">Last 24h</option>
              <option value="7">Last 7 days</option>
              <option value="30">Last 30 days</option>
            </SelectField>
          </>
        }
      />
    </>
  );
}

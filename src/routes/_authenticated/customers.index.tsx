import { SelectField } from "@/components/ui/select-field";
import { createFileRoute, useNavigate } from "@tanstack/react-router";
import { useMemo, useState } from "react";
import { Download, MoreHorizontal } from "lucide-react";
import { toast } from "sonner";
import { useDB } from "@/services/store";
import { PageHeader, CustomerCell, NoAccess, usePermission, Mono } from "@/components/common";
import { DataTable, FilterSelect, SearchInput, type Column } from "@/components/tables/DataTable";
import { StatusBadge, PlanBadge } from "@/components/status/StatusBadge";
import { fmtDate, fullName } from "@/lib/format";
import { Button } from "@/components/ui/button";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import type { Customer } from "@/types/models";

export const Route = createFileRoute("/_authenticated/customers/")({
  head: () => ({
    meta: [
      { property: "og:type", content: "website" },
      { name: "twitter:card", content: "summary" },
      { title: "Customers | Renda Admin" },
      { name: "description", content: "Search and manage Renda customer records." },
      { property: "og:title", content: "Customers | Renda Admin" },
      { property: "og:description", content: "Search and manage Renda customer records." },
    ],
  }),
  component: Customers,
});

const STATUSES = [
  "Registered",
  "Email Verification Pending",
  "Email Verified",
  "Onboarding In Progress",
  "KYC Pending",
  "KYC Under Review",
  "KYC Failed",
  "KYC Approved",
  "Account Issuance Pending",
  "Account Issuance Failed",
  "Setup In Progress",
  "Active",
  "Restricted",
  "Closed",
];

function Customers() {
  const db = useDB();
  const navigate = useNavigate();
  const allowed = usePermission("customers.view");
  const [q, setQ] = useState("");
  const [status, setStatus] = useState("all");
  const [onb, setOnb] = useState("all");
  const [kyc, setKyc] = useState("all");
  const [plan, setPlan] = useState("all");
  const [bank, setBank] = useState("all");
  const [reg, setReg] = useState("all");
  const [selected, setSelected] = useState<string[]>([]);

  const planOf = (id: string) => db.subscriptions.find((s) => s.customerId === id)?.plan;
  const bankOf = (c: Customer) => {
    const a = db.accounts.find((x) => x.customerId === c.id && x.accountType === "Smart Spend");
    return a ? a.accountStatus : "Not Issued";
  };
  const rows = useMemo(() => {
    const t = q.trim().toLowerCase();
    return db.customers.filter((c) => {
      if (t && ![fullName(c), c.userId, c.email, c.phone].some((v) => v.toLowerCase().includes(t)))
        return false;
      if (status !== "all" && c.customerStatus !== status) return false;
      if (onb !== "all" && c.onboardingStatus !== onb) return false;
      if (kyc !== "all" && c.kycStatus !== kyc) return false;
      if (plan !== "all" && (planOf(c.id) ?? "None") !== plan) return false;
      if (bank !== "all" && bankOf(c) !== bank) return false;
      if (
        reg !== "all" &&
        Date.now() - new Date(c.registrationDate).getTime() > Number(reg) * 864e5
      )
        return false;
      return true;
    });
  }, [db, q, status, onb, kyc, plan, bank, reg]);

  if (!allowed) return <NoAccess what="customer records" />;

  const cols: Column<Customer>[] = [
    {
      key: "name",
      header: "Customer",
      cell: (c) => <CustomerCell customer={c} sub={c.customerStatus} />,
      sort: (c) => fullName(c),
    },
    {
      key: "uid",
      header: "Renda User ID",
      cell: (c) => <Mono>{c.userId}</Mono>,
      sort: (c) => c.userId,
    },
    {
      key: "email",
      header: "Email",
      cell: (c) => <span className="text-muted-foreground">{c.email}</span>,
    },
    {
      key: "phone",
      header: "Phone",
      cell: (c) => <span className="tabular text-muted-foreground">{c.phone}</span>,
    },
    {
      key: "onb",
      header: "Onboarding",
      cell: (c) => <StatusBadge status={c.onboardingStatus} />,
      sort: (c) => c.onboardingStatus,
    },
    {
      key: "kyc",
      header: "KYC",
      cell: (c) => <StatusBadge status={c.kycStatus} />,
      sort: (c) => c.kycStatus,
    },
    { key: "bank", header: "Banking", cell: (c) => <StatusBadge status={bankOf(c)} /> },
    { key: "plan", header: "Plan", cell: (c) => <PlanBadge plan={planOf(c.id)} /> },
    {
      key: "reg",
      header: "Registered",
      cell: (c) => fmtDate(c.registrationDate),
      sort: (c) => c.registrationDate,
    },
    {
      key: "act",
      header: <span className="sr-only">Actions</span>,
      className: "text-right",
      cell: (c) => (
        <DropdownMenu>
          <DropdownMenuTrigger asChild onClick={(e) => e.stopPropagation()}>
            <Button
              variant="ghost"
              aria-label="Customer actions"
              className="rounded p-1 hover:bg-secondary"
            >
              <MoreHorizontal className="size-4" />
            </Button>
          </DropdownMenuTrigger>
          <DropdownMenuContent align="end" onClick={(e) => e.stopPropagation()}>
            <DropdownMenuItem
              onClick={() =>
                navigate({ to: "/customers/$customerId", params: { customerId: c.id } })
              }
            >
              Open profile
            </DropdownMenuItem>
            {c.closureRequest && (
              <DropdownMenuItem
                onClick={() =>
                  navigate({
                    to: "/closure-requests/$customerId",
                    params: { customerId: c.id },
                  })
                }
              >
                Open closure request ({c.closureRequest.status.toLowerCase()})
              </DropdownMenuItem>
            )}
            <DropdownMenuItem
              onClick={() =>
                navigate({
                  to: "/customers/$customerId",
                  params: { customerId: c.id },
                  search: { tab: "Transactions" },
                })
              }
            >
              Review transactions
            </DropdownMenuItem>
            <DropdownMenuItem
              onClick={() =>
                navigate({ to: "/onboarding/$customerId", params: { customerId: c.id } })
              }
            >
              Verification case
            </DropdownMenuItem>
          </DropdownMenuContent>
        </DropdownMenu>
      ),
    },
  ];

  const exportCsv = () => {
    const chosen = db.customers.filter((c) => selected.includes(c.id));
    const csv = [
      "Name,User ID,Status,KYC,Plan",
      ...chosen.map(
        (c) =>
          `"${fullName(c)}",${c.userId},${c.customerStatus},${c.kycStatus},${planOf(c.id) ?? ""}`,
      ),
    ].join("\n");
    const url = URL.createObjectURL(new Blob([csv], { type: "text/csv" }));
    const a = document.createElement("a");
    a.href = url;
    a.download = "renda-customers.csv";
    a.click();
    URL.revokeObjectURL(url);
    toast.success(`Exported ${chosen.length} customers (non-sensitive fields only)`);
  };

  return (
    <>
      <PageHeader title="Customers" subtitle="Search and manage Renda customer records." />
      <DataTable
        rows={rows}
        columns={cols}
        rowKey={(c) => c.id}
        onRowClick={(c) => navigate({ to: "/customers/$customerId", params: { customerId: c.id } })}
        selectable
        selected={selected}
        onSelectedChange={setSelected}
        defaultSort={{ key: "reg", dir: "desc" }}
        emptyTitle="No customers match"
        toolbar={
          <>
            <SearchInput
              value={q}
              onChange={setQ}
              placeholder="Search name, user ID, email, phone"
            />
            <FilterSelect label="Status" value={status} onChange={setStatus} options={STATUSES} />
            <FilterSelect
              label="Onboarding"
              value={onb}
              onChange={setOnb}
              options={["Not Started", "In Progress", "Completed", "Blocked"]}
            />
            <FilterSelect
              label="KYC"
              value={kyc}
              onChange={setKyc}
              options={["Not Started", "Pending", "Under Review", "Approved", "Failed"]}
            />
            <FilterSelect
              label="Plan"
              value={plan}
              onChange={setPlan}
              options={["Everyday", "Plus", "None"]}
            />
            <FilterSelect
              label="Account"
              value={bank}
              onChange={setBank}
              options={[
                "Not Issued",
                "Pending Issuance",
                "Issuance Failed",
                "Active",
                "Restricted",
                "Closed",
              ]}
            />
            <SelectField
              aria-label="Registration date"
              value={reg}
              onChange={(e) => setReg(e.target.value)}
              className="h-10 w-auto max-w-full rounded-md border bg-card px-3 text-[13px]"
            >
              <option value="all">Registered: Any time</option>
              <option value="7">Last 7 days</option>
              <option value="30">Last 30 days</option>
              <option value="90">Last 90 days</option>
            </SelectField>
            {selected.length > 0 && (
              <div className="ml-auto flex items-center gap-2">
                <span className="text-[13px] text-muted-foreground">
                  {selected.length} selected
                </span>
                <Button size="sm" variant="outline" onClick={exportCsv}>
                  <Download /> Export CSV
                </Button>
                <Button size="sm" variant="ghost" onClick={() => setSelected([])}>
                  Clear
                </Button>
              </div>
            )}
          </>
        }
      />
    </>
  );
}

import { SelectField } from "@/components/ui/select-field";
import { createFileRoute } from "@tanstack/react-router";
import { useMemo, useState } from "react";
import { useDB } from "@/services/store";
import { NoAccess, PageHeader, usePermission } from "@/components/common";
import { FilterSelect, SearchInput } from "@/components/tables/DataTable";
import { TransactionTable } from "@/components/tables/RecordTables";
import { fullName, lookup } from "@/lib/format";

export const Route = createFileRoute("/_authenticated/transactions/")({
  head: () => ({
    meta: [
      { property: "og:type", content: "website" },
      { name: "twitter:card", content: "summary" },
      { title: "Transactions | Renda Admin" },
      { name: "description", content: "Investigate customer transactions." },
      { property: "og:title", content: "Transactions | Renda Admin" },
      { property: "og:description", content: "Investigate customer transactions." },
    ],
  }),
  component: Transactions,
});

function Transactions() {
  const db = useDB();
  const L = lookup(db);
  const allowed = usePermission("transactions.view");
  const [q, setQ] = useState("");
  const [type, setType] = useState("all");
  const [status, setStatus] = useState("all");
  const [acct, setAcct] = useState("all");
  const [rail, setRail] = useState("all");
  const [days, setDays] = useState("all");
  const [min, setMin] = useState("");
  const [max, setMax] = useState("");
  const rows = useMemo(
    () =>
      db.transactions.filter((t) => {
        const c = L.customer(t.customerId);
        if (
          q &&
          ![
            t.transactionReference,
            t.description,
            t.providerReference,
            c ? fullName(c) : "",
            c?.userId ?? "",
          ].some((v) => v.toLowerCase().includes(q.toLowerCase()))
        )
          return false;
        if (type !== "all" && t.transactionType !== type) return false;
        if (status !== "all" && t.status !== status) return false;
        if (rail !== "all" && t.paymentRail !== rail) return false;
        if (acct !== "all" && L.account(t.accountId)?.accountType !== acct) return false;
        if (days !== "all" && Date.now() - new Date(t.timestamp).getTime() > Number(days) * 864e5)
          return false;
        if (min && t.amount < Number(min)) return false;
        if (max && t.amount > Number(max)) return false;
        return true;
      }),
    [db, q, type, status, acct, rail, days, min, max],
  );
  if (!allowed) return <NoAccess what="transactions" />;
  return (
    <>
      <PageHeader
        title="Transactions"
        subtitle="Review transactions across all customers and payment rails."
      />
      <TransactionTable
        rows={rows}
        pageSize={15}
        toolbar={
          <>
            <SearchInput value={q} onChange={setQ} placeholder="Reference, customer, description" />
            <FilterSelect
              label="Type"
              value={type}
              onChange={setType}
              options={[
                "Card Purchase",
                "P2P Sent",
                "P2P Received",
                "Interac Sent",
                "Interac Received",
                "Account Transfer",
                "Plan Fee",
                "Interest",
              ]}
              labels={{ "P2P Sent": "RenPay Sent", "P2P Received": "RenPay Received" }}
            />
            <FilterSelect
              label="Status"
              value={status}
              onChange={setStatus}
              options={["Pending", "Completed", "Failed", "Reversed"]}
            />
            <FilterSelect
              label="Account"
              value={acct}
              onChange={setAcct}
              options={["Smart Spend", "Sense Save"]}
            />
            <FilterSelect
              label="Rail"
              value={rail}
              onChange={setRail}
              options={["Mastercard", "Internal Ledger", "Interac", "Renda Billing"]}
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
            <input
              aria-label="Minimum amount"
              type="number"
              placeholder="Min $"
              value={min}
              onChange={(e) => setMin(e.target.value)}
              className="h-8 w-20 rounded-md border bg-card px-2 text-[13px]"
            />
            <input
              aria-label="Maximum amount"
              type="number"
              placeholder="Max $"
              value={max}
              onChange={(e) => setMax(e.target.value)}
              className="h-8 w-20 rounded-md border bg-card px-2 text-[13px]"
            />
          </>
        }
      />
    </>
  );
}

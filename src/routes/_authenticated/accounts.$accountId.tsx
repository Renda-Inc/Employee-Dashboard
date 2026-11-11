import { createFileRoute, Link } from "@tanstack/react-router";
import { jsPDF } from "jspdf";
import { FileText } from "lucide-react";
import { toast } from "sonner";
import { useDB } from "@/services/store";
import {
  EmptyState,
  KV,
  Mono,
  NoAccess,
  PageHeader,
  Panel,
  SimulatedNote,
  usePermission,
  Avatar,
} from "@/components/common";
import { TransactionTable } from "@/components/tables/RecordTables";
import { StatusBadge } from "@/components/status/StatusBadge";
import { NewCaseDialog } from "@/components/dialogs/NewCaseDialog";
import { Button } from "@/components/ui/button";
import { fmtDate, fmtMoney, fullName } from "@/lib/format";
import type { Account, Customer, Transaction } from "@/types/models";

export const Route = createFileRoute("/_authenticated/accounts/$accountId")({
  head: () => ({
    meta: [
      { property: "og:type", content: "website" },
      { name: "twitter:card", content: "summary" },
      { title: "Account details — Renda Admin" },
      { name: "description", content: "Banking account details." },
      { property: "og:title", content: "Account details — Renda Admin" },
      { property: "og:description", content: "Banking account details." },
    ],
  }),
  component: AccountDetail,
});

function sampleDoc(kind: "statement" | "cheque", a: Account, c: Customer, txns: Transaction[]) {
  const doc = new jsPDF({ unit: "pt", format: "letter" });
  doc.setFont("helvetica", "bold").setFontSize(16).text("RENDA", 48, 56);
  doc
    .setFont("helvetica", "normal")
    .setFontSize(9)
    .setTextColor(200, 60, 40)
    .text("SAMPLE — NOT AN OFFICIAL BANK DOCUMENT (demo)", 48, 72);
  doc
    .setTextColor(23, 25, 28)
    .setFontSize(12)
    .text(
      kind === "statement"
        ? `${a.accountType} — Sample statement`
        : `${a.accountType} — Sample void cheque`,
      48,
      104,
    );
  doc
    .setFontSize(10)
    .text(`Customer: ${fullName(c)} (${c.userId})`, 48, 124)
    .text(`Account: ${a.maskedAccountIdentifier ?? "pending"}`, 48, 140);
  if (kind === "cheque") {
    doc.rect(48, 170, 516, 160).setFontSize(42).setTextColor(220, 220, 220).text("VOID", 240, 270);
    doc
      .setFontSize(9)
      .setTextColor(105, 113, 125)
      .text("Transit / institution numbers are not available in demo mode.", 60, 315);
  } else {
    let y = 176;
    doc.setFontSize(9);
    txns.slice(0, 30).forEach((t) => {
      doc
        .text(fmtDate(t.timestamp), 48, y)
        .text(t.description.slice(0, 50), 140, y)
        .text(`${t.direction === "debit" ? "-" : "+"}${t.amount.toFixed(2)}`, 520, y, {
          align: "right",
        });
      y += 15;
    });
  }
  doc.save(`renda-sample-${kind}-${a.id}.pdf`);
  toast.success("Sample document generated (not an official bank document)");
}

function AccountDetail() {
  const { accountId } = Route.useParams();
  const db = useDB();
  const allowed = usePermission("accounts.view");
  const canCase = usePermission("support.manage");
  const a = db.accounts.find((x) => x.id === accountId);
  if (!allowed) return <NoAccess what="banking accounts" />;
  if (!a)
    return (
      <div className="panel">
        <EmptyState title="Account not found" />
      </div>
    );
  const c = db.customers.find((x) => x.id === a.customerId)!;
  const txns = db.transactions.filter((t) => t.accountId === a.id);
  const issued = a.accountStatus === "Active" || a.accountStatus === "Restricted";
  return (
    <>
      <PageHeader
        title={`${a.accountType} ${a.maskedAccountIdentifier ?? ""}`}
        subtitle={
          <span className="inline-flex items-center gap-2">
            <StatusBadge status={a.accountStatus} />{" "}
            <Link
              to="/customers/$customerId"
              params={{ customerId: c.id }}
              className="text-primary"
            >
              {fullName(c)}
            </Link>
          </span>
        }
        actions={
          <>
            <Link to="/onboarding/$customerId" params={{ customerId: c.id }}>
              <Button size="sm" variant="outline">
                Review account issues
              </Button>
            </Link>
            {canCase && (
              <NewCaseDialog
                customerId={c.id}
                link={{ type: "account", id: a.id }}
                defaultCategory="Banking Account"
                trigger={
                  <Button size="sm" variant="outline">
                    Open support case
                  </Button>
                }
              />
            )}
          </>
        }
      />
      <div className="grid gap-6 lg:grid-cols-[1.5fr_1fr]">
        <Panel title="Account details">
          <KV
            cols={3}
            items={[
              ["Account type", a.accountType],
              ["Status", <StatusBadge status={a.accountStatus} />],
              ["Account identifier", <Mono>{a.maskedAccountIdentifier ?? "Not issued"}</Mono>],
              ["Opening date", fmtDate(a.openingDate)],
              ["Available balance", fmtMoney(a.availableBalance)],
              ["Ledger balance", fmtMoney(a.ledgerBalance)],
            ]}
          />
          <div className="mt-4">
            <div className="eyebrow mb-1">Restrictions</div>
            {a.restrictions.length ? (
              <ul className="list-disc pl-4">
                {a.restrictions.map((r) => (
                  <li key={r}>{r}</li>
                ))}
              </ul>
            ) : (
              <p className="text-muted-foreground">None</p>
            )}
          </div>
        </Panel>
        <div className="space-y-6">
          <Panel title="Customer">
            <Link
              to="/customers/$customerId"
              params={{ customerId: c.id }}
              className="flex items-center gap-3 hover:underline"
            >
              <Avatar name={fullName(c)} size="md" />
              <span>
                <span className="block font-medium">{fullName(c)}</span>
                <span className="text-[13px] text-muted-foreground">
                  {c.userId} · {c.customerStatus}
                </span>
              </span>
            </Link>
          </Panel>
          <Panel title="Statements & documents">
            {issued ? (
              <div className="space-y-2">
                <Button
                  variant="outline"
                  size="sm"
                  className="w-full justify-start"
                  onClick={() => sampleDoc("statement", a, c, txns)}
                >
                  <FileText /> Sample statement (PDF)
                </Button>
                {a.accountType === "Smart Spend" && (
                  <Button
                    variant="outline"
                    size="sm"
                    className="w-full justify-start"
                    onClick={() => sampleDoc("cheque", a, c, txns)}
                  >
                    <FileText /> Sample void cheque (PDF)
                  </Button>
                )}
                <SimulatedNote>
                  Generated sample documents only. Official statements are issued by the banking
                  partner.
                </SimulatedNote>
              </div>
            ) : (
              <p className="text-muted-foreground">
                Documents are available once the account is issued.
              </p>
            )}
          </Panel>
        </div>
      </div>
      <h2 className="mb-2 mt-6 text-[14px] font-semibold">Recent transactions</h2>
      <TransactionTable rows={txns} showCustomer={false} />
    </>
  );
}

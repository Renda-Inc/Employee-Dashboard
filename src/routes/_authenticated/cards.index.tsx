import { createFileRoute, Link } from "@tanstack/react-router";
import { useState } from "react";
import { Factory } from "lucide-react";
import { useDB } from "@/services/store";
import { NoAccess, PageHeader, usePermission } from "@/components/common";
import { FilterSelect, SearchInput } from "@/components/tables/DataTable";
import { CardTable } from "@/components/tables/RecordTables";
import { Button } from "@/components/ui/button";
import { fullName, lookup } from "@/lib/format";
import { CARD_DESIGNS } from "@/types/models";

export const Route = createFileRoute("/_authenticated/cards/")({
  head: () => ({
    meta: [
      { property: "og:type", content: "website" },
      { name: "twitter:card", content: "summary" },
      { title: "Cards | Renda Admin" },
      { name: "description", content: "Virtual and physical Renda Mastercard records." },
      { property: "og:title", content: "Cards | Renda Admin" },
      { property: "og:description", content: "Renda Mastercard records." },
    ],
  }),
  component: Cards,
});

function Cards() {
  const db = useDB();
  const L = lookup(db);
  const allowed = usePermission("cards.view");
  const [q, setQ] = useState("");
  const [type, setType] = useState("all");
  const [design, setDesign] = useState("all");
  const [status, setStatus] = useState("all");
  const [plan, setPlan] = useState("all");
  const [mfg, setMfg] = useState("all");
  const [rpl, setRpl] = useState("all");
  if (!allowed) return <NoAccess what="card records" />;
  const orderOf = (id: string) =>
    db.cardOrders.find((o) => o.cardId === id && o.orderStatus !== "Canceled");
  const o = db.cardOrders;
  const metrics = [
    ["Total cards", db.cards.length],
    ["Active", db.cards.filter((c) => c.cardStatus === "Active").length],
    ["Locked", db.cards.filter((c) => c.cardStatus === "Locked").length],
    [
      "Pending card requests",
      db.subscriptions.filter((s) => s.cardSelectionRequired).length +
        o.filter((x) => x.orderStatus === "Eligible").length,
    ],
    [
      "Replacement requests",
      o.filter(
        (x) =>
          x.orderType === "Replacement Card" &&
          ["Eligible", "Batched", "Submitted"].includes(x.orderStatus),
      ).length,
    ],
    [
      "Awaiting manufacturing",
      o.filter((x) => x.orderStatus === "Eligible" || x.orderStatus === "Batched").length,
    ],
    ["In production", o.filter((x) => x.orderStatus === "Submitted").length],
    ["Awaiting activation", db.cards.filter((c) => c.cardStatus === "In Production").length],
  ] as const;
  const rows = db.cards.filter((c) => {
    const cu = L.customer(c.customerId);
    const ord = orderOf(c.id);
    if (
      q &&
      !`${cu ? fullName(cu) : ""} ${cu?.userId} ${c.last4} ${c.replacementReference ?? ""}`
        .toLowerCase()
        .includes(q.toLowerCase())
    )
      return false;
    if (type !== "all" && c.cardType !== type) return false;
    if (design !== "all" && c.cardDesign !== design) return false;
    if (status !== "all" && c.cardStatus !== status) return false;
    if (
      plan !== "all" &&
      db.subscriptions.find((s) => s.customerId === c.customerId)?.plan !== plan
    )
      return false;
    if (mfg !== "all" && (ord?.orderStatus ?? "None") !== mfg) return false;
    if (rpl === "Replacement" && !c.replacesCardId) return false;
    if (rpl === "Replaced" && !c.replacedByCardId) return false;
    return true;
  });
  return (
    <>
      <PageHeader
        title="Cards"
        subtitle="Virtual and physical Renda Mastercard records, replacements and fulfillment."
        actions={
          <Link to="/cards/manufacturing">
            <Button size="sm">
              <Factory /> Card Manufacturing
            </Button>
          </Link>
        }
      />
      <div className="mb-5 grid grid-cols-2 gap-px overflow-hidden rounded-lg border bg-border md:grid-cols-4 xl:grid-cols-8">
        {metrics.map(([l, v]) => (
          <div key={l} className="bg-card px-3 py-3">
            <div className="truncate text-[12px] text-muted-foreground">{l}</div>
            <div className="mt-0.5 text-[20px] font-semibold tabular">{v}</div>
          </div>
        ))}
      </div>
      <CardTable
        rows={rows}
        pageSize={15}
        toolbar={
          <>
            <SearchInput
              value={q}
              onChange={setQ}
              placeholder="Customer, user ID, last 4, RPL ref"
            />
            <FilterSelect
              label="Type"
              value={type}
              onChange={setType}
              options={["Virtual", "Physical"]}
            />
            <FilterSelect
              label="Design"
              value={design}
              onChange={setDesign}
              options={["Virtual", ...CARD_DESIGNS]}
            />
            <FilterSelect
              label="Status"
              value={status}
              onChange={setStatus}
              options={[
                "Active",
                "Locked",
                "Awaiting Manufacturing",
                "In Production",
                "Replaced",
                "Canceled",
              ]}
            />
            <FilterSelect
              label="Plan"
              value={plan}
              onChange={setPlan}
              options={["Everyday", "Plus"]}
            />
            <FilterSelect
              label="Manufacturing"
              value={mfg}
              onChange={setMfg}
              options={["Eligible", "Batched", "Submitted", "Activated", "None"]}
            />
            <FilterSelect
              label="Replacement"
              value={rpl}
              onChange={setRpl}
              options={["Replacement", "Replaced"]}
            />
          </>
        }
      />
    </>
  );
}

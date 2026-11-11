// Generates the manufacturing order PDF. Contains no banking credentials, card numbers or PII
// beyond a placeholder customer token. Fields are a configurable starting point pending
// the manufacturer's confirmed specifications.
import { jsPDF } from "jspdf";
import type { DB, ManufacturingBatch } from "@/types/models";

const SPEC: Record<string, string> = {
  Classic: "Matte black PVC · silver foil · EMV chip",
  "Blue Nova": "Deep blue gradient · holographic star foil · EMV chip",
  "Aqua Aura": "Aqua pearlescent · white print · EMV chip",
  "Pearl Ivory": "Ivory metal-effect · gold foil · EMV chip",
};

export function buildBatchPdf(db: DB, batch: ManufacturingBatch): jsPDF {
  const doc = new jsPDF({ unit: "pt", format: "letter" });
  const orders = batch.orderIds
    .map((id) => db.cardOrders.find((o) => o.id === id)!)
    .filter(Boolean);
  const emp = (id: string | null) => db.employees.find((e) => e.id === id)?.name ?? "—";
  const W = doc.internal.pageSize.getWidth();
  let y = 56;

  doc.setFont("helvetica", "bold").setFontSize(18).text("RENDA", 48, y);
  doc
    .setFont("helvetica", "normal")
    .setFontSize(9)
    .setTextColor(105, 113, 125)
    .text("Card Manufacturing Order", 48, y + 14);
  doc
    .setFontSize(8)
    .text("DEMO DOCUMENT — placeholder identifiers, not for production use", W - 48, y, {
      align: "right",
    });
  y += 44;
  doc.setDrawColor(229, 231, 235).line(48, y, W - 48, y);
  y += 24;

  const meta: [string, string][] = [
    ["Batch reference", batch.batchReference],
    ["Created", new Date(batch.createdAt).toLocaleString("en-CA")],
    ["Prepared by", emp(batch.createdBy)],
    ["Order count", String(orders.length)],
    ["Manufacturer", db.settings.manufacturerName],
    ["Generated", new Date().toLocaleString("en-CA")],
  ];
  doc.setTextColor(23, 25, 28);
  meta.forEach(([k, v], i) => {
    const x = 48 + (i % 2) * 260;
    const yy = y + Math.floor(i / 2) * 30;
    doc.setFontSize(7.5).setTextColor(105, 113, 125).text(k.toUpperCase(), x, yy);
    doc
      .setFontSize(10)
      .setTextColor(23, 25, 28)
      .text(v, x, yy + 13);
  });
  y += 100;

  // Design breakdown
  const breakdown: Record<string, number> = {};
  orders.forEach((o) => (breakdown[o.requestedDesign] = (breakdown[o.requestedDesign] ?? 0) + 1));
  doc.setFont("helvetica", "bold").setFontSize(10).text("Design breakdown", 48, y);
  y += 14;
  doc.setFont("helvetica", "normal").setFontSize(9);
  Object.entries(breakdown).forEach(([d, n]) => {
    doc.text(`${d}`, 48, y);
    doc.text(`${n}`, 160, y);
    doc
      .setTextColor(105, 113, 125)
      .text(SPEC[d] ?? "", 190, y)
      .setTextColor(23, 25, 28);
    y += 14;
  });
  y += 16;

  // Orders table
  const cols = db.settings.pdfIncludeShippingReference
    ? [
        ["#", 48],
        ["Order ref", 70],
        ["Customer token", 160],
        ["Type", 260],
        ["Design", 360],
        ["Shipping ref", 450],
      ]
    : [
        ["#", 48],
        ["Order ref", 70],
        ["Customer token", 180],
        ["Type", 290],
        ["Design", 410],
      ];
  doc.setFillColor(241, 243, 245).rect(48, y - 11, W - 96, 18, "F");
  doc.setFont("helvetica", "bold").setFontSize(8);
  cols.forEach(([h, x]) => doc.text(String(h), Number(x) + 4, y));
  y += 18;
  doc.setFont("helvetica", "normal").setFontSize(8.5);
  orders.forEach((o, i) => {
    if (y > 720) {
      doc.addPage();
      y = 56;
    }
    const token = `CUST-${o.customerId.slice(4).padStart(4, "0")}`;
    const row = [
      String(i + 1),
      o.orderReference,
      token,
      o.orderType === "Replacement Card" ? `Replacement (${o.replacementReference})` : "Initial",
      o.requestedDesign,
      o.shippingReference,
    ];
    cols.forEach(([, x], j) => doc.text(row[j], Number(x) + 4, y));
    doc.setDrawColor(229, 231, 235).line(48, y + 6, W - 48, y + 6);
    y += 18;
  });

  y += 24;
  doc.setFontSize(7.5).setTextColor(105, 113, 125);
  doc.text(
    "Contains no card numbers, CVVs, PINs or banking credentials. Personalization data is transmitted separately via the card processor.",
    48,
    y,
    { maxWidth: W - 96 },
  );
  doc.text(`Page footer · ${batch.batchReference}`, 48, 760);
  return doc;
}

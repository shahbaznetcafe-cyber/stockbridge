import sgMail from "@sendgrid/mail";

export type PurchaseOrderDocumentInput = {
  orderNumber: string;
  status: string;
  expectedDate: Date | string | null;
  notes: string | null;
  supplier: {
    name: string;
    email: string | null;
    phone: string | null;
  };
  store: {
    shop: string;
    currency: string;
  };
  lines: Array<{
    titleSnapshot: string;
    skuSnapshot: string | null;
    quantity: number;
    unitCost: number;
    lineTotal: number;
    receipts: Array<{ quantity: number }>;
  }>;
};

export type PurchaseOrderDocument = ReturnType<typeof buildPurchaseOrderDocument>;

function formatDateValue(value: Date | string | null) {
  if (!value) return "Not set";
  return new Intl.DateTimeFormat("en", { month: "short", day: "numeric", year: "numeric" }).format(new Date(value));
}

function getReceivedQuantity(receipts: Array<{ quantity: number }>) {
  return receipts.reduce((total, receipt) => total + receipt.quantity, 0);
}

export function buildPurchaseOrderDocument(order: PurchaseOrderDocumentInput) {
  const lines = order.lines.map((line) => {
    const receivedQuantity = getReceivedQuantity(line.receipts);
    return {
      title: line.titleSnapshot,
      sku: line.skuSnapshot || "Not set",
      orderedQuantity: line.quantity,
      receivedQuantity,
      remainingQuantity: Math.max(line.quantity - receivedQuantity, 0),
      unitCost: line.unitCost,
      lineTotal: line.lineTotal,
    };
  });

  return {
    title: `Purchase Order ${order.orderNumber}`,
    orderNumber: order.orderNumber,
    status: order.status,
    expectedDate: formatDateValue(order.expectedDate),
    notes: order.notes?.trim() || "None",
    supplier: order.supplier,
    store: order.store,
    lines,
    totalCost: Number(lines.reduce((total, line) => total + line.lineTotal, 0).toFixed(2)),
    totalUnits: lines.reduce((total, line) => total + line.orderedQuantity, 0),
    totalReceived: lines.reduce((total, line) => total + line.receivedQuantity, 0),
    totalRemaining: lines.reduce((total, line) => total + line.remainingQuantity, 0),
  };
}

export function buildPurchaseOrderEmail({
  orderNumber,
  supplierName,
  printUrl,
}: {
  orderNumber: string;
  supplierName: string;
  printUrl: string;
}) {
  return {
    subject: `Purchase Order ${orderNumber}`,
    text: [
      `Hello ${supplierName},`,
      "",
      `Please review purchase order ${orderNumber}.`,
      `Open or print the purchase order here: ${printUrl}`,
      "",
      "Regards,",
      "StockBridge",
    ].join("\n"),
  };
}

export async function sendPurchaseOrderEmail({
  to,
  from,
  orderNumber,
  supplierName,
  printUrl,
}: {
  to: string;
  from: string;
  orderNumber: string;
  supplierName: string;
  printUrl: string;
}) {
  if (!process.env.SENDGRID_API_KEY) {
    throw new Error("SENDGRID_API_KEY is not configured.");
  }

  const email = buildPurchaseOrderEmail({ orderNumber, supplierName, printUrl });
  sgMail.setApiKey(process.env.SENDGRID_API_KEY);
  await sgMail.send({
    to,
    from,
    subject: email.subject,
    text: email.text,
  });

  return email;
}

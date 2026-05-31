import { describe, expect, test } from "vitest";

import {
  buildPurchaseOrderDocument,
  buildPurchaseOrderEmail,
} from "./purchase-order-documents.server";

describe("purchase order documents", () => {
  test("builds supplier-ready document totals and line remaining quantities", () => {
    const document = buildPurchaseOrderDocument({
      orderNumber: "PO-20260531-001",
      status: "partial",
      expectedDate: new Date("2026-06-07T00:00:00.000Z"),
      notes: "Deliver before noon.",
      supplier: {
        name: "Acme Supply",
        email: "orders@acme.example",
        phone: "555-0100",
      },
      store: {
        shop: "demo-store.myshopify.com",
        currency: "USD",
      },
      lines: [
        {
          titleSnapshot: "Aloe Drink",
          skuSnapshot: "ALOE",
          quantity: 10,
          unitCost: 2.5,
          lineTotal: 25,
          receipts: [{ quantity: 4 }],
        },
        {
          titleSnapshot: "Mint Tea",
          skuSnapshot: null,
          quantity: 3,
          unitCost: 4,
          lineTotal: 12,
          receipts: [],
        },
      ],
    });

    expect(document.title).toBe("Purchase Order PO-20260531-001");
    expect(document.totalCost).toBe(37);
    expect(document.totalUnits).toBe(13);
    expect(document.totalReceived).toBe(4);
    expect(document.lines).toMatchObject([
      { title: "Aloe Drink", sku: "ALOE", orderedQuantity: 10, receivedQuantity: 4, remainingQuantity: 6 },
      { title: "Mint Tea", sku: "Not set", orderedQuantity: 3, receivedQuantity: 0, remainingQuantity: 3 },
    ]);
  });

  test("builds a concise supplier email", () => {
    const email = buildPurchaseOrderEmail({
      orderNumber: "PO-20260531-001",
      supplierName: "Acme Supply",
      printUrl: "https://stockbridge-ua7x.onrender.com/app/purchase-orders/po-1/print",
    });

    expect(email.subject).toBe("Purchase Order PO-20260531-001");
    expect(email.text).toContain("Acme Supply");
    expect(email.text).toContain("https://stockbridge-ua7x.onrender.com/app/purchase-orders/po-1/print");
  });
});

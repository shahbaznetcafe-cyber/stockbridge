import { describe, expect, test } from "vitest";

import {
  buildPurchaseOrderCsv,
  filterPurchaseOrders,
  getPurchaseOrderFilterParams,
} from "./purchase-order-exports.server";

const orders = [
  {
    id: "po-1",
    orderNumber: "PO-20260531-001",
    status: "sent",
    expectedDate: new Date("2026-06-05T00:00:00.000Z"),
    totalCost: 42.5,
    supplier: { name: "Acme Supply" },
    lines: [
      {
        titleSnapshot: "Aloe Drink",
        skuSnapshot: "ALOE-12",
        quantity: 10,
        unitCost: 2.5,
        lineTotal: 25,
        receipts: [{ quantity: 4 }],
      },
    ],
  },
  {
    id: "po-2",
    orderNumber: "PO-20260531-002",
    status: "received",
    expectedDate: null,
    totalCost: 18,
    supplier: { name: "Metro Traders" },
    lines: [
      {
        titleSnapshot: "Mint Tea, Large",
        skuSnapshot: null,
        quantity: 6,
        unitCost: 3,
        lineTotal: 18,
        receipts: [{ quantity: 6 }],
      },
    ],
  },
];

describe("purchase order export helpers", () => {
  test("normalizes filter params from query strings", () => {
    const params = getPurchaseOrderFilterParams(new URL("https://example.com/app/purchase-orders?q= aloe &status=sent"));

    expect(params).toEqual({ q: "aloe", status: "sent" });
  });

  test("filters purchase orders by status and searchable fields", () => {
    expect(filterPurchaseOrders(orders, { q: "acme", status: "sent" }).map((order) => order.id)).toEqual(["po-1"]);
    expect(filterPurchaseOrders(orders, { q: "large", status: "all" }).map((order) => order.id)).toEqual(["po-2"]);
    expect(filterPurchaseOrders(orders, { q: "ALOE-12", status: "received" })).toEqual([]);
  });

  test("builds CSV rows with received and remaining quantities", () => {
    const csv = buildPurchaseOrderCsv(orders);

    expect(csv.split("\n")[0]).toBe(
      "Order Number,Supplier,Status,Expected Date,Total Cost,Product,SKU,Ordered,Received,Remaining,Unit Cost,Line Total",
    );
    expect(csv).toContain("PO-20260531-001,Acme Supply,sent,2026-06-05,42.50,Aloe Drink,ALOE-12,10,4,6,2.50,25.00");
    expect(csv).toContain('PO-20260531-002,Metro Traders,received,,18.00,"Mint Tea, Large",,6,6,0,3.00,18.00');
  });
});

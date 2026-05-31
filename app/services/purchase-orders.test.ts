import { describe, expect, test } from "vitest";

import {
  calculateLineTotal,
  calculatePurchaseOrderTotal,
  createPurchaseOrderLineDrafts,
  getSuggestedOrderQuantity,
  normalizePurchaseOrderStatus,
} from "./purchase-orders.server";

describe("purchase order helpers", () => {
  test("calculates suggested order quantity from reorder settings", () => {
    expect(
      getSuggestedOrderQuantity({
        inventoryQty: 3,
        reorderPoint: 10,
        reorderQty: 24,
        safetyStock: 2,
      }),
    ).toBe(24);

    expect(
      getSuggestedOrderQuantity({
        inventoryQty: 3,
        reorderPoint: 10,
        reorderQty: null,
        safetyStock: 2,
      }),
    ).toBe(9);
  });

  test("does not suggest ordering products above reorder point", () => {
    expect(
      getSuggestedOrderQuantity({
        inventoryQty: 14,
        reorderPoint: 10,
        reorderQty: 24,
        safetyStock: 2,
      }),
    ).toBe(0);
  });

  test("calculates line and order totals", () => {
    expect(calculateLineTotal(3, 12.5)).toBe(37.5);
    expect(
      calculatePurchaseOrderTotal([
        { quantity: 3, unitCost: 12.5 },
        { quantity: 2, unitCost: 4 },
      ]),
    ).toBe(45.5);
  });

  test("normalizes allowed statuses and rejects unknown statuses", () => {
    expect(normalizePurchaseOrderStatus("sent")).toBe("sent");
    expect(normalizePurchaseOrderStatus("received")).toBe("received");
    expect(() => normalizePurchaseOrderStatus("paid")).toThrow("Unknown purchase order status");
  });

  test("creates purchase order line drafts from valid quantities only", () => {
    const drafts = createPurchaseOrderLineDrafts(
      [
        { productId: "prod-1", title: "Aloe Drink", sku: "ALOE", inventoryCost: 2.5 },
        { productId: "prod-2", title: "Mint Tea", sku: null, inventoryCost: null },
        { productId: "prod-3", title: "Green Juice", sku: "GREEN", inventoryCost: 5 },
      ],
      new Map([
        ["prod-1", 4],
        ["prod-2", 0],
        ["prod-3", 2],
      ]),
    );

    expect(drafts).toEqual([
      {
        productId: "prod-1",
        titleSnapshot: "Aloe Drink",
        skuSnapshot: "ALOE",
        quantity: 4,
        unitCost: 2.5,
        lineTotal: 10,
      },
      {
        productId: "prod-3",
        titleSnapshot: "Green Juice",
        skuSnapshot: "GREEN",
        quantity: 2,
        unitCost: 5,
        lineTotal: 10,
      },
    ]);
  });
});

import { describe, expect, test } from "vitest";

import {
  calculateLineTotal,
  calculatePurchaseOrderTotal,
  createInventoryAdjustmentChanges,
  createPurchaseOrderLineDrafts,
  createPartialReceiptDrafts,
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

  test("creates Shopify inventory adjustment changes for receivable lines", () => {
    const result = createInventoryAdjustmentChanges([
      {
        titleSnapshot: "Aloe Drink",
        quantity: 4,
        product: {
          shopifyInventoryItemId: "gid://shopify/InventoryItem/1",
          shopifyLocationId: "gid://shopify/Location/1",
        },
      },
      {
        titleSnapshot: "Mint Tea",
        quantity: 2,
        product: {
          shopifyInventoryItemId: "gid://shopify/InventoryItem/2",
          shopifyLocationId: "gid://shopify/Location/1",
        },
      },
    ]);

    expect(result).toEqual({
      changes: [
        {
          delta: 4,
          inventoryItemId: "gid://shopify/InventoryItem/1",
          locationId: "gid://shopify/Location/1",
        },
        {
          delta: 2,
          inventoryItemId: "gid://shopify/InventoryItem/2",
          locationId: "gid://shopify/Location/1",
        },
      ],
      missingProducts: [],
    });
  });

  test("reports products missing Shopify inventory identifiers", () => {
    const result = createInventoryAdjustmentChanges([
      {
        titleSnapshot: "Aloe Drink",
        quantity: 4,
        product: {
          shopifyInventoryItemId: null,
          shopifyLocationId: "gid://shopify/Location/1",
        },
      },
      {
        titleSnapshot: "Mint Tea",
        quantity: 2,
        product: {
          shopifyInventoryItemId: "gid://shopify/InventoryItem/2",
          shopifyLocationId: null,
        },
      },
    ]);

    expect(result).toEqual({
      changes: [],
      missingProducts: ["Aloe Drink", "Mint Tea"],
    });
  });

  test("creates partial receipt drafts from remaining quantities", () => {
    const drafts = createPartialReceiptDrafts(
      [
        {
          id: "line-1",
          titleSnapshot: "Aloe Drink",
          quantity: 10,
          receipts: [{ quantity: 4 }],
          product: {
            shopifyInventoryItemId: "gid://shopify/InventoryItem/1",
            shopifyLocationId: "gid://shopify/Location/1",
          },
        },
        {
          id: "line-2",
          titleSnapshot: "Mint Tea",
          quantity: 3,
          receipts: [],
          product: {
            shopifyInventoryItemId: "gid://shopify/InventoryItem/2",
            shopifyLocationId: "gid://shopify/Location/1",
          },
        },
      ],
      new Map([
        ["line-1", 6],
        ["line-2", 1],
      ]),
    );

    expect(drafts).toEqual([
      {
        lineId: "line-1",
        titleSnapshot: "Aloe Drink",
        quantity: 6,
        remainingQuantity: 6,
        inventoryItemId: "gid://shopify/InventoryItem/1",
        locationId: "gid://shopify/Location/1",
      },
      {
        lineId: "line-2",
        titleSnapshot: "Mint Tea",
        quantity: 1,
        remainingQuantity: 3,
        inventoryItemId: "gid://shopify/InventoryItem/2",
        locationId: "gid://shopify/Location/1",
      },
    ]);
  });

  test("rejects partial receipts above remaining quantity", () => {
    expect(() =>
      createPartialReceiptDrafts(
        [
          {
            id: "line-1",
            titleSnapshot: "Aloe Drink",
            quantity: 10,
            receipts: [{ quantity: 4 }],
            product: {
              shopifyInventoryItemId: "gid://shopify/InventoryItem/1",
              shopifyLocationId: "gid://shopify/Location/1",
            },
          },
        ],
        new Map([["line-1", 7]]),
      ),
    ).toThrow("Aloe Drink only has 6 units remaining.");
  });
});

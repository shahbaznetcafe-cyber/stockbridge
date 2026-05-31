import { describe, expect, test } from "vitest";

import {
  buildSalesMetrics,
  getReorderPoint,
  summarizeInventoryMetrics,
} from "./inventory-calculations.server";

describe("inventory calculations", () => {
  test("uses product reorder point when present and falls back to default threshold", () => {
    expect(getReorderPoint({ reorderPoint: 7 })).toBe(7);
    expect(getReorderPoint({ reorderPoint: null })).toBe(10);
    expect(getReorderPoint({ reorderPoint: undefined })).toBe(10);
  });

  test("counts low stock against each product reorder point", () => {
    const metrics = summarizeInventoryMetrics([
      { status: "active", inventoryQty: 5, reorderPoint: 6, inventoryCost: 4 },
      { status: "active", inventoryQty: 12, reorderPoint: 6, inventoryCost: 8 },
      { status: "active", inventoryQty: 0, reorderPoint: null, inventoryCost: 3 },
      { status: "draft", inventoryQty: 0, reorderPoint: 10, inventoryCost: 99 },
    ]);

    expect(metrics.totalProducts).toBe(3);
    expect(metrics.lowStockProducts).toBe(2);
    expect(metrics.outOfStock).toBe(1);
    expect(metrics.totalInventoryValue).toBe(20 + 96);
  });

  test("builds sales metrics from recent order line items", () => {
    const now = new Date("2026-05-31T00:00:00.000Z");
    const metrics = buildSalesMetrics(
      [
        { productId: "gid://shopify/Product/1", quantity: 2, price: 12, soldAt: new Date("2026-05-30T00:00:00.000Z") },
        { productId: "gid://shopify/Product/1", quantity: 3, price: 12, soldAt: new Date("2026-04-15T00:00:00.000Z") },
        { productId: "gid://shopify/Product/2", quantity: 4, price: 5, soldAt: new Date("2026-03-05T00:00:00.000Z") },
      ],
      now,
    );

    expect(metrics.get("gid://shopify/Product/1")).toMatchObject({
      totalSold30: 2,
      totalSold90: 5,
      salesVelocity: 2 / 30,
      revenueAtRisk: 60,
    });
    expect(metrics.get("gid://shopify/Product/1")?.lastSoldAt?.toISOString()).toBe("2026-05-30T00:00:00.000Z");
    expect(metrics.get("gid://shopify/Product/2")).toMatchObject({
      totalSold30: 0,
      totalSold90: 4,
    });
  });
});

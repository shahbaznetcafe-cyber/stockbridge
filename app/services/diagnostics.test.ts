import { describe, expect, test } from "vitest";

import { buildDiagnosticsReport } from "./diagnostics.server";

describe("diagnostics report", () => {
  test("marks a fully configured store as ready", () => {
    const report = buildDiagnosticsReport({
      stats: {
        products: 12,
        activeProducts: 10,
        productsWithSuppliers: 10,
        productsMissingInventoryIds: 0,
        suppliers: 3,
        purchaseOrders: 4,
        openPurchaseOrders: 2,
        unresolvedAlerts: 1,
        notificationSettings: true,
      },
      env: {
        sendgridConfigured: true,
        notificationFromEmailConfigured: true,
        redisConfigured: true,
      },
    });

    expect(report.summary).toEqual({
      critical: 0,
      warning: 1,
      success: 7,
    });
    expect(report.readyForCustomer).toBe(true);
    expect(report.checks.map((check) => check.key)).toEqual([
      "products",
      "suppliers",
      "supplierAssignments",
      "shopifyInventoryIds",
      "purchaseOrders",
      "notifications",
      "backgroundJobs",
      "alerts",
    ]);
  });

  test("surfaces missing setup blockers", () => {
    const report = buildDiagnosticsReport({
      stats: {
        products: 0,
        activeProducts: 0,
        productsWithSuppliers: 0,
        productsMissingInventoryIds: 0,
        suppliers: 0,
        purchaseOrders: 0,
        openPurchaseOrders: 0,
        unresolvedAlerts: 0,
        notificationSettings: false,
      },
      env: {
        sendgridConfigured: false,
        notificationFromEmailConfigured: false,
        redisConfigured: false,
      },
    });

    expect(report.readyForCustomer).toBe(false);
    expect(report.summary.critical).toBe(4);
    expect(report.checks.filter((check) => check.status === "critical").map((check) => check.key)).toEqual([
      "products",
      "suppliers",
      "supplierAssignments",
      "shopifyInventoryIds",
    ]);
    expect(report.checks.find((check) => check.key === "notifications")?.status).toBe("warning");
    expect(report.checks.find((check) => check.key === "backgroundJobs")?.status).toBe("warning");
  });
});

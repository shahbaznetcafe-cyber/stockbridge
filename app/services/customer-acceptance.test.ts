import { describe, expect, test } from "vitest";

import { buildCustomerAcceptanceReport } from "./customer-acceptance.server";

describe("customer acceptance report", () => {
  test("builds final acceptance checklist for private customer release", () => {
    const report = buildCustomerAcceptanceReport({
      productionUrl: "https://stockbridge-ua7x.onrender.com",
      commitSha: "abc1234",
      generatedAt: "2026-06-01T10:00:00.000Z",
    });

    expect(report.releaseType).toBe("Private customer release");
    expect(report.productionUrl).toBe("https://stockbridge-ua7x.onrender.com");
    expect(report.commitSha).toBe("abc1234");
    expect(report.summary).toEqual({ total: 12, critical: 12 });
    expect(report.items.map((item) => item.key)).toEqual([
      "deployLatestCommit",
      "healthCheck",
      "shopifyInstall",
      "productSync",
      "supplierSetup",
      "purchaseOrderWorkflow",
      "inventoryReceiving",
      "printEmailExport",
      "alerts",
      "notifications",
      "diagnostics",
      "releaseReadiness",
    ]);
  });

  test("uses stable defaults when deployment metadata is missing", () => {
    const report = buildCustomerAcceptanceReport({});

    expect(report.productionUrl).toBe("https://stockbridge-ua7x.onrender.com");
    expect(report.commitSha).toBe("unknown");
    expect(report.generatedAt).toMatch(/\d{4}-\d{2}-\d{2}T/);
  });
});

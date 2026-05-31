import { describe, expect, test } from "vitest";

import { buildReleaseReadinessChecklist } from "./release-readiness.server";

describe("release readiness checklist", () => {
  test("marks private release ready when production essentials are present", () => {
    const checklist = buildReleaseReadinessChecklist({
      appUrl: "https://stockbridge-ua7x.onrender.com",
      configuredScopes: "read_products,write_products,read_inventory,write_inventory,read_orders",
      hasPrivacyUrl: true,
      hasSupportUrl: true,
      hasGdprWebhooks: true,
      hasDiagnosticsPage: true,
      hasBillingEnabled: false,
      distribution: "custom",
    });

    expect(checklist.summary).toEqual({ critical: 0, warning: 2, success: 7 });
    expect(checklist.privateReleaseReady).toBe(true);
    expect(checklist.appStoreReady).toBe(false);
    expect(checklist.items.find((item) => item.key === "billing")?.status).toBe("warning");
  });

  test("flags missing App Store review blockers", () => {
    const checklist = buildReleaseReadinessChecklist({
      appUrl: "",
      configuredScopes: "read_products,read_all_orders",
      hasPrivacyUrl: false,
      hasSupportUrl: false,
      hasGdprWebhooks: false,
      hasDiagnosticsPage: false,
      hasBillingEnabled: false,
      distribution: "public",
    });

    expect(checklist.privateReleaseReady).toBe(false);
    expect(checklist.appStoreReady).toBe(false);
    expect(checklist.items.filter((item) => item.status === "critical").map((item) => item.key)).toEqual([
      "productionUrl",
      "scopes",
      "privacy",
      "support",
      "gdpr",
      "diagnostics",
    ]);
  });
});

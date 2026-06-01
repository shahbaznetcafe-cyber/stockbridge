export type CustomerAcceptanceItem = {
  key: string;
  label: string;
  priority: "critical";
  expectedResult: string;
  evidence: string;
};

export type CustomerAcceptanceReportInput = {
  productionUrl?: string;
  commitSha?: string;
  generatedAt?: string;
};

function item(
  key: string,
  label: string,
  expectedResult: string,
  evidence: string,
): CustomerAcceptanceItem {
  return { key, label, priority: "critical", expectedResult, evidence };
}

export function buildCustomerAcceptanceReport(input: CustomerAcceptanceReportInput) {
  const productionUrl = input.productionUrl || "https://stockbridge-ua7x.onrender.com";
  const commitSha = input.commitSha || "unknown";
  const generatedAt = input.generatedAt || new Date().toISOString();

  const items: CustomerAcceptanceItem[] = [
    item("deployLatestCommit", "Deploy latest commit", "Render is running the latest GitHub main commit.", "Render deploy log shows successful deploy for the listed commit."),
    item("healthCheck", "Health check", `${productionUrl}/up returns 200.`, "HTTP response body contains status ok."),
    item("shopifyInstall", "Shopify install", "StockBridge opens inside Shopify Admin without Not Found, 500, or redirect loop.", "Embedded app dashboard loads for the test store."),
    item("productSync", "Product sync", "Products sync with title, SKU, inventory, image, cost, price, and Shopify inventory IDs.", "Products page shows synced rows and Diagnostics product checks are not critical."),
    item("supplierSetup", "Supplier setup", "At least one supplier exists and at least one product is assigned to a supplier.", "Suppliers page and Diagnostics supplier checks pass."),
    item("purchaseOrderWorkflow", "Purchase order workflow", "A draft purchase order can be created, marked sent, filtered, searched, and exported to CSV.", "Purchase Orders page shows PO row and CSV download contains line quantities."),
    item("inventoryReceiving", "Inventory receiving", "Partial/full receipt records history and increments Shopify/local inventory only by received quantity.", "Receipt history updates and Shopify inventory changes match received quantity."),
    item("printEmailExport", "Print, email, export", "Printable purchase order opens; email readiness is clear; CSV export works.", "Print page loads, Settings readiness is reviewed, CSV opens/downloads."),
    item("alerts", "Inventory alerts", "Low-stock/out-of-stock alerts display and can be resolved with success feedback.", "Alerts page shows expected status after resolve action."),
    item("notifications", "Notifications", "Email digest, email alerts, and Slack are ready or intentionally disabled.", "Settings Notification Readiness shows ready or disabled for each channel."),
    item("diagnostics", "Diagnostics", "Diagnostics has no critical blockers after setup.", "Diagnostics page summary critical count is 0."),
    item("releaseReadiness", "Release readiness", "Release Readiness has no critical private-release blockers.", "Release Readiness page summary critical count is 0."),
  ];

  return {
    releaseType: "Private customer release",
    productionUrl,
    commitSha,
    generatedAt,
    summary: {
      total: items.length,
      critical: items.filter((acceptanceItem) => acceptanceItem.priority === "critical").length,
    },
    items,
  };
}

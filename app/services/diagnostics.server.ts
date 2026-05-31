export type DiagnosticStatus = "success" | "warning" | "critical";

export type DiagnosticsStats = {
  products: number;
  activeProducts: number;
  productsWithSuppliers: number;
  productsMissingInventoryIds: number;
  suppliers: number;
  purchaseOrders: number;
  openPurchaseOrders: number;
  unresolvedAlerts: number;
  notificationSettings: boolean;
};

export type DiagnosticsEnv = {
  sendgridConfigured: boolean;
  notificationFromEmailConfigured: boolean;
  redisConfigured: boolean;
};

export type DiagnosticCheck = {
  key: string;
  label: string;
  status: DiagnosticStatus;
  value: string;
  action: string;
};

export type DiagnosticsReport = {
  readyForCustomer: boolean;
  summary: Record<DiagnosticStatus, number>;
  checks: DiagnosticCheck[];
};

function check(
  key: string,
  label: string,
  status: DiagnosticStatus,
  value: string,
  action: string,
): DiagnosticCheck {
  return { key, label, status, value, action };
}

export function buildDiagnosticsReport({
  stats,
  env,
}: {
  stats: DiagnosticsStats;
  env: DiagnosticsEnv;
}): DiagnosticsReport {
  const checks: DiagnosticCheck[] = [
    stats.products > 0
      ? check("products", "Product sync", "success", `${stats.products} products synced`, "Products are available for inventory planning.")
      : check("products", "Product sync", "critical", "No products synced", "Open Products and run Sync Products before customer handoff."),

    stats.suppliers > 0
      ? check("suppliers", "Suppliers", "success", `${stats.suppliers} suppliers`, "Supplier setup is available.")
      : check("suppliers", "Suppliers", "critical", "No suppliers", "Add at least one supplier before creating purchase orders."),

    stats.productsWithSuppliers > 0
      ? check(
          "supplierAssignments",
          "Supplier assignments",
          stats.productsWithSuppliers >= Math.max(stats.activeProducts, 1) ? "success" : "warning",
          `${stats.productsWithSuppliers}/${stats.activeProducts} active products assigned`,
          "Assign suppliers to remaining active products for better reorder planning.",
        )
      : check(
          "supplierAssignments",
          "Supplier assignments",
          "critical",
          "No products assigned to suppliers",
          "Assign synced products to suppliers so purchase orders can be generated.",
        ),

    stats.products > 0 && stats.productsMissingInventoryIds === 0
      ? check("shopifyInventoryIds", "Shopify inventory IDs", "success", "Ready", "Receiving can update Shopify inventory.")
      : check(
          "shopifyInventoryIds",
          "Shopify inventory IDs",
          "critical",
          `${stats.productsMissingInventoryIds} products missing IDs`,
          "Run Sync Products after deployment so receiving has inventory item and location IDs.",
        ),

    stats.purchaseOrders > 0
      ? check(
          "purchaseOrders",
          "Purchase orders",
          "success",
          `${stats.purchaseOrders} total / ${stats.openPurchaseOrders} open`,
          "Purchase order workflow has been used.",
        )
      : check(
          "purchaseOrders",
          "Purchase orders",
          "warning",
          "No purchase orders",
          "Create a draft purchase order from reorder candidates during customer testing.",
        ),

    env.sendgridConfigured && env.notificationFromEmailConfigured && stats.notificationSettings
      ? check("notifications", "Email notifications", "success", "Configured", "Email notifications can send.")
      : check(
          "notifications",
          "Email notifications",
          "warning",
          "Needs review",
          "Configure SENDGRID_API_KEY, NOTIFICATION_FROM_EMAIL, and Settings recipients before enabling email alerts.",
        ),

    env.redisConfigured
      ? check("backgroundJobs", "Background jobs", "success", "Redis configured", "Queued alert jobs can run.")
      : check(
          "backgroundJobs",
          "Background jobs",
          "warning",
          "Redis missing",
          "Set REDIS_URL if scheduled alert workers are required in production.",
        ),

    stats.unresolvedAlerts > 0
      ? check("alerts", "Inventory alerts", "warning", `${stats.unresolvedAlerts} unresolved`, "Review alerts before customer handoff.")
      : check("alerts", "Inventory alerts", "success", "No unresolved alerts", "Alert queue is clear."),
  ];

  const summary = checks.reduce<Record<DiagnosticStatus, number>>(
    (counts, item) => {
      counts[item.status] += 1;
      return counts;
    },
    { critical: 0, warning: 0, success: 0 },
  );

  return {
    readyForCustomer: summary.critical === 0,
    summary,
    checks,
  };
}

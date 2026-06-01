export const DEFAULT_REORDER_POINT = 10;

export type InventoryProductInput = {
  id?: string;
  title?: string;
  status: string;
  inventoryQty: number;
  inventoryCost: number | null;
  reorderPoint?: number | null;
  imageUrl?: string | null;
};

export type SalesLineItem = {
  productId: string;
  quantity: number;
  price: number;
  soldAt: Date;
};

export type SalesMetric = {
  totalSold30: number;
  totalSold90: number;
  lastSoldAt: Date | null;
  salesVelocity: number;
  revenueAtRisk: number;
};

export function getReorderPoint(product: { reorderPoint?: number | null }) {
  return product.reorderPoint ?? DEFAULT_REORDER_POINT;
}

export function summarizeInventoryMetrics(products: InventoryProductInput[]) {
  const activeProducts = products.filter((product) => product.status === "active");
  const lowStockProducts = activeProducts.filter(
    (product) => product.inventoryQty <= getReorderPoint(product),
  );
  const productsForReorder = lowStockProducts
    .sort((a, b) => a.inventoryQty - b.inventoryQty)
    .slice(0, 5);

  return {
    totalProducts: activeProducts.length,
    lowStockProducts: lowStockProducts.length,
    outOfStock: activeProducts.filter((product) => product.inventoryQty <= 0).length,
    totalInventoryValue: activeProducts.reduce(
      (total, product) => total + product.inventoryQty * (product.inventoryCost ?? 0),
      0,
    ),
    productsForReorder,
  };
}

export function buildSalesMetrics(lineItems: SalesLineItem[], now = new Date()) {
  const metrics = new Map<string, SalesMetric>();
  const thirtyDaysAgo = new Date(now);
  thirtyDaysAgo.setDate(thirtyDaysAgo.getDate() - 30);
  const ninetyDaysAgo = new Date(now);
  ninetyDaysAgo.setDate(ninetyDaysAgo.getDate() - 90);

  for (const item of lineItems) {
    if (item.soldAt < ninetyDaysAgo) continue;

    const current =
      metrics.get(item.productId) ??
      {
        totalSold30: 0,
        totalSold90: 0,
        lastSoldAt: null,
        salesVelocity: 0,
        revenueAtRisk: 0,
      };

    current.totalSold90 += item.quantity;
    current.revenueAtRisk += item.quantity * item.price;

    if (item.soldAt >= thirtyDaysAgo) {
      current.totalSold30 += item.quantity;
    }

    if (!current.lastSoldAt || item.soldAt > current.lastSoldAt) {
      current.lastSoldAt = item.soldAt;
    }

    current.salesVelocity = current.totalSold30 / 30;
    metrics.set(item.productId, current);
  }

  return metrics;
}

export function buildProductSyncMessage({
  productCount,
  salesLineItems,
  salesSyncWarning,
}: {
  productCount: number;
  salesLineItems?: number;
  salesSyncWarning?: string;
}) {
  if (salesSyncWarning) {
    return `Synced ${productCount} products. Order sales metrics skipped: ${salesSyncWarning}`;
  }

  return `Synced ${productCount} products and ${salesLineItems ?? 0} order line items.`;
}

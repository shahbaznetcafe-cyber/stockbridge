import prisma from "../db.server";

const LOW_STOCK_THRESHOLD = 10;
const DEAD_STOCK_DAYS = 90;

export async function checkLowStock(storeId: string) {
  const products = await prisma.product.findMany({
    where: {
      storeId,
      status: "active",
      isTracking: true,
    },
  });

  const alerts: { productId: string; type: string; message: string; severity: string }[] = [];

  for (const product of products) {
    const threshold = product.reorderPoint ?? LOW_STOCK_THRESHOLD;

    if (product.inventoryQty <= 0) {
      alerts.push({
        productId: product.id,
        type: "out_of_stock",
        message: `${product.title} is out of stock`,
        severity: "critical",
      });
    } else if (product.inventoryQty <= threshold) {
      alerts.push({
        productId: product.id,
        type: "low_stock",
        message: `${product.title} is low on stock (${product.inventoryQty} units remaining)`,
        severity: product.inventoryQty <= threshold * 0.5 ? "critical" : "warning",
      });
    }
  }

  for (const alert of alerts) {
    const existing = await prisma.stockAlert.findFirst({
      where: {
        storeId,
        productId: alert.productId,
        type: alert.type,
        isResolved: false,
      },
    });

    if (!existing) {
      await prisma.stockAlert.create({
        data: {
          storeId,
          productId: alert.productId,
          type: alert.type,
          message: alert.message,
          severity: alert.severity,
        },
      });
    }
  }

  return alerts;
}

export async function checkDeadStock(storeId: string) {
  const cutoff = new Date();
  cutoff.setDate(cutoff.getDate() - DEAD_STOCK_DAYS);

  const products = await prisma.product.findMany({
    where: {
      storeId,
      status: "active",
      isTracking: true,
      inventoryQty: { gt: 0 },
      lastSoldAt: { lt: cutoff },
    },
  });

  const alerts: { productId: string; type: string; message: string; severity: string }[] = [];

  for (const product of products) {
    alerts.push({
      productId: product.id,
      type: "dead_stock",
      message: `${product.title} hasn't sold in ${DEAD_STOCK_DAYS} days (${product.inventoryQty} units, $${(product.inventoryQty * (product.inventoryCost ?? 0)).toFixed(2)})`,
      severity: "warning",
    });

    const existing = await prisma.stockAlert.findFirst({
      where: {
        storeId,
        productId: product.id,
        type: "dead_stock",
        isResolved: false,
      },
    });

    if (!existing) {
      await prisma.stockAlert.create({
        data: {
          storeId,
          productId: product.id,
          type: "dead_stock",
          message: alerts[alerts.length - 1].message,
          severity: alerts[alerts.length - 1].severity,
        },
      });
    }
  }

  return alerts;
}

export async function getUnresolvedAlerts(storeId: string) {
  return prisma.stockAlert.findMany({
    where: { storeId, isResolved: false },
    orderBy: [{ severity: "desc" }, { createdAt: "desc" }],
    include: { product: { select: { title: true, imageUrl: true } } },
  });
}

export async function resolveAlert(alertId: string) {
  return prisma.stockAlert.update({
    where: { id: alertId },
    data: { isResolved: true, resolvedAt: new Date() },
  });
}

export async function getAlertStats(storeId: string) {
  const [total, resolved, critical, lowStock, outOfStock, deadStock] = await Promise.all([
    prisma.stockAlert.count({ where: { storeId } }),
    prisma.stockAlert.count({ where: { storeId, isResolved: true } }),
    prisma.stockAlert.count({ where: { storeId, severity: "critical", isResolved: false } }),
    prisma.stockAlert.count({ where: { storeId, type: "low_stock", isResolved: false } }),
    prisma.stockAlert.count({ where: { storeId, type: "out_of_stock", isResolved: false } }),
    prisma.stockAlert.count({ where: { storeId, type: "dead_stock", isResolved: false } }),
  ]);

  return { total, resolved, unresolved: total - resolved, critical, lowStock, outOfStock, deadStock };
}

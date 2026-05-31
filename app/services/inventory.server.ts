import prisma from "../db.server";
import {
  buildSalesMetrics,
  summarizeInventoryMetrics,
  type SalesLineItem,
} from "./inventory-calculations.server";
import { checkDeadStock, checkLowStock } from "./alerts.server";

export async function syncProducts(storeId: string, admin: any) {
  const products: any[] = [];
  let hasNextPage = true;
  let cursor: string | null = null;

  while (hasNextPage) {
    const query = `#graphql
      query getProducts($first: Int!, $after: String) {
        products(first: $first, after: $after) {
          edges {
            cursor
            node {
              id
              title
              vendor
              productType
              status
              totalInventory
              sku: metafield(namespace: "stockbridge", key: "sku") { value }
              barcode: metafield(namespace: "stockbridge", key: "barcode") { value }
              cost: metafield(namespace: "stockbridge", key: "cost") { value }
              leadTime: metafield(namespace: "stockbridge", key: "lead_time") { value }
              safetyStock: metafield(namespace: "stockbridge", key: "safety_stock") { value }
              reorderPoint: metafield(namespace: "stockbridge", key: "reorder_point") { value }
              reorderQty: metafield(namespace: "stockbridge", key: "reorder_qty") { value }
              featuredImage {
                url
              }
              variants(first: 1) {
                edges {
                  node {
                    id
                    price
                    sku
                    barcode
                    inventoryQuantity
                  }
                }
              }
            }
          }
          pageInfo {
            hasNextPage
            endCursor
          }
        }
      }`;

    const response = await admin.graphql(query, {
      variables: { first: 250, after: cursor },
    });
    const json = await response.json();
    const edges = json.data.products.edges;

    for (const edge of edges) {
      const p = edge.node;
      const variant = p.variants.edges[0]?.node;
      products.push({
        shopifyId: p.id,
        storeId,
        title: p.title,
        vendor: p.vendor,
        productType: p.productType,
        status: p.status,
        sku: p.sku?.value || variant?.sku || null,
        barcode: p.barcode?.value || variant?.barcode || null,
        price: variant?.price ? parseFloat(variant.price) : null,
        inventoryQty: p.totalInventory ?? variant?.inventoryQuantity ?? 0,
        imageUrl: p.featuredImage?.url || null,
        inventoryCost: p.cost?.value ? parseFloat(p.cost.value) : null,
        leadTimeDays: p.leadTime?.value ? parseInt(p.leadTime.value) : 14,
        safetyStock: p.safetyStock?.value ? parseInt(p.safetyStock.value) : 0,
        reorderPoint: p.reorderPoint?.value ? parseInt(p.reorderPoint.value) : null,
        reorderQty: p.reorderQty?.value ? parseInt(p.reorderQty.value) : null,
      });
    }

    hasNextPage = json.data.products.pageInfo.hasNextPage;
    cursor = json.data.products.pageInfo.endCursor;
  }

  for (const p of products) {
    await prisma.product.upsert({
      where: { id: p.shopifyId },
      update: {
        title: p.title,
        vendor: p.vendor,
        productType: p.productType,
        status: p.status,
        sku: p.sku,
        barcode: p.barcode,
        price: p.price,
        inventoryQty: p.inventoryQty,
        imageUrl: p.imageUrl,
        inventoryCost: p.inventoryCost,
        leadTimeDays: p.leadTimeDays,
        safetyStock: p.safetyStock,
        reorderPoint: p.reorderPoint,
        reorderQty: p.reorderQty,
      },
      create: {
        id: p.shopifyId,
        storeId: p.storeId,
        title: p.title,
        vendor: p.vendor,
        productType: p.productType,
        status: p.status,
        sku: p.sku,
        barcode: p.barcode,
        price: p.price,
        inventoryQty: p.inventoryQty,
        imageUrl: p.imageUrl,
        inventoryCost: p.inventoryCost,
        leadTimeDays: p.leadTimeDays,
        safetyStock: p.safetyStock,
        reorderPoint: p.reorderPoint,
        reorderQty: p.reorderQty,
      },
    });
  }

  await checkLowStock(storeId);
  await checkDeadStock(storeId);

  return products.length;
}

export async function getProductMetrics(storeId: string) {
  const products = await prisma.product.findMany({
    where: { storeId, status: "active" },
    select: {
      id: true,
      title: true,
      status: true,
      inventoryQty: true,
      inventoryCost: true,
      reorderPoint: true,
      imageUrl: true,
    },
  });

  return summarizeInventoryMetrics(products);
}

export async function getTopSellingProducts(storeId: string, days: number = 30) {
  return prisma.product.findMany({
    where: {
      storeId,
      status: "active",
      totalSold30: days === 30 ? { gt: 0 } : undefined,
    },
    orderBy: days === 30 ? { totalSold30: "desc" } : { totalSold90: "desc" },
    take: 10,
    select: {
      id: true,
      title: true,
      sku: true,
      inventoryQty: true,
      totalSold30: true,
      totalSold90: true,
      price: true,
      imageUrl: true,
      daysOfSupply: true,
    },
  });
}

function parseMoney(value: unknown) {
  if (typeof value === "number") return value;
  if (typeof value === "string") return parseFloat(value) || 0;
  return 0;
}

function parseOrderLineItems(orderEdges: any[]) {
  const lineItems: SalesLineItem[] = [];

  for (const edge of orderEdges) {
    const order = edge.node;
    const soldAt = new Date(order.processedAt ?? order.createdAt);

    for (const lineEdge of order.lineItems.edges ?? []) {
      const line = lineEdge.node;
      const productId = line.variant?.product?.id;
      if (!productId) continue;

      const price =
        parseMoney(line.originalUnitPriceSet?.shopMoney?.amount) ||
        parseMoney(line.discountedUnitPriceSet?.shopMoney?.amount);

      lineItems.push({
        productId,
        quantity: line.quantity ?? 0,
        price,
        soldAt,
      });
    }
  }

  return lineItems;
}

export async function syncOrderSalesMetrics(storeId: string, admin: any) {
  const lineItems: SalesLineItem[] = [];
  let hasNextPage = true;
  let cursor: string | null = null;
  const since = new Date();
  // Shopify read_orders normally exposes recent orders only. Keep the sync inside
  // that private-app-safe window unless read_all_orders is approved later.
  since.setDate(since.getDate() - 60);

  while (hasNextPage) {
    const query = `#graphql
      query getRecentOrders($first: Int!, $after: String, $query: String!) {
        orders(first: $first, after: $after, query: $query, sortKey: PROCESSED_AT, reverse: true) {
          edges {
            cursor
            node {
              id
              createdAt
              processedAt
              lineItems(first: 100) {
                edges {
                  node {
                    quantity
                    originalUnitPriceSet {
                      shopMoney {
                        amount
                      }
                    }
                    discountedUnitPriceSet {
                      shopMoney {
                        amount
                      }
                    }
                    variant {
                      product {
                        id
                      }
                    }
                  }
                }
              }
            }
          }
          pageInfo {
            hasNextPage
            endCursor
          }
        }
      }`;

    const response = await admin.graphql(query, {
      variables: {
        first: 100,
        after: cursor,
        query: `processed_at:>=${since.toISOString().slice(0, 10)} financial_status:paid`,
      },
    });
    const json = await response.json();
    const orders = json.data?.orders;
    if (!orders) break;

    lineItems.push(...parseOrderLineItems(orders.edges ?? []));
    hasNextPage = Boolean(orders.pageInfo?.hasNextPage);
    cursor = orders.pageInfo?.endCursor ?? null;
  }

  const metrics = buildSalesMetrics(lineItems);
  const products = await prisma.product.findMany({
    where: { storeId },
    select: { id: true, inventoryQty: true },
  });

  for (const product of products) {
    const productMetrics = metrics.get(product.id) ?? {
      totalSold30: 0,
      totalSold90: 0,
      lastSoldAt: null,
      salesVelocity: 0,
      revenueAtRisk: 0,
    };

    await prisma.product.update({
      where: { id: product.id },
      data: {
        totalSold30: productMetrics.totalSold30,
        totalSold90: productMetrics.totalSold90,
        lastSoldAt: productMetrics.lastSoldAt,
        salesVelocity: productMetrics.salesVelocity,
        daysOfSupply:
          productMetrics.salesVelocity > 0
            ? product.inventoryQty / productMetrics.salesVelocity
            : 0,
        revenueAtRisk: productMetrics.revenueAtRisk,
      },
    });
  }

  await checkLowStock(storeId);
  await checkDeadStock(storeId);

  return { ordersLineItems: lineItems.length, productsUpdated: products.length };
}

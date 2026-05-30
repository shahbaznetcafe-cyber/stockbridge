import prisma from "../db.server";

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

  return products.length;
}

export async function getProductMetrics(storeId: string) {
  const totalProducts = await prisma.product.count({
    where: { storeId, status: "active" },
  });

  const lowStockProducts = await prisma.product.count({
    where: {
      storeId,
      status: "active",
      inventoryQty: { lte: prisma.product.fields.reorderPoint ?? 10 },
    },
  });

  const outOfStock = await prisma.product.count({
    where: { storeId, status: "active", inventoryQty: 0 },
  });

  const totalInventoryValue = await prisma.product.aggregate({
    where: { storeId, status: "active", inventoryCost: { not: null } },
    _sum: { inventoryCost: true },
  });

  const productsForReorder = await prisma.product.findMany({
    where: {
      storeId,
      status: "active",
      inventoryQty: { lte: prisma.product.fields.reorderPoint ?? 10 },
    },
    orderBy: { inventoryQty: "asc" },
    take: 5,
    select: { id: true, title: true, inventoryQty: true, reorderPoint: true, imageUrl: true },
  });

  return {
    totalProducts,
    lowStockProducts,
    outOfStock,
    totalInventoryValue: totalInventoryValue._sum.inventoryCost || 0,
    productsForReorder,
  };
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

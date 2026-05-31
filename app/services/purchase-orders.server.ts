import prisma from "../db.server";

export const PURCHASE_ORDER_STATUSES = ["draft", "sent", "partial", "received", "cancelled"] as const;

export type PurchaseOrderStatus = (typeof PURCHASE_ORDER_STATUSES)[number];

export type ReorderProductInput = {
  inventoryQty: number;
  reorderPoint: number | null;
  reorderQty: number | null;
  safetyStock: number;
};

export type PurchaseOrderLineInput = {
  quantity: number;
  unitCost: number;
};

export type ProductForPurchaseOrderLine = {
  productId: string;
  title: string;
  sku: string | null;
  inventoryCost: number | null;
};

export type PurchaseOrderLineDraft = {
  productId: string;
  titleSnapshot: string;
  skuSnapshot: string | null;
  quantity: number;
  unitCost: number;
  lineTotal: number;
};

export type ReceivablePurchaseOrderLine = {
  id?: string;
  titleSnapshot: string;
  quantity: number;
  receipts?: Array<{ quantity: number }>;
  product: {
    shopifyInventoryItemId: string | null;
    shopifyLocationId: string | null;
  };
};

export type PartialReceiptDraft = {
  lineId: string;
  titleSnapshot: string;
  quantity: number;
  remainingQuantity: number;
  inventoryItemId: string;
  locationId: string;
};

export function getSuggestedOrderQuantity(product: ReorderProductInput) {
  const reorderPoint = product.reorderPoint ?? 10;
  if (product.inventoryQty > reorderPoint) return 0;

  if (product.reorderQty && product.reorderQty > 0) return product.reorderQty;

  return Math.max(reorderPoint + product.safetyStock - product.inventoryQty, 1);
}

export function calculateLineTotal(quantity: number, unitCost: number) {
  return Number((quantity * unitCost).toFixed(2));
}

export function calculatePurchaseOrderTotal(lines: PurchaseOrderLineInput[]) {
  return Number(
    lines.reduce((total, line) => total + calculateLineTotal(line.quantity, line.unitCost), 0).toFixed(2),
  );
}

export function normalizePurchaseOrderStatus(status: string): PurchaseOrderStatus {
  if (PURCHASE_ORDER_STATUSES.includes(status as PurchaseOrderStatus)) {
    return status as PurchaseOrderStatus;
  }

  throw new Error(`Unknown purchase order status: ${status}`);
}

export function createPurchaseOrderLineDrafts(
  products: ProductForPurchaseOrderLine[],
  quantitiesByProductId: Map<string, number>,
): PurchaseOrderLineDraft[] {
  return products.flatMap((product) => {
    const quantity = Math.floor(quantitiesByProductId.get(product.productId) ?? 0);
    if (quantity <= 0) return [];

    const unitCost = product.inventoryCost ?? 0;
    return [
      {
        productId: product.productId,
        titleSnapshot: product.title,
        skuSnapshot: product.sku,
        quantity,
        unitCost,
        lineTotal: calculateLineTotal(quantity, unitCost),
      },
    ];
  });
}

export function createInventoryAdjustmentChanges(lines: ReceivablePurchaseOrderLine[]) {
  const changes: Array<{ delta: number; inventoryItemId: string; locationId: string }> = [];
  const missingProducts: string[] = [];

  for (const line of lines) {
    const inventoryItemId = line.product.shopifyInventoryItemId;
    const locationId = line.product.shopifyLocationId;

    if (!inventoryItemId || !locationId) {
      missingProducts.push(line.titleSnapshot);
      continue;
    }

    changes.push({
      delta: line.quantity,
      inventoryItemId,
      locationId,
    });
  }

  return { changes, missingProducts };
}

function getReceivedQuantity(line: { receipts?: Array<{ quantity: number }> }) {
  return line.receipts?.reduce((total, receipt) => total + receipt.quantity, 0) ?? 0;
}

export function createPartialReceiptDrafts(
  lines: Array<ReceivablePurchaseOrderLine & { id: string }>,
  quantitiesByLineId: Map<string, number>,
): PartialReceiptDraft[] {
  return lines.flatMap((line) => {
    const quantity = Math.floor(quantitiesByLineId.get(line.id) ?? 0);
    if (quantity <= 0) return [];

    const remainingQuantity = line.quantity - getReceivedQuantity(line);
    if (quantity > remainingQuantity) {
      throw new Error(`${line.titleSnapshot} only has ${remainingQuantity} units remaining.`);
    }

    const inventoryItemId = line.product.shopifyInventoryItemId;
    const locationId = line.product.shopifyLocationId;
    if (!inventoryItemId || !locationId) {
      throw new Error(`Sync products before receiving. Missing Shopify inventory identifiers for: ${line.titleSnapshot}.`);
    }

    return [
      {
        lineId: line.id,
        titleSnapshot: line.titleSnapshot,
        quantity,
        remainingQuantity,
        inventoryItemId,
        locationId,
      },
    ];
  });
}

export async function getPurchaseOrderPageData(storeId: string) {
  const [suppliers, products, purchaseOrders] = await Promise.all([
    prisma.supplier.findMany({
      where: { storeId },
      orderBy: { name: "asc" },
      select: { id: true, name: true, leadTimeDays: true, moq: true },
    }),
    prisma.product.findMany({
      where: { storeId, status: "active", supplierId: { not: null } },
      orderBy: [{ supplierId: "asc" }, { title: "asc" }],
      select: {
        id: true,
        supplierId: true,
        title: true,
        sku: true,
        inventoryQty: true,
        inventoryCost: true,
        reorderPoint: true,
        reorderQty: true,
        safetyStock: true,
      },
    }),
    prisma.purchaseOrder.findMany({
      where: { storeId },
      orderBy: { createdAt: "desc" },
      include: {
        supplier: { select: { name: true } },
        lines: {
          select: {
            id: true,
            productId: true,
            titleSnapshot: true,
            skuSnapshot: true,
            quantity: true,
            unitCost: true,
            lineTotal: true,
            receipts: { select: { quantity: true, createdAt: true }, orderBy: { createdAt: "desc" } },
          },
          orderBy: { createdAt: "asc" },
        },
        receipts: { select: { id: true, quantity: true, createdAt: true, line: { select: { titleSnapshot: true } } }, orderBy: { createdAt: "desc" } },
      },
      take: 50,
    }),
  ]);

  const reorderCandidates = products
    .map((product) => ({
      ...product,
      suggestedQty: getSuggestedOrderQuantity(product),
    }))
    .filter((product) => product.suggestedQty > 0);

  return { suppliers, reorderCandidates, purchaseOrders };
}

async function getNextPurchaseOrderNumber(storeId: string) {
  const today = new Date();
  const datePart = today.toISOString().slice(0, 10).replace(/-/g, "");
  const count = await prisma.purchaseOrder.count({ where: { storeId } });
  return `PO-${datePart}-${String(count + 1).padStart(3, "0")}`;
}

export async function createPurchaseOrderFromQuantities({
  storeId,
  supplierId,
  quantitiesByProductId,
  expectedDate,
  notes,
}: {
  storeId: string;
  supplierId: string;
  quantitiesByProductId: Map<string, number>;
  expectedDate?: string | null;
  notes?: string | null;
}) {
  const supplier = await prisma.supplier.findFirst({
    where: { id: supplierId, storeId },
    select: { id: true },
  });

  if (!supplier) throw new Error("Supplier not found");

  const productIds = [...quantitiesByProductId.keys()];
  const products = await prisma.product.findMany({
    where: { id: { in: productIds }, storeId, supplierId },
    select: { id: true, title: true, sku: true, inventoryCost: true },
  });

  const lines = createPurchaseOrderLineDrafts(
    products.map((product) => ({
      productId: product.id,
      title: product.title,
      sku: product.sku,
      inventoryCost: product.inventoryCost,
    })),
    quantitiesByProductId,
  );

  if (lines.length === 0) throw new Error("Add at least one product quantity before creating a purchase order.");

  const totalCost = calculatePurchaseOrderTotal(lines);
  const orderNumber = await getNextPurchaseOrderNumber(storeId);

  return prisma.purchaseOrder.create({
    data: {
      storeId,
      supplierId,
      orderNumber,
      expectedDate: expectedDate ? new Date(expectedDate) : null,
      notes: notes?.trim() || null,
      totalCost,
      lines: {
        create: lines,
      },
    },
    include: { lines: true, supplier: { select: { name: true } } },
  });
}

export async function updatePurchaseOrderStatus(storeId: string, purchaseOrderId: string, status: string) {
  const normalizedStatus = normalizePurchaseOrderStatus(status);
  if (normalizedStatus === "received" || normalizedStatus === "partial") {
    throw new Error("Use the receive inventory workflow to update receiving status.");
  }
  const timestamp = new Date();

  const order = await prisma.purchaseOrder.findFirst({
    where: { id: purchaseOrderId, storeId },
    select: { id: true },
  });

  if (!order) throw new Error("Purchase order not found");

  return prisma.purchaseOrder.update({
    where: { id: purchaseOrderId },
    data: {
      status: normalizedStatus,
      sentAt: normalizedStatus === "sent" ? timestamp : undefined,
      cancelledAt: normalizedStatus === "cancelled" ? timestamp : undefined,
    },
  });
}

async function applyShopifyInventoryReceipt(admin: any, idempotencyKey: string, referenceDocumentUri: string, changes: Array<{ delta: number; inventoryItemId: string; locationId: string }>) {
  const query = `#graphql
    mutation receivePurchaseOrderInventory($input: InventoryAdjustQuantitiesInput!, $idempotencyKey: String!) {
      inventoryAdjustQuantities(input: $input) @idempotent(key: $idempotencyKey) {
        userErrors {
          field
          message
        }
        inventoryAdjustmentGroup {
          createdAt
          reason
          referenceDocumentUri
        }
      }
    }`;

  const response = await admin.graphql(query, {
    variables: {
      input: {
        reason: "restock",
        name: "available",
        referenceDocumentUri,
        changes,
      },
      idempotencyKey,
    },
  });
  const json = await response.json();
  const userErrors = json.data?.inventoryAdjustQuantities?.userErrors ?? [];

  if (userErrors.length > 0) {
    throw new Error(userErrors.map((error: { message: string }) => error.message).join("; "));
  }

  if (json.errors?.length) {
    throw new Error(json.errors.map((error: { message: string }) => error.message).join("; "));
  }
}

export async function receivePurchaseOrderPartially(
  storeId: string,
  purchaseOrderId: string,
  quantitiesByLineId: Map<string, number>,
  admin: any,
) {
  const order = await prisma.purchaseOrder.findFirst({
    where: { id: purchaseOrderId, storeId },
    include: {
      lines: {
        include: {
          receipts: { select: { quantity: true } },
          product: {
            select: {
              id: true,
              shopifyInventoryItemId: true,
              shopifyLocationId: true,
            },
          },
        },
      },
    },
  });

  if (!order) throw new Error("Purchase order not found");
  if (order.status === "received") throw new Error("Purchase order has already been fully received.");
  if (order.status === "cancelled") throw new Error("Cancelled purchase orders cannot be received.");

  const drafts = createPartialReceiptDrafts(order.lines, quantitiesByLineId);
  if (drafts.length === 0) throw new Error("Enter at least one received quantity.");

  const receiptGroupId = `${Date.now()}-${Math.random().toString(36).slice(2)}`;
  await applyShopifyInventoryReceipt(
    admin,
    `stockbridge-po-partial-${purchaseOrderId}-${receiptGroupId}`,
    `stockbridge://purchase-orders/${purchaseOrderId}/receipts/${receiptGroupId}`,
    drafts.map((draft) => ({
      delta: draft.quantity,
      inventoryItemId: draft.inventoryItemId,
      locationId: draft.locationId,
    })),
  );

  const lineById = new Map(order.lines.map((line) => [line.id, line]));
  const totalOrdered = order.lines.reduce((total, line) => total + line.quantity, 0);
  const alreadyReceived = order.lines.reduce((total, line) => total + getReceivedQuantity(line), 0);
  const newlyReceived = drafts.reduce((total, draft) => total + draft.quantity, 0);
  const nextReceived = alreadyReceived + newlyReceived;
  const isFullyReceived = nextReceived >= totalOrdered;
  const timestamp = new Date();

  await prisma.$transaction([
    ...drafts.map((draft) => {
      const line = lineById.get(draft.lineId);
      if (!line) throw new Error("Purchase order line not found");

      return prisma.purchaseOrderReceipt.create({
        data: {
          purchaseOrderId,
          lineId: draft.lineId,
          productId: line.productId,
          quantity: draft.quantity,
        },
      });
    }),
    ...drafts.map((draft) => {
      const line = lineById.get(draft.lineId);
      if (!line) throw new Error("Purchase order line not found");

      return prisma.product.update({
        where: { id: line.productId },
        data: { inventoryQty: { increment: draft.quantity } },
      });
    }),
    prisma.purchaseOrder.update({
      where: { id: purchaseOrderId },
      data: {
        status: isFullyReceived ? "received" : "partial",
        receivedAt: isFullyReceived ? timestamp : undefined,
      },
    }),
  ]);

  return { receivedLines: drafts.length, receivedUnits: newlyReceived, fullyReceived: isFullyReceived };
}

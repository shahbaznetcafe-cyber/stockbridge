import prisma from "../db.server";

export const PURCHASE_ORDER_STATUSES = ["draft", "sent", "received", "cancelled"] as const;

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
            titleSnapshot: true,
            skuSnapshot: true,
            quantity: true,
            unitCost: true,
            lineTotal: true,
          },
          orderBy: { createdAt: "asc" },
        },
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
      receivedAt: normalizedStatus === "received" ? timestamp : undefined,
      cancelledAt: normalizedStatus === "cancelled" ? timestamp : undefined,
    },
  });
}

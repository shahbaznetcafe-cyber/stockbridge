import { PURCHASE_ORDER_STATUSES, type PurchaseOrderStatus } from "./purchase-orders.server";

export type PurchaseOrderFilters = {
  q: string;
  status: string;
};

export type ExportablePurchaseOrder = {
  id: string;
  orderNumber: string;
  status: string;
  expectedDate: Date | string | null;
  totalCost: number;
  supplier: { name: string };
  lines: Array<{
    titleSnapshot: string;
    skuSnapshot: string | null;
    quantity: number;
    unitCost: number;
    lineTotal: number;
    receipts: Array<{ quantity: number }>;
  }>;
};

export function getPurchaseOrderFilterParams(url: URL): PurchaseOrderFilters {
  const q = (url.searchParams.get("q") || "").trim();
  const status = (url.searchParams.get("status") || "all").trim().toLowerCase();

  return {
    q,
    status: PURCHASE_ORDER_STATUSES.includes(status as PurchaseOrderStatus) ? status : "all",
  };
}

export function filterPurchaseOrders<T extends ExportablePurchaseOrder>(
  orders: T[],
  filters: Partial<PurchaseOrderFilters>,
) {
  const query = (filters.q || "").trim().toLowerCase();
  const status = (filters.status || "all").trim().toLowerCase();

  return orders.filter((order) => {
    if (status !== "all" && order.status !== status) return false;
    if (!query) return true;

    const searchableValues = [
      order.orderNumber,
      order.status,
      order.supplier.name,
      ...order.lines.flatMap((line) => [line.titleSnapshot, line.skuSnapshot || ""]),
    ];

    return searchableValues.some((value) => value.toLowerCase().includes(query));
  });
}

function startOfDay(value: Date) {
  return new Date(Date.UTC(value.getUTCFullYear(), value.getUTCMonth(), value.getUTCDate()));
}

function isOpenStatus(status: string) {
  return status !== "received" && status !== "cancelled";
}

export function calculatePurchaseOrderSummary(orders: ExportablePurchaseOrder[], now = new Date()) {
  const today = startOfDay(now);
  const weekEnd = new Date(today);
  weekEnd.setUTCDate(weekEnd.getUTCDate() + 7);

  const openOrders = orders.filter((order) => isOpenStatus(order.status));
  const overdueOrders = openOrders.filter((order) => {
    if (!order.expectedDate) return false;
    return startOfDay(new Date(order.expectedDate)) < today;
  });
  const dueThisWeekOrders = openOrders.filter((order) => {
    if (!order.expectedDate) return false;
    const expectedDate = startOfDay(new Date(order.expectedDate));
    return expectedDate >= today && expectedDate <= weekEnd;
  });

  return {
    totalOrders: orders.length,
    openOrders: openOrders.length,
    draftOrders: orders.filter((order) => order.status === "draft").length,
    sentOrders: orders.filter((order) => order.status === "sent").length,
    partialOrders: orders.filter((order) => order.status === "partial").length,
    overdueOrders: overdueOrders.length,
    dueThisWeekOrders: dueThisWeekOrders.length,
    openOrderValue: Number(openOrders.reduce((total, order) => total + order.totalCost, 0).toFixed(2)),
  };
}

function getReceivedQuantity(line: ExportablePurchaseOrder["lines"][number]) {
  return line.receipts.reduce((total, receipt) => total + receipt.quantity, 0);
}

function formatDateForCsv(value: Date | string | null) {
  if (!value) return "";
  return new Date(value).toISOString().slice(0, 10);
}

function csvCell(value: string | number | null) {
  const text = value === null ? "" : String(value);
  if (!/[",\n\r]/.test(text)) return text;
  return `"${text.replace(/"/g, '""')}"`;
}

function moneyCell(value: number) {
  return value.toFixed(2);
}

export function buildPurchaseOrderCsv(orders: ExportablePurchaseOrder[]) {
  const rows = [
    [
      "Order Number",
      "Supplier",
      "Status",
      "Expected Date",
      "Total Cost",
      "Product",
      "SKU",
      "Ordered",
      "Received",
      "Remaining",
      "Unit Cost",
      "Line Total",
    ],
  ];

  for (const order of orders) {
    for (const line of order.lines) {
      const received = getReceivedQuantity(line);
      rows.push([
        order.orderNumber,
        order.supplier.name,
        order.status,
        formatDateForCsv(order.expectedDate),
        moneyCell(order.totalCost),
        line.titleSnapshot,
        line.skuSnapshot || "",
        String(line.quantity),
        String(received),
        String(Math.max(line.quantity - received, 0)),
        moneyCell(line.unitCost),
        moneyCell(line.lineTotal),
      ]);
    }
  }

  return rows.map((row) => row.map(csvCell).join(",")).join("\n");
}

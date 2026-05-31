import type { LoaderFunctionArgs } from "@remix-run/node";

import prisma from "../db.server";
import { authenticate } from "../shopify.server";
import {
  buildPurchaseOrderCsv,
  filterPurchaseOrders,
  getPurchaseOrderFilterParams,
} from "../services/purchase-order-exports.server";

export const loader = async ({ request }: LoaderFunctionArgs) => {
  const { session } = await authenticate.admin(request);

  const store = await prisma.store.findUnique({ where: { shop: session.shop } });
  if (!store) throw new Response("Store not found", { status: 404 });

  const filters = getPurchaseOrderFilterParams(new URL(request.url));
  const purchaseOrders = await prisma.purchaseOrder.findMany({
    where: { storeId: store.id },
    orderBy: { createdAt: "desc" },
    include: {
      supplier: { select: { name: true } },
      lines: {
        select: {
          titleSnapshot: true,
          skuSnapshot: true,
          quantity: true,
          unitCost: true,
          lineTotal: true,
          receipts: { select: { quantity: true } },
        },
        orderBy: { createdAt: "asc" },
      },
    },
    take: 500,
  });

  const csv = buildPurchaseOrderCsv(filterPurchaseOrders(purchaseOrders, filters));
  return new Response(csv, {
    headers: {
      "Content-Type": "text/csv; charset=utf-8",
      "Content-Disposition": 'attachment; filename="stockbridge-purchase-orders.csv"',
      "Cache-Control": "no-store",
    },
  });
};

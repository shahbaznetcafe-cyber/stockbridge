import type { ActionFunctionArgs, LoaderFunctionArgs } from "@remix-run/node";
import { json } from "@remix-run/node";
import { Form, useActionData, useLoaderData } from "@remix-run/react";
import { authenticate } from "../shopify.server";
import prisma from "../db.server";
import {
  buildPurchaseOrderDocument,
  sendPurchaseOrderEmail,
} from "../services/purchase-order-documents.server";

export const loader = async ({ request, params }: LoaderFunctionArgs) => {
  const { session } = await authenticate.admin(request);
  const store = await prisma.store.findUnique({ where: { shop: session.shop } });
  if (!store) throw new Response("Store not found", { status: 404 });

  const purchaseOrder = await prisma.purchaseOrder.findFirst({
    where: { id: params.purchaseOrderId, storeId: store.id },
    include: {
      supplier: { select: { name: true, email: true, phone: true } },
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
  });

  if (!purchaseOrder) throw new Response("Purchase order not found", { status: 404 });

  return json({
    document: buildPurchaseOrderDocument({
      ...purchaseOrder,
      store: { shop: store.shop, currency: store.currency },
    }),
    canEmail: Boolean(purchaseOrder.supplier.email),
  });
};

export const action = async ({ request, params }: ActionFunctionArgs) => {
  const { session } = await authenticate.admin(request);
  const store = await prisma.store.findUnique({ where: { shop: session.shop } });
  if (!store) return json({ error: "Store not found" }, { status: 404 });

  const purchaseOrder = await prisma.purchaseOrder.findFirst({
    where: { id: params.purchaseOrderId, storeId: store.id },
    include: { supplier: { select: { name: true, email: true } } },
  });

  if (!purchaseOrder) return json({ error: "Purchase order not found" }, { status: 404 });
  if (!purchaseOrder.supplier.email) return json({ error: "Supplier email is not set." }, { status: 400 });

  const url = new URL(request.url);
  const printUrl = `${url.origin}/app/purchase-orders/${purchaseOrder.id}/print`;
  const from = process.env.NOTIFICATION_FROM_EMAIL || "alerts@stockbridge.app";

  try {
    await sendPurchaseOrderEmail({
      to: purchaseOrder.supplier.email,
      from,
      orderNumber: purchaseOrder.orderNumber,
      supplierName: purchaseOrder.supplier.name,
      printUrl,
    });
    return json({ success: true, message: `Purchase order emailed to ${purchaseOrder.supplier.email}.` });
  } catch (error) {
    return json({ error: error instanceof Error ? error.message : "Failed to email purchase order." }, { status: 400 });
  }
};

function money(value: number, currency: string) {
  return new Intl.NumberFormat("en", { style: "currency", currency }).format(value);
}

export default function PurchaseOrderPrint() {
  const { document, canEmail } = useLoaderData<typeof loader>();
  const actionData = useActionData<typeof action>();

  return (
    <main className="po-page">
      <style>{`
        body { margin: 0; background: #f6f6f7; color: #202223; font-family: Arial, sans-serif; }
        .po-page { max-width: 980px; margin: 0 auto; padding: 32px; }
        .toolbar { display: flex; gap: 12px; justify-content: flex-end; margin-bottom: 20px; }
        .toolbar button, .toolbar a { border: 1px solid #8c9196; background: #fff; padding: 8px 12px; border-radius: 6px; color: #202223; text-decoration: none; font-size: 14px; cursor: pointer; }
        .notice { margin-bottom: 16px; padding: 12px; border-radius: 6px; background: #eafaf1; border: 1px solid #aee9d1; }
        .error { margin-bottom: 16px; padding: 12px; border-radius: 6px; background: #fff4f4; border: 1px solid #fed3d1; }
        .sheet { background: #fff; border: 1px solid #dfe3e8; padding: 36px; }
        .header { display: flex; justify-content: space-between; gap: 24px; border-bottom: 2px solid #202223; padding-bottom: 20px; margin-bottom: 24px; }
        h1 { margin: 0 0 8px; font-size: 28px; }
        h2 { margin: 0 0 8px; font-size: 16px; }
        p { margin: 4px 0; }
        .meta { display: grid; grid-template-columns: repeat(3, 1fr); gap: 16px; margin-bottom: 24px; }
        .box { border: 1px solid #dfe3e8; padding: 14px; border-radius: 6px; }
        table { width: 100%; border-collapse: collapse; margin-top: 16px; }
        th, td { border-bottom: 1px solid #dfe3e8; padding: 10px; text-align: left; vertical-align: top; }
        th { background: #f6f6f7; font-size: 12px; text-transform: uppercase; }
        .right { text-align: right; }
        .totals { display: flex; justify-content: flex-end; margin-top: 24px; }
        .totals table { max-width: 360px; }
        .notes { margin-top: 24px; }
        @media print {
          body { background: #fff; }
          .po-page { max-width: none; padding: 0; }
          .toolbar, .notice, .error { display: none; }
          .sheet { border: 0; padding: 0; }
        }
      `}</style>
      <div className="toolbar">
        <button type="button" onClick={() => window.print()}>Print or Save PDF</button>
        <Form method="POST">
          <button type="submit" disabled={!canEmail}>Email supplier</button>
        </Form>
        <a href="/app/purchase-orders">Back</a>
      </div>
      {actionData && "success" in actionData && actionData.success && <div className="notice">{actionData.message}</div>}
      {actionData && "error" in actionData && <div className="error">{actionData.error}</div>}
      <section className="sheet">
        <div className="header">
          <div>
            <h1>{document.title}</h1>
            <p>Status: {document.status}</p>
            <p>Expected: {document.expectedDate}</p>
          </div>
          <div>
            <h2>Merchant</h2>
            <p>{document.store.shop}</p>
          </div>
        </div>
        <div className="meta">
          <div className="box">
            <h2>Supplier</h2>
            <p>{document.supplier.name}</p>
            <p>{document.supplier.email || "Email not set"}</p>
            <p>{document.supplier.phone || "Phone not set"}</p>
          </div>
          <div className="box">
            <h2>Units</h2>
            <p>Ordered: {document.totalUnits}</p>
            <p>Received: {document.totalReceived}</p>
            <p>Remaining: {document.totalRemaining}</p>
          </div>
          <div className="box">
            <h2>Total</h2>
            <p>{money(document.totalCost, document.store.currency)}</p>
          </div>
        </div>
        <table>
          <thead>
            <tr>
              <th>Product</th>
              <th>SKU</th>
              <th className="right">Ordered</th>
              <th className="right">Received</th>
              <th className="right">Remaining</th>
              <th className="right">Unit cost</th>
              <th className="right">Line total</th>
            </tr>
          </thead>
          <tbody>
            {document.lines.map((line) => (
              <tr key={`${line.title}-${line.sku}`}>
                <td>{line.title}</td>
                <td>{line.sku}</td>
                <td className="right">{line.orderedQuantity}</td>
                <td className="right">{line.receivedQuantity}</td>
                <td className="right">{line.remainingQuantity}</td>
                <td className="right">{money(line.unitCost, document.store.currency)}</td>
                <td className="right">{money(line.lineTotal, document.store.currency)}</td>
              </tr>
            ))}
          </tbody>
        </table>
        <div className="totals">
          <table>
            <tbody>
              <tr>
                <th>Total units</th>
                <td className="right">{document.totalUnits}</td>
              </tr>
              <tr>
                <th>Total cost</th>
                <td className="right">{money(document.totalCost, document.store.currency)}</td>
              </tr>
            </tbody>
          </table>
        </div>
        <div className="notes">
          <h2>Notes</h2>
          <p>{document.notes}</p>
        </div>
      </section>
    </main>
  );
}

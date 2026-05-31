import { useState } from "react";
import type { ActionFunctionArgs, LoaderFunctionArgs } from "@remix-run/node";
import { json } from "@remix-run/node";
import { Link, useFetcher, useLoaderData } from "@remix-run/react";
import {
  Badge,
  Banner,
  BlockStack,
  Button,
  Card,
  IndexTable,
  InlineStack,
  Page,
  Select,
  Text,
  TextField,
} from "@shopify/polaris";
import { TitleBar } from "@shopify/app-bridge-react";

import prisma from "../db.server";
import { authenticate } from "../shopify.server";
import {
  createPurchaseOrderFromQuantities,
  getPurchaseOrderPageData,
  receivePurchaseOrderPartially,
  updatePurchaseOrderStatus,
} from "../services/purchase-orders.server";

export const loader = async ({ request }: LoaderFunctionArgs) => {
  const { session } = await authenticate.admin(request);

  const store = await prisma.store.findUnique({ where: { shop: session.shop } });
  if (!store) throw new Error("Store not found");

  return json(await getPurchaseOrderPageData(store.id));
};

export const action = async ({ request }: ActionFunctionArgs) => {
  const { session, admin } = await authenticate.admin(request);
  const formData = await request.formData();
  const intent = formData.get("intent");

  const store = await prisma.store.findUnique({ where: { shop: session.shop } });
  if (!store) return json({ error: "Store not found" }, { status: 404 });

  try {
    if (intent === "create") {
      const supplierId = ((formData.get("supplierId") as string) || "").trim();
      const productIds = formData.getAll("productId") as string[];
      const quantities = formData.getAll("quantity") as string[];
      const quantitiesByProductId = new Map<string, number>();

      productIds.forEach((productId, index) => {
        const quantity = Number.parseInt(quantities[index] || "0", 10);
        quantitiesByProductId.set(productId, Number.isFinite(quantity) ? quantity : 0);
      });

      await createPurchaseOrderFromQuantities({
        storeId: store.id,
        supplierId,
        quantitiesByProductId,
        expectedDate: (formData.get("expectedDate") as string) || null,
        notes: (formData.get("notes") as string) || null,
      });

      return json({ success: true, message: "Purchase order draft created." });
    }

    if (intent === "receive") {
      const lineIds = formData.getAll("lineId") as string[];
      const quantities = formData.getAll("receivedQuantity") as string[];
      const quantitiesByLineId = new Map<string, number>();

      lineIds.forEach((lineId, index) => {
        const quantity = Number.parseInt(quantities[index] || "0", 10);
        quantitiesByLineId.set(lineId, Number.isFinite(quantity) ? quantity : 0);
      });

      const result = await receivePurchaseOrderPartially(
        store.id,
        formData.get("purchaseOrderId") as string,
        quantitiesByLineId,
        admin,
      );

      return json({
        success: true,
        message: result.fullyReceived
          ? `Purchase order fully received. Added ${result.receivedUnits} units.`
          : `Partial receipt saved. Added ${result.receivedUnits} units across ${result.receivedLines} lines.`,
      });
    }

    if (intent === "status") {
      const status = formData.get("status") as string;
      await updatePurchaseOrderStatus(
        store.id,
        formData.get("purchaseOrderId") as string,
        status,
      );
      return json({ success: true, message: "Purchase order status updated." });
    }
  } catch (error) {
    return json({ error: error instanceof Error ? error.message : "Purchase order action failed." }, { status: 400 });
  }

  return json({ error: "Unknown intent" }, { status: 400 });
};

function formatMoney(value: number) {
  return `$${value.toFixed(2)}`;
}

function formatDate(value: string | null) {
  if (!value) return "Not set";
  return new Intl.DateTimeFormat("en", { month: "short", day: "numeric", year: "numeric" }).format(new Date(value));
}

function statusBadge(status: string) {
  const tone = status === "received" ? "success" : status === "cancelled" ? "critical" : status === "sent" || status === "partial" ? "info" : "attention";
  return <Badge tone={tone}>{status}</Badge>;
}

function getReceivedQuantity(receipts: Array<{ quantity: number }>) {
  return receipts.reduce((total, receipt) => total + receipt.quantity, 0);
}

export default function PurchaseOrders() {
  const { suppliers, reorderCandidates, purchaseOrders } = useLoaderData<typeof loader>();
  const fetcher = useFetcher();
  const actionData = fetcher.data as { success?: boolean; error?: string; message?: string } | undefined;
  const [selectedSupplierId, setSelectedSupplierId] = useState(suppliers[0]?.id || "");

  const supplierOptions = suppliers.map((supplier) => ({ label: supplier.name, value: supplier.id }));
  const selectedSupplier = suppliers.find((supplier) => supplier.id === selectedSupplierId);
  const selectedCandidates = reorderCandidates.filter((product) => product.supplierId === selectedSupplierId);

  const purchaseOrderRows = purchaseOrders.map((order, index) => (
    <IndexTable.Row id={order.id} key={order.id} position={index}>
      <IndexTable.Cell>
        <Text variant="bodyMd" as="span" fontWeight="bold">
          {order.orderNumber}
        </Text>
      </IndexTable.Cell>
      <IndexTable.Cell>{order.supplier.name}</IndexTable.Cell>
      <IndexTable.Cell>{statusBadge(order.status)}</IndexTable.Cell>
      <IndexTable.Cell>{order.lines.length}</IndexTable.Cell>
      <IndexTable.Cell>{formatMoney(order.totalCost)}</IndexTable.Cell>
      <IndexTable.Cell>{formatDate(order.expectedDate)}</IndexTable.Cell>
      <IndexTable.Cell>
        <InlineStack gap="200">
          {order.status === "draft" && (
            <fetcher.Form method="POST">
              <input type="hidden" name="intent" value="status" />
              <input type="hidden" name="purchaseOrderId" value={order.id} />
              <input type="hidden" name="status" value="sent" />
              <Button variant="plain" submit>
                Mark sent
              </Button>
            </fetcher.Form>
          )}
          {order.status !== "received" && order.status !== "cancelled" && (
            <fetcher.Form method="POST">
              <input type="hidden" name="intent" value="status" />
              <input type="hidden" name="purchaseOrderId" value={order.id} />
              <input type="hidden" name="status" value="cancelled" />
              <Button variant="plain" tone="critical" submit>
                Cancel
              </Button>
            </fetcher.Form>
          )}
          <Link to={`/app/purchase-orders/${order.id}/print`}>Print or email</Link>
        </InlineStack>
      </IndexTable.Cell>
    </IndexTable.Row>
  ));

  return (
    <Page fullWidth>
      <TitleBar title="Purchase Orders" />
      <BlockStack gap="400">
        {actionData?.success && (
          <Banner tone="success">
            <Text as="p" variant="bodyMd">
              {actionData.message}
            </Text>
          </Banner>
        )}
        {actionData?.error && (
          <Banner tone="critical">
            <Text as="p" variant="bodyMd">
              {actionData.error}
            </Text>
          </Banner>
        )}
        {suppliers.length === 0 && (
          <Banner tone="info">
            <Text as="p" variant="bodyMd">
              Add suppliers first, then assign products to suppliers before creating purchase orders.
            </Text>
          </Banner>
        )}

        <Card>
          <fetcher.Form method="POST">
            <input type="hidden" name="intent" value="create" />
            <BlockStack gap="400">
              <Text as="h2" variant="headingMd">
                Create draft purchase order
              </Text>
              <Select
                label="Supplier"
                name="supplierId"
                options={supplierOptions}
                value={selectedSupplierId}
                onChange={setSelectedSupplierId}
                disabled={suppliers.length === 0}
              />
              <InlineStack gap="400">
                <TextField label="Expected date" name="expectedDate" type="date" autoComplete="off" />
                <TextField label="Notes" name="notes" type="text" autoComplete="off" />
              </InlineStack>

              {selectedSupplier && selectedCandidates.length === 0 && (
                <Banner tone="info">
                  <Text as="p" variant="bodyMd">
                    No reorder candidates for {selectedSupplier.name}. Assign products and set reorder points on the Products page.
                  </Text>
                </Banner>
              )}

              {selectedCandidates.length > 0 && (
                <IndexTable
                  resourceName={{ singular: "product", plural: "products" }}
                  itemCount={selectedCandidates.length}
                  selectable={false}
                  headings={[
                    { title: "Product" },
                    { title: "SKU" },
                    { title: "Stock" },
                    { title: "Reorder Point" },
                    { title: "Suggested Qty" },
                    { title: "Unit Cost" },
                  ]}
                >
                  {selectedCandidates.map((product, index) => (
                    <IndexTable.Row id={product.id} key={product.id} position={index}>
                      <IndexTable.Cell>
                        <input type="hidden" name="productId" value={product.id} />
                        <Text as="span" variant="bodyMd" fontWeight="bold">
                          {product.title}
                        </Text>
                      </IndexTable.Cell>
                      <IndexTable.Cell>{product.sku || "Not set"}</IndexTable.Cell>
                      <IndexTable.Cell>{product.inventoryQty}</IndexTable.Cell>
                      <IndexTable.Cell>{product.reorderPoint ?? 10}</IndexTable.Cell>
                      <IndexTable.Cell>
                        <TextField
                          label="Quantity"
                          labelHidden
                          name="quantity"
                          type="number"
                          min={0}
                          defaultValue={product.suggestedQty.toString()}
                          autoComplete="off"
                        />
                      </IndexTable.Cell>
                      <IndexTable.Cell>{formatMoney(product.inventoryCost ?? 0)}</IndexTable.Cell>
                    </IndexTable.Row>
                  ))}
                </IndexTable>
              )}

              <Button variant="primary" submit disabled={selectedCandidates.length === 0} loading={fetcher.state !== "idle"}>
                Create purchase order
              </Button>
            </BlockStack>
          </fetcher.Form>
        </Card>

        {purchaseOrders.some((order) => order.status !== "received" && order.status !== "cancelled") && (
          <Card>
            <BlockStack gap="400">
              <Text as="h2" variant="headingMd">
                Receive inventory
              </Text>
              {purchaseOrders
                .filter((order) => order.status !== "received" && order.status !== "cancelled")
                .map((order) => (
                  <fetcher.Form method="POST" key={order.id}>
                    <input type="hidden" name="intent" value="receive" />
                    <input type="hidden" name="purchaseOrderId" value={order.id} />
                    <BlockStack gap="300">
                      <InlineStack gap="300" blockAlign="center">
                        <Text as="h3" variant="headingSm">
                          {order.orderNumber}
                        </Text>
                        {statusBadge(order.status)}
                        <Text as="span" variant="bodyMd" tone="subdued">
                          {order.supplier.name}
                        </Text>
                      </InlineStack>
                      <IndexTable
                        resourceName={{ singular: "line", plural: "lines" }}
                        itemCount={order.lines.length}
                        selectable={false}
                        headings={[
                          { title: "Product" },
                          { title: "Ordered" },
                          { title: "Received" },
                          { title: "Remaining" },
                          { title: "Receive Now" },
                        ]}
                      >
                        {order.lines.map((line, index) => {
                          const receivedQuantity = getReceivedQuantity(line.receipts);
                          const remainingQuantity = Math.max(line.quantity - receivedQuantity, 0);

                          return (
                            <IndexTable.Row id={line.id} key={line.id} position={index}>
                              <IndexTable.Cell>
                                <input type="hidden" name="lineId" value={line.id} />
                                <Text as="span" variant="bodyMd" fontWeight="bold">
                                  {line.titleSnapshot}
                                </Text>
                              </IndexTable.Cell>
                              <IndexTable.Cell>{line.quantity}</IndexTable.Cell>
                              <IndexTable.Cell>{receivedQuantity}</IndexTable.Cell>
                              <IndexTable.Cell>{remainingQuantity}</IndexTable.Cell>
                              <IndexTable.Cell>
                                <TextField
                                  label="Receive quantity"
                                  labelHidden
                                  name="receivedQuantity"
                                  type="number"
                                  min={0}
                                  max={remainingQuantity}
                                  defaultValue="0"
                                  disabled={remainingQuantity === 0}
                                  autoComplete="off"
                                />
                              </IndexTable.Cell>
                            </IndexTable.Row>
                          );
                        })}
                      </IndexTable>
                      <Button variant="primary" submit loading={fetcher.state !== "idle"}>
                        Receive selected quantities
                      </Button>
                    </BlockStack>
                  </fetcher.Form>
                ))}
            </BlockStack>
          </Card>
        )}

        <Card>
          <BlockStack gap="300">
            <Text as="h2" variant="headingMd">
              Recent purchase orders
            </Text>
            {purchaseOrders.length === 0 ? (
              <Text as="p" tone="subdued" variant="bodyMd">
                No purchase orders yet. Create the first draft from current reorder candidates.
              </Text>
            ) : (
              <IndexTable
                resourceName={{ singular: "purchase order", plural: "purchase orders" }}
                itemCount={purchaseOrders.length}
                selectable={false}
                headings={[
                  { title: "PO" },
                  { title: "Supplier" },
                  { title: "Status" },
                  { title: "Lines" },
                  { title: "Total" },
                  { title: "Expected" },
                  { title: "Actions" },
                ]}
              >
                {purchaseOrderRows}
              </IndexTable>
            )}
          </BlockStack>
        </Card>

        {purchaseOrders.some((order) => order.receipts.length > 0) && (
          <Card>
            <BlockStack gap="300">
              <Text as="h2" variant="headingMd">
                Receipt history
              </Text>
              <IndexTable
                resourceName={{ singular: "receipt", plural: "receipts" }}
                itemCount={purchaseOrders.reduce((total, order) => total + order.receipts.length, 0)}
                selectable={false}
                headings={[
                  { title: "PO" },
                  { title: "Product" },
                  { title: "Quantity" },
                  { title: "Received At" },
                ]}
              >
                {purchaseOrders.flatMap((order) =>
                  order.receipts.map((receipt, index) => (
                    <IndexTable.Row id={receipt.id} key={receipt.id} position={index}>
                      <IndexTable.Cell>{order.orderNumber}</IndexTable.Cell>
                      <IndexTable.Cell>{receipt.line.titleSnapshot}</IndexTable.Cell>
                      <IndexTable.Cell>{receipt.quantity}</IndexTable.Cell>
                      <IndexTable.Cell>{formatDate(receipt.createdAt)}</IndexTable.Cell>
                    </IndexTable.Row>
                  )),
                )}
              </IndexTable>
            </BlockStack>
          </Card>
        )}
      </BlockStack>
    </Page>
  );
}

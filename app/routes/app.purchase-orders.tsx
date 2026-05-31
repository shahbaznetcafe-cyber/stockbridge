import { useState } from "react";
import type { ActionFunctionArgs, LoaderFunctionArgs } from "@remix-run/node";
import { json } from "@remix-run/node";
import { useFetcher, useLoaderData } from "@remix-run/react";
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
  updatePurchaseOrderStatus,
} from "../services/purchase-orders.server";

export const loader = async ({ request }: LoaderFunctionArgs) => {
  const { session } = await authenticate.admin(request);

  const store = await prisma.store.findUnique({ where: { shop: session.shop } });
  if (!store) throw new Error("Store not found");

  return json(await getPurchaseOrderPageData(store.id));
};

export const action = async ({ request }: ActionFunctionArgs) => {
  const { session } = await authenticate.admin(request);
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

    if (intent === "status") {
      await updatePurchaseOrderStatus(
        store.id,
        formData.get("purchaseOrderId") as string,
        formData.get("status") as string,
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
  const tone = status === "received" ? "success" : status === "cancelled" ? "critical" : status === "sent" ? "info" : "attention";
  return <Badge tone={tone}>{status}</Badge>;
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
              <input type="hidden" name="status" value="received" />
              <Button variant="plain" submit>
                Mark received
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
      </BlockStack>
    </Page>
  );
}

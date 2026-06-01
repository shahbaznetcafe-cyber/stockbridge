import { useState } from "react";
import type { LoaderFunctionArgs, ActionFunctionArgs } from "@remix-run/node";
import { json } from "@remix-run/node";
import { useLoaderData, useFetcher } from "@remix-run/react";
import { Page, Card, Text, BlockStack, IndexTable, useIndexResourceState, Button, Modal, TextField, Select, InlineStack, Badge, Thumbnail, Banner } from "@shopify/polaris";
import { TitleBar } from "@shopify/app-bridge-react";
import { authenticate } from "../shopify.server";
import prisma from "../db.server";
import { syncOrderSalesMetrics, syncProducts } from "../services/inventory.server";
import { buildProductSyncMessage } from "../services/inventory-calculations.server";

export const loader = async ({ request }: LoaderFunctionArgs) => {
  const { session } = await authenticate.admin(request);

  const store = await prisma.store.findUnique({ where: { shop: session.shop } });
  if (!store) throw new Error("Store not found");

  const products = await prisma.product.findMany({
    where: { storeId: store.id },
    orderBy: { updatedAt: "desc" },
    include: { supplier: { select: { name: true } } },
  });
  const suppliers = await prisma.supplier.findMany({
    where: { storeId: store.id },
    orderBy: { name: "asc" },
    select: { id: true, name: true },
  });

  return json({ products, suppliers });
};

export const action = async ({ request }: ActionFunctionArgs) => {
  const { session, admin } = await authenticate.admin(request);
  const formData = await request.formData();
  const intent = formData.get("intent");

  const store = await prisma.store.findUnique({ where: { shop: session.shop } });
  if (!store) return json({ error: "Store not found" }, { status: 404 });

  if (intent === "sync") {
    try {
      const count = await syncProducts(store.id, admin);
      let salesLineItems = 0;
      let salesSyncWarning: string | undefined;

      try {
        const sales = await syncOrderSalesMetrics(store.id, admin);
        salesLineItems = sales.ordersLineItems;
      } catch (error) {
        console.error("Order sales metrics sync failed:", error);
        salesSyncWarning = error instanceof Error ? error.message : "Order sales metrics unavailable.";
      }

      return json({
        success: true,
        message: buildProductSyncMessage({
          productCount: count,
          salesLineItems,
          salesSyncWarning,
        }),
      });
    } catch (error) {
      console.error("Product sync failed:", error);
      return json(
        { error: error instanceof Error ? error.message : "Product sync failed." },
        { status: 400 },
      );
    }
  }

  if (intent === "update") {
    const productId = formData.get("productId") as string;
    const inventoryCost = parseFloat(formData.get("inventoryCost") as string) || null;
    const leadTimeDays = parseInt(formData.get("leadTimeDays") as string) || 14;
    const safetyStock = parseInt(formData.get("safetyStock") as string) || 0;
    const reorderPoint = parseInt(formData.get("reorderPoint") as string) || null;
    const reorderQty = parseInt(formData.get("reorderQty") as string) || null;
    const supplierId = ((formData.get("supplierId") as string) || "").trim() || null;

    await prisma.product.update({
      where: { id: productId },
      data: { inventoryCost, leadTimeDays, safetyStock, reorderPoint, reorderQty, supplierId },
    });

    return json({ success: true });
  }

  return json({ error: "Unknown intent" }, { status: 400 });
};

export default function Products() {
  const { products, suppliers } = useLoaderData<typeof loader>();
  const fetcher = useFetcher();
  const actionData = fetcher.data as { success?: boolean; error?: string; message?: string } | undefined;
  const [editingProduct, setEditingProduct] = useState<any>(null);

  const resourceName = { singular: "product", plural: "products" };
  const { selectedResources, allResourcesSelected, handleSelectionChange } = useIndexResourceState(products);

  const rowMarkup = products.map((product, index) => (
    <IndexTable.Row id={product.id} key={product.id} selected={selectedResources.includes(product.id)} position={index}>
      <IndexTable.Cell>
        <InlineStack gap="200" align="start" blockAlign="center">
          {product.imageUrl && <Thumbnail source={product.imageUrl} alt={product.title} size="small" />}
          <Text variant="bodyMd" fontWeight="bold" as="span">{product.title}</Text>
        </InlineStack>
      </IndexTable.Cell>
      <IndexTable.Cell>{product.sku || "Not set"}</IndexTable.Cell>
      <IndexTable.Cell>
        <Badge tone={product.inventoryQty <= 0 ? "critical" : product.inventoryQty <= (product.reorderPoint ?? 10) ? "warning" : "success"}>
          {product.inventoryQty}
        </Badge>
      </IndexTable.Cell>
      <IndexTable.Cell>{product.price != null ? `$${product.price.toFixed(2)}` : "Not set"}</IndexTable.Cell>
      <IndexTable.Cell>{product.supplier?.name || "Not assigned"}</IndexTable.Cell>
      <IndexTable.Cell>{product.reorderPoint || "Default"}</IndexTable.Cell>
      <IndexTable.Cell>
        <Button variant="plain" onClick={() => setEditingProduct(product)}>Edit</Button>
      </IndexTable.Cell>
    </IndexTable.Row>
  ));

  return (
    <Page
      fullWidth
      primaryAction={<Button variant="primary" onClick={() => fetcher.submit({ intent: "sync" }, { method: "POST" })} loading={fetcher.state !== "idle"}>Sync Products</Button>}
    >
      <TitleBar title="Products" />
      <BlockStack gap="400">
      {actionData?.success && (
        <Banner tone="success">
          <Text as="p" variant="bodyMd">{actionData.message || "Product settings saved."}</Text>
        </Banner>
      )}
      {actionData?.error && (
        <Banner tone="critical">
          <Text as="p" variant="bodyMd">{actionData.error}</Text>
        </Banner>
      )}
      <Card>
        <IndexTable
          resourceName={resourceName}
          itemCount={products.length}
          selectedItemsCount={allResourcesSelected ? "All" : selectedResources.length}
          onSelectionChange={handleSelectionChange}
          headings={[
            { title: "Product" },
            { title: "SKU" },
            { title: "Stock" },
            { title: "Price" },
            { title: "Supplier" },
            { title: "Reorder Point" },
            { title: "Actions" },
          ]}
        >
          {rowMarkup}
        </IndexTable>
        {products.length === 0 && (
          <div style={{ padding: "var(--p-space-500)", textAlign: "center" }}>
            <Text variant="bodyMd" as="p" tone="subdued">
              No products synced yet. Use Sync Products after installing StockBridge in a Shopify store.
            </Text>
          </div>
        )}
      </Card>
      </BlockStack>

      <Modal
        open={!!editingProduct}
        onClose={() => setEditingProduct(null)}
        title={`Edit ${editingProduct?.title || ""}`}
      >
        <Modal.Section>
          {editingProduct && (
            <fetcher.Form method="POST">
              <input type="hidden" name="intent" value="update" />
              <input type="hidden" name="productId" value={editingProduct.id} />
              <BlockStack gap="400">
                <TextField label="Inventory Cost" name="inventoryCost" type="number" defaultValue={editingProduct.inventoryCost?.toString() || ""} autoComplete="off" />
                <TextField label="Lead Time (days)" name="leadTimeDays" type="number" defaultValue={editingProduct.leadTimeDays.toString()} autoComplete="off" />
                <TextField label="Safety Stock" name="safetyStock" type="number" defaultValue={editingProduct.safetyStock.toString()} autoComplete="off" />
                <TextField label="Reorder Point" name="reorderPoint" type="number" defaultValue={editingProduct.reorderPoint?.toString() || ""} autoComplete="off" />
                <TextField label="Reorder Quantity" name="reorderQty" type="number" defaultValue={editingProduct.reorderQty?.toString() || ""} autoComplete="off" />
                <Select
                  label="Supplier"
                  name="supplierId"
                  options={[
                    { label: "No supplier", value: "" },
                    ...suppliers.map((supplier) => ({ label: supplier.name, value: supplier.id })),
                  ]}
                  defaultValue={editingProduct.supplierId || ""}
                />
                <Button variant="primary" submit>Save</Button>
              </BlockStack>
            </fetcher.Form>
          )}
        </Modal.Section>
      </Modal>
    </Page>
  );
}

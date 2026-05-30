import { useState } from "react";
import type { LoaderFunctionArgs, ActionFunctionArgs } from "@remix-run/node";
import { json } from "@remix-run/node";
import { useLoaderData, useFetcher } from "@remix-run/react";
import { Page, Card, Text, BlockStack, IndexTable, useIndexResourceState, Button, Modal, TextField, Select, InlineStack, Badge, Thumbnail } from "@shopify/polaris";
import { TitleBar } from "@shopify/app-bridge-react";
import { authenticate } from "../shopify.server";
import prisma from "../db.server";
import { syncProducts } from "../services/inventory.server";

export const loader = async ({ request }: LoaderFunctionArgs) => {
  const { session } = await authenticate.admin(request);

  const store = await prisma.store.findUnique({ where: { shop: session.shop } });
  if (!store) throw new Error("Store not found");

  const products = await prisma.product.findMany({
    where: { storeId: store.id },
    orderBy: { updatedAt: "desc" },
    include: { supplier: { select: { name: true } } },
  });

  return json({ products, storeId: store.id });
};

export const action = async ({ request }: ActionFunctionArgs) => {
  const { session, admin } = await authenticate.admin(request);
  const formData = await request.formData();
  const intent = formData.get("intent");

  const store = await prisma.store.findUnique({ where: { shop: session.shop } });
  if (!store) return json({ error: "Store not found" }, { status: 404 });

  if (intent === "sync") {
    const count = await syncProducts(store.id, admin);
    return json({ success: true, count });
  }

  if (intent === "update") {
    const productId = formData.get("productId") as string;
    const inventoryCost = parseFloat(formData.get("inventoryCost") as string) || null;
    const leadTimeDays = parseInt(formData.get("leadTimeDays") as string) || 14;
    const safetyStock = parseInt(formData.get("safetyStock") as string) || 0;
    const reorderPoint = parseInt(formData.get("reorderPoint") as string) || null;
    const reorderQty = parseInt(formData.get("reorderQty") as string) || null;
    const supplierId = formData.get("supplierId") as string || null;

    await prisma.product.update({
      where: { id: productId },
      data: { inventoryCost, leadTimeDays, safetyStock, reorderPoint, reorderQty, supplierId },
    });

    return json({ success: true });
  }

  return json({ error: "Unknown intent" }, { status: 400 });
};

export default function Products() {
  const { products, storeId } = useLoaderData<typeof loader>();
  const fetcher = useFetcher();
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
      <IndexTable.Cell>{product.sku || "—"}</IndexTable.Cell>
      <IndexTable.Cell>
        <Badge tone={product.inventoryQty <= 0 ? "critical" : product.inventoryQty <= (product.reorderPoint ?? 10) ? "warning" : "success"}>
          {product.inventoryQty}
        </Badge>
      </IndexTable.Cell>
      <IndexTable.Cell>${product.price?.toFixed(2) || "—"}</IndexTable.Cell>
      <IndexTable.Cell>{product.supplier?.name || "—"}</IndexTable.Cell>
      <IndexTable.Cell>{product.reorderPoint || "—"}</IndexTable.Cell>
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
      </Card>

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
                <Button variant="primary" submit>Save</Button>
              </BlockStack>
            </fetcher.Form>
          )}
        </Modal.Section>
      </Modal>
    </Page>
  );
}

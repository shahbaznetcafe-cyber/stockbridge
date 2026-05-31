import type { LoaderFunctionArgs } from "@remix-run/node";
import { json } from "@remix-run/node";
import { useLoaderData } from "@remix-run/react";
import { Page, Card, Text, BlockStack, IndexTable, useIndexResourceState } from "@shopify/polaris";
import { TitleBar } from "@shopify/app-bridge-react";
import { authenticate } from "../shopify.server";
import prisma from "../db.server";
import { getProductMetrics, getTopSellingProducts } from "../services/inventory.server";
import { getAlertStats } from "../services/alerts.server";
import { MetricCard } from "../components/MetricCard";

export const loader = async ({ request }: LoaderFunctionArgs) => {
  const { session } = await authenticate.admin(request);

  const store = await prisma.store.upsert({
    where: { shop: session.shop },
    create: { shop: session.shop, myshopifyDomain: session.shop },
    update: {},
  });

  const [metrics, alertStats, topProducts] = await Promise.all([
    getProductMetrics(store.id),
    getAlertStats(store.id),
    getTopSellingProducts(store.id, 30),
  ]);

  return json({ metrics, alertStats, topProducts });
};

export default function Dashboard() {
  const { metrics, alertStats, topProducts } = useLoaderData<typeof loader>();

  const { selectedResources, allResourcesSelected, handleSelectionChange } = useIndexResourceState(topProducts);

  const rowMarkup = topProducts.map((product, index) => (
    <IndexTable.Row id={product.id} key={product.id} selected={selectedResources.includes(product.id)} position={index}>
      <IndexTable.Cell>
        <Text variant="bodyMd" fontWeight="bold" as="span">{product.title}</Text>
      </IndexTable.Cell>
      <IndexTable.Cell>{product.sku || "Not set"}</IndexTable.Cell>
      <IndexTable.Cell>{product.inventoryQty}</IndexTable.Cell>
      <IndexTable.Cell>{product.totalSold30}</IndexTable.Cell>
      <IndexTable.Cell>{product.daysOfSupply.toFixed(1)} days</IndexTable.Cell>
      <IndexTable.Cell>{product.price != null ? `$${product.price.toFixed(2)}` : "Not set"}</IndexTable.Cell>
    </IndexTable.Row>
  ));

  return (
    <Page fullWidth>
      <TitleBar title="Dashboard" />
      <BlockStack gap="500">
        <div style={{ display: "flex", gap: "var(--p-space-400)", flexWrap: "wrap" }}>
          <MetricCard label="Total Products" value={metrics.totalProducts} />
          <MetricCard label="Out of Stock" value={metrics.outOfStock} tone={metrics.outOfStock > 0 ? "critical" : undefined} />
          <MetricCard label="Low Stock Items" value={metrics.lowStockProducts} tone={metrics.lowStockProducts > 0 ? "warning" : undefined} />
          <MetricCard label="Inventory Value" value={`$${metrics.totalInventoryValue.toLocaleString()}`} />
        </div>
        <div style={{ display: "flex", gap: "var(--p-space-400)", flexWrap: "wrap" }}>
          <MetricCard label="Critical Alerts" value={alertStats.critical} tone={alertStats.critical > 0 ? "critical" : undefined} />
          <MetricCard label="Low Stock" value={alertStats.lowStock} tone={alertStats.lowStock > 0 ? "warning" : undefined} />
          <MetricCard label="Out of Stock" value={alertStats.outOfStock} tone={alertStats.outOfStock > 0 ? "critical" : undefined} />
          <MetricCard label="Dead Stock" value={alertStats.deadStock} />
        </div>
        <Card>
          <Text variant="headingMd" as="h2">Top Selling Products (30 days)</Text>
          <IndexTable
            resourceName={{ singular: "product", plural: "products" }}
            itemCount={topProducts.length}
            selectedItemsCount={allResourcesSelected ? "All" : selectedResources.length}
            onSelectionChange={handleSelectionChange}
            headings={[
              { title: "Product" },
              { title: "SKU" },
              { title: "Stock" },
              { title: "Sold (30d)" },
              { title: "Days of Supply" },
              { title: "Price" },
            ]}
          >
            {rowMarkup}
          </IndexTable>
          {topProducts.length === 0 && (
            <Text variant="bodyMd" as="p" alignment="center" tone="subdued">
              No sales data yet. Sync your products to get started.
            </Text>
          )}
        </Card>
      </BlockStack>
    </Page>
  );
}

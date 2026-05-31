import type { LoaderFunctionArgs } from "@remix-run/node";
import { json } from "@remix-run/node";
import { useLoaderData } from "@remix-run/react";
import {
  Badge,
  Banner,
  BlockStack,
  Card,
  IndexTable,
  InlineStack,
  Page,
  Text,
} from "@shopify/polaris";
import { TitleBar } from "@shopify/app-bridge-react";

import prisma from "../db.server";
import { authenticate } from "../shopify.server";
import { buildDiagnosticsReport, type DiagnosticStatus } from "../services/diagnostics.server";

export const loader = async ({ request }: LoaderFunctionArgs) => {
  const { session } = await authenticate.admin(request);

  const store = await prisma.store.upsert({
    where: { shop: session.shop },
    create: { shop: session.shop, myshopifyDomain: session.shop },
    update: {},
  });

  const [
    products,
    activeProducts,
    productsWithSuppliers,
    productsMissingInventoryIds,
    suppliers,
    purchaseOrders,
    openPurchaseOrders,
    unresolvedAlerts,
    notificationSettings,
  ] = await Promise.all([
    prisma.product.count({ where: { storeId: store.id } }),
    prisma.product.count({ where: { storeId: store.id, status: "active" } }),
    prisma.product.count({ where: { storeId: store.id, status: "active", supplierId: { not: null } } }),
    prisma.product.count({
      where: {
        storeId: store.id,
        status: "active",
        OR: [{ shopifyInventoryItemId: null }, { shopifyLocationId: null }],
      },
    }),
    prisma.supplier.count({ where: { storeId: store.id } }),
    prisma.purchaseOrder.count({ where: { storeId: store.id } }),
    prisma.purchaseOrder.count({
      where: { storeId: store.id, status: { in: ["draft", "sent", "partial"] } },
    }),
    prisma.stockAlert.count({ where: { storeId: store.id, isResolved: false } }),
    prisma.notificationSetting.findUnique({ where: { storeId: store.id } }),
  ]);

  const report = buildDiagnosticsReport({
    stats: {
      products,
      activeProducts,
      productsWithSuppliers,
      productsMissingInventoryIds,
      suppliers,
      purchaseOrders,
      openPurchaseOrders,
      unresolvedAlerts,
      notificationSettings: Boolean(notificationSettings),
    },
    env: {
      sendgridConfigured: Boolean(process.env.SENDGRID_API_KEY),
      notificationFromEmailConfigured: Boolean(process.env.NOTIFICATION_FROM_EMAIL),
      redisConfigured: Boolean(process.env.REDIS_URL),
    },
  });

  return json({
    shop: store.shop,
    generatedAt: new Date().toISOString(),
    report,
  });
};

function statusBadge(status: DiagnosticStatus) {
  const tone = status === "success" ? "success" : status === "critical" ? "critical" : "warning";
  return <Badge tone={tone}>{status}</Badge>;
}

function summaryTone(status: DiagnosticStatus) {
  if (status === "critical") return "critical";
  if (status === "success") return "success";
  return "warning";
}

export default function Diagnostics() {
  const { shop, generatedAt, report } = useLoaderData<typeof loader>();

  const rows = report.checks.map((check, index) => (
    <IndexTable.Row id={check.key} key={check.key} position={index}>
      <IndexTable.Cell>
        <Text as="span" variant="bodyMd" fontWeight="bold">
          {check.label}
        </Text>
      </IndexTable.Cell>
      <IndexTable.Cell>{statusBadge(check.status)}</IndexTable.Cell>
      <IndexTable.Cell>{check.value}</IndexTable.Cell>
      <IndexTable.Cell>{check.action}</IndexTable.Cell>
    </IndexTable.Row>
  ));

  return (
    <Page fullWidth>
      <TitleBar title="Diagnostics" />
      <BlockStack gap="500">
        <Banner tone={report.readyForCustomer ? "success" : "critical"}>
          <Text as="p" variant="bodyMd">
            {report.readyForCustomer
              ? "No critical setup blockers found for this store."
              : "Critical setup blockers found. Resolve them before customer handoff."}
          </Text>
        </Banner>

        <InlineStack align="space-between" blockAlign="center" gap="300">
          <Text as="h2" variant="headingMd">
            Store setup status
          </Text>
          <Text as="span" tone="subdued" variant="bodySm">
            {shop} / {generatedAt}
          </Text>
        </InlineStack>

        <InlineStack gap="300">
          {(["critical", "warning", "success"] as DiagnosticStatus[]).map((status) => (
            <Card key={status}>
              <BlockStack gap="100">
                <Text as="p" variant="headingLg" tone={summaryTone(status)}>
                  {report.summary[status]}
                </Text>
                <Text as="p" variant="bodyMd" tone="subdued">
                  {status}
                </Text>
              </BlockStack>
            </Card>
          ))}
        </InlineStack>

        <Card>
          <BlockStack gap="300">
            <Text as="h2" variant="headingMd">
              Setup checks
            </Text>
            <IndexTable
              resourceName={{ singular: "check", plural: "checks" }}
              itemCount={report.checks.length}
              selectable={false}
              headings={[
                { title: "Check" },
                { title: "Status" },
                { title: "Value" },
                { title: "Next action" },
              ]}
            >
              {rows}
            </IndexTable>
          </BlockStack>
        </Card>
      </BlockStack>
    </Page>
  );
}

import type { LoaderFunctionArgs, ActionFunctionArgs } from "@remix-run/node";
import { json } from "@remix-run/node";
import { useLoaderData, useFetcher } from "@remix-run/react";
import {
  Page, Card, Text, BlockStack, IndexTable, useIndexResourceState,
  Badge, Button, InlineStack, Thumbnail, Banner,
} from "@shopify/polaris";
import { TitleBar } from "@shopify/app-bridge-react";
import { authenticate } from "../shopify.server";
import prisma from "../db.server";
import { getUnresolvedAlerts, resolveAlert } from "../services/alerts.server";

export const loader = async ({ request }: LoaderFunctionArgs) => {
  const { session } = await authenticate.admin(request);

  const store = await prisma.store.findUnique({ where: { shop: session.shop } });
  if (!store) throw new Error("Store not found");

  const alerts = await getUnresolvedAlerts(store.id);
  return json({ alerts });
};

export const action = async ({ request }: ActionFunctionArgs) => {
  const { session } = await authenticate.admin(request);
  const formData = await request.formData();
  const alertId = formData.get("alertId") as string;

  if (alertId) {
    await resolveAlert(alertId);
    return json({ success: true });
  }
  return json({ error: "No alert ID provided" }, { status: 400 });
};

export default function Alerts() {
  const { alerts } = useLoaderData<typeof loader>();
  const fetcher = useFetcher();

  const severityBadge = (severity: string) => {
    const tones: Record<string, "critical" | "warning" | "info"> = {
      critical: "critical",
      warning: "warning",
      info: "info",
    };
    return <Badge tone={tones[severity] || "info"}>{severity}</Badge>;
  };

  const typeIcon = (type: string) => {
    const labels: Record<string, string> = {
      low_stock: "📦 Low Stock",
      out_of_stock: "❌ Out of Stock",
      dead_stock: "💀 Dead Stock",
    };
    return labels[type] || type;
  };

  const resourceName = { singular: "alert", plural: "alerts" };

  const rowMarkup = alerts.map((alert, index) => (
    <IndexTable.Row id={alert.id} key={alert.id} position={index}>
      <IndexTable.Cell>
        <InlineStack gap="200" align="start" blockAlign="center">
          {alert.product?.imageUrl && <Thumbnail source={alert.product.imageUrl} alt={alert.product.title} size="small" />}
          <Text variant="bodyMd" fontWeight="bold" as="span">{alert.product?.title || "Unknown Product"}</Text>
        </InlineStack>
      </IndexTable.Cell>
      <IndexTable.Cell>{typeIcon(alert.type)}</IndexTable.Cell>
      <IndexTable.Cell>{severityBadge(alert.severity)}</IndexTable.Cell>
      <IndexTable.Cell>{alert.message}</IndexTable.Cell>
      <IndexTable.Cell>
        <fetcher.Form method="POST">
          <input type="hidden" name="alertId" value={alert.id} />
          <Button variant="plain" submit>Resolve</Button>
        </fetcher.Form>
      </IndexTable.Cell>
    </IndexTable.Row>
  ));

  return (
    <Page fullWidth>
      <TitleBar title="Inventory Alerts" />
      <BlockStack gap="400">
        {alerts.length === 0 && (
          <Banner tone="success">
            <Text variant="bodyMd" as="p">No unresolved alerts. Your inventory is in good shape!</Text>
          </Banner>
        )}
        <Card>
          <IndexTable
            resourceName={resourceName}
            itemCount={alerts.length}
            headings={[
              { title: "Product" },
              { title: "Type" },
              { title: "Severity" },
              { title: "Message" },
              { title: "Action" },
            ]}
            selectable={false}
          >
            {rowMarkup}
          </IndexTable>
        </Card>
      </BlockStack>
    </Page>
  );
}

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

import { authenticate } from "../shopify.server";
import {
  buildReleaseReadinessChecklist,
  type ReleaseReadinessStatus,
} from "../services/release-readiness.server";

const CONFIGURED_SCOPES = "read_products,write_products,read_inventory,write_inventory,read_orders";

export const loader = async ({ request }: LoaderFunctionArgs) => {
  await authenticate.admin(request);

  const checklist = buildReleaseReadinessChecklist({
    appUrl: process.env.SHOPIFY_APP_URL || "https://stockbridge-ua7x.onrender.com",
    configuredScopes: process.env.SCOPES || CONFIGURED_SCOPES,
    hasPrivacyUrl: true,
    hasSupportUrl: true,
    hasGdprWebhooks: true,
    hasDiagnosticsPage: true,
    hasBillingEnabled: false,
    distribution: "custom",
  });

  return json({ checklist });
};

function statusBadge(status: ReleaseReadinessStatus) {
  const tone = status === "success" ? "success" : status === "critical" ? "critical" : "warning";
  return <Badge tone={tone}>{status}</Badge>;
}

function summaryTone(status: ReleaseReadinessStatus) {
  if (status === "critical") return "critical";
  if (status === "success") return "success";
  return "warning";
}

export default function ReleaseReadiness() {
  const { checklist } = useLoaderData<typeof loader>();

  const rows = checklist.items.map((item, index) => (
    <IndexTable.Row id={item.key} key={item.key} position={index}>
      <IndexTable.Cell>
        <Text as="span" variant="bodyMd" fontWeight="bold">
          {item.label}
        </Text>
      </IndexTable.Cell>
      <IndexTable.Cell>{statusBadge(item.status)}</IndexTable.Cell>
      <IndexTable.Cell>{item.value}</IndexTable.Cell>
      <IndexTable.Cell>{item.action}</IndexTable.Cell>
    </IndexTable.Row>
  ));

  return (
    <Page fullWidth>
      <TitleBar title="Release Readiness" />
      <BlockStack gap="500">
        <Banner tone={checklist.privateReleaseReady ? "success" : "critical"}>
          <Text as="p" variant="bodyMd">
            {checklist.privateReleaseReady
              ? "Private customer release has no critical release blockers."
              : "Critical release blockers remain. Resolve them before customer handoff."}
          </Text>
        </Banner>

        <InlineStack gap="300">
          {(["critical", "warning", "success"] as ReleaseReadinessStatus[]).map((status) => (
            <Card key={status}>
              <BlockStack gap="100">
                <Text as="p" variant="headingLg" tone={summaryTone(status)}>
                  {checklist.summary[status]}
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
              Review checklist
            </Text>
            <IndexTable
              resourceName={{ singular: "release check", plural: "release checks" }}
              itemCount={checklist.items.length}
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

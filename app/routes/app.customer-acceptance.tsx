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
import { buildCustomerAcceptanceReport } from "../services/customer-acceptance.server";

export const loader = async ({ request }: LoaderFunctionArgs) => {
  await authenticate.admin(request);

  return json({
    report: buildCustomerAcceptanceReport({
      productionUrl: process.env.SHOPIFY_APP_URL || "https://stockbridge-ua7x.onrender.com",
      commitSha: process.env.RENDER_GIT_COMMIT || process.env.COMMIT_SHA || "unknown",
    }),
  });
};

export default function CustomerAcceptance() {
  const { report } = useLoaderData<typeof loader>();

  const rows = report.items.map((item, index) => (
    <IndexTable.Row id={item.key} key={item.key} position={index}>
      <IndexTable.Cell>
        <Text as="span" variant="bodyMd" fontWeight="bold">
          {item.label}
        </Text>
      </IndexTable.Cell>
      <IndexTable.Cell>
        <Badge tone="critical">{item.priority}</Badge>
      </IndexTable.Cell>
      <IndexTable.Cell>{item.expectedResult}</IndexTable.Cell>
      <IndexTable.Cell>{item.evidence}</IndexTable.Cell>
    </IndexTable.Row>
  ));

  return (
    <Page fullWidth>
      <TitleBar title="Customer Acceptance" />
      <BlockStack gap="500">
        <Banner tone="info">
          <Text as="p" variant="bodyMd">
            Use this checklist for the final private customer acceptance pass after Render deploy and Shopify install.
          </Text>
        </Banner>

        <InlineStack gap="300">
          <Card>
            <BlockStack gap="100">
              <Text as="p" variant="headingLg">
                {report.summary.total}
              </Text>
              <Text as="p" tone="subdued" variant="bodyMd">
                acceptance checks
              </Text>
            </BlockStack>
          </Card>
          <Card>
            <BlockStack gap="100">
              <Text as="p" variant="headingLg" tone="critical">
                {report.summary.critical}
              </Text>
              <Text as="p" tone="subdued" variant="bodyMd">
                critical checks
              </Text>
            </BlockStack>
          </Card>
          <Card>
            <BlockStack gap="100">
              <Text as="p" variant="bodyMd" fontWeight="bold">
                {report.commitSha}
              </Text>
              <Text as="p" tone="subdued" variant="bodyMd">
                commit
              </Text>
            </BlockStack>
          </Card>
        </InlineStack>

        <Card>
          <BlockStack gap="300">
            <InlineStack align="space-between" blockAlign="center">
              <Text as="h2" variant="headingMd">
                Final acceptance report
              </Text>
              <Text as="span" tone="subdued" variant="bodySm">
                {report.productionUrl} / {report.generatedAt}
              </Text>
            </InlineStack>
            <IndexTable
              resourceName={{ singular: "acceptance check", plural: "acceptance checks" }}
              itemCount={report.items.length}
              selectable={false}
              headings={[
                { title: "Check" },
                { title: "Priority" },
                { title: "Expected result" },
                { title: "Evidence to capture" },
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

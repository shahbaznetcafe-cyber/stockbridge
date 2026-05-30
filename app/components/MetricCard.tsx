import { Card, Text, BlockStack } from "@shopify/polaris";

export function MetricCard({ label, value, tone }: { label: string; value: string | number; tone?: "critical" | "success" | "warning" | "subdued" }) {
  return (
    <Card>
      <BlockStack gap="200">
        <Text variant="headingLg" as="h3" tone={tone}>{value}</Text>
        <Text variant="bodyMd" as="p" tone="subdued">{label}</Text>
      </BlockStack>
    </Card>
  );
}

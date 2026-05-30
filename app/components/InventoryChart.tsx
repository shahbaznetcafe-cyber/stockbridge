import { Card, Text, BlockStack } from "@shopify/polaris";

interface BarData {
  label: string;
  value: number;
  color?: string;
}

export function InventoryChart({ title, data, height = 200 }: { title: string; data: BarData[]; height?: number }) {
  const maxValue = Math.max(...data.map((d) => d.value), 1);
  const barWidth = Math.max(20, Math.min(60, (100 / data.length) - 2));

  return (
    <Card>
      <BlockStack gap="300">
        <Text variant="headingMd" as="h2">{title}</Text>
        <svg viewBox={`0 0 ${data.length * (barWidth + 8) + 40} ${height}`} style={{ width: "100%", height }}>
          {data.map((d, i) => {
            const x = 20 + i * (barWidth + 8);
            const barHeight = (d.value / maxValue) * (height - 60);
            return (
              <g key={i}>
                <rect
                  x={x}
                  y={height - 30 - barHeight}
                  width={barWidth}
                  height={barHeight}
                  rx={4}
                  fill={d.color || "#5c6ac4"}
                />
                <text x={x + barWidth / 2} y={height - 12} textAnchor="middle" fontSize={10} fill="#6d7175">
                  {d.label}
                </text>
                <text x={x + barWidth / 2} y={height - 36 - barHeight} textAnchor="middle" fontSize={11} fontWeight="bold" fill="#202223">
                  {d.value}
                </text>
              </g>
            );
          })}
        </svg>
      </BlockStack>
    </Card>
  );
}

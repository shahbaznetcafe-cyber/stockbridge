import { Badge } from "@shopify/polaris";

const alertConfig: Record<string, { label: string; tone: "critical" | "warning" | "info" | "success" }> = {
  out_of_stock: { label: "Out of Stock", tone: "critical" },
  low_stock: { label: "Low Stock", tone: "warning" },
  dead_stock: { label: "Dead Stock", tone: "info" },
  overstocked: { label: "Overstocked", tone: "success" },
};

export function AlertBadge({ type, severity }: { type: string; severity?: string }) {
  const config = alertConfig[type] || { label: type.replace(/_/g, " "), tone: "info" as const };

  if (severity === "critical") {
    return <Badge tone="critical">{config.label}</Badge>;
  }

  return <Badge tone={config.tone}>{config.label}</Badge>;
}

export function SeverityBadge({ severity }: { severity: string }) {
  const tones: Record<string, "critical" | "warning" | "info"> = {
    critical: "critical",
    warning: "warning",
    info: "info",
  };
  return <Badge tone={tones[severity] || "info"}>{severity}</Badge>;
}

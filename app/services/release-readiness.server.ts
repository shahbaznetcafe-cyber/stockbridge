export type ReleaseDistribution = "custom" | "public";
export type ReleaseReadinessStatus = "success" | "warning" | "critical";

export type ReleaseReadinessInput = {
  appUrl: string;
  configuredScopes: string;
  hasPrivacyUrl: boolean;
  hasSupportUrl: boolean;
  hasGdprWebhooks: boolean;
  hasDiagnosticsPage: boolean;
  hasBillingEnabled: boolean;
  distribution: ReleaseDistribution;
};

export type ReleaseReadinessItem = {
  key: string;
  label: string;
  status: ReleaseReadinessStatus;
  value: string;
  action: string;
};

const REQUIRED_SCOPES = [
  "read_products",
  "write_products",
  "read_inventory",
  "write_inventory",
  "read_orders",
];

const HIGH_RISK_SCOPES = ["read_all_orders"];

function item(
  key: string,
  label: string,
  status: ReleaseReadinessStatus,
  value: string,
  action: string,
): ReleaseReadinessItem {
  return { key, label, status, value, action };
}

function parseScopes(scopes: string) {
  return scopes
    .split(",")
    .map((scope) => scope.trim())
    .filter(Boolean);
}

export function buildReleaseReadinessChecklist(input: ReleaseReadinessInput) {
  const scopes = parseScopes(input.configuredScopes);
  const missingScopes = REQUIRED_SCOPES.filter((scope) => !scopes.includes(scope));
  const highRiskScopes = scopes.filter((scope) => HIGH_RISK_SCOPES.includes(scope));

  const items: ReleaseReadinessItem[] = [
    input.appUrl.startsWith("https://")
      ? item("productionUrl", "Production URL", "success", input.appUrl, "Production URL is HTTPS.")
      : item("productionUrl", "Production URL", "critical", "Missing or non-HTTPS", "Set SHOPIFY_APP_URL and app_url to the deployed HTTPS Render URL."),

    missingScopes.length === 0 && highRiskScopes.length === 0
      ? item("scopes", "Access scopes", "success", scopes.join(", "), "Scopes match the current private release feature set.")
      : item(
          "scopes",
          "Access scopes",
          "critical",
          [...missingScopes.map((scope) => `missing ${scope}`), ...highRiskScopes.map((scope) => `review ${scope}`)].join("; "),
          "Use only required scopes and avoid high-risk scopes unless Shopify review evidence is ready.",
        ),

    input.hasPrivacyUrl
      ? item("privacy", "Privacy URL", "success", "/privacy", "Privacy route exists.")
      : item("privacy", "Privacy URL", "critical", "Missing", "Add and configure a public privacy URL."),

    input.hasSupportUrl
      ? item("support", "Support URL", "success", "/support", "Support route exists.")
      : item("support", "Support URL", "critical", "Missing", "Add and configure a public support URL."),

    input.hasGdprWebhooks
      ? item("gdpr", "GDPR webhooks", "success", "Configured", "Customer and shop redaction webhooks are configured.")
      : item("gdpr", "GDPR webhooks", "critical", "Missing", "Configure mandatory GDPR webhook routes."),

    input.hasDiagnosticsPage
      ? item("diagnostics", "Diagnostics page", "success", "/app/diagnostics", "Store setup can be checked before handoff.")
      : item("diagnostics", "Diagnostics page", "critical", "Missing", "Add an embedded diagnostics page for customer setup checks."),

    input.hasBillingEnabled
      ? item("billing", "Billing", "success", "Enabled", "Billing is available for paid public release.")
      : item(
          "billing",
          "Billing",
          input.distribution === "public" ? "warning" : "warning",
          "Disabled",
          input.distribution === "public"
            ? "Add Shopify billing before paid App Store monetization, or list as free."
            : "Billing can remain disabled for private customer release.",
        ),

    input.distribution === "public"
      ? item("listingAssets", "App Store listing assets", "warning", "Needs manual upload", "Prepare icon, screenshots, listing copy, test instructions, privacy, and support links in Partner Dashboard.")
      : item("listingAssets", "App Store listing assets", "warning", "Not required for private release", "Prepare later before public App Store submission."),

    item("reviewTesting", "Review test instructions", "success", "Documented checklist", "Use the customer handoff and App Store readiness docs for reviewer/customer testing."),
  ];

  const summary = items.reduce<Record<ReleaseReadinessStatus, number>>(
    (counts, readinessItem) => {
      counts[readinessItem.status] += 1;
      return counts;
    },
    { critical: 0, warning: 0, success: 0 },
  );

  return {
    privateReleaseReady: summary.critical === 0,
    appStoreReady: input.distribution === "public" && summary.critical === 0 && summary.warning === 0,
    summary,
    items,
  };
}

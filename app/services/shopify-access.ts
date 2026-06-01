export const REQUIRED_PRODUCT_SYNC_SCOPES = ["read_products"];
export const DEFAULT_APP_SCOPES = [
  "read_products",
  "write_products",
  "read_inventory",
  "write_inventory",
  "read_orders",
];
export const REAUTHORIZE_TARGET = "_top";

export function parseScopeList(scopes?: string | null) {
  return (scopes || "")
    .split(",")
    .map((scope) => scope.trim())
    .filter(Boolean);
}

export function getMissingScopes(grantedScopes: string[] | undefined, requiredScopes: string[]) {
  const granted = new Set(grantedScopes || []);
  return requiredScopes.filter((scope) => !granted.has(scope));
}

export function normalizeAppScopes(scopes?: string | null) {
  const configured = parseScopeList(scopes);
  return Array.from(new Set([...DEFAULT_APP_SCOPES, ...configured]));
}

export function resolveGrantedScopes(queriedScopes: string[] | undefined, sessionScope?: string | null) {
  return queriedScopes && queriedScopes.length ? queriedScopes : parseScopeList(sessionScope);
}

export function isProductsAccessDenied(error: unknown) {
  const message = error instanceof Error ? error.message : String(error || "");
  return /access denied/i.test(message) && /products/i.test(message);
}

export function buildMissingProductScopeMessage(shop: string, missingScopes: string[]) {
  const scopeText = missingScopes.join(", ") || REQUIRED_PRODUCT_SYNC_SCOPES.join(", ");
  return `This store has not approved StockBridge product access (${scopeText}). Re-authorize the app for ${shop}, or uninstall and reinstall StockBridge, then approve the requested product permissions.`;
}

export function buildReauthorizeUrl(shop: string) {
  return `/auth/login?shop=${encodeURIComponent(shop)}`;
}

export const REQUIRED_PRODUCT_SYNC_SCOPES = ["read_products"];

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

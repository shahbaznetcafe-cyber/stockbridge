import { describe, expect, test } from "vitest";

import {
  buildMissingProductScopeMessage,
  buildReauthorizeUrl,
  getMissingScopes,
  isProductsAccessDenied,
  normalizeAppScopes,
  parseScopeList,
  REAUTHORIZE_TARGET,
  REQUIRED_PRODUCT_SYNC_SCOPES,
  resolveGrantedScopes,
} from "./shopify-access";

describe("Shopify access helpers", () => {
  test("parses and compares approved scopes", () => {
    expect(parseScopeList("read_products, write_inventory,,read_orders")).toEqual([
      "read_products",
      "write_inventory",
      "read_orders",
    ]);

    expect(getMissingScopes(["write_inventory"], REQUIRED_PRODUCT_SYNC_SCOPES)).toEqual([
      "read_products",
    ]);
    expect(getMissingScopes(["read_products", "write_inventory"], REQUIRED_PRODUCT_SYNC_SCOPES)).toEqual([]);
    expect(resolveGrantedScopes(["read_products"], "write_inventory")).toEqual(["read_products"]);
    expect(resolveGrantedScopes([], "write_inventory")).toEqual(["write_inventory"]);
    expect(normalizeAppScopes("write_products,write_inventory,read_orders")).toEqual([
      "read_products",
      "write_products",
      "read_inventory",
      "write_inventory",
      "read_orders",
    ]);
  });

  test("builds actionable product access recovery details", () => {
    expect(isProductsAccessDenied(new Error("Access denied for products field."))).toBe(true);
    expect(isProductsAccessDenied(new Error("Access denied for orders field."))).toBe(false);

    expect(buildReauthorizeUrl("th991q-0w.myshopify.com")).toBe(
      "/auth/login?shop=th991q-0w.myshopify.com",
    );
    expect(REAUTHORIZE_TARGET).toBe("_top");
    expect(
      buildMissingProductScopeMessage("th991q-0w.myshopify.com", ["read_products"]),
    ).toContain("approve the requested product permissions");
  });
});

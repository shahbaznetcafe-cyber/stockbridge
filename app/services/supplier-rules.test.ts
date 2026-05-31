import { describe, expect, test } from "vitest";

import { getSupplierDeleteBlockMessage } from "./supplier-rules.server";

describe("supplier rules", () => {
  test("blocks deleting suppliers assigned to products", () => {
    expect(getSupplierDeleteBlockMessage("Acme Supply", 3)).toBe(
      "Acme Supply is assigned to 3 products. Reassign or detach those products before removing this supplier.",
    );
  });

  test("allows deleting suppliers with no assigned products", () => {
    expect(getSupplierDeleteBlockMessage("Acme Supply", 0)).toBeNull();
  });
});

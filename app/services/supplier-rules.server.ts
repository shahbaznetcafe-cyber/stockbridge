export function getSupplierDeleteBlockMessage(supplierName: string, assignedProductCount: number) {
  if (assignedProductCount <= 0) return null;

  const productLabel = assignedProductCount === 1 ? "product" : "products";
  return `${supplierName} is assigned to ${assignedProductCount} ${productLabel}. Reassign or detach those products before removing this supplier.`;
}

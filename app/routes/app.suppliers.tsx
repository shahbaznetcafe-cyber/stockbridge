import { useState } from "react";
import type { LoaderFunctionArgs, ActionFunctionArgs } from "@remix-run/node";
import { json } from "@remix-run/node";
import { useLoaderData, useFetcher } from "@remix-run/react";
import { Page, Card, Text, BlockStack, Button, Modal, TextField, Banner, IndexTable, useIndexResourceState } from "@shopify/polaris";
import { TitleBar } from "@shopify/app-bridge-react";
import { authenticate } from "../shopify.server";
import prisma from "../db.server";
import { getSupplierDeleteBlockMessage } from "../services/supplier-rules.server";

export const loader = async ({ request }: LoaderFunctionArgs) => {
  const { session } = await authenticate.admin(request);

  const store = await prisma.store.findUnique({ where: { shop: session.shop } });
  if (!store) throw new Error("Store not found");

  const suppliers = await prisma.supplier.findMany({
    where: { storeId: store.id },
    include: { _count: { select: { products: true } } },
    orderBy: { name: "asc" },
  });

  return json({ suppliers, storeId: store.id });
};

export const action = async ({ request }: ActionFunctionArgs) => {
  const { session } = await authenticate.admin(request);

  const store = await prisma.store.findUnique({ where: { shop: session.shop } });
  if (!store) return json({ error: "Store not found" }, { status: 404 });

  const formData = await request.formData();
  const intent = formData.get("intent");

  if (intent === "create") {
    await prisma.supplier.create({
      data: {
        storeId: store.id,
        name: formData.get("name") as string,
        email: (formData.get("email") as string) || null,
        phone: (formData.get("phone") as string) || null,
        leadTimeDays: parseInt(formData.get("leadTimeDays") as string) || 14,
        moq: parseInt(formData.get("moq") as string) || 1,
        notes: (formData.get("notes") as string) || null,
      },
    });
    return json({ success: true });
  }

  if (intent === "delete") {
    const supplierId = formData.get("supplierId") as string;
    const supplier = await prisma.supplier.findFirst({
      where: { id: supplierId, storeId: store.id },
      include: { _count: { select: { products: true } } },
    });

    if (!supplier) return json({ error: "Supplier not found" }, { status: 404 });

    const blockMessage = getSupplierDeleteBlockMessage(supplier.name, supplier._count.products);
    if (blockMessage) return json({ error: blockMessage }, { status: 409 });

    await prisma.supplier.delete({ where: { id: supplierId } });
    return json({ success: true, message: `${supplier.name} removed.` });
  }

  return json({ error: "Unknown intent" }, { status: 400 });
};

export default function Suppliers() {
  const { suppliers } = useLoaderData<typeof loader>();
  const fetcher = useFetcher();
  const actionData = fetcher.data as { success?: boolean; error?: string; message?: string } | undefined;
  const [createOpen, setCreateOpen] = useState(false);

  const resourceName = { singular: "supplier", plural: "suppliers" };
  const { selectedResources, allResourcesSelected, handleSelectionChange } = useIndexResourceState(suppliers);

  const rowMarkup = suppliers.map((supplier, index) => (
    <IndexTable.Row id={supplier.id} key={supplier.id} selected={selectedResources.includes(supplier.id)} position={index}>
      <IndexTable.Cell><Text variant="bodyMd" fontWeight="bold" as="span">{supplier.name}</Text></IndexTable.Cell>
      <IndexTable.Cell>{supplier.email || "Not set"}</IndexTable.Cell>
      <IndexTable.Cell>{supplier.phone || "Not set"}</IndexTable.Cell>
      <IndexTable.Cell>{supplier.leadTimeDays} days</IndexTable.Cell>
      <IndexTable.Cell>MOQ: {supplier.moq}</IndexTable.Cell>
      <IndexTable.Cell>{supplier._count.products}</IndexTable.Cell>
      <IndexTable.Cell>
        <fetcher.Form method="POST">
          <input type="hidden" name="intent" value="delete" />
          <input type="hidden" name="supplierId" value={supplier.id} />
          <Button variant="plain" tone="critical" submit>Remove</Button>
        </fetcher.Form>
      </IndexTable.Cell>
    </IndexTable.Row>
  ));

  return (
    <Page
      fullWidth
      primaryAction={<Button variant="primary" onClick={() => setCreateOpen(true)}>Add Supplier</Button>}
    >
      <TitleBar title="Suppliers" />
      <BlockStack gap="400">
        {actionData?.success && (
          <Banner tone="success">
            <Text variant="bodyMd" as="p">{actionData.message || "Supplier saved."}</Text>
          </Banner>
        )}
        {actionData?.error && (
          <Banner tone="critical">
            <Text variant="bodyMd" as="p">{actionData.error}</Text>
          </Banner>
        )}
        {suppliers.length === 0 && (
          <Banner tone="info">
            <Text variant="bodyMd" as="p">No suppliers yet. Add your first supplier to start managing lead times and reorder points.</Text>
          </Banner>
        )}
        <Card>
          <IndexTable
            resourceName={resourceName}
            itemCount={suppliers.length}
            selectedItemsCount={allResourcesSelected ? "All" : selectedResources.length}
            onSelectionChange={handleSelectionChange}
            headings={[
              { title: "Name" },
              { title: "Email" },
              { title: "Phone" },
              { title: "Lead Time" },
              { title: "MOQ" },
              { title: "Products" },
              { title: "Actions" },
            ]}
          >
            {rowMarkup}
          </IndexTable>
        </Card>
      </BlockStack>

      <Modal open={createOpen} onClose={() => setCreateOpen(false)} title="Add Supplier">
        <Modal.Section>
          <fetcher.Form method="POST" onSubmit={() => setCreateOpen(false)}>
            <input type="hidden" name="intent" value="create" />
            <BlockStack gap="400">
              <TextField label="Supplier Name" name="name" type="text" autoComplete="off" required />
              <TextField label="Email" name="email" type="email" autoComplete="email" />
              <TextField label="Phone" name="phone" type="tel" autoComplete="tel" />
              <TextField label="Lead Time (days)" name="leadTimeDays" type="number" defaultValue="14" autoComplete="off" />
              <TextField label="Minimum Order Quantity" name="moq" type="number" defaultValue="1" autoComplete="off" />
              <TextField label="Notes" name="notes" type="text" multiline={3} autoComplete="off" />
              <Button variant="primary" submit>Save Supplier</Button>
            </BlockStack>
          </fetcher.Form>
        </Modal.Section>
      </Modal>
    </Page>
  );
}

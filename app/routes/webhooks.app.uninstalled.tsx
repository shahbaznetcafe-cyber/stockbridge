import type { ActionFunctionArgs } from "@remix-run/node";
import { authenticate } from "../shopify.server";
import db from "../db.server";

export const action = async ({ request }: ActionFunctionArgs) => {
  const { shop, session, topic } = await authenticate.webhook(request);

  console.log(`Received ${topic} webhook for ${shop}`);

  if (session) {
    await db.session.deleteMany({ where: { shop } });
  }

  const store = await db.store.findUnique({ where: { shop } });
  if (store) {
    await db.store.update({
      where: { id: store.id },
      data: { uninstalledAt: new Date(), subscriptionStatus: "uninstalled" },
    });
    await db.product.deleteMany({ where: { storeId: store.id } });
    await db.supplier.deleteMany({ where: { storeId: store.id } });
    await db.stockAlert.deleteMany({ where: { storeId: store.id } });
    await db.notificationSetting.deleteMany({ where: { storeId: store.id } });
  }

  return new Response();
};

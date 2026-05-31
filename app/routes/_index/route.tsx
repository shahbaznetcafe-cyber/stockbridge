import type { LoaderFunctionArgs } from "@remix-run/node";
import { redirect } from "@remix-run/node";
import { Form, useLoaderData } from "@remix-run/react";

import { login } from "../../shopify.server";

import styles from "./styles.module.css";

export const loader = async ({ request }: LoaderFunctionArgs) => {
  const url = new URL(request.url);

  if (url.searchParams.get("shop")) {
    throw redirect(`/app?${url.searchParams.toString()}`);
  }

  return { showForm: Boolean(login) };
};

export default function App() {
  const { showForm } = useLoaderData<typeof loader>();

  return (
    <div className={styles.index}>
      <div className={styles.content}>
        <p className={styles.eyebrow}>StockBridge for Shopify</p>
        <h1 className={styles.heading}>Inventory alerts before stockouts cost you sales</h1>
        <p className={styles.text}>
          Sync Shopify products, track reorder points, manage supplier lead times, and review low-stock alerts from one embedded dashboard.
        </p>
        {showForm && (
          <Form className={styles.form} method="post" action="/auth/login">
            <label className={styles.label}>
              <span>Shop domain</span>
              <input
                className={styles.input}
                type="text"
                name="shop"
                placeholder="my-store.myshopify.com"
                pattern="^[a-zA-Z0-9][a-zA-Z0-9-]*\.myshopify\.com$"
                required
              />
              <span>Use your full myshopify.com domain to install or open the app.</span>
            </label>
            <button className={styles.button} type="submit">
              Continue to Shopify
            </button>
          </Form>
        )}
        <ul className={styles.list}>
          <li>
            <strong>Sync products</strong>
            <span>Pull active Shopify products, prices, SKUs, images, and inventory into StockBridge.</span>
          </li>
          <li>
            <strong>Plan replenishment</strong>
            <span>Set supplier lead times, safety stock, reorder points, and reorder quantities.</span>
          </li>
          <li>
            <strong>Review alerts</strong>
            <span>Catch low-stock, out-of-stock, and dead-stock items before they become urgent.</span>
          </li>
        </ul>
      </div>
    </div>
  );
}

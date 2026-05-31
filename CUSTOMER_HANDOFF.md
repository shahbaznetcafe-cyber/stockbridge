# StockBridge Customer Handoff Checklist

## Private Customer Release

- Production URL: `https://stockbridge-ua7x.onrender.com`
- Health check: `https://stockbridge-ua7x.onrender.com/up`
- Billing: disabled for first customer release
- Required Shopify scopes: `read_products,write_products,read_inventory,write_inventory,read_orders`

## Before Customer Install

- Confirm Render service deploy is live.
- Confirm `SHOPIFY_APP_URL` matches production URL.
- Confirm Shopify Partner app URL matches production URL.
- Confirm Shopify redirect URLs match the deployed auth routes.
- Confirm PostgreSQL and Redis credentials are saved in Render environment variables.

## Customer Test Flow

- Install app on the customer's Shopify store.
- Open embedded app from Shopify Admin.
- Sync products.
- Confirm product table shows titles, SKUs, inventory, price, supplier, and reorder point.
- Add at least one supplier.
- Assign supplier to at least one product.
- Set inventory cost, safety stock, lead time, reorder point, and reorder quantity.
- Open Purchase Orders.
- Create a draft purchase order from reorder candidates.
- Mark the purchase order as sent, then received or cancelled.
- Confirm dashboard metrics update.
- Confirm alerts show for low-stock or out-of-stock products.
- Resolve an alert and confirm success feedback.
- Save notification settings with valid emails and Slack webhook if needed.

## Current Purchase Order Limit

- Phase 1 purchase orders are internal planning records.
- Receiving a purchase order does not update Shopify inventory quantities yet.

## Rollback

- Revert the latest GitHub commit on `main`.
- Push the revert commit.
- Let Render auto-deploy the previous stable build.
- Confirm `/up` returns `200`.

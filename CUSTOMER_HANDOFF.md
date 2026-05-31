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
- Open Diagnostics after install and resolve critical setup blockers before calling the customer test complete.

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
- Mark the purchase order as sent.
- Use Receive inventory after goods arrive. Partial receipts are allowed.
- Confirm remaining quantity and receipt history update after each receipt.
- Confirm Shopify inventory increased by the received quantity only.
- Confirm Purchase Orders summary shows open value, open orders, due-this-week orders, overdue orders, and workflow counts.
- Open Print or email for a purchase order.
- Use Print or Save PDF and confirm the supplier-ready document includes supplier, totals, lines, and remaining quantities.
- Send supplier email only after SendGrid and supplier email are configured.
- Search purchase orders by supplier, product, SKU, or PO number.
- Filter purchase orders by draft, sent, partial, received, or cancelled status.
- Export CSV and confirm the file includes ordered, received, and remaining quantities.
- Cancel incorrect purchase orders before receiving.
- Confirm dashboard metrics update.
- Confirm alerts show for low-stock or out-of-stock products.
- Confirm Diagnostics shows no critical blockers after sync, supplier setup, and purchase-order testing.
- Resolve an alert and confirm success feedback.
- Save notification settings with valid emails and Slack webhook if needed.
- Review Notification Readiness in Settings and resolve warning states for enabled delivery channels.

## Purchase Order Notes

- Product sync must be run after this release before receiving purchase orders, because receiving needs Shopify inventory item and location identifiers.
- Receiving a purchase order records receipt history, updates Shopify inventory, and increments StockBridge local product stock.
- PDF export uses the browser print dialog from the printable purchase order page.
- Supplier PO email uses SendGrid and will show a configuration error if SendGrid is not enabled.
- CSV export downloads the currently filtered purchase order list for customer handoff, supplier follow-up, and spreadsheet review.
- Summary cards are calculated from the latest 50 purchase orders shown on the Purchase Orders page.
- Diagnostics is a setup readiness screen. Warnings can be acceptable for private release if the customer does not need that feature, but critical blockers should be resolved.
- Notification readiness shows whether email alerts, daily digest, and Slack alerts are ready, disabled, or need configuration.

## Rollback

- Revert the latest GitHub commit on `main`.
- Push the revert commit.
- Let Render auto-deploy the previous stable build.
- Confirm `/up` returns `200`.

# StockBridge

StockBridge is a Shopify embedded app for small merchants who need practical inventory control without a heavy ERP. It syncs Shopify products, tracks reorder points and supplier lead times, calculates sales velocity, creates draft purchase orders, and surfaces low-stock, out-of-stock, and dead-stock alerts.

## Current Production URL

Production app URL:

```text
https://stockbridge-ua7x.onrender.com
```

Health check:

```text
https://stockbridge-ua7x.onrender.com/up
```

## Tech Stack

- Shopify Remix app
- Shopify App Bridge and Polaris
- Prisma ORM
- PostgreSQL on Render
- Redis/BullMQ for background jobs when `REDIS_URL` is configured
- SendGrid for email notifications when `SENDGRID_API_KEY` is configured

## Required Environment Variables

Copy `.env.example` and fill in the production values.

```text
SHOPIFY_API_KEY=
SHOPIFY_API_SECRET=
SHOPIFY_APP_URL=https://stockbridge-ua7x.onrender.com
SCOPES=read_products,write_products,read_inventory,write_inventory,read_orders
SESSION_SECRET=
DATABASE_URL=
REDIS_URL=
SENDGRID_API_KEY=
NOTIFICATION_FROM_EMAIL=alerts@stockbridge.app
```

For the current Render setup, `DATABASE_URL` uses the external PostgreSQL URL because the web service and database are not in the same Render region. If both services are moved to the same region, switch to Render's internal database URL.

## Local Development

```powershell
npm install
npm run dev
```

Use Shopify CLI to connect the app to a Shopify development store.

## Production Build

```powershell
npm ci
npm run build
npm run start:prod
```

`start:prod` runs Prisma migrations first. If the existing database was originally created with `prisma db push`, it falls back to a non-destructive `prisma db push --skip-generate`. It does not use `--accept-data-loss`.

## Verification

```powershell
npm test
npm run build
npm run lint
```

Production smoke checks:

```powershell
Invoke-WebRequest https://stockbridge-ua7x.onrender.com/up -UseBasicParsing
Invoke-WebRequest https://stockbridge-ua7x.onrender.com/ -UseBasicParsing
```

## Private Customer Handoff

1. Confirm the Shopify Partner app URL is `https://stockbridge-ua7x.onrender.com`.
2. Confirm redirect URLs include the deployed auth callback paths used by Shopify Remix.
3. Install the app on the customer's Shopify store.
4. Open StockBridge inside Shopify Admin.
5. Sync products from the Products screen.
6. Add suppliers and assign them to products.
7. Set reorder points, safety stock, lead time, and reorder quantities.
8. Create a draft purchase order from reorder candidates.
9. Mark the purchase order as sent, received, or cancelled as the supplier workflow progresses.
10. Review dashboard metrics and Inventory Alerts.
11. Configure email or Slack notifications in Settings if the customer wants alerts.

## Known Production Notes

- Billing is disabled for the first private customer release.
- App Store submission is a separate hardening phase.
- Redis-backed queues run only when `REDIS_URL` is configured.
- SendGrid email delivery runs only when `SENDGRID_API_KEY` is configured.
- Render internal database URLs should only be used when web service and database are in the same region.
- Shopify `read_orders` is used for recent order analytics. Full 90-day historical reporting needs Shopify approval for broader order history access.
- Purchase Orders Phase 1 creates internal planning records only. Receiving a purchase order does not change Shopify inventory yet.

## Support

Support page:

```text
https://stockbridge-ua7x.onrender.com/support
```

Privacy page:

```text
https://stockbridge-ua7x.onrender.com/privacy
```

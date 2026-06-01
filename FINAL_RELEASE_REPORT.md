# StockBridge Final Private Release Report

## Release Target

- Release type: private customer release
- Production URL: `https://stockbridge-ua7x.onrender.com`
- Shopify distribution: custom distribution
- Billing: disabled for private release
- App Store submission: later phase after private acceptance

## Final Acceptance Flow

Run these checks after deploying the latest GitHub `main` commit to Render:

1. `GET https://stockbridge-ua7x.onrender.com/up` returns `200`.
2. StockBridge opens inside Shopify Admin without `404`, `500`, or redirect loop.
3. Products sync from Shopify.
4. Suppliers can be created and assigned to products.
5. Purchase order can be created, marked sent, filtered, searched, printed, emailed when configured, exported to CSV, and received partially or fully.
6. Shopify inventory changes match received purchase order quantity.
7. Alerts display and can be resolved.
8. Notification Readiness shows each enabled channel as ready.
9. Diagnostics shows zero critical blockers.
10. Release Readiness shows zero critical private-release blockers.
11. Customer Acceptance page is reviewed and evidence is captured.

## In-App Verification Pages

- Dashboard: `/app`
- Products: `/app/products`
- Suppliers: `/app/suppliers`
- Purchase Orders: `/app/purchase-orders`
- Alerts: `/app/alerts`
- Settings / Notification Readiness: `/app/settings`
- Diagnostics: `/app/diagnostics`
- Release Readiness: `/app/release-readiness`
- Customer Acceptance: `/app/customer-acceptance`

## Deploy Notes

- Latest source must be pushed to GitHub `main`.
- Render deploy must run the latest commit.
- No Render deploy hook is stored in this repository.
- If Render auto-deploy is disabled, use Render dashboard: Manual Deploy > Deploy latest commit.

## Known Private Release Limitations

- Billing is intentionally disabled.
- Public App Store assets are not submitted yet.
- Direct server-side PDF generation is not included; PO PDF uses browser print/save.
- Redis-backed scheduled jobs require `REDIS_URL`.
- SendGrid email delivery requires `SENDGRID_API_KEY` and `NOTIFICATION_FROM_EMAIL`.

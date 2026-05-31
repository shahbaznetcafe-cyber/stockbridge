# StockBridge App Store Readiness

## Current Release Target

- Immediate target: private customer release through custom distribution.
- Later target: public Shopify App Store submission after private install is stable.
- Billing status: disabled for private release. Add Shopify Billing only before paid public monetization.
- Production URL: `https://stockbridge-ua7x.onrender.com`

## Official Shopify Review Areas Checked

- Distribution method: custom distribution does not require App Store approval, but public distribution does.
- Reliability: embedded app routes must not show blocking `404`, `500`, or redirect-loop errors during review.
- UI: app must have an operational merchant UI.
- Data sync: Shopify data copied into StockBridge must remain accurate and explainable.
- Platform use: embedded app uses Shopify App Bridge and Shopify Admin API.
- Scopes: app must request only scopes required for its feature set.
- Listing: public App Store submission needs app icon, screenshots, listing copy, support URL, privacy URL, and testing instructions.

## Current Evidence

- Public support route: `/support`
- Public privacy route: `/privacy`
- Health route: `/up`
- Embedded setup diagnostics: `/app/diagnostics`
- Embedded release checklist: `/app/release-readiness`
- GDPR webhooks:
  - `/webhooks/customers/data_request`
  - `/webhooks/customers/redact`
  - `/webhooks/shop/redact`
- App lifecycle webhooks:
  - `/webhooks/app/uninstalled`
  - `/webhooks/app/scopes_update`

## Private Customer Release Checklist

- Deploy latest `main` commit to Render.
- Confirm `/up` returns `200`.
- Install app on the target Shopify store.
- Sync products.
- Add suppliers.
- Assign suppliers to products.
- Create and receive at least one purchase order.
- Confirm Diagnostics has no critical blockers.
- Confirm Release Readiness has no critical blockers.
- Confirm Notification Readiness is either ready or intentionally disabled.

## Public App Store Checklist

- Decide whether the app will be free or paid.
- If paid, implement Shopify Billing before submission.
- Prepare app icon in Shopify Partner Dashboard.
- Prepare screenshots for Dashboard, Products, Purchase Orders, Diagnostics, and Settings.
- Prepare listing copy:
  - App name: StockBridge
  - Primary value: inventory alerts, reorder planning, supplier lead times, Shopify inventory receiving.
  - Target merchant: small Shopify merchants managing supplier-based inventory.
- Prepare reviewer test instructions:
  - Test store domain.
  - Install flow.
  - Product sync steps.
  - Supplier setup steps.
  - Purchase order creation, print, CSV export, partial receiving, and alert workflow.
- Confirm there are no visible placeholder screens, broken nav links, or template copy.
- Confirm no route used in the reviewer flow returns `404`, `500`, or a redirect loop.

## Official References

- Shopify App Store requirements: https://shopify.dev/docs/apps/launch/shopify-app-store/app-store-requirements
- Shopify app distribution: https://shopify.dev/docs/apps/launch/distribution

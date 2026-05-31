export default function Privacy() {
  return (
    <main style={{ maxWidth: "760px", margin: "0 auto", padding: "48px 20px", lineHeight: 1.7 }}>
      <h1>StockBridge Privacy Policy</h1>
      <p>
        StockBridge stores the Shopify data needed to provide inventory planning, supplier tracking,
        alerts, and app authentication. This can include shop domain, product information, inventory
        quantities, supplier records entered by the merchant, notification settings, and app session data.
      </p>
      <p>
        StockBridge does not sell merchant data. Data is used only to operate the app, provide support,
        and maintain security. Merchants can uninstall the app from Shopify Admin, which triggers cleanup
        of app sessions and store-specific app data.
      </p>
      <p>
        For privacy or data deletion requests, contact the StockBridge support owner listed in the
        customer handoff documentation.
      </p>
    </main>
  );
}

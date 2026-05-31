import { describe, expect, test } from "vitest";

import {
  buildAlertNotificationHtml,
  buildDailyDigestHtml,
  buildNotificationReadiness,
} from "./notification-content.server";

describe("notification content helpers", () => {
  test("escapes alert notification HTML", () => {
    const html = buildAlertNotificationHtml({
      message: '<script>alert("x")</script>',
      storeShop: "demo.myshopify.com",
    });

    expect(html).toContain("&lt;script&gt;alert(&quot;x&quot;)&lt;/script&gt;");
    expect(html).not.toContain("<script>");
  });

  test("builds digest HTML with escaped alert rows and counts", () => {
    const html = buildDailyDigestHtml({
      storeName: "Demo Store",
      alerts: [
        { type: "low_stock", message: "Aloe < 5 units", severity: "warning" },
        { type: "out_of_stock", message: 'Mint "Tea" sold out', severity: "critical" },
      ],
    });

    expect(html).toContain("Critical alerts: 1");
    expect(html).toContain("Warnings: 1");
    expect(html).toContain("Aloe &lt; 5 units");
    expect(html).toContain("Mint &quot;Tea&quot; sold out");
  });

  test("reports notification readiness from settings and environment", () => {
    const readiness = buildNotificationReadiness({
      settings: {
        emailEnabled: true,
        emailRecipients: "owner@example.com",
        slackEnabled: true,
        slackWebhookUrl: null,
        dailyDigestEnabled: true,
      },
      env: {
        sendgridConfigured: false,
        notificationFromEmailConfigured: true,
      },
    });

    expect(readiness).toEqual([
      {
        key: "emailAlerts",
        label: "Email alerts",
        status: "warning",
        value: "SendGrid missing",
        action: "Set SENDGRID_API_KEY before relying on email alert delivery.",
      },
      {
        key: "dailyDigest",
        label: "Daily digest",
        status: "warning",
        value: "SendGrid missing",
        action: "Set SENDGRID_API_KEY before relying on daily digest delivery.",
      },
      {
        key: "slackAlerts",
        label: "Slack alerts",
        status: "warning",
        value: "Webhook missing",
        action: "Add a Slack webhook URL or disable Slack notifications.",
      },
    ]);
  });
});

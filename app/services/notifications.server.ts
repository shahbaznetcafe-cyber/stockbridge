import prisma from "../db.server";
import sgMail from "@sendgrid/mail";

if (process.env.SENDGRID_API_KEY) {
  sgMail.setApiKey(process.env.SENDGRID_API_KEY);
}

export async function sendAlertNotification(storeId: string, alert: { type: string; message: string; severity: string }) {
  const settings = await prisma.notificationSetting.findUnique({
    where: { storeId },
  });

  if (!settings) return;

  const store = await prisma.store.findUnique({ where: { id: storeId } });
  if (!store) return;

  if (settings.emailEnabled && settings.emailRecipients && process.env.SENDGRID_API_KEY) {
    const recipients = settings.emailRecipients.split(",").map((e) => e.trim());
    const subject = `[StockBridge] ${alert.severity === "critical" ? "🚨" : "⚠️"} ${alert.type.replace("_", " ").toUpperCase()}`;

    try {
      await sgMail.send({
        to: recipients,
        from: process.env.NOTIFICATION_FROM_EMAIL || "alerts@stockbridge.app",
        subject,
        html: `<h2>${alert.message}</h2><p>Store: ${store.shop}</p><hr/><p style="color:#666;">StockBridge Inventory Alert</p>`,
      });
    } catch (error) {
      console.error("Failed to send alert email:", error);
    }
  }

  if (settings.slackEnabled && settings.slackWebhookUrl) {
    const emoji = alert.severity === "critical" ? ":red_circle:" : ":warning:";
    const payload = {
      text: `${emoji} *${alert.type.replace("_", " ").toUpperCase()}*\n${alert.message}\n_Store: ${store.shop}_`,
    };

    try {
      await fetch(settings.slackWebhookUrl, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(payload),
      });
    } catch (error) {
      console.error("Failed to send Slack notification:", error);
    }
  }
}

export async function sendDailyDigest(storeId: string) {
  const settings = await prisma.notificationSetting.findUnique({ where: { storeId } });
  if (!settings?.dailyDigestEnabled || !settings?.emailRecipients) return;

  const alerts = await prisma.stockAlert.findMany({
    where: { storeId, isResolved: false },
    orderBy: { createdAt: "desc" },
    take: 20,
  });

  if (alerts.length === 0) return;

  const stats = {
    critical: alerts.filter((a) => a.severity === "critical").length,
    warning: alerts.filter((a) => a.severity === "warning").length,
    lowStock: alerts.filter((a) => a.type === "low_stock").length,
    outOfStock: alerts.filter((a) => a.type === "out_of_stock").length,
    deadStock: alerts.filter((a) => a.type === "dead_stock").length,
  };

  const store = await prisma.store.findUnique({ where: { id: storeId } });
  const storeName = store?.shop || "Your Store";

  let html = `<h1>📊 Daily Inventory Digest - ${storeName}</h1>`;
  html += `<p>Here's your inventory summary for today:</p>`;
  html += `<ul>
    <li>🚨 Critical alerts: ${stats.critical}</li>
    <li>⚠️ Warnings: ${stats.warning}</li>
    <li>📦 Low stock: ${stats.lowStock}</li>
    <li>❌ Out of stock: ${stats.outOfStock}</li>
    <li>💀 Dead stock: ${stats.deadStock}</li>
  </ul>`;
  html += `<table border="1" cellpadding="8" cellspacing="0" style="border-collapse:collapse;width:100%;">
    <tr style="background:#f5f5f5;"><th>Type</th><th>Message</th><th>Severity</th></tr>`;

  for (const alert of alerts) {
    const color = alert.severity === "critical" ? "#ff4444" : "#ffaa00";
    html += `<tr><td>${alert.type.replace("_", " ")}</td><td>${alert.message}</td><td style="color:${color};">${alert.severity}</td></tr>`;
  }

  html += `</table><hr/><p style="color:#999;">StockBridge - Smart Inventory Management</p>`;

  if (process.env.SENDGRID_API_KEY) {
    try {
      await sgMail.send({
        to: settings.emailRecipients.split(",").map((e) => e.trim()),
        from: process.env.NOTIFICATION_FROM_EMAIL || "alerts@stockbridge.app",
        subject: `📊 Daily Inventory Digest - ${storeName}`,
        html,
      });
    } catch (error) {
      console.error("Failed to send daily digest:", error);
    }
  }
}

export async function getNotificationSettings(storeId: string) {
  return prisma.notificationSetting.upsert({
    where: { storeId },
    create: { storeId },
    update: {},
  });
}

export async function updateNotificationSettings(
  storeId: string,
  data: Partial<{
    emailEnabled: boolean;
    emailRecipients: string;
    slackEnabled: boolean;
    slackWebhookUrl: string;
    dailyDigestEnabled: boolean;
    dailyDigestTime: string;
    alertTypes: string;
  }>
) {
  return prisma.notificationSetting.upsert({
    where: { storeId },
    create: { storeId, ...data },
    update: data,
  });
}

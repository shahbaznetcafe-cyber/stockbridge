import prisma from "../db.server";
import sgMail from "@sendgrid/mail";
import { normalizeEmailRecipients, validateSlackWebhookUrl } from "./notification-validation.server";

if (process.env.SENDGRID_API_KEY) {
  sgMail.setApiKey(process.env.SENDGRID_API_KEY);
}

export async function sendAlertNotification(storeId: string, alert: { type: string; message: string; severity: string }) {
  const jobLog = await prisma.jobLog.create({
    data: { storeId, jobType: "alert_notification", status: "running", message: alert.type },
  });

  const settings = await prisma.notificationSetting.findUnique({ where: { storeId } });
  const store = await prisma.store.findUnique({ where: { id: storeId } });

  if (!settings || !store) {
    await prisma.jobLog.update({
      where: { id: jobLog.id },
      data: {
        status: "skipped",
        message: !settings ? "Notification settings not found" : "Store not found",
        completedAt: new Date(),
      },
    });
    return;
  }

  const emailRecipients = normalizeEmailRecipients(settings.emailRecipients);
  const slackWebhook = validateSlackWebhookUrl(settings.slackWebhookUrl);
  const errors: string[] = [];

  if (settings.emailEnabled && "value" in emailRecipients && emailRecipients.value && process.env.SENDGRID_API_KEY) {
    try {
      await sgMail.send({
        to: emailRecipients.value.split(","),
        from: process.env.NOTIFICATION_FROM_EMAIL || "alerts@stockbridge.app",
        subject: `[StockBridge] ${alert.severity.toUpperCase()} ${alert.type.replace("_", " ").toUpperCase()}`,
        html: `<h2>${alert.message}</h2><p>Store: ${store.shop}</p><hr/><p style="color:#666;">StockBridge Inventory Alert</p>`,
      });
    } catch (error) {
      console.error("Failed to send alert email:", error);
      errors.push(error instanceof Error ? error.message : "Failed to send alert email");
    }
  }

  if (settings.slackEnabled && "value" in slackWebhook && slackWebhook.value) {
    const marker = alert.severity === "critical" ? ":red_circle:" : ":warning:";
    try {
      await fetch(slackWebhook.value, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          text: `${marker} *${alert.type.replace("_", " ").toUpperCase()}*\n${alert.message}\n_Store: ${store.shop}_`,
        }),
      });
    } catch (error) {
      console.error("Failed to send Slack notification:", error);
      errors.push(error instanceof Error ? error.message : "Failed to send Slack notification");
    }
  }

  await prisma.jobLog.update({
    where: { id: jobLog.id },
    data: {
      status: errors.length > 0 ? "failed" : "completed",
      error: errors.length > 0 ? errors.join("; ") : null,
      completedAt: new Date(),
    },
  });
}

export async function sendDailyDigest(storeId: string) {
  const jobLog = await prisma.jobLog.create({
    data: { storeId, jobType: "daily_digest", status: "running" },
  });

  const settings = await prisma.notificationSetting.findUnique({ where: { storeId } });
  const recipients = normalizeEmailRecipients(settings?.emailRecipients);

  if (!settings?.dailyDigestEnabled || !("value" in recipients) || !recipients.value) {
    await prisma.jobLog.update({
      where: { id: jobLog.id },
      data: { status: "skipped", message: "Daily digest disabled or no recipients", completedAt: new Date() },
    });
    return;
  }

  const alerts = await prisma.stockAlert.findMany({
    where: { storeId, isResolved: false },
    orderBy: { createdAt: "desc" },
    take: 20,
  });

  if (alerts.length === 0) {
    await prisma.jobLog.update({
      where: { id: jobLog.id },
      data: { status: "skipped", message: "No unresolved alerts", completedAt: new Date() },
    });
    return;
  }

  const stats = {
    critical: alerts.filter((a) => a.severity === "critical").length,
    warning: alerts.filter((a) => a.severity === "warning").length,
    lowStock: alerts.filter((a) => a.type === "low_stock").length,
    outOfStock: alerts.filter((a) => a.type === "out_of_stock").length,
    deadStock: alerts.filter((a) => a.type === "dead_stock").length,
  };

  const store = await prisma.store.findUnique({ where: { id: storeId } });
  const storeName = store?.shop || "Your Store";

  let html = `<h1>Daily Inventory Digest - ${storeName}</h1>`;
  html += "<p>Here's your inventory summary for today:</p>";
  html += `<ul>
    <li>Critical alerts: ${stats.critical}</li>
    <li>Warnings: ${stats.warning}</li>
    <li>Low stock: ${stats.lowStock}</li>
    <li>Out of stock: ${stats.outOfStock}</li>
    <li>Dead stock: ${stats.deadStock}</li>
  </ul>`;
  html += `<table border="1" cellpadding="8" cellspacing="0" style="border-collapse:collapse;width:100%;">
    <tr style="background:#f5f5f5;"><th>Type</th><th>Message</th><th>Severity</th></tr>`;

  for (const alert of alerts) {
    const color = alert.severity === "critical" ? "#ff4444" : "#ffaa00";
    html += `<tr><td>${alert.type.replace("_", " ")}</td><td>${alert.message}</td><td style="color:${color};">${alert.severity}</td></tr>`;
  }

  html += "</table><hr/><p style=\"color:#999;\">StockBridge - Smart Inventory Management</p>";

  if (!process.env.SENDGRID_API_KEY) {
    await prisma.jobLog.update({
      where: { id: jobLog.id },
      data: { status: "skipped", message: "SENDGRID_API_KEY is not set", completedAt: new Date() },
    });
    return;
  }

  try {
    await sgMail.send({
      to: recipients.value.split(","),
      from: process.env.NOTIFICATION_FROM_EMAIL || "alerts@stockbridge.app",
      subject: `Daily Inventory Digest - ${storeName}`,
      html,
    });
    await prisma.jobLog.update({
      where: { id: jobLog.id },
      data: { status: "completed", completedAt: new Date() },
    });
  } catch (error) {
    console.error("Failed to send daily digest:", error);
    await prisma.jobLog.update({
      where: { id: jobLog.id },
      data: {
        status: "failed",
        error: error instanceof Error ? error.message : "Failed to send daily digest",
        completedAt: new Date(),
      },
    });
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
    emailRecipients: string | null;
    slackEnabled: boolean;
    slackWebhookUrl: string | null;
    dailyDigestEnabled: boolean;
    dailyDigestTime: string;
    alertTypes: string;
  }>,
) {
  return prisma.notificationSetting.upsert({
    where: { storeId },
    create: { storeId, ...data },
    update: data,
  });
}

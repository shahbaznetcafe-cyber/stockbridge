import prisma from "../db.server";
import sgMail from "@sendgrid/mail";
import { buildAlertNotificationHtml, buildDailyDigestHtml } from "./notification-content.server";
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
        html: buildAlertNotificationHtml({ message: alert.message, storeShop: store.shop }),
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

  const store = await prisma.store.findUnique({ where: { id: storeId } });
  const storeName = store?.shop || "Your Store";
  const html = buildDailyDigestHtml({ storeName, alerts });

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

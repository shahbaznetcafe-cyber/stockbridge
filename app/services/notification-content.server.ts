export type NotificationReadinessStatus = "success" | "warning" | "subdued";

export type NotificationReadinessCheck = {
  key: string;
  label: string;
  status: NotificationReadinessStatus;
  value: string;
  action: string;
};

export type NotificationSettingsSnapshot = {
  emailEnabled: boolean;
  emailRecipients: string | null;
  slackEnabled: boolean;
  slackWebhookUrl: string | null;
  dailyDigestEnabled: boolean;
};

export type NotificationEnvSnapshot = {
  sendgridConfigured: boolean;
  notificationFromEmailConfigured: boolean;
};

type DigestAlert = {
  type: string;
  message: string;
  severity: string;
};

function escapeHtml(value: string) {
  return value
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;")
    .replace(/'/g, "&#39;");
}

function readinessCheck(
  key: string,
  label: string,
  status: NotificationReadinessStatus,
  value: string,
  action: string,
): NotificationReadinessCheck {
  return { key, label, status, value, action };
}

export function buildAlertNotificationHtml({
  message,
  storeShop,
}: {
  message: string;
  storeShop: string;
}) {
  return `<h2>${escapeHtml(message)}</h2><p>Store: ${escapeHtml(storeShop)}</p><hr/><p style="color:#666;">StockBridge Inventory Alert</p>`;
}

export function buildDailyDigestHtml({
  storeName,
  alerts,
}: {
  storeName: string;
  alerts: DigestAlert[];
}) {
  const stats = {
    critical: alerts.filter((alert) => alert.severity === "critical").length,
    warning: alerts.filter((alert) => alert.severity === "warning").length,
    lowStock: alerts.filter((alert) => alert.type === "low_stock").length,
    outOfStock: alerts.filter((alert) => alert.type === "out_of_stock").length,
    deadStock: alerts.filter((alert) => alert.type === "dead_stock").length,
  };

  const rows = alerts
    .map((alert) => {
      const color = alert.severity === "critical" ? "#d72c0d" : "#b98900";
      return `<tr><td>${escapeHtml(alert.type.replace("_", " "))}</td><td>${escapeHtml(alert.message)}</td><td style="color:${color};">${escapeHtml(alert.severity)}</td></tr>`;
    })
    .join("");

  return `<h1>Daily Inventory Digest - ${escapeHtml(storeName)}</h1>
<p>Here's your inventory summary for today:</p>
<ul>
  <li>Critical alerts: ${stats.critical}</li>
  <li>Warnings: ${stats.warning}</li>
  <li>Low stock: ${stats.lowStock}</li>
  <li>Out of stock: ${stats.outOfStock}</li>
  <li>Dead stock: ${stats.deadStock}</li>
</ul>
<table border="1" cellpadding="8" cellspacing="0" style="border-collapse:collapse;width:100%;">
  <tr style="background:#f5f5f5;"><th>Type</th><th>Message</th><th>Severity</th></tr>
  ${rows}
</table>
<hr/><p style="color:#999;">StockBridge - Smart Inventory Management</p>`;
}

export function buildNotificationReadiness({
  settings,
  env,
}: {
  settings: NotificationSettingsSnapshot;
  env: NotificationEnvSnapshot;
}): NotificationReadinessCheck[] {
  const checks: NotificationReadinessCheck[] = [];

  if (!settings.emailEnabled) {
    checks.push(readinessCheck("emailAlerts", "Email alerts", "subdued", "Disabled", "Enable email notifications if the customer wants email alerts."));
  } else if (!settings.emailRecipients) {
    checks.push(readinessCheck("emailAlerts", "Email alerts", "warning", "Recipients missing", "Add at least one email recipient."));
  } else if (!env.sendgridConfigured) {
    checks.push(readinessCheck("emailAlerts", "Email alerts", "warning", "SendGrid missing", "Set SENDGRID_API_KEY before relying on email alert delivery."));
  } else if (!env.notificationFromEmailConfigured) {
    checks.push(readinessCheck("emailAlerts", "Email alerts", "warning", "From email missing", "Set NOTIFICATION_FROM_EMAIL before relying on email alert delivery."));
  } else {
    checks.push(readinessCheck("emailAlerts", "Email alerts", "success", "Ready", "Email alerts can send."));
  }

  if (!settings.dailyDigestEnabled) {
    checks.push(readinessCheck("dailyDigest", "Daily digest", "subdued", "Disabled", "Enable daily digest if the customer wants daily summary emails."));
  } else if (!settings.emailRecipients) {
    checks.push(readinessCheck("dailyDigest", "Daily digest", "warning", "Recipients missing", "Add email recipients before relying on daily digest delivery."));
  } else if (!env.sendgridConfigured) {
    checks.push(readinessCheck("dailyDigest", "Daily digest", "warning", "SendGrid missing", "Set SENDGRID_API_KEY before relying on daily digest delivery."));
  } else if (!env.notificationFromEmailConfigured) {
    checks.push(readinessCheck("dailyDigest", "Daily digest", "warning", "From email missing", "Set NOTIFICATION_FROM_EMAIL before relying on daily digest delivery."));
  } else {
    checks.push(readinessCheck("dailyDigest", "Daily digest", "success", "Ready", "Daily digest can send when scheduled."));
  }

  if (!settings.slackEnabled) {
    checks.push(readinessCheck("slackAlerts", "Slack alerts", "subdued", "Disabled", "Enable Slack only if the customer provides a webhook."));
  } else if (!settings.slackWebhookUrl) {
    checks.push(readinessCheck("slackAlerts", "Slack alerts", "warning", "Webhook missing", "Add a Slack webhook URL or disable Slack notifications."));
  } else {
    checks.push(readinessCheck("slackAlerts", "Slack alerts", "success", "Ready", "Slack alerts can send."));
  }

  return checks;
}

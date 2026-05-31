const EMAIL_PATTERN = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
const SLACK_WEBHOOK_PREFIX = "https://hooks.slack.com/services/";

export function normalizeEmailRecipients(input: string | null | undefined) {
  const recipients = (input ?? "")
    .split(",")
    .map((email) => email.trim())
    .filter(Boolean);

  if (recipients.length === 0) return { value: null };

  if (recipients.some((email) => !EMAIL_PATTERN.test(email))) {
    return { error: "Use valid email addresses separated by commas." };
  }

  return { value: recipients.join(",") };
}

export function validateSlackWebhookUrl(input: string | null | undefined) {
  const value = (input ?? "").trim();
  if (!value) return { value: null };

  if (!value.startsWith(SLACK_WEBHOOK_PREFIX)) {
    return { error: "Slack webhook URL must start with https://hooks.slack.com/services/." };
  }

  return { value };
}

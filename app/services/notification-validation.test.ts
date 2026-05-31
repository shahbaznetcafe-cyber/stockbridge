import { describe, expect, test } from "vitest";

import {
  normalizeEmailRecipients,
  validateSlackWebhookUrl,
} from "./notification-validation.server";

describe("notification validation", () => {
  test("normalizes valid email recipient lists", () => {
    expect(normalizeEmailRecipients(" owner@example.com, buyer@example.com ")).toEqual({
      value: "owner@example.com,buyer@example.com",
    });
  });

  test("rejects invalid email recipient lists", () => {
    expect(normalizeEmailRecipients("owner@example.com,not-an-email")).toEqual({
      error: "Use valid email addresses separated by commas.",
    });
  });

  test("allows only HTTPS Slack webhook URLs", () => {
    expect(validateSlackWebhookUrl("https://hooks.slack.com/services/T000/B000/secret")).toEqual({
      value: "https://hooks.slack.com/services/T000/B000/secret",
    });
    expect(validateSlackWebhookUrl("http://hooks.slack.com/services/T000/B000/secret")).toEqual({
      error: "Slack webhook URL must start with https://hooks.slack.com/services/.",
    });
  });
});

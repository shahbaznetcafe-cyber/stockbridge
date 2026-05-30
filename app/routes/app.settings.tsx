import type { LoaderFunctionArgs, ActionFunctionArgs } from "@remix-run/node";
import { json } from "@remix-run/node";
import { useLoaderData, useFetcher } from "@remix-run/react";
import { Page, Card, Text, BlockStack, Button, TextField, Checkbox, Banner, FormLayout } from "@shopify/polaris";
import { TitleBar } from "@shopify/app-bridge-react";
import { authenticate } from "../shopify.server";
import { getNotificationSettings, updateNotificationSettings } from "../services/notifications.server";
import prisma from "../db.server";

export const loader = async ({ request }: LoaderFunctionArgs) => {
  const { session } = await authenticate.admin(request);

  const store = await prisma.store.findUnique({ where: { shop: session.shop } });
  if (!store) throw new Error("Store not found");

  const settings = await getNotificationSettings(store.id);
  return json({ settings, plan: store.subscriptionStatus });
};

export const action = async ({ request }: ActionFunctionArgs) => {
  const { session } = await authenticate.admin(request);
  const formData = await request.formData();
  const intent = formData.get("intent");

  const store = await prisma.store.findUnique({ where: { shop: session.shop } });
  if (!store) return json({ error: "Store not found" }, { status: 404 });

  if (intent === "update_settings") {
    await updateNotificationSettings(store.id, {
      emailEnabled: formData.get("emailEnabled") === "on",
      emailRecipients: (formData.get("emailRecipients") as string) || null,
      slackEnabled: formData.get("slackEnabled") === "on",
      slackWebhookUrl: (formData.get("slackWebhookUrl") as string) || null,
      dailyDigestEnabled: formData.get("dailyDigestEnabled") === "on",
      dailyDigestTime: (formData.get("dailyDigestTime") as string) || "08:00",
      alertTypes: (formData.get("alertTypes") as string) || "low_stock,out_of_stock,dead_stock",
    });
    return json({ success: true });
  }

  if (intent === "sync_products") {
    return json({ success: true });
  }

  return json({ error: "Unknown intent" }, { status: 400 });
};

export default function Settings() {
  const { settings, plan } = useLoaderData<typeof loader>();
  const fetcher = useFetcher();

  return (
    <Page fullWidth>
      <TitleBar title="Settings" />
      <BlockStack gap="500">
        <Card>
          <Text variant="headingMd" as="h2">Plan & Billing</Text>
          <BlockStack gap="200">
            <Text variant="bodyMd" as="p">Current plan: <strong>{plan === "trial" ? "Free Trial" : plan}</strong></Text>
            <Text variant="bodyMd" as="p" tone="subdued">
              {plan === "trial" ? "Your 14-day free trial is active." : "Thank you for being a subscriber."}
            </Text>
            <Button
              url="https://stockbridge.onrender.com/app/billing"
              external
            >
              {plan === "trial" ? "Choose a Plan" : "Manage Billing"}
            </Button>
          </BlockStack>
        </Card>

        <Card>
          <Text variant="headingMd" as="h2">Notification Settings</Text>
          <fetcher.Form method="POST">
            <input type="hidden" name="intent" value="update_settings" />
            <BlockStack gap="400">
              <FormLayout>
                <Checkbox
                  label="Enable email notifications"
                  name="emailEnabled"
                  defaultChecked={settings.emailEnabled}
                />
                <TextField
                  label="Email recipients (comma separated)"
                  name="emailRecipients"
                  type="text"
                  defaultValue={settings.emailRecipients || ""}
                  autoComplete="email"
                  helpText="Separate multiple emails with commas"
                />
                <Checkbox
                  label="Enable Slack notifications"
                  name="slackEnabled"
                  defaultChecked={settings.slackEnabled}
                />
                <TextField
                  label="Slack Webhook URL"
                  name="slackWebhookUrl"
                  type="text"
                  defaultValue={settings.slackWebhookUrl || ""}
                  autoComplete="off"
                />
                <Checkbox
                  label="Enable daily email digest"
                  name="dailyDigestEnabled"
                  defaultChecked={settings.dailyDigestEnabled}
                />
                <TextField
                  label="Daily digest time"
                  name="dailyDigestTime"
                  type="time"
                  defaultValue={settings.dailyDigestTime}
                  autoComplete="off"
                />
                <TextField
                  label="Alert types to monitor"
                  name="alertTypes"
                  type="text"
                  defaultValue={settings.alertTypes}
                  helpText="Comma separated: low_stock, out_of_stock, dead_stock"
                  autoComplete="off"
                />
              </FormLayout>
              <Button variant="primary" submit>Save Settings</Button>
            </BlockStack>
          </fetcher.Form>
        </Card>
      </BlockStack>
    </Page>
  );
}

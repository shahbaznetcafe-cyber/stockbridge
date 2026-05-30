import { Queue, Worker } from "bullmq";
import IORedis from "ioredis";

const connection = process.env.REDIS_URL
  ? new IORedis(process.env.REDIS_URL, { maxRetriesPerRequest: null })
  : null;

export const inventoryQueue = connection
  ? new Queue("inventory", { connection, defaultJobOptions: { attempts: 3, backoff: { type: "exponential", delay: 5000 } } })
  : null;

export const alertQueue = connection
  ? new Queue("alerts", { connection, defaultJobOptions: { attempts: 2, backoff: { type: "fixed", delay: 10000 } } })
  : null;

export const digestQueue = connection
  ? new Queue("digest", { connection, defaultJobOptions: { repeat: { pattern: "0 8 * * *" } } })
  : null;

export async function scheduleInventoryCheck(storeId: string) {
  if (!inventoryQueue) return;
  await inventoryQueue.add("check_inventory", { storeId });
}

export async function scheduleAlertCheck(storeId: string) {
  if (!alertQueue) return;
  await alertQueue.add("check_alerts", { storeId });
}

if (connection && inventoryQueue && alertQueue && digestQueue) {
  new Worker(
    "inventory",
    async (job) => {
      const { storeId } = job.data;
      const { checkLowStock, checkDeadStock } = await import("../services/alerts.server");

      await checkLowStock(storeId);
      await checkDeadStock(storeId);
    },
    { connection },
  );

  new Worker(
    "alerts",
    async (job) => {
      const { storeId } = job.data;
      const { getUnresolvedAlerts } = await import("../services/alerts.server");
      const { sendAlertNotification } = await import("../services/notifications.server");

      const alerts = await getUnresolvedAlerts(storeId);
      for (const alert of alerts.slice(0, 5)) {
        await sendAlertNotification(storeId, alert);
      }
    },
    { connection },
  );

  new Worker(
    "digest",
    async (job) => {
      const { sendDailyDigest } = await import("../services/notifications.server");
      const prisma = (await import("../db.server")).default;
      const stores = await prisma.store.findMany({ where: { uninstalledAt: null } });
      for (const store of stores) {
        await sendDailyDigest(store.id);
      }
    },
    { connection },
  );
}

import { spawnSync, spawn } from "node:child_process";

function run(command, args) {
  const result = spawnSync(command, args, { stdio: "inherit", shell: process.platform === "win32" });
  return result.status ?? 1;
}

if (process.env.DATABASE_URL) {
  const migrateStatus = run("npx", ["prisma", "migrate", "deploy"]);

  if (migrateStatus !== 0) {
    console.warn("Prisma migrate deploy failed. Falling back to non-destructive prisma db push.");
    const pushStatus = run("npx", ["prisma", "db", "push", "--skip-generate"]);
    if (pushStatus !== 0) process.exit(pushStatus);
  }
} else {
  console.warn("DATABASE_URL is not set. Starting server without database migration.");
}

const server = spawn("npx", ["remix-serve", "./build/server/index.js"], {
  stdio: "inherit",
  shell: process.platform === "win32",
});

server.on("exit", (code) => process.exit(code ?? 0));

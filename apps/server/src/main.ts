import { serve } from "@hono/node-server";
import pg from "pg";
import { pino } from "pino";
import { createApp } from "./app.ts";
import { loadConfig } from "./config.ts";
import { RealtimeHub } from "./realtime/hub.ts";

const config = loadConfig();
const log = pino({ level: config.LOG_LEVEL });
const db = new pg.Pool({ connectionString: config.DATABASE_URL, max: 10 });

let hub: RealtimeHub | null = null;
const { app, tokens } = createApp({ db, config, log, realtimeConnections: () => hub?.connectionCount ?? 0 });
hub = new RealtimeHub(db, config.DATABASE_URL, tokens, log);
await hub.start();

const server = serve({ fetch: app.fetch, port: config.PORT, hostname: "0.0.0.0" }, (info) =>
  log.info({ port: info.port }, "AccEdu server đã chạy"),
);

server.on("upgrade", (req, socket, head) => {
  const path = (req.url ?? "").split("?")[0];
  if (path === "/realtime/v1/ws" || path === "/realtime/v1/websocket") hub?.handleUpgrade(req, socket, head);
  else socket.destroy();
});

async function shutdown(signal: string) {
  log.info({ signal }, "đang dừng");
  await hub?.stop();
  server.close();
  await db.end();
  process.exit(0);
}
process.on("SIGTERM", () => void shutdown("SIGTERM"));
process.on("SIGINT", () => void shutdown("SIGINT"));

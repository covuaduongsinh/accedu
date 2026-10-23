import type { IncomingMessage } from "node:http";
import type { Duplex } from "node:stream";
import { Client, type Pool } from "pg";
import type { Logger } from "pino";
import { WebSocketServer, type WebSocket } from "ws";
import type { TokenService } from "../auth/tokens.ts";

/**
 * Realtime của AccEdu Platform: một kết nối Postgres LISTEN kênh `accedu_changes`,
 * phát sự kiện tới các WebSocket đã đăng nhập và là thành viên của đơn vị.
 *
 * Giao thức (JSON):
 *   client → {type:"auth", token} | {type:"subscribe", tenant} | {type:"unsubscribe", tenant} | {type:"ping"}
 *   server → {type:"ready"} | {type:"subscribed", tenant} | {type:"change", tenant, table, op, id}
 *            | {type:"reauth"} | {type:"error", message} | {type:"pong"}
 */
interface Conn {
  ws: WebSocket;
  userId: string | null;
  exp: number;
  tenants: Set<string>;
  alive: boolean;
}

export interface ChangeEvent {
  tenant: string;
  table: string;
  op: string;
  id: string | null;
}

export class RealtimeHub {
  private readonly wss = new WebSocketServer({ noServer: true, maxPayload: 64 * 1024 });
  private readonly conns = new Set<Conn>();
  private listener: Client | null = null;
  private heartbeat: NodeJS.Timeout | null = null;
  private stopped = false;
  private readonly db: Pool;
  private readonly dbUrl: string;
  private readonly tokens: TokenService;
  private readonly log: Logger;

  constructor(db: Pool, dbUrl: string, tokens: TokenService, log: Logger) {
    this.db = db;
    this.dbUrl = dbUrl;
    this.tokens = tokens;
    this.log = log;
    this.wss.on("connection", (ws) => this.onConnection(ws));
  }

  get connectionCount(): number {
    return this.conns.size;
  }

  async start(): Promise<void> {
    await this.listen();
    this.heartbeat = setInterval(() => {
      for (const c of this.conns) {
        if (!c.alive) {
          c.ws.terminate();
          continue;
        }
        c.alive = false;
        c.ws.ping();
      }
    }, 25_000);
  }

  async stop(): Promise<void> {
    this.stopped = true;
    if (this.heartbeat) clearInterval(this.heartbeat);
    for (const c of this.conns) c.ws.close(1001, "server shutdown");
    await this.listener?.end().catch(() => undefined);
    this.wss.close();
  }

  /** Gắn vào sự kiện `upgrade` của http server cho đường dẫn /realtime/v1/ws */
  handleUpgrade(req: IncomingMessage, socket: Duplex, head: Buffer): void {
    this.wss.handleUpgrade(req, socket, head, (ws) => this.wss.emit("connection", ws, req));
  }

  private async listen(): Promise<void> {
    const client = new Client({ connectionString: this.dbUrl });
    client.on("error", (e) => {
      this.log.error({ err: e }, "mất kết nối LISTEN, thử lại sau 2 giây");
      this.listener = null;
      if (!this.stopped) setTimeout(() => void this.listen().catch((err) => this.log.error({ err }, "LISTEN lỗi")), 2_000);
    });
    client.on("notification", (msg) => {
      if (!msg.payload) return;
      try {
        this.dispatch(JSON.parse(msg.payload) as ChangeEvent);
      } catch (e) {
        this.log.warn({ err: e }, "payload realtime không hợp lệ");
      }
    });
    await client.connect();
    await client.query("listen accedu_changes");
    this.listener = client;
  }

  /** Phát sự kiện tới các kết nối đang theo dõi đơn vị */
  dispatch(ev: ChangeEvent): void {
    const now = Math.floor(Date.now() / 1000);
    for (const c of this.conns) {
      if (!c.tenants.has(ev.tenant)) continue;
      if (c.exp <= now) {
        this.send(c, { type: "reauth" });
        continue;
      }
      this.send(c, { type: "change", ...ev });
      // Thay đổi thành viên: kiểm tra lại quyền theo dõi (bị xóa khỏi đơn vị thì ngắt)
      if (ev.table === "memberships") void this.recheck(c, ev.tenant);
    }
  }

  private async recheck(c: Conn, tenant: string) {
    if (c.userId && !(await this.isMember(c.userId, tenant))) {
      c.tenants.delete(tenant);
      this.send(c, { type: "error", message: `Không còn quyền truy cập đơn vị ${tenant}` });
    }
  }

  private async isMember(userId: string, tenant: string): Promise<boolean> {
    const r = await this.db.query<{ ok: boolean }>("select platform.is_member($1, $2) as ok", [tenant, userId]);
    return r.rows[0]?.ok === true;
  }

  private send(c: Conn, msg: unknown) {
    if (c.ws.readyState === c.ws.OPEN) c.ws.send(JSON.stringify(msg));
  }

  private onConnection(ws: WebSocket) {
    const c: Conn = { ws, userId: null, exp: 0, tenants: new Set(), alive: true };
    this.conns.add(c);
    ws.on("pong", () => (c.alive = true));
    ws.on("close", () => this.conns.delete(c));
    ws.on("error", () => this.conns.delete(c));
    ws.on("message", (raw) => void this.onMessage(c, String(raw)));
    // Chưa xác thực trong 10 giây → đóng
    setTimeout(() => {
      if (!c.userId) ws.close(4401, "unauthenticated");
    }, 10_000).unref();
  }

  private async onMessage(c: Conn, raw: string) {
    let msg: { type?: string; token?: string; tenant?: string };
    try {
      msg = JSON.parse(raw);
    } catch {
      return this.send(c, { type: "error", message: "JSON không hợp lệ" });
    }
    c.alive = true;
    switch (msg.type) {
      case "auth": {
        try {
          const claims = await this.tokens.verifyAccess(String(msg.token ?? ""));
          if (c.userId && c.userId !== claims.sub) {
            c.tenants.clear();
          }
          c.userId = claims.sub;
          c.exp = claims.exp ?? 0;
          this.send(c, { type: "ready" });
        } catch {
          this.send(c, { type: "error", message: "Token không hợp lệ hoặc hết hạn" });
          c.ws.close(4401, "invalid token");
        }
        return;
      }
      case "subscribe": {
        const tenant = String(msg.tenant ?? "");
        if (!c.userId) return this.send(c, { type: "error", message: "Chưa xác thực" });
        if (!/^[0-9a-f-]{36}$/i.test(tenant)) return this.send(c, { type: "error", message: "Mã đơn vị không hợp lệ" });
        if (!(await this.isMember(c.userId, tenant))) {
          return this.send(c, { type: "error", message: "Bạn không thuộc đơn vị này" });
        }
        c.tenants.add(tenant);
        return this.send(c, { type: "subscribed", tenant });
      }
      case "unsubscribe":
        c.tenants.delete(String(msg.tenant ?? ""));
        return;
      case "ping":
        return this.send(c, { type: "pong" });
      default:
        return this.send(c, { type: "error", message: "Loại thông điệp không hỗ trợ" });
    }
  }
}

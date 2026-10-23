/**
 * Client realtime của AccEdu Platform (WebSocket `/realtime/v1/ws`).
 *
 * Giao thức (JSON):
 *   client → {type:"auth", token} | {type:"subscribe", tenant} | {type:"unsubscribe", tenant} | {type:"ping"}
 *   server → {type:"ready"} | {type:"subscribed", tenant} | {type:"change", tenant, table, op, id}
 *            | {type:"reauth"} | {type:"error", message} | {type:"pong"}
 *
 * Một kết nối dùng chung cho mọi đơn vị đang mở. Mất kết nối thì tự nối lại (backoff tối đa 30 giây);
 * nối lại xong phát sự kiện `table: "*"` để client tải lại toàn bộ — bù cho các thay đổi bị lỡ.
 */

export interface ChangeEvent {
  tenant: string;
  /** Tên bảng thay đổi; "*" = vừa nối lại, cần làm mới mọi dữ liệu của đơn vị */
  table: string;
  op: "INSERT" | "UPDATE" | "DELETE" | "RESYNC";
  id: string | null;
}

export type SyncState = "connecting" | "live" | "offline";

type Listener = { onChange: (ev: ChangeEvent) => void; onState: (s: SyncState) => void };

interface TenantSub {
  listeners: Set<Listener>;
  state: SyncState;
  /** Đã từng "live" — lần subscribed tiếp theo là nối lại, cần đồng bộ bù */
  wasLive: boolean;
}

type WsLike = {
  readyState: number;
  send(data: string): void;
  close(code?: number, reason?: string): void;
  addEventListener(type: "open" | "error", fn: () => void): void;
  addEventListener(type: "message", fn: (ev: { data: unknown }) => void): void;
  addEventListener(type: "close", fn: () => void): void;
};

export interface RealtimeOptions {
  /** URL gốc của API (http/https) — tự đổi sang ws/wss */
  url: string;
  /** Lấy access token hiện tại (null = chưa đăng nhập) */
  getToken: () => Promise<string | null>;
  /** Thay WebSocket (test) */
  WebSocketImpl?: new (url: string) => WsLike;
}

const OPEN = 1;
const PING_EVERY_MS = 25_000;
const PONG_TIMEOUT_MS = 10_000;
const MAX_BACKOFF_MS = 30_000;

export function realtimeUrl(apiUrl: string): string {
  return `${apiUrl.replace(/\/+$/, "").replace(/^http/i, "ws")}/realtime/v1/ws`;
}

export class RealtimeClient {
  private readonly opts: RealtimeOptions;
  private readonly subs = new Map<string, TenantSub>();
  private ws: WsLike | null = null;
  private authed = false;
  private connecting = false;
  private attempt = 0;
  private retryTimer: ReturnType<typeof setTimeout> | null = null;
  private pingTimer: ReturnType<typeof setInterval> | null = null;
  private pongTimer: ReturnType<typeof setTimeout> | null = null;

  constructor(opts: RealtimeOptions) {
    this.opts = opts;
  }

  /** Theo dõi thay đổi của một đơn vị; trả về hàm hủy theo dõi */
  subscribe(tenant: string, onChange: Listener["onChange"], onState: Listener["onState"]): () => void {
    const listener: Listener = { onChange, onState };
    let sub = this.subs.get(tenant);
    if (!sub) {
      sub = { listeners: new Set(), state: "connecting", wasLive: false };
      this.subs.set(tenant, sub);
      if (this.authed) this.send({ type: "subscribe", tenant });
    }
    sub.listeners.add(listener);
    onState(sub.state);
    this.ensureConnected();

    return () => {
      const s = this.subs.get(tenant);
      if (!s) return;
      s.listeners.delete(listener);
      if (s.listeners.size > 0) return;
      this.subs.delete(tenant);
      if (this.authed) this.send({ type: "unsubscribe", tenant });
      if (this.subs.size === 0) this.disconnect();
    };
  }

  /** Gọi khi token được làm mới / đăng nhập lại: xác thực lại trên kết nối hiện có */
  refreshAuth(token: string | null): void {
    if (!token) {
      this.disconnect();
      this.setAllState("offline");
      return;
    }
    if (this.ws?.readyState === OPEN) this.send({ type: "auth", token });
    else this.ensureConnected(true);
  }

  /** Mạng có lại (sự kiện `online`, app quay lại foreground): nối lại ngay, bỏ qua backoff */
  reconnectNow(): void {
    if (this.subs.size === 0 || this.ws?.readyState === OPEN) return;
    this.ensureConnected(true);
  }

  close(): void {
    this.subs.clear();
    this.disconnect();
  }

  private ensureConnected(immediate = false) {
    if (this.subs.size === 0 || this.ws || this.connecting) return;
    if (this.retryTimer) {
      if (!immediate) return;
      clearTimeout(this.retryTimer);
      this.retryTimer = null;
    }
    void this.connect();
  }

  private async connect() {
    this.connecting = true;
    const token = await this.opts.getToken().catch(() => null);
    this.connecting = false;
    if (this.subs.size === 0 || this.ws) return;
    if (!token) {
      this.setAllState("offline");
      return;
    }
    const Impl = this.opts.WebSocketImpl ?? (globalThis.WebSocket as unknown as new (url: string) => WsLike);
    let ws: WsLike;
    try {
      ws = new Impl(realtimeUrl(this.opts.url));
    } catch {
      this.scheduleRetry();
      return;
    }
    this.ws = ws;
    this.authed = false;
    this.setAllState("connecting");

    ws.addEventListener("open", () => {
      ws.send(JSON.stringify({ type: "auth", token }));
      this.startPing();
    });
    ws.addEventListener("message", (ev) => this.onMessage(String(ev.data)));
    ws.addEventListener("error", () => undefined);
    ws.addEventListener("close", () => {
      if (this.ws !== ws) return;
      this.ws = null;
      this.authed = false;
      this.stopPing();
      this.setAllState("offline");
      this.scheduleRetry();
    });
  }

  private onMessage(raw: string) {
    let msg: { type?: string; tenant?: string; table?: string; op?: string; id?: string | null; message?: string };
    try {
      msg = JSON.parse(raw);
    } catch {
      return;
    }
    if (this.pongTimer) {
      clearTimeout(this.pongTimer);
      this.pongTimer = null;
    }
    switch (msg.type) {
      case "ready":
        this.authed = true;
        this.attempt = 0;
        for (const tenant of this.subs.keys()) this.send({ type: "subscribe", tenant });
        return;
      case "subscribed": {
        const sub = msg.tenant ? this.subs.get(msg.tenant) : undefined;
        if (!sub || !msg.tenant) return;
        const resync = sub.wasLive && sub.state !== "live";
        sub.wasLive = true;
        this.setState(sub, "live");
        if (resync) this.emit(msg.tenant, { tenant: msg.tenant, table: "*", op: "RESYNC", id: null });
        return;
      }
      case "change":
        if (msg.tenant && msg.table) {
          this.emit(msg.tenant, {
            tenant: msg.tenant,
            table: msg.table,
            op: (msg.op ?? "UPDATE") as ChangeEvent["op"],
            id: msg.id ?? null,
          });
        }
        return;
      case "reauth":
        // Token trên kết nối đã hết hạn: lấy token mới (supabase-js tự làm mới) rồi gửi lại
        void this.opts.getToken().then((t) => (t ? this.send({ type: "auth", token: t }) : this.disconnect()));
        return;
      default:
        return;
    }
  }

  private emit(tenant: string, ev: ChangeEvent) {
    for (const l of this.subs.get(tenant)?.listeners ?? []) l.onChange(ev);
  }

  private send(msg: unknown) {
    if (this.ws?.readyState === OPEN) this.ws.send(JSON.stringify(msg));
  }

  private setState(sub: TenantSub, state: SyncState) {
    if (sub.state === state) return;
    sub.state = state;
    for (const l of sub.listeners) l.onState(state);
  }

  private setAllState(state: SyncState) {
    for (const sub of this.subs.values()) this.setState(sub, state);
  }

  private scheduleRetry() {
    if (this.subs.size === 0 || this.retryTimer) return;
    const base = Math.min(MAX_BACKOFF_MS, 1_000 * 2 ** this.attempt);
    this.attempt += 1;
    const delay = base / 2 + Math.random() * (base / 2);
    this.retryTimer = setTimeout(() => {
      this.retryTimer = null;
      this.ensureConnected();
    }, delay);
  }

  private startPing() {
    this.stopPing();
    this.pingTimer = setInterval(() => {
      this.send({ type: "ping" });
      if (this.pongTimer) return;
      // Không nhận được gì trong 10 giây → coi như kết nối chết (mạng di động, ngủ máy)
      this.pongTimer = setTimeout(() => {
        this.pongTimer = null;
        this.ws?.close(4000, "pong timeout");
      }, PONG_TIMEOUT_MS);
    }, PING_EVERY_MS);
  }

  private stopPing() {
    if (this.pingTimer) clearInterval(this.pingTimer);
    if (this.pongTimer) clearTimeout(this.pongTimer);
    this.pingTimer = null;
    this.pongTimer = null;
  }

  private disconnect() {
    if (this.retryTimer) clearTimeout(this.retryTimer);
    this.retryTimer = null;
    this.stopPing();
    const ws = this.ws;
    this.ws = null;
    this.authed = false;
    ws?.close(1000, "bye");
  }
}

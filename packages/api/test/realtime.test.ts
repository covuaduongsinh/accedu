import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { RealtimeClient, realtimeUrl, type ChangeEvent, type SyncState } from "../src/realtime";

const T1 = "11111111-1111-1111-1111-111111111111";
const T2 = "22222222-2222-2222-2222-222222222222";

class FakeWs {
  static all: FakeWs[] = [];
  readyState = 0;
  sent: Record<string, unknown>[] = [];
  private readonly handlers = new Map<string, ((ev: { data: unknown }) => void)[]>();
  readonly url: string;
  constructor(url: string) {
    this.url = url;
    FakeWs.all.push(this);
  }
  addEventListener(type: string, fn: (ev: { data: unknown }) => void) {
    this.handlers.set(type, [...(this.handlers.get(type) ?? []), fn]);
  }
  private fire(type: string, data: unknown = null) {
    for (const fn of this.handlers.get(type) ?? []) fn({ data });
  }
  send(data: string) {
    this.sent.push(JSON.parse(data) as Record<string, unknown>);
  }
  close() {
    if (this.readyState === 3) return;
    this.readyState = 3;
    this.fire("close");
  }
  // Điều khiển từ test
  open() {
    this.readyState = 1;
    this.fire("open");
  }
  receive(msg: unknown) {
    this.fire("message", JSON.stringify(msg));
  }
  drop() {
    this.readyState = 3;
    this.fire("close");
  }
}

const flush = () => new Promise((r) => setTimeout(r, 0));

function setup(token: string | null = "tok-1") {
  let current = token;
  const rt = new RealtimeClient({
    url: "https://api.example.vn/",
    getToken: async () => current,
    WebSocketImpl: FakeWs,
  });
  return { rt, setToken: (t: string | null) => (current = t) };
}

describe("RealtimeClient", () => {
  beforeEach(() => {
    FakeWs.all = [];
  });
  afterEach(() => {
    vi.useRealTimers();
  });

  it("đổi URL http(s) sang ws(s)", () => {
    expect(realtimeUrl("https://api.example.vn/")).toBe("wss://api.example.vn/realtime/v1/ws");
    expect(realtimeUrl("http://localhost:8000")).toBe("ws://localhost:8000/realtime/v1/ws");
  });

  it("xác thực, theo dõi đơn vị và chuyển sự kiện tới listener", async () => {
    const { rt } = setup();
    const events: ChangeEvent[] = [];
    const states: SyncState[] = [];
    rt.subscribe(T1, (e) => events.push(e), (s) => states.push(s));
    await flush();
    const ws = FakeWs.all[0]!;
    expect(ws.url).toBe("wss://api.example.vn/realtime/v1/ws");
    ws.open();
    expect(ws.sent[0]).toEqual({ type: "auth", token: "tok-1" });
    ws.receive({ type: "ready" });
    expect(ws.sent[1]).toEqual({ type: "subscribe", tenant: T1 });
    ws.receive({ type: "subscribed", tenant: T1 });
    expect(states.at(-1)).toBe("live");
    ws.receive({ type: "change", tenant: T1, table: "vouchers", op: "INSERT", id: "v1" });
    ws.receive({ type: "change", tenant: T2, table: "vouchers", op: "INSERT", id: "v2" });
    expect(events).toEqual([{ tenant: T1, table: "vouchers", op: "INSERT", id: "v1" }]);
  });

  it("dùng chung một kết nối cho nhiều đơn vị; hủy hết thì đóng", async () => {
    const { rt } = setup();
    const off1 = rt.subscribe(T1, () => undefined, () => undefined);
    await flush();
    const ws = FakeWs.all[0]!;
    ws.open();
    ws.receive({ type: "ready" });
    const off2 = rt.subscribe(T2, () => undefined, () => undefined);
    expect(FakeWs.all).toHaveLength(1);
    expect(ws.sent).toContainEqual({ type: "subscribe", tenant: T2 });
    off2();
    expect(ws.sent.at(-1)).toEqual({ type: "unsubscribe", tenant: T2 });
    off1();
    expect(ws.readyState).toBe(3);
  });

  it("mất kết nối thì nối lại có backoff và phát sự kiện đồng bộ bù", async () => {
    vi.useFakeTimers();
    const { rt } = setup();
    const events: ChangeEvent[] = [];
    const states: SyncState[] = [];
    rt.subscribe(T1, (e) => events.push(e), (s) => states.push(s));
    await vi.advanceTimersByTimeAsync(0);
    const ws1 = FakeWs.all[0]!;
    ws1.open();
    ws1.receive({ type: "ready" });
    ws1.receive({ type: "subscribed", tenant: T1 });
    ws1.drop();
    expect(states.at(-1)).toBe("offline");
    await vi.advanceTimersByTimeAsync(1_000);
    const ws2 = FakeWs.all[1]!;
    expect(ws2).toBeDefined();
    ws2.open();
    ws2.receive({ type: "ready" });
    ws2.receive({ type: "subscribed", tenant: T1 });
    expect(states.at(-1)).toBe("live");
    expect(events).toEqual([{ tenant: T1, table: "*", op: "RESYNC", id: null }]);
  });

  it("token làm mới thì xác thực lại trên kết nối hiện có; server đòi reauth thì gửi token mới", async () => {
    const { rt, setToken } = setup();
    rt.subscribe(T1, () => undefined, () => undefined);
    await flush();
    const ws = FakeWs.all[0]!;
    ws.open();
    rt.refreshAuth("tok-2");
    expect(ws.sent.at(-1)).toEqual({ type: "auth", token: "tok-2" });
    setToken("tok-3");
    ws.receive({ type: "reauth" });
    await flush();
    expect(ws.sent.at(-1)).toEqual({ type: "auth", token: "tok-3" });
  });

  it("chưa đăng nhập thì không mở kết nối; đăng xuất thì ngắt", async () => {
    const { rt, setToken } = setup(null);
    const states: SyncState[] = [];
    rt.subscribe(T1, () => undefined, (s) => states.push(s));
    await flush();
    expect(FakeWs.all).toHaveLength(0);
    expect(states.at(-1)).toBe("offline");
    setToken("tok-1");
    rt.refreshAuth("tok-1");
    await flush();
    const ws = FakeWs.all[0]!;
    ws.open();
    rt.refreshAuth(null);
    expect(ws.readyState).toBe(3);
    expect(states.at(-1)).toBe("offline");
  });
});

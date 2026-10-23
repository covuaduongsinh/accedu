import { serve } from "@hono/node-server";
import type { AddressInfo } from "node:net";
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { WebSocket } from "ws";
import { RealtimeHub } from "../src/realtime/hub.ts";
import { bearer, login, OWNER, setupPlatform } from "./helpers.ts";

let p: Awaited<ReturnType<typeof setupPlatform>>;
let hub: RealtimeHub;
let server: ReturnType<typeof serve>;
let wsUrl: string;
let ownerToken: string;

beforeAll(async () => {
  p = await setupPlatform("accedu_server_realtime");
  hub = new RealtimeHub(p.db, p.config.DATABASE_URL, p.tokens, p.log);
  await hub.start();
  server = serve({ fetch: p.app.fetch, port: 0 });
  server.on("upgrade", (req, socket, head) => hub.handleUpgrade(req, socket, head));
  await new Promise((r) => server.once("listening", r));
  wsUrl = `ws://127.0.0.1:${(server.address() as AddressInfo).port}/realtime/v1/ws`;
  ownerToken = ((await (await login(p.app, OWNER.email, OWNER.password)).json()) as { access_token: string }).access_token;
});

afterAll(async () => {
  await hub.stop();
  server.close();
  await p.db.end();
  await p.adminDb.end();
});

type Msg = { type: string; [k: string]: unknown };

function connect(): Promise<{ ws: WebSocket; next: (type: string, ms?: number) => Promise<Msg>; all: Msg[] }> {
  return new Promise((resolve, reject) => {
    const ws = new WebSocket(wsUrl);
    const all: Msg[] = [];
    const waiters: Array<{ type: string; resolve: (m: Msg) => void }> = [];
    ws.on("message", (raw) => {
      const m = JSON.parse(String(raw)) as Msg;
      all.push(m);
      const i = waiters.findIndex((w) => w.type === m.type);
      if (i >= 0) waiters.splice(i, 1)[0]!.resolve(m);
    });
    ws.on("open", () =>
      resolve({
        ws,
        all,
        next: (type, ms = 3000) =>
          new Promise((res, rej) => {
            const found = all.find((m) => m.type === type && !(m as { _seen?: boolean })._seen);
            if (found) {
              (found as { _seen?: boolean })._seen = true;
              return res(found);
            }
            const t = setTimeout(() => rej(new Error(`hết giờ chờ ${type}`)), ms);
            waiters.push({ type, resolve: (m) => (clearTimeout(t), ((m as { _seen?: boolean })._seen = true), res(m)) });
          }),
      }),
    );
    ws.on("error", reject);
  });
}

describe("realtime", () => {
  it("thành viên nhận sự kiện thay đổi của đơn vị", async () => {
    const c = await connect();
    c.ws.send(JSON.stringify({ type: "auth", token: ownerToken }));
    await c.next("ready");
    c.ws.send(JSON.stringify({ type: "subscribe", tenant: p.tenantId }));
    await c.next("subscribed");

    await p.adminDb.query("insert into public.partners (tenant_id, code, name) values ($1, 'HV100', 'Học viên A')", [p.tenantId]);
    const ev = await c.next("change");
    expect(ev).toEqual({ type: "change", tenant: p.tenantId, table: "partners", op: "INSERT", id: null, _seen: true });
    c.ws.close();
  });

  it("người ngoài đơn vị không theo dõi được; token sai bị ngắt", async () => {
    const r = await p.app.request("/platform/v1/users", {
      method: "POST",
      headers: bearer(ownerToken),
      body: JSON.stringify({ tenant_id: p.tenantId, email: "xem@duongsinh.vn", password: "XemThoi2026", role: "viewer" }),
    });
    expect(r.status).toBe(201);
    // Đơn vị khác (người viewer không thuộc)
    const other = await p.adminDb.query<{ id: string }>(
      "insert into public.tenants (slug, name) values ('khac', 'Đơn vị khác') returning id",
    );
    const viewerToken = ((await (await login(p.app, "xem@duongsinh.vn", "XemThoi2026")).json()) as { access_token: string }).access_token;
    const c = await connect();
    c.ws.send(JSON.stringify({ type: "auth", token: viewerToken }));
    await c.next("ready");
    c.ws.send(JSON.stringify({ type: "subscribe", tenant: other.rows[0]!.id }));
    const err = await c.next("error");
    expect(err.message).toMatch(/không thuộc đơn vị/);
    c.ws.close();

    const bad = await connect();
    const closed = new Promise<number>((res) => bad.ws.on("close", (code) => res(code)));
    bad.ws.send(JSON.stringify({ type: "auth", token: "rac" }));
    expect(await closed).toBe(4401);
  });

  it("bị xóa khỏi đơn vị thì ngừng nhận sự kiện", async () => {
    const r = await p.app.request("/platform/v1/users", {
      method: "POST",
      headers: bearer(ownerToken),
      body: JSON.stringify({ tenant_id: p.tenantId, email: "tamthoi@duongsinh.vn", password: "TamThoi2026", role: "cashier" }),
    });
    const { user_id } = (await r.json()) as { user_id: string };
    const token = ((await (await login(p.app, "tamthoi@duongsinh.vn", "TamThoi2026")).json()) as { access_token: string }).access_token;
    const c = await connect();
    c.ws.send(JSON.stringify({ type: "auth", token }));
    await c.next("ready");
    c.ws.send(JSON.stringify({ type: "subscribe", tenant: p.tenantId }));
    await c.next("subscribed");
    await p.adminDb.query("delete from public.memberships where tenant_id = $1 and user_id = $2", [p.tenantId, user_id]);
    const err = await c.next("error");
    expect(err.message).toMatch(/Không còn quyền/);
    await p.adminDb.query("insert into public.partners (tenant_id, code, name) values ($1, 'HV101', 'Học viên B')", [p.tenantId]);
    await new Promise((res) => setTimeout(res, 300));
    expect(c.all.filter((m) => m.type === "change" && m.table === "partners")).toHaveLength(0);
    c.ws.close();
  });
});

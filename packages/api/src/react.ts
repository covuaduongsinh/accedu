import type { VoucherInput } from "@accedu/core";
import { useMutation, useQuery, useQueryClient, type QueryClient } from "@tanstack/react-query";
import { createContext, createElement, useContext, useEffect, useState, type ReactNode } from "react";
import type { Session } from "@supabase/supabase-js";
import type { AccEduClient } from "./client";
import { api, qk } from "./queries";

const ClientContext = createContext<AccEduClient | null>(null);

export function AccEduProvider({ client, children }: { client: AccEduClient; children: ReactNode }) {
  return createElement(ClientContext.Provider, { value: client }, children);
}

export function useDb(): AccEduClient {
  const db = useContext(ClientContext);
  if (!db) throw new Error("Thiếu AccEduProvider");
  return db;
}

/** Phiên đăng nhập hiện tại; undefined = đang kiểm tra (dùng cho mobile và các vỏ khác). */
export function useSession(): Session | null | undefined {
  const db = useDb();
  const [session, setSession] = useState<Session | null | undefined>(undefined);
  useEffect(() => {
    void db.auth.getSession().then(({ data }) => setSession(data.session));
    const { data } = db.auth.onAuthStateChange((_event, s) => setSession(s));
    return () => data.subscription.unsubscribe();
  }, [db]);
  return session;
}

export function useTenants() {
  const db = useDb();
  return useQuery({ queryKey: qk.tenants(), queryFn: () => api.myTenants(db) });
}

export function useTenant(slug: string | undefined) {
  const db = useDb();
  return useQuery({
    queryKey: qk.tenant(slug ?? ""),
    queryFn: () => api.tenantBySlug(db, slug as string),
    enabled: !!slug,
  });
}

export function useAccounts(tenantId: string | undefined) {
  const db = useDb();
  return useQuery({
    queryKey: qk.accounts(tenantId ?? ""),
    queryFn: () => api.accounts(db, tenantId as string),
    enabled: !!tenantId,
    staleTime: 5 * 60_000,
  });
}

export function usePartners(tenantId: string | undefined) {
  const db = useDb();
  return useQuery({
    queryKey: qk.partners(tenantId ?? ""),
    queryFn: () => api.partners(db, tenantId as string),
    enabled: !!tenantId,
    staleTime: 60_000,
  });
}

export function useVouchers(tenantId: string | undefined, types: readonly string[]) {
  const db = useDb();
  return useQuery({
    queryKey: qk.vouchers(tenantId ?? "", types),
    queryFn: () => api.vouchers(db, tenantId as string, { types: [...types] }),
    enabled: !!tenantId,
  });
}

export function useVoucher(id: string | undefined) {
  const db = useDb();
  return useQuery({ queryKey: qk.voucher(id ?? ""), queryFn: () => api.voucher(db, id as string), enabled: !!id });
}

export function useSaveVoucher(tenantId: string, source: "web" | "desktop" | "mobile" = "web") {
  const db = useDb();
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (args: { voucher: VoucherInput & { id?: string; version?: number }; post?: boolean }) =>
      api.saveVoucher(db, tenantId, args.voucher, { post: args.post ?? false, source }),
    onSuccess: (id) => invalidateLedger(qc, tenantId, id),
  });
}

export function useVoucherAction(tenantId: string) {
  const db = useDb();
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async (args: { id: string; action: "post" | "unpost" | "delete" }) => {
      if (args.action === "post") await api.postVoucher(db, args.id);
      else if (args.action === "unpost") await api.unpostVoucher(db, args.id);
      else await api.deleteVoucher(db, args.id);
      return args.id;
    },
    onSuccess: (id) => invalidateLedger(qc, tenantId, id),
  });
}

export function useMembers(tenantId: string | undefined) {
  const db = useDb();
  return useQuery({ queryKey: qk.members(tenantId ?? ""), queryFn: () => api.members(db, tenantId as string), enabled: !!tenantId });
}

export function useOpeningBalances(tenantId: string | undefined) {
  const db = useDb();
  return useQuery({ queryKey: qk.opening(tenantId ?? ""), queryFn: () => api.openingBalances(db, tenantId as string), enabled: !!tenantId });
}

export function usePeriodLocks(tenantId: string | undefined) {
  const db = useDb();
  return useQuery({ queryKey: qk.locks(tenantId ?? ""), queryFn: () => api.periodLocks(db, tenantId as string), enabled: !!tenantId });
}

export function useJobs(tenantId: string | undefined) {
  const db = useDb();
  return useQuery({ queryKey: qk.jobs(tenantId ?? ""), queryFn: () => api.jobs(db, tenantId as string), enabled: !!tenantId });
}

export function useTrialBalance(tenantId: string | undefined, from: string, to: string, maxLevel = 9) {
  const db = useDb();
  return useQuery({
    queryKey: qk.report(tenantId ?? "", "trial-balance", from, to, String(maxLevel)),
    queryFn: () => api.trialBalance(db, tenantId as string, from, to, maxLevel),
    enabled: !!tenantId,
  });
}

export function useGeneralJournal(tenantId: string | undefined, from: string, to: string) {
  const db = useDb();
  return useQuery({
    queryKey: qk.report(tenantId ?? "", "general-journal", from, to),
    queryFn: () => api.generalJournal(db, tenantId as string, from, to),
    enabled: !!tenantId,
  });
}

export function useAccountLedger(tenantId: string | undefined, account: string, from: string, to: string) {
  const db = useDb();
  return useQuery({
    queryKey: qk.report(tenantId ?? "", "ledger", account, from, to),
    queryFn: () => api.accountLedger(db, tenantId as string, account, from, to),
    enabled: !!tenantId && !!account,
  });
}

function invalidateLedger(qc: QueryClient, tenantId: string, voucherId?: string) {
  void qc.invalidateQueries({ queryKey: ["vouchers", tenantId] });
  void qc.invalidateQueries({ queryKey: ["report", tenantId] });
  if (voucherId) void qc.invalidateQueries({ queryKey: qk.voucher(voucherId) });
}

export type SyncState = "connecting" | "live" | "offline";

/** Bảng được theo dõi (đều nằm trong publication supabase_realtime) */
const SYNC_TABLES = ["vouchers", "accounts", "partners", "jobs", "opening_balances", "period_locks", "memberships"] as const;

/**
 * Đồng bộ thời gian thực giữa web / desktop / mobile qua Supabase Realtime: khi bất kỳ thiết bị nào
 * thay đổi chứng từ hoặc danh mục của đơn vị, mọi thiết bị khác tự làm mới dữ liệu liên quan.
 * Dữ liệu được tải lại qua REST nên RLS vẫn áp dụng. Kênh nối lại sau khi mất kết nối thì làm mới
 * toàn bộ dữ liệu của đơn vị để bù các thay đổi bị lỡ.
 */
export function useRealtimeSync(tenantId: string | undefined): SyncState {
  const db = useDb();
  const qc = useQueryClient();
  const [state, setState] = useState<SyncState>("connecting");

  useEffect(() => {
    if (!tenantId) return;
    const filter = `tenant_id=eq.${tenantId}`;
    let channel = db.channel(`tenant:${tenantId}`);
    for (const table of SYNC_TABLES) {
      channel = channel.on("postgres_changes", { event: "*", schema: "public", table, filter }, (payload) => {
        const row = (payload.new ?? payload.old) as { id?: string } | null;
        applyChange(qc, tenantId, table, row?.id ?? null);
      });
    }
    channel = channel.on("postgres_changes", { event: "*", schema: "public", table: "tenants", filter: `id=eq.${tenantId}` }, () =>
      applyChange(qc, tenantId, "tenants", null),
    );
    let wasLive = false;
    channel.subscribe((status) => {
      if (status === "SUBSCRIBED") {
        if (wasLive) applyChange(qc, tenantId, "*", null);
        wasLive = true;
        setState("live");
      } else if (status === "CLOSED" || status === "CHANNEL_ERROR" || status === "TIMED_OUT") {
        setState("offline");
      }
    });
    return () => {
      void db.removeChannel(channel);
    };
  }, [db, qc, tenantId]);

  return state;
}

function applyChange(qc: QueryClient, tenantId: string, table: string, id: string | null) {
  const inv = (queryKey: readonly unknown[]) => void qc.invalidateQueries({ queryKey });
  switch (table) {
    case "vouchers":
      return invalidateLedger(qc, tenantId, id ?? undefined);
    case "accounts":
      inv(qk.accounts(tenantId));
      return inv(["report", tenantId]);
    case "partners":
      return inv(qk.partners(tenantId));
    case "jobs":
      return inv(qk.jobs(tenantId));
    case "opening_balances":
      inv(qk.opening(tenantId));
      return inv(["report", tenantId]);
    case "period_locks":
      return inv(qk.locks(tenantId));
    case "memberships":
      inv(qk.members(tenantId));
      return inv(qk.tenants());
    case "tenants":
      inv(qk.tenants());
      return inv(["tenant"]);
    case "*":
      // Vừa nối lại sau khi mất kết nối: làm mới mọi dữ liệu của đơn vị
      inv(qk.tenants());
      inv(["tenant"]);
      return void qc.invalidateQueries({ predicate: (q) => q.queryKey.includes(tenantId) || q.queryKey[0] === "voucher" });
    default:
      return;
  }
}

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

/**
 * Đồng bộ thời gian thực giữa web / desktop / mobile: khi bất kỳ thiết bị nào thay đổi
 * chứng từ hoặc danh mục của đơn vị, mọi thiết bị khác tự làm mới dữ liệu liên quan.
 */
export function useRealtimeSync(tenantId: string | undefined): SyncState {
  const db = useDb();
  const qc = useQueryClient();
  const [state, setState] = useState<SyncState>("connecting");

  useEffect(() => {
    if (!tenantId) return;
    const filter = `tenant_id=eq.${tenantId}`;
    const channel = db
      .channel(`tenant:${tenantId}`)
      .on("postgres_changes", { event: "*", schema: "public", table: "vouchers", filter }, (payload) => {
        const id = (payload.new as { id?: string })?.id ?? (payload.old as { id?: string })?.id;
        invalidateLedger(qc, tenantId, id);
      })
      .on("postgres_changes", { event: "*", schema: "public", table: "accounts", filter }, () => {
        void qc.invalidateQueries({ queryKey: qk.accounts(tenantId) });
        void qc.invalidateQueries({ queryKey: ["report", tenantId] });
      })
      .on("postgres_changes", { event: "*", schema: "public", table: "partners", filter }, () => {
        void qc.invalidateQueries({ queryKey: qk.partners(tenantId) });
      })
      .on("postgres_changes", { event: "*", schema: "public", table: "jobs", filter }, () => {
        void qc.invalidateQueries({ queryKey: qk.jobs(tenantId) });
      })
      .on("postgres_changes", { event: "*", schema: "public", table: "opening_balances", filter }, () => {
        void qc.invalidateQueries({ queryKey: qk.opening(tenantId) });
        void qc.invalidateQueries({ queryKey: ["report", tenantId] });
      })
      .on("postgres_changes", { event: "*", schema: "public", table: "period_locks", filter }, () => {
        void qc.invalidateQueries({ queryKey: qk.locks(tenantId) });
      })
      .subscribe((status) => {
        setState(status === "SUBSCRIBED" ? "live" : status === "CLOSED" || status === "CHANNEL_ERROR" ? "offline" : "connecting");
      });
    return () => {
      void db.removeChannel(channel);
    };
  }, [db, qc, tenantId]);

  return state;
}

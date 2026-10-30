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

export function useItems(tenantId: string | undefined) {
  const db = useDb();
  return useQuery({ queryKey: qk.items(tenantId ?? ""), queryFn: () => api.items(db, tenantId as string), enabled: !!tenantId, staleTime: 60_000 });
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

export function usePartnerLedger(tenantId: string | undefined, account: string, partnerId: string | undefined, from: string, to: string) {
  const db = useDb();
  return useQuery({
    queryKey: qk.report(tenantId ?? "", "partner-ledger", account, partnerId ?? "", from, to),
    queryFn: () => api.partnerLedger(db, tenantId as string, account, partnerId as string, from, to),
    enabled: !!tenantId && !!account && !!partnerId,
  });
}

export function usePartnerBalances(tenantId: string | undefined, account: string, from: string, to: string) {
  const db = useDb();
  return useQuery({
    queryKey: qk.report(tenantId ?? "", "partner-balances", account, from, to),
    queryFn: () => api.partnerBalances(db, tenantId as string, account, from, to),
    enabled: !!tenantId && !!account,
  });
}

/** Hóa đơn còn nợ (danh sách chọn khi thu/chi theo hóa đơn); partnerId undefined = chưa chọn đối tượng thì không tải */
export function useOpenInvoices(
  tenantId: string | undefined,
  side: "receivable" | "payable" | null,
  opts: { partnerId?: string | null; asOf?: string | null; includePaid?: boolean; enabled?: boolean } = {},
) {
  const db = useDb();
  return useQuery({
    queryKey: qk.report(tenantId ?? "", "open-invoices", side ?? "", opts.partnerId ?? "*", opts.asOf ?? "", opts.includePaid ? "all" : "open"),
    queryFn: () => api.openInvoices(db, tenantId as string, side as "receivable" | "payable", opts),
    enabled: !!tenantId && !!side && (opts.enabled ?? true),
  });
}

export function useAging(tenantId: string | undefined, side: "receivable" | "payable", asOf: string, account?: string) {
  const db = useDb();
  return useQuery({
    queryKey: qk.report(tenantId ?? "", "aging", side, asOf, account ?? ""),
    queryFn: () => api.aging(db, tenantId as string, side, asOf, account),
    enabled: !!tenantId && !!asOf,
  });
}

export function useVatListing(tenantId: string | undefined, direction: "out" | "in", from: string, to: string) {
  const db = useDb();
  return useQuery({
    queryKey: qk.report(tenantId ?? "", "vat-listing", direction, from, to),
    queryFn: () => api.vatListing(db, tenantId as string, direction, from, to),
    enabled: !!tenantId,
  });
}

/** Các phiếu thu/chi đã chọn trừ vào một hóa đơn */
export function useInvoicePayments(tenantId: string | undefined, invoiceId: string | undefined) {
  const db = useDb();
  return useQuery({
    queryKey: qk.report(tenantId ?? "", "invoice-payments", invoiceId ?? ""),
    queryFn: () => api.invoicePayments(db, invoiceId as string),
    enabled: !!tenantId && !!invoiceId,
  });
}

export function useWarehouses(tenantId: string | undefined) {
  const db = useDb();
  return useQuery({ queryKey: qk.warehouses(tenantId ?? ""), queryFn: () => api.warehouses(db, tenantId as string), enabled: !!tenantId });
}

export function useStockOpenings(tenantId: string | undefined) {
  const db = useDb();
  return useQuery({ queryKey: qk.stockOpenings(tenantId ?? ""), queryFn: () => api.stockOpenings(db, tenantId as string), enabled: !!tenantId });
}

/** Tồn kho đến ngày (số lượng, giá trị theo mặt hàng × kho, kèm tổng mặt hàng để tính giá bình quân) */
export function useStudents(tenantId: string | undefined) {
  const db = useDb();
  return useQuery({ queryKey: qk.students(tenantId ?? ""), queryFn: () => api.students(db, tenantId as string), enabled: !!tenantId });
}

export function useClasses(tenantId: string | undefined) {
  const db = useDb();
  return useQuery({ queryKey: qk.classes(tenantId ?? ""), queryFn: () => api.classes(db, tenantId as string), enabled: !!tenantId });
}

export function useEnrollments(tenantId: string | undefined) {
  const db = useDb();
  return useQuery({ queryKey: qk.enrollments(tenantId ?? ""), queryFn: () => api.enrollments(db, tenantId as string), enabled: !!tenantId });
}

export function useTuitionStatus(tenantId: string | undefined, opts: { classId?: string | null; month?: string | null } = {}) {
  const db = useDb();
  return useQuery({
    queryKey: qk.report(tenantId ?? "", "tuition-status", opts.classId ?? "", opts.month ?? ""),
    queryFn: () => api.tuitionStatus(db, tenantId as string, opts),
    enabled: !!tenantId,
  });
}

export function useMyClasses(tenantId: string | undefined) {
  const db = useDb();
  return useQuery({ queryKey: qk.myClasses(tenantId ?? ""), queryFn: () => api.myClasses(db, tenantId as string), enabled: !!tenantId });
}

export function useRoster(tenantId: string | undefined, classId: string | null | undefined, date: string) {
  const db = useDb();
  return useQuery({
    queryKey: qk.roster(tenantId ?? "", classId ?? "", date),
    queryFn: () => api.classRoster(db, tenantId as string, classId as string, date),
    enabled: !!tenantId && !!classId,
  });
}

export function useAttendanceReport(tenantId: string | undefined, classId: string | null | undefined, month: string) {
  const db = useDb();
  return useQuery({
    queryKey: qk.attendance(tenantId ?? "", classId ?? "", month),
    queryFn: () => api.attendanceReport(db, tenantId as string, classId as string, month),
    enabled: !!tenantId && !!classId,
  });
}

/** Ghi điểm danh: thử lại khi mạng chập chờn, xong thì làm mới danh sách lớp / điểm danh / số buổi */
export function useRecordAttendance(tenantId: string | undefined) {
  const db = useDb();
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (v: { classId: string; date: string; rows: Parameters<typeof api.recordAttendance>[4]; topic?: string | null }) =>
      api.recordAttendance(db, tenantId as string, v.classId, v.date, v.rows, v.topic),
    retry: 3,
    onSuccess: () => invalidateAttendance(qc, tenantId ?? ""),
  });
}

export function useCourseBalance(tenantId: string | undefined, classId?: string | null) {
  const db = useDb();
  return useQuery({
    queryKey: qk.report(tenantId ?? "", "course-balance", classId ?? ""),
    queryFn: () => api.courseBalance(db, tenantId as string, classId),
    enabled: !!tenantId,
  });
}

export function useDeferredTuition(tenantId: string | undefined, asOf?: string | null) {
  const db = useDb();
  return useQuery({
    queryKey: qk.report(tenantId ?? "", "deferred-tuition", asOf ?? ""),
    queryFn: () => api.deferredTuition(db, tenantId as string, asOf),
    enabled: !!tenantId,
  });
}

function invalidateAttendance(qc: QueryClient, tenantId: string) {
  for (const key of [["roster", tenantId], ["attendance", tenantId], qk.myClasses(tenantId), ["report", tenantId]]) {
    void qc.invalidateQueries({ queryKey: key });
  }
}

export function useCoachProfiles(tenantId: string | undefined) {
  const db = useDb();
  return useQuery({ queryKey: qk.coachProfiles(tenantId ?? ""), queryFn: () => api.coachProfiles(db, tenantId as string), enabled: !!tenantId });
}

export function useMyCoachSessions(tenantId: string | undefined, month: string) {
  const db = useDb();
  return useQuery({
    queryKey: ["my-coach-sessions", tenantId ?? "", month],
    queryFn: () => api.myCoachSessions(db, tenantId as string, month),
    enabled: !!tenantId,
  });
}

export function useClassSessions(tenantId: string | undefined, classId: string | null | undefined, from: string, to: string) {
  const db = useDb();
  return useQuery({
    queryKey: ["attendance", tenantId ?? "", classId ?? "", "sessions", from, to],
    queryFn: () => api.classSessions(db, tenantId as string, classId as string, from, to),
    enabled: !!tenantId && !!classId,
  });
}

export function useTuitionReminders(tenantId: string | undefined) {
  const db = useDb();
  return useQuery({ queryKey: qk.reminders(tenantId ?? ""), queryFn: () => api.tuitionReminders(db, tenantId as string), enabled: !!tenantId });
}

export function useStockBalances(tenantId: string | undefined, asOf?: string | null) {
  const db = useDb();
  return useQuery({
    queryKey: qk.report(tenantId ?? "", "stock-balances", asOf ?? ""),
    queryFn: () => api.stockBalances(db, tenantId as string, asOf),
    enabled: !!tenantId,
  });
}

export function useStockSummary(tenantId: string | undefined, from: string, to: string, warehouseId?: string | null) {
  const db = useDb();
  return useQuery({
    queryKey: qk.report(tenantId ?? "", "stock-summary", from, to, warehouseId ?? ""),
    queryFn: () => api.stockSummary(db, tenantId as string, from, to, warehouseId),
    enabled: !!tenantId,
  });
}

export function useStockCard(tenantId: string | undefined, itemId: string | undefined, from: string, to: string, warehouseId?: string | null) {
  const db = useDb();
  return useQuery({
    queryKey: qk.report(tenantId ?? "", "stock-card", itemId ?? "", from, to, warehouseId ?? ""),
    queryFn: () => api.stockCard(db, tenantId as string, itemId as string, from, to, warehouseId),
    enabled: !!tenantId && !!itemId,
  });
}

export function useStockVsLedger(tenantId: string | undefined, to: string) {
  const db = useDb();
  return useQuery({
    queryKey: qk.report(tenantId ?? "", "stock-vs-ledger", to),
    queryFn: () => api.stockVsLedger(db, tenantId as string, to),
    enabled: !!tenantId,
  });
}

export function useGrossProfit(tenantId: string | undefined, from: string, to: string, by: "item" | "customer") {
  const db = useDb();
  return useQuery({
    queryKey: qk.report(tenantId ?? "", "gross-profit", from, to, by),
    queryFn: () => api.grossProfit(db, tenantId as string, from, to, by),
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
const SYNC_TABLES = [
  "vouchers",
  "accounts",
  "partners",
  "items",
  "jobs",
  "opening_balances",
  "period_locks",
  "memberships",
  "warehouses",
  "stock_openings",
  "student_profiles",
  "classes",
  "enrollments",
  "tuition_bills",
  "class_sessions",
  "attendance",
  "tuition_recognitions",
  "coach_profiles",
  "coach_pay",
  "tuition_reminders",
] as const;

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
    // Gom thay đổi trong 300 ms (nhập Excel hàng trăm dòng → mỗi bảng chỉ làm mới một lần)
    const pending = new Map<string, Set<string | null>>();
    let timer: ReturnType<typeof setTimeout> | undefined;
    const flush = () => {
      timer = undefined;
      for (const [table, ids] of pending) {
        if (ids.size > 20) {
          applyChange(qc, tenantId, table, null);
          if (table === "vouchers") void qc.invalidateQueries({ queryKey: ["voucher"] });
        } else for (const id of ids) applyChange(qc, tenantId, table, id);
      }
      pending.clear();
    };
    let channel = db.channel(`tenant:${tenantId}`);
    for (const table of SYNC_TABLES) {
      channel = channel.on("postgres_changes", { event: "*", schema: "public", table, filter }, (payload) => {
        const row = (payload.new ?? payload.old) as { id?: string } | null;
        // Bảng khác vouchers chỉ cần làm mới cả danh sách: không cần giữ id
        const ids = pending.get(table) ?? new Set<string | null>();
        ids.add(table === "vouchers" ? (row?.id ?? null) : null);
        pending.set(table, ids);
        timer ??= setTimeout(flush, 300);
      });
    }
    channel = channel.on("postgres_changes", { event: "*", schema: "public", table: "tenants", filter: `id=eq.${tenantId}` }, () =>
      applyChange(qc, tenantId, "tenants", null),
    );
    let wasLive = false;
    const started = Date.now();
    channel.subscribe((status) => {
      if (status === "SUBSCRIBED") {
        // Lần đầu: làm mới dữ liệu khôi phục từ bộ nhớ đệm (thiết bị khác có thể đã sửa khi app đang đóng);
        // nối lại sau khi mất kết nối: làm mới toàn bộ để bù các thay đổi bị lỡ
        applyChange(qc, tenantId, "*", null, wasLive ? undefined : started);
        wasLive = true;
        setState("live");
      } else if (status === "CLOSED" || status === "CHANNEL_ERROR" || status === "TIMED_OUT") {
        setState("offline");
      }
    });
    return () => {
      if (timer) clearTimeout(timer);
      void db.removeChannel(channel);
    };
  }, [db, qc, tenantId]);

  return state;
}

function applyChange(qc: QueryClient, tenantId: string, table: string, id: string | null, olderThan?: number) {
  const inv = (queryKey: readonly unknown[]) => void qc.invalidateQueries({ queryKey });
  switch (table) {
    case "vouchers":
      return invalidateLedger(qc, tenantId, id ?? undefined);
    case "accounts":
      inv(qk.accounts(tenantId));
      return inv(["report", tenantId]);
    case "partners":
      inv(qk.students(tenantId));
      return inv(qk.partners(tenantId));
    case "jobs":
      inv(qk.classes(tenantId));
      return inv(qk.jobs(tenantId));
    case "student_profiles":
      return inv(qk.students(tenantId));
    case "classes":
      return inv(qk.classes(tenantId));
    case "enrollments":
      return inv(qk.enrollments(tenantId));
    case "tuition_bills":
    case "tuition_recognitions":
      return inv(["report", tenantId]);
    case "class_sessions":
    case "attendance":
      return invalidateAttendance(qc, tenantId);
    case "coach_profiles":
      return inv(qk.coachProfiles(tenantId));
    case "coach_pay":
      return inv(["report", tenantId]);
    case "tuition_reminders":
      return inv(qk.reminders(tenantId));
    case "items":
      return inv(qk.items(tenantId));
    case "warehouses":
      return inv(qk.warehouses(tenantId));
    case "stock_openings":
      inv(qk.stockOpenings(tenantId));
      return inv(["report", tenantId]);
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
    case "*": {
      // Làm mới mọi dữ liệu của đơn vị (chỉ dữ liệu tải trước mốc olderThan nếu có)
      const stale = (q: { state: { dataUpdatedAt: number } }) => olderThan === undefined || q.state.dataUpdatedAt < olderThan;
      void qc.invalidateQueries({ predicate: (q) => stale(q) && (q.queryKey[0] === "tenants" || q.queryKey[0] === "tenant") });
      return void qc.invalidateQueries({ predicate: (q) => stale(q) && (q.queryKey.includes(tenantId) || q.queryKey[0] === "voucher") });
    }
    default:
      return;
  }
}

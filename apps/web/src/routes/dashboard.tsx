import { useTrialBalance, useVouchers } from "@accedu/api/react";
import { formatAmount, formatDateVN, todayVN, voucherType } from "@accedu/core";
import { Link, Navigate } from "@tanstack/react-router";
import { Banknote, Building, HandCoins, Receipt, TrendingDown, TrendingUp } from "lucide-react";
import type { ReactNode } from "react";
import { Badge, Card, Empty, PageHeader } from "../components/ui";
import { COACH_HOME, isCoach, useTenantCtx } from "../lib/tenant";
import { STATUS_BADGE } from "../features/vouchers/config";

const ALL_TYPES = ["PT", "PC", "BC", "BN", "PK", "HDB", "HDV", "HDM", "HMV"] as const;

export function Dashboard() {
  const { role, slug } = useTenantCtx();
  // HLV không xem số liệu kế toán: vào thẳng Điểm danh
  if (isCoach(role)) return <Navigate to="/$tenant/$" params={{ tenant: slug, _splat: COACH_HOME }} replace />;
  return <AccountingDashboard />;
}

function AccountingDashboard() {
  const { tenant, slug } = useTenantCtx();
  const today = todayVN();
  const from = `${today.slice(0, 4)}-01-01`;
  const tb = useTrialBalance(tenant.id, from, today, 1);
  const recent = useVouchers(tenant.id, ALL_TYPES);

  const row = (code: string) => tb.data?.find((r) => r.account_code === code);
  const closing = (code: string) => Number(row(code)?.closing_debit ?? 0) - Number(row(code)?.closing_credit ?? 0);
  const credit = (code: string) => Number(row(code)?.credit ?? 0);
  const debit = (code: string) => Number(row(code)?.debit ?? 0);
  const revenue = credit("511") + credit("515") + credit("711");
  const expense = ["632", "635", "641", "642", "811"].reduce((s, c) => s + debit(c), 0);

  return (
    <div className="space-y-4">
      <PageHeader title="Tổng quan" subtitle={`${tenant.name} · lũy kế từ ${formatDateVN(from)} đến ${formatDateVN(today)}`} />
      <div className="grid grid-cols-2 gap-3 lg:grid-cols-6">
        <Kpi icon={<Banknote size={18} />} label="Tiền mặt (111)" value={closing("111")} />
        <Kpi icon={<Building size={18} />} label="Tiền gửi (112)" value={closing("112")} />
        <Kpi icon={<HandCoins size={18} />} label="Phải thu KH (131)" value={closing("131")} />
        <Kpi icon={<Receipt size={18} />} label="Phải trả NCC (331)" value={-closing("331")} />
        <Kpi icon={<TrendingUp size={18} />} label="Doanh thu & thu nhập" value={revenue} tone="gold" />
        <Kpi icon={<TrendingDown size={18} />} label="Chi phí" value={expense} />
      </div>
      <Card title="Chứng từ gần đây">
        {recent.data?.length ? (
          <table className="w-full text-sm">
            <thead className="text-left text-xs text-muted">
              <tr>
                <th className="py-1">Ngày</th>
                <th>Số</th>
                <th>Loại</th>
                <th>Diễn giải</th>
                <th className="text-right">Số tiền</th>
                <th>Trạng thái</th>
              </tr>
            </thead>
            <tbody>
              {recent.data.slice(0, 10).map((v) => (
                <tr key={v.id} className="border-t border-line">
                  <td className="py-1.5">{formatDateVN(v.posting_date)}</td>
                  <td className="font-medium text-navy-600">{v.number}</td>
                  <td>{voucherType(v.voucher_type)?.name ?? v.voucher_type}</td>
                  <td className="max-w-80 truncate">{v.description}</td>
                  <td className="num">{formatAmount(Number(v.total_amount))}</td>
                  <td>
                    <Badge tone={STATUS_BADGE[v.status].tone}>{STATUS_BADGE[v.status].label}</Badge>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        ) : (
          <Empty>
            Chưa có chứng từ. Bắt đầu với{" "}
            <Link to="/$tenant/$" params={{ tenant: slug, _splat: "cash/receipts" }} className="text-navy-500 underline">
              Phiếu thu
            </Link>{" "}
            hoặc{" "}
            <Link to="/$tenant/$" params={{ tenant: slug, _splat: "general/accounts" }} className="text-navy-500 underline">
              Danh mục tài khoản
            </Link>
            .
          </Empty>
        )}
      </Card>
    </div>
  );
}

function Kpi({ icon, label, value, tone = "navy" }: { icon: ReactNode; label: string; value: number; tone?: "navy" | "gold" }) {
  return (
    <div className={`rounded-lg border p-3 shadow-sm ${tone === "gold" ? "border-gold-300 bg-gold-50" : "border-line bg-white"}`}>
      <div className="mb-1 flex items-center gap-1.5 text-xs text-muted">
        <span className="text-navy-500">{icon}</span>
        {label}
      </div>
      <div className={`num text-left text-lg font-semibold ${value < 0 ? "text-danger" : "text-navy-700"}`}>{formatAmount(value)}</div>
    </div>
  );
}

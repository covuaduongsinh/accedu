import { useAccounts, useAssets, useOpeningBalances, usePartners, useTrialBalance } from "@accedu/api/react";
import { formatAmount, formatDateVN, IMPORT_SPECS, type ImportKind } from "@accedu/core";
import { Link } from "@tanstack/react-router";
import { CheckCircle2, Circle, FileDown, FileUp } from "lucide-react";
import { useState } from "react";
import { Badge, Button, Card, PageHeader } from "../../components/ui";
import { downloadTemplate } from "../../lib/export";
import { canPost, useTenantCtx } from "../../lib/tenant";
import { ImportDialog } from "./ImportDialog";

interface Step {
  kind: ImportKind;
  done: boolean;
  status: string;
  fao: string;
}

/** Chuyển dữ liệu từ FAO: nhập lần lượt các tệp Excel (danh mục, số dư, TSCĐ / CCDC) rồi kiểm tra Bảng cân đối phát sinh tại ngày bắt đầu */
export function MigrationPage() {
  const { tenant, slug, role } = useTenantCtx();
  const accounts = useAccounts(tenant.id);
  const partners = usePartners(tenant.id);
  const opening = useOpeningBalances(tenant.id);
  const tb = useTrialBalance(tenant.id, tenant.start_date, tenant.start_date, 1);
  const fixedAssets = useAssets(tenant.id, "fixed");
  const tools = useAssets(tenant.id, "tool");
  const [importing, setImporting] = useState<ImportKind | null>(null);
  const editable = canPost(role);

  const accountRows = (opening.data ?? []).filter((o) => !o.partner_id && !o.job_id);
  const partnerRows = (opening.data ?? []).filter((o) => o.partner_id);
  const detailAccounts = (accounts.data ?? []).filter((a) => a.is_postable).length;
  const steps: Step[] = [
    {
      kind: "accounts",
      done: (accounts.data?.length ?? 0) > 0,
      status: `${accounts.data?.length ?? 0} tài khoản (${detailAccounts} tài khoản chi tiết)`,
      fao: "Tổng hợp › Danh mục tài khoản → Kết xuất Excel",
    },
    {
      kind: "partners",
      done: (partners.data?.length ?? 0) > 0,
      status: `${partners.data?.length ?? 0} đối tượng`,
      fao: "Bán hàng › Danh mục khách hàng (và Mua hàng › Danh mục nhà cung cấp) → Kết xuất Excel",
    },
    {
      kind: "opening-accounts",
      done: accountRows.length > 0,
      status: `${accountRows.length} tài khoản có số dư`,
      fao: "Tổng hợp › Số dư đầu kỳ › Vào số dư đầu kỳ các tài khoản, hoặc Bảng cân đối phát sinh (chọn cột cuối kỳ)",
    },
    {
      kind: "opening-partners",
      done: partnerRows.length > 0,
      status: `${partnerRows.length} dòng công nợ`,
      fao: "Bán hàng / Mua hàng › Số dư đầu kỳ › Vào số dư công nợ đầu kỳ, hoặc Báo cáo số dư công nợ",
    },
    {
      kind: "fixed-assets",
      done: (fixedAssets.data?.length ?? 0) > 0,
      status: `${fixedAssets.data?.length ?? 0} TSCĐ (không bắt buộc)`,
      fao: "Tài sản › Báo cáo kiểm kê TSCĐ › Danh mục TSCĐ tại ngày đầu kỳ → Kết xuất Excel",
    },
    {
      kind: "tools",
      done: (tools.data?.length ?? 0) > 0,
      status: `${tools.data?.length ?? 0} CCDC (không bắt buộc)`,
      fao: "Công cụ › Báo cáo kiểm kê CCDC › Danh mục CCDC → Kết xuất Excel",
    },
  ];

  const sum = (k: "opening_debit" | "opening_credit") => (tb.data ?? []).reduce((s, r) => s + Number(r[k] ?? 0), 0);
  const debit = sum("opening_debit");
  const credit = sum("opening_credit");

  return (
    <div className="space-y-3">
      <PageHeader
        title="Chuyển dữ liệu từ FAO"
        subtitle={`Nhập lần lượt các tệp Excel xuất từ FAO (chỉ thao tác xem/kết xuất bên FAO). Số dư tính tại ngày bắt đầu nhập liệu ${formatDateVN(tenant.start_date)}.`}
      />
      <Card title="Các bước">
        <ol className="divide-y divide-line">
          {steps.map((s, i) => (
            <li key={s.kind} className="flex flex-wrap items-center gap-3 py-2.5">
              {s.done ? <CheckCircle2 className="text-success" size={20} /> : <Circle className="text-muted" size={20} />}
              <div className="min-w-64 flex-1">
                <div className="text-sm font-medium text-navy-700">
                  {i + 1}. {IMPORT_SPECS[s.kind].title}
                </div>
                <div className="text-xs text-muted">
                  {s.status} · Từ FAO: {s.fao}
                </div>
              </div>
              <Button variant="ghost" icon={<FileDown size={14} />} onClick={() => void downloadTemplate(s.kind)}>
                Tệp mẫu
              </Button>
              {editable ? (
                <Button variant={s.done ? "secondary" : "primary"} icon={<FileUp size={14} />} onClick={() => setImporting(s.kind)}>
                  {s.done ? "Nhập lại / bổ sung" : "Nhập từ Excel"}
                </Button>
              ) : null}
            </li>
          ))}
          <li className="flex flex-wrap items-center gap-3 py-2.5">
            {debit === credit && debit > 0 ? <CheckCircle2 className="text-success" size={20} /> : <Circle className="text-muted" size={20} />}
            <div className="min-w-64 flex-1">
              <div className="text-sm font-medium text-navy-700">5. Kiểm tra Bảng cân đối phát sinh tại ngày bắt đầu</div>
              <div className="text-xs text-muted">
                Tổng dư Nợ {formatAmount(debit)} · Tổng dư Có {formatAmount(credit)} — đối chiếu với số dư cùng ngày trên FAO.
              </div>
            </div>
            {debit === credit ? <Badge tone="green">Cân</Badge> : <Badge tone="red">Lệch {formatAmount(debit - credit)}</Badge>}
            <Link
              to="/$tenant/$"
              params={{ tenant: slug, _splat: "general/trial-balance" }}
              className="text-sm font-medium text-navy-600 hover:underline"
            >
              Mở Bảng cân đối phát sinh
            </Link>
          </li>
        </ol>
      </Card>
      <Card title="Chọn ngày bắt đầu nhập liệu">
        <ul className="list-disc space-y-1 pl-5 text-sm">
          <li>
            <b>Chạy song song ngay (khuyến nghị):</b> đặt ngày bắt đầu là ngày đầu tháng tới ở{" "}
            <Link to="/$tenant/$" params={{ tenant: slug, _splat: "system/company" }} className="text-navy-600 hover:underline">
              Thông tin đơn vị
            </Link>
            , rồi nhập số dư <i>cuối ngày hôm trước</i> lấy từ Bảng cân đối phát sinh và Báo cáo số dư công nợ của FAO.
          </li>
          <li>
            <b>Giữ ngày đầu năm:</b> nhập số dư đầu năm từ FAO, sau đó nhập lại các chứng từ phát sinh từ đầu năm.
          </li>
          <li>Đổi ngày bắt đầu trước khi nhập số dư; khi đã khóa sổ thì không nhập lại số dư được.</li>
        </ul>
      </Card>
      {importing ? <ImportDialog kind={importing} open onClose={() => setImporting(null)} /> : null}
    </div>
  );
}

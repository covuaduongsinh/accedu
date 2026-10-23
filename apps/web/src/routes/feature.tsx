import { findFeature } from "@accedu/core";
import { useParams } from "@tanstack/react-router";
import { Construction } from "lucide-react";
import type { ComponentType } from "react";
import { AccountsPage } from "../features/catalogs/AccountsPage";
import { PartnersPage } from "../features/catalogs/PartnersPage";
import { GeneralJournalPage } from "../features/reports/GeneralJournalPage";
import { LedgerPage } from "../features/reports/LedgerPage";
import { TrialBalancePage } from "../features/reports/TrialBalancePage";
import { VoucherModule } from "../features/vouchers/VoucherModule";
import { Card, PageHeader } from "../components/ui";

const PAGES: Record<string, ComponentType> = {
  "general/accounts": AccountsPage,
  "sales/customers": () => <PartnersPage kind="customer" />,
  "purchase/suppliers": () => <PartnersPage kind="supplier" />,
  "general/journal-vouchers": () => <VoucherModule type="PK" />,
  "cash/receipts": () => <VoucherModule type="PT" />,
  "cash/payments": () => <VoucherModule type="PC" />,
  "cash/bank-credits": () => <VoucherModule type="BC" />,
  "cash/bank-debits": () => <VoucherModule type="BN" />,
  "general/trial-balance": TrialBalancePage,
  "general/general-journal": GeneralJournalPage,
  "general/ledger": () => <LedgerPage />,
  "cash/cash-book": () => <LedgerPage defaultAccount="111" title="Sổ quỹ tiền mặt" />,
  "cash/bank-book": () => <LedgerPage defaultAccount="112" title="Sổ tiền gửi không kỳ hạn" />,
};

export function FeaturePage() {
  const { _splat: path = "" } = useParams({ strict: false }) as { _splat?: string };
  const Page = PAGES[path];
  if (Page) return <Page />;
  const f = findFeature(path);
  return (
    <div>
      <PageHeader title={f?.title ?? "Không tìm thấy chức năng"} />
      <Card>
        <div className="flex items-center gap-3 text-sm text-muted">
          <Construction className="text-gold-500" />
          {f ? `Chức năng đang phát triển theo kế hoạch ${f.phase}.` : `Đường dẫn “${path}” không tồn tại.`}
        </div>
      </Card>
    </div>
  );
}

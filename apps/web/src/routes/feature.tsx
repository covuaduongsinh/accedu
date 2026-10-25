import { findFeature } from "@accedu/core";
import { useParams } from "@tanstack/react-router";
import { Construction } from "lucide-react";
import type { ComponentType } from "react";
import { AccountsPage } from "../features/catalogs/AccountsPage";
import { ItemsPage } from "../features/catalogs/ItemsPage";
import { JobsPage } from "../features/catalogs/JobsPage";
import { WarehousesPage } from "../features/catalogs/WarehousesPage";
import { OpeningBalancesPage } from "../features/catalogs/OpeningBalancesPage";
import { InputInvoicesPage } from "../features/einvoice/InputInvoicesPage";
import { MigrationPage } from "../features/import/MigrationPage";
import { CompanyPage, PeriodLockCard } from "../features/system/CompanyPage";
import { UsersPage } from "../features/system/UsersPage";
import { PartnersPage } from "../features/catalogs/PartnersPage";
import { GeneralJournalPage } from "../features/reports/GeneralJournalPage";
import { GrossProfitPage } from "../features/reports/GrossProfitPage";
import { LedgerPage } from "../features/reports/LedgerPage";
import { PartnerBalancesPage, PartnerLedgerPage } from "../features/reports/PartnerReports";
import { AgingPage, VatListingPage } from "../features/reports/SettlementReports";
import { CostingPage, StockCardPage, StockSummaryPage } from "../features/reports/StockReports";
import { TrialBalancePage } from "../features/reports/TrialBalancePage";
import { VoucherModule } from "../features/vouchers/VoucherModule";
import { Card, PageHeader } from "../components/ui";

const PAGES: Record<string, ComponentType> = {
  "system/company": CompanyPage,
  "system/users": UsersPage,
  "system/periods": () => (
    <div>
      <PageHeader title="Kỳ kế toán & khóa sổ" />
      <PeriodLockCard />
    </div>
  ),
  "general/opening-balances": OpeningBalancesPage,
  "system/import": MigrationPage,
  "project/jobs": JobsPage,
  "general/accounts": AccountsPage,
  "sales/customers": () => <PartnersPage kind="customer" />,
  "purchase/suppliers": () => <PartnersPage kind="supplier" />,
  "general/journal-vouchers": () => <VoucherModule type="PK" />,
  "inventory/items": ItemsPage,
  "inventory/warehouses": WarehousesPage,
  "inventory/receipts": () => <VoucherModule type="PNK" />,
  "inventory/issues": () => <VoucherModule type="PXK" />,
  "inventory/transfers": () => <VoucherModule type="PDC" />,
  "inventory/stock-summary": StockSummaryPage,
  "inventory/stock-card": StockCardPage,
  "inventory/costing": CostingPage,
  "sales/invoices": () => <VoucherModule type="HDB" />,
  "sales/service-invoices": () => <VoucherModule type="HDV" />,
  "purchase/invoices": () => <VoucherModule type="HDM" />,
  "purchase/service-invoices": () => <VoucherModule type="HMV" />,
  "purchase/input-invoices": InputInvoicesPage,
  "sales/receivable-ledger": () => <PartnerLedgerPage side="receivable" />,
  "sales/receivable-summary": () => <PartnerBalancesPage side="receivable" />,
  "purchase/payable-ledger": () => <PartnerLedgerPage side="payable" />,
  "purchase/payable-summary": () => <PartnerBalancesPage side="payable" />,
  "sales/aging": () => <AgingPage side="receivable" />,
  "sales/gross-profit": GrossProfitPage,
  "purchase/aging": () => <AgingPage side="payable" />,
  "general/vat-out": () => <VatListingPage direction="out" />,
  "general/vat-in": () => <VatListingPage direction="in" />,
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

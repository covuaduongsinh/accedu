import type { ItemRow, StockBalanceRow } from "@accedu/api";
import { formatAmount } from "@accedu/core";

/** Số lượng: số nguyên không có phần lẻ, còn lại 2 chữ số */
export const formatQty = (q: number) => formatAmount(q, { decimals: Number.isInteger(q) ? 0 : 2 });

/**
 * Tồn của mặt hàng tại kho, và tổng mọi kho (giá bình quân tính chung mọi kho) —
 * đến ngày hạch toán, chưa tính phiếu đang lập.
 */
export function stockOf(balances: readonly StockBalanceRow[] | undefined, itemId: string | undefined, warehouseId: string) {
  const rows = (balances ?? []).filter((b) => b.item_id === itemId);
  const here = rows.find((b) => b.warehouse_id === warehouseId);
  const first = rows[0];
  return {
    quantity: Number(here?.quantity ?? 0),
    item: { quantity: Number(first?.item_quantity ?? 0), amount: Number(first?.item_amount ?? 0) },
  };
}

/** Xuất quá số tồn: chặn ghi sổ ngay trên form (máy chủ kiểm tra lại cả các phiếu sau ngày này) */
export const shortageMessage = (n: number, item: Pick<ItemRow, "code" | "uom">, available: number) =>
  `Dòng ${n}: ${item.code} tại kho chỉ còn ${formatQty(available)} ${item.uom}`;

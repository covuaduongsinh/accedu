import type { MyTenantRow, TenantRow } from "@accedu/api";
import { createContext, useContext } from "react";

export interface TenantCtx {
  tenant: TenantRow;
  role: MyTenantRow["role"];
  slug: string;
}

export const TenantContext = createContext<TenantCtx | null>(null);

export function useTenantCtx(): TenantCtx {
  const t = useContext(TenantContext);
  if (!t) throw new Error("Ngoài phạm vi đơn vị");
  return t;
}

export const ROLE_LABEL: Record<MyTenantRow["role"], string> = {
  owner: "Chủ sở hữu",
  admin: "Quản trị",
  chief_accountant: "Kế toán trưởng",
  accountant: "Kế toán",
  cashier: "Thủ quỹ",
  viewer: "Chỉ xem",
};

export function canPost(role: MyTenantRow["role"]): boolean {
  return role === "owner" || role === "admin" || role === "chief_accountant" || role === "accountant";
}

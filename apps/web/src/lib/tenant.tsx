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
  coach: "Huấn luyện viên",
};

/** HLV chỉ dùng chức năng điểm danh — không xem số liệu kế toán */
export const COACH_HOME = "education/attendance";
export function isCoach(role: MyTenantRow["role"]): boolean {
  return role === "coach";
}

export function canPost(role: MyTenantRow["role"]): boolean {
  return role === "owner" || role === "admin" || role === "chief_accountant" || role === "accountant";
}

/** Sửa danh mục (lớp, học viên, ghi danh) và điểm danh mọi lớp */
export const canEditCatalog = canPost;

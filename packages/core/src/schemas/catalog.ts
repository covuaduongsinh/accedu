import { z } from "zod";

export const accountSchema = z.object({
  code: z.string().trim().regex(/^\d{3,16}$/, "Số hiệu tài khoản chỉ gồm chữ số (3–16 ký tự)"),
  name: z.string().trim().min(1).max(128),
  nameEn: z.string().max(128).optional(),
  parentCode: z.string().nullish(),
  kind: z.enum(["asset", "liability", "equity", "revenue", "expense", "result"]),
  normalSide: z.enum(["debit", "credit", "both"]).default("debit"),
  currency: z.string().length(3).nullish(),
  trackPartner: z.boolean().default(false),
  trackItem: z.boolean().default(false),
  isPostable: z.boolean().default(true),
});

export const partnerSchema = z.object({
  code: z.string().trim().min(1, "Thiếu mã").max(16, "Mã tối đa 16 ký tự"),
  name: z.string().trim().min(1, "Thiếu tên").max(256, "Tên tối đa 256 ký tự"),
  taxCode: z
    .string()
    .trim()
    .regex(/^\d{10}(-\d{3})?$|^\d{12}$/, "Mã số thuế 10 số, 10-3 số hoặc CCCD 12 số")
    .optional()
    .or(z.literal("")),
  idNumber: z.string().max(32, "Số CCCD tối đa 32 ký tự").optional(),
  address: z.string().max(256, "Địa chỉ tối đa 256 ký tự").optional(),
  phone: z.string().max(32, "Điện thoại tối đa 32 ký tự").optional(),
  email: z.email("Email không hợp lệ").optional().or(z.literal("")),
  contactName: z.string().max(128, "Người liên hệ tối đa 128 ký tự").optional(),
  groupCode: z.string().max(16, "Mã nhóm tối đa 16 ký tự").optional(),
  isCustomer: z.boolean().default(true),
  isSupplier: z.boolean().default(false),
  isEmployee: z.boolean().default(false),
  isStudent: z.boolean().default(false),
  bankAccountNo: z.string().max(32, "Số tài khoản ngân hàng tối đa 32 ký tự").optional(),
  bankName: z.string().max(128, "Tên ngân hàng tối đa 128 ký tự").optional(),
  note: z.string().max(512, "Ghi chú tối đa 512 ký tự").optional(),
});

export const ITEM_KINDS = { goods: "Hàng hóa", book: "Sách", material: "Vật tư", finished: "Thành phẩm", tool: "Công cụ", service: "Dịch vụ" } as const;

export const itemSchema = z.object({
  code: z.string().trim().min(1, "Thiếu mã hàng").max(32, "Mã hàng tối đa 32 ký tự"),
  name: z.string().trim().min(1, "Thiếu tên hàng").max(256, "Tên tối đa 256 ký tự"),
  kind: z.enum(["goods", "book", "material", "finished", "tool", "service"]).default("goods"),
  uom: z.string().trim().min(1, "Thiếu đơn vị tính").max(32).default("Cái"),
  vatCode: z.enum(["0", "5", "8", "10", "KCT", "KKKNT"]).default("10"),
  salePrice: z.number().finite().nonnegative("Giá bán không âm").nullish(),
  purchasePrice: z.number().finite().nonnegative("Giá mua không âm").nullish(),
  revenueAccount: z.string().trim().regex(/^\d{3,16}$/, "Tài khoản chỉ gồm chữ số").nullish().or(z.literal("")),
  inventoryAccount: z.string().trim().regex(/^\d{3,16}$/, "Tài khoản chỉ gồm chữ số").nullish().or(z.literal("")),
  groupCode: z.string().max(16).optional(),
  trackInventory: z.boolean().optional(),
  cogsAccount: z.string().trim().regex(/^\d{3,16}$/, "Tài khoản chỉ gồm chữ số").nullish().or(z.literal("")),
  defaultWarehouseId: z.uuid().nullish().or(z.literal("")),
});

export const warehouseSchema = z.object({
  code: z.string().trim().min(1, "Thiếu mã kho").max(16, "Mã kho tối đa 16 ký tự").regex(/^[A-Za-z0-9_.-]+$/, "Mã kho chỉ gồm chữ, số, - _ ."),
  name: z.string().trim().min(1, "Thiếu tên kho").max(128),
  address: z.string().max(256).optional(),
  isActive: z.boolean().default(true),
});

export type WarehouseInput = z.input<typeof warehouseSchema>;
export type ItemInput = z.input<typeof itemSchema>;
export type AccountInput = z.input<typeof accountSchema>;
export type PartnerInput = z.input<typeof partnerSchema>;

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
  code: z.string().trim().min(1).max(16),
  name: z.string().trim().min(1).max(256),
  taxCode: z
    .string()
    .trim()
    .regex(/^\d{10}(-\d{3})?$|^\d{12}$/, "Mã số thuế 10 số, 10-3 số hoặc CCCD 12 số")
    .optional()
    .or(z.literal("")),
  address: z.string().max(256).optional(),
  phone: z.string().max(32).optional(),
  email: z.email().optional().or(z.literal("")),
  isCustomer: z.boolean().default(true),
  isSupplier: z.boolean().default(false),
  isEmployee: z.boolean().default(false),
});

export type AccountInput = z.input<typeof accountSchema>;
export type PartnerInput = z.input<typeof partnerSchema>;

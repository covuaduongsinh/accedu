import { z } from "zod";
import { stripDiacritics } from "../accounting/modules";

/** Lộ trình 6 cấp của Dương Sinh */
export const CHESS_LEVELS = { tot: "Tốt", ma: "Mã", tuong: "Tượng", xe: "Xe", hau: "Hậu", vua: "Vua" } as const;
export type ChessLevel = keyof typeof CHESS_LEVELS;
export const LEVEL_ORDER = Object.keys(CHESS_LEVELS) as ChessLevel[];

/** Cách tính học phí của lớp */
export const BILLING_MODES = { monthly: "Theo tháng", course: "Theo khóa (N buổi)" } as const;
export type BillingMode = keyof typeof BILLING_MODES;

export const ENROLLMENT_STATUS = { active: "Đang học", paused: "Bảo lưu", finished: "Kết thúc", dropped: "Nghỉ học" } as const;
export type EnrollmentStatus = keyof typeof ENROLLMENT_STATUS;

/** "Tốt", "tot", "TỐT", "Cấp Mã" → mã cấp; trống → null; không nhận ra → undefined */
export function parseLevel(text: string | null | undefined): ChessLevel | null | undefined {
  const t = stripDiacritics(String(text ?? ""))
    .toLowerCase()
    .replace(/^cap\s+/, "")
    .trim();
  if (!t) return null;
  return (LEVEL_ORDER as string[]).includes(t) ? (t as ChessLevel) : undefined;
}

/** Nội dung chuyển khoản học phí: không dấu, chỉ chữ số và khoảng trắng (ngân hàng nào cũng nhận) */
export function tuitionTransferNote(studentCode: string, invoiceNumber?: string | null): string {
  return stripDiacritics(`HP ${studentCode}${invoiceNumber ? ` ${invoiceNumber}` : ""}`)
    .replaceAll(/[^A-Za-z0-9 ]/g, "")
    .toUpperCase()
    .slice(0, 50);
}

const optionalText = (max: number, label: string) => z.string().trim().max(max, `${label} tối đa ${max} ký tự`).optional();

export const studentSchema = z.object({
  code: z.string().trim().min(1, "Thiếu mã học viên").max(16, "Mã học viên tối đa 16 ký tự"),
  name: z.string().trim().min(1, "Thiếu họ tên học viên").max(256),
  birthDate: z.iso.date("Ngày sinh không hợp lệ").optional().or(z.literal("")),
  gender: z.enum(["M", "F"]).optional().or(z.literal("")),
  guardianName: optionalText(128, "Tên phụ huynh"),
  guardianPhone: optionalText(32, "SĐT phụ huynh"),
  phone: optionalText(32, "Điện thoại"),
  school: optionalText(128, "Trường"),
  address: optionalText(256, "Địa chỉ"),
  level: z.enum(LEVEL_ORDER as [ChessLevel, ...ChessLevel[]]).optional().or(z.literal("")),
  joinedOn: z.iso.date().optional().or(z.literal("")),
  note: optionalText(512, "Ghi chú"),
  isActive: z.boolean().default(true),
});

export const classSchema = z
  .object({
    code: z.string().trim().min(1, "Thiếu mã lớp").max(32, "Mã lớp tối đa 32 ký tự"),
    name: z.string().trim().min(1, "Thiếu tên lớp").max(256),
    level: z.enum(LEVEL_ORDER as [ChessLevel, ...ChessLevel[]]).optional().or(z.literal("")),
    billing: z.enum(["monthly", "course"]).default("monthly"),
    fee: z.number().min(0, "Học phí không được âm"),
    sessionsPerCourse: z.number().int().positive().nullish(),
    schedule: optionalText(128, "Lịch học"),
    location: optionalText(128, "Địa điểm"),
    coachPartnerId: z.uuid().nullish(),
    capacity: z.number().int().positive().nullish(),
    startDate: z.iso.date().optional().or(z.literal("")),
    endDate: z.iso.date().optional().or(z.literal("")),
    isActive: z.boolean().default(true),
  })
  .refine((c) => c.billing !== "course" || (c.sessionsPerCourse ?? 0) > 0, { message: "Lớp tính theo khóa cần số buổi mỗi khóa", path: ["sessionsPerCourse"] });

export const enrollmentSchema = z.object({
  classId: z.uuid("Chưa chọn lớp"),
  studentId: z.uuid("Chưa chọn học viên"),
  startDate: z.iso.date("Ngày vào lớp không hợp lệ"),
  endDate: z.iso.date().optional().or(z.literal("")),
  status: z.enum(["active", "paused", "finished", "dropped"]).default("active"),
  fee: z.number().min(0).nullish(),
  note: optionalText(512, "Ghi chú"),
});

export type StudentInput = z.input<typeof studentSchema>;
export type ClassInput = z.input<typeof classSchema>;
export type EnrollmentInput = z.input<typeof enrollmentSchema>;

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

/** Điểm danh: có mặt và vắng không phép trừ buổi; vắng có phép không trừ (học bù) */
export const ATTENDANCE_STATUS = { present: "Có mặt", absent: "Vắng", excused: "Có phép" } as const;
export type AttendanceStatus = keyof typeof ATTENDANCE_STATUS;
export const countsAsSession = (status: AttendanceStatus | null | undefined): boolean => status === "present" || status === "absent";

/** Loại HLV: nhân viên (lương Có 334) / cộng tác viên (Có 331, khấu trừ thuế TNCN) */
export const COACH_KINDS = { employee: "Nhân viên", contractor: "Cộng tác viên" } as const;
export type CoachKind = keyof typeof COACH_KINDS;

/** Cộng tác viên: tổng chi trả một lần (tháng) từ 2.000.000 đ thì khấu trừ 10% thuế TNCN (cùng công thức với generate_coach_pay) */
export const PIT_THRESHOLD = 2_000_000;
export function contractorPit(gross: number, kind: CoachKind = "contractor"): number {
  return kind === "contractor" && gross >= PIT_THRESHOLD ? Math.round(gross * 0.1) : 0;
}

/** "5, 20" → [5, 20]; ngày nhắc học phí trong tháng 1–28, tối đa 4 ngày */
export function parseReminderDays(text: string): number[] | string {
  const parts = text.split(/[\s,;]+/).filter(Boolean);
  if (!parts.length) return "Nhập ít nhất một ngày nhắc";
  const days = [...new Set(parts.map(Number))].toSorted((a, b) => a - b);
  if (days.some((d) => !Number.isInteger(d) || d < 1 || d > 28)) return "Ngày nhắc phải từ 1 đến 28";
  if (days.length > 4) return "Tối đa 4 ngày nhắc mỗi tháng";
  return days;
}

/** Còn ≤ 2 buổi thì báo sắp hết khóa */
export const COURSE_ENDING_SESSIONS = 2;

/** Nhãn số buổi còn lại của học viên lớp theo khóa */
export function remainingLabel(remaining: number | null | undefined): string {
  if (remaining == null) return "";
  if (remaining < 0) return `Vượt ${-remaining} buổi`;
  if (remaining === 0) return "Hết khóa";
  return `Còn ${remaining} buổi`;
}

/**
 * Doanh thu lớp theo khóa ghi nhận trong tháng (cùng công thức với allocate_tuition_revenue):
 * lũy kế = học phí × số buổi đã học đến hết tháng / số buổi của khóa (đủ buổi thì trọn học phí),
 * trừ phần đã ghi nhận các tháng trước; không vượt phần học phí chưa phân bổ.
 */
export function recognizeCourse(input: {
  fee: number;
  sessions: number;
  usedThrough: number;
  recognizedBefore: number;
  recognizedOther?: number;
}): number {
  const { fee, sessions, usedThrough, recognizedBefore } = input;
  if (sessions <= 0 || fee <= 0) return 0;
  const target = usedThrough >= sessions ? fee : Math.round((fee * usedThrough) / sessions);
  const cap = fee - (input.recognizedOther ?? recognizedBefore);
  return Math.max(0, Math.min(cap, target - recognizedBefore));
}

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
  email: z.email("Email phụ huynh không hợp lệ").optional().or(z.literal("")),
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
    coachUserId: z.uuid().nullish(),
    coachRate: z.number().min(0, "Đơn giá buổi không được âm").nullish(),
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

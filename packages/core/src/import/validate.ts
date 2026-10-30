import { inferAccount, type CoaKind, type NormalSide } from "../accounting/coa";
import { parseLevel, type ChessLevel } from "../education/education";
import { partnerSchema } from "../schemas/catalog";
import { parseDateVN } from "../text/date";
import { IMPORT_SPECS, type ImportKind } from "./specs";
import { cellText, normalizeHeader, parseFlag, parseLooseAmount, type Cell, type ColumnMap, type HeaderGuess, type Table } from "./table";

/** Dữ liệu hiện có của đơn vị — để biết dòng nào mới/cập nhật và kiểm tra tham chiếu */
export interface ImportContext {
  accounts: ReadonlyArray<{ code: string; is_postable: boolean; track_partner: boolean }>;
  partners: ReadonlyArray<{ code: string }>;
  items?: ReadonlyArray<{ code: string; track_inventory?: boolean }>;
  warehouses?: ReadonlyArray<{ code: string }>;
  /** Mã lớp học (nhập danh sách học viên) */
  classes?: ReadonlyArray<{ code: string }>;
  /** Nhập từ trang Khách hàng hay Nhà cung cấp: loại mặc định của đối tượng mới */
  partnerDefault?: "customer" | "supplier";
}

/** Dòng gửi lên hàm SQL import_accounts — trường vắng mặt = giữ nguyên khi cập nhật */
export interface AccountImportRow {
  row: number;
  code: string;
  name?: string;
  name_en?: string | null;
  parent_code?: string | null;
  kind?: CoaKind;
  normal_side?: NormalSide;
  currency?: string | null;
  track_partner?: boolean;
  track_item?: boolean;
}

export interface PartnerImportRow {
  row: number;
  code: string;
  name?: string;
  tax_code?: string | null;
  id_number?: string | null;
  address?: string | null;
  phone?: string | null;
  email?: string | null;
  contact_name?: string | null;
  group_code?: string | null;
  bank_account_no?: string | null;
  bank_name?: string | null;
  note?: string | null;
  is_customer?: boolean;
  is_supplier?: boolean;
  is_employee?: boolean;
  is_student?: boolean;
}

export interface OpeningImportRow {
  row: number;
  account: string;
  partner_code?: string;
  debit: number;
  credit: number;
}

export interface ItemImportRow {
  row: number;
  code: string;
  name?: string;
  kind?: "goods" | "book" | "material" | "finished" | "tool" | "service";
  uom?: string;
  vat_code?: string;
  sale_price?: number | null;
  purchase_price?: number | null;
  revenue_account?: string | null;
  inventory_account?: string | null;
  group_code?: string | null;
  barcode?: string | null;
}

/** Dòng gửi lên import_stock_openings */
export interface StockOpeningImportRow {
  row: number;
  warehouse_code: string;
  item_code: string;
  quantity: number;
  amount: number;
  account?: string;
}

/** Dòng gửi lên import_students */
export interface StudentImportRow {
  row: number;
  code: string;
  name: string;
  birth_date?: string;
  guardian_name?: string;
  guardian_phone?: string;
  email?: string;
  school?: string;
  level?: ChessLevel;
  address?: string;
  class_code?: string;
  start_date?: string;
}

export type ImportPayload = AccountImportRow | PartnerImportRow | OpeningImportRow | ItemImportRow | StockOpeningImportRow | StudentImportRow;

const ITEM_KIND_WORDS: Record<string, NonNullable<ItemImportRow["kind"]>> = {
  "hang hoa": "goods",
  hh: "goods",
  goods: "goods",
  hang: "goods",
  sach: "book",
  book: "book",
  "vat tu": "material",
  "nguyen vat lieu": "material",
  nvl: "material",
  "thanh pham": "finished",
  tp: "finished",
  "cong cu": "tool",
  ccdc: "tool",
  "cong cu dung cu": "tool",
  "dich vu": "service",
  dv: "service",
  service: "service",
};

/** "10%", "10", "KCT", "Không chịu thuế" → mã thuế AccEdu; null nếu không nhận ra */
export function parseVatCode(text: string): "0" | "5" | "8" | "10" | "KCT" | "KKKNT" | null {
  const t = normalizeHeader(text);
  if (["kct", "khong chiu thue", "khong chiu"].includes(t)) return "KCT";
  if (["kkknt", "khong ke khai"].includes(t)) return "KKKNT";
  // "10", "10%", "10.0" hoặc ô Excel định dạng phần trăm (0.1)
  const n = Number(text.trim().replace("%", "").replace(",", "."));
  if (!Number.isFinite(n) || text.trim() === "") return null;
  const pct = n > 0 && n < 1 ? Math.round(n * 100) : n;
  const code = String(pct);
  return code === "0" || code === "5" || code === "8" || code === "10" ? code : null;
}
export type RowStatus = "new" | "update" | "skip" | "error";

export interface PreviewRow<P extends ImportPayload = ImportPayload> {
  /** Số dòng trên sheet (từ 1, như Excel hiển thị) */
  row: number;
  status: RowStatus;
  message?: string;
  /** Giá trị hiển thị theo từng trường */
  values: Record<string, string>;
  payload?: P;
}

export interface Preview<P extends ImportPayload = ImportPayload> {
  kind: ImportKind;
  rows: PreviewRow<P>[];
  counts: Record<RowStatus, number>;
  /** Số dư: tổng Nợ/Có các dòng sẽ nhập và các dòng TK công nợ bị bỏ qua */
  totals?: { debit: number; credit: number; skippedDebit: number; skippedCredit: number };
}

const TOTAL_WORDS = ["tong", "cong", "total", "luy ke"];

function looksLikeTotal(values: string[]): boolean {
  return values.some((v) => {
    const n = normalizeHeader(v);
    return TOTAL_WORDS.some((w) => n.startsWith(w));
  });
}

const round2 = (n: number) => Math.round(n * 100) / 100;

function parseSide(text: string): NormalSide | null | undefined {
  const t = normalizeHeader(text);
  if (t === "") return undefined;
  if (["no", "d", "debit", "du no", "ben no"].includes(t)) return "debit";
  if (["co", "c", "credit", "du co", "ben co"].includes(t)) return "credit";
  if (["luong tinh", "both", "l", "ca hai", "hai ben", "no co", "2"].includes(t)) return "both";
  return null;
}

const TYPE_WORDS: Record<string, "is_customer" | "is_supplier" | "is_employee" | "is_student"> = {
  kh: "is_customer",
  "khach hang": "is_customer",
  khach: "is_customer",
  ncc: "is_supplier",
  "nha cung cap": "is_supplier",
  nv: "is_employee",
  "nhan vien": "is_employee",
  hlv: "is_employee",
  hv: "is_student",
  "hoc vien": "is_student",
  "hoc sinh": "is_student",
};

function parseTypes(text: string): Partial<Record<"is_customer" | "is_supplier" | "is_employee" | "is_student", boolean>> | null {
  const parts = text
    .split(/[,;/+&]| va /i)
    .map((p) => normalizeHeader(p))
    .filter(Boolean);
  const out: Partial<Record<"is_customer" | "is_supplier" | "is_employee" | "is_student", boolean>> = {
    is_customer: false,
    is_supplier: false,
    is_employee: false,
    is_student: false,
  };
  for (const p of parts) {
    const k = TYPE_WORDS[p];
    if (!k) return null;
    out[k] = true;
  }
  return out;
}

/** Chuẩn hóa số hiệu tài khoản: bỏ khoảng trắng, dấu chấm (Excel đôi khi hiển thị 1121.0) */
function accountCode(c: Cell): string {
  if (typeof c === "number" && Number.isInteger(c)) return String(c);
  return cellText(c).replace(/\.0+$/, "").replace(/[\s.]/g, "");
}

/** Mã đối tượng: số nguyên trong ô Excel → chuỗi không có phần thập phân */
/** Trường tùy chọn: chỉ đưa vào payload khi có giá trị */
const optField = (key: string, value: string | null | undefined) => (value ? { [key]: value } : {});

/** Ô ngày: Date, số ngày kiểu Excel, "dd/mm/yyyy" hoặc "yyyy-mm-dd" → ISO; trống → ""; sai → null */
function dateText(c: Cell): string | null {
  if (c === null || c === undefined || c === "") return "";
  if (c instanceof Date) return Number.isNaN(c.getTime()) ? null : c.toISOString().slice(0, 10);
  if (typeof c === "number") {
    if (c < 1 || c > 200_000) return null;
    return new Date(Date.UTC(1899, 11, 30) + Math.round(c) * 86_400_000).toISOString().slice(0, 10);
  }
  const t = cellText(c);
  if (/^\d{4}-\d{2}-\d{2}$/.test(t)) return t;
  return parseDateVN(t);
}

function codeText(c: Cell): string {
  if (typeof c === "number" && Number.isInteger(c)) return String(c);
  return cellText(c);
}

/**
 * Chuyển bảng đọc từ Excel thành bản xem trước: từng dòng có trạng thái Mới / Cập nhật / Bỏ qua / Lỗi
 * và dữ liệu đã chuẩn hóa để gửi lên máy chủ. Máy chủ kiểm tra lại toàn bộ trước khi ghi.
 */
export function buildPreview(kind: ImportKind, table: Table, header: HeaderGuess, map: ColumnMap, ctx: ImportContext): Preview {
  const spec = IMPORT_SPECS[kind];
  const first = header.row + header.height;
  const rows: PreviewRow[] = [];
  const has = (key: string) => map[key] !== null && map[key] !== undefined;
  const raw = (cells: readonly Cell[], key: string): Cell => (has(key) ? cells[map[key]!] : undefined);

  for (let i = first; i < table.length; i++) {
    const cells = table[i] ?? [];
    const values: Record<string, string> = {};
    for (const f of spec.fields) if (has(f.key)) values[f.key] = cellText(raw(cells, f.key));
    // Dòng trống hoàn toàn: không hiển thị
    if (!cells.some((c) => cellText(c) !== "")) continue;
    rows.push({ row: i + 1, status: "new", values });
  }

  const accountByCode = new Map(ctx.accounts.map((a) => [a.code, a]));
  const partnerCodes = new Set(ctx.partners.map((p) => p.code.toUpperCase()));
  const fail = (r: PreviewRow, message: string) => {
    r.status = "error";
    r.message = message;
  };
  const skip = (r: PreviewRow, message: string) => {
    r.status = "skip";
    r.message = message;
  };
  const tableRow = (r: PreviewRow) => table[r.row - 1] ?? [];

  if (kind === "accounts") {
    const seen = new Map<string, number>();
    const fileCodes = new Set<string>();
    for (const r of rows) {
      const code = accountCode(raw(tableRow(r), "code"));
      if (/^\d{3,16}$/.test(code)) fileCodes.add(code);
    }
    const known = new Set([...accountByCode.keys(), ...fileCodes]);
    for (const r of rows) {
      const cells = tableRow(r);
      const code = accountCode(raw(cells, "code"));
      r.values.code = code;
      if (!/^\d{3,16}$/.test(code)) {
        if (looksLikeTotal(Object.values(r.values)) || (code === "" && !r.values.name)) skip(r, "Không phải dòng tài khoản");
        else fail(r, code === "" ? "Thiếu số hiệu tài khoản" : "Số hiệu tài khoản chỉ gồm chữ số (3–16 ký tự)");
        continue;
      }
      const dup = seen.get(code);
      if (dup) {
        fail(r, `Trùng số hiệu với dòng ${dup}`);
        continue;
      }
      seen.set(code, r.row);
      const exists = accountByCode.has(code);
      const name = cellText(raw(cells, "name"));
      if (!name) {
        fail(r, "Thiếu tên tài khoản");
        continue;
      }
      if (name.length > 128) {
        fail(r, "Tên tài khoản tối đa 128 ký tự");
        continue;
      }
      const p: AccountImportRow = { row: r.row, code, name };
      if (has("nameEn")) p.name_en = cellText(raw(cells, "nameEn")) || null;

      if (has("parentCode")) {
        const parent = accountCode(raw(cells, "parentCode")) || null;
        if (parent && (!/^\d{3,16}$/.test(parent) || !code.startsWith(parent) || parent === code)) {
          fail(r, `Tài khoản mẹ ${parent} không hợp lệ (số hiệu con phải bắt đầu bằng số hiệu mẹ)`);
          continue;
        }
        if (parent && !known.has(parent)) {
          fail(r, `Chưa có tài khoản mẹ ${parent}`);
          continue;
        }
        p.parent_code = parent;
      } else if (!exists) {
        let parent: string | null = null;
        for (let len = code.length - 1; len >= 3 && !parent; len--) if (known.has(code.slice(0, len))) parent = code.slice(0, len);
        p.parent_code = parent;
      }

      if (has("currency")) {
        const cur = cellText(raw(cells, "currency")).toUpperCase();
        if (cur && !/^[A-Z]{3}$/.test(cur)) {
          fail(r, `Mã ngoại tệ ${cur} không hợp lệ`);
          continue;
        }
        p.currency = cur || null;
      }
      if (has("normalSide")) {
        const side = parseSide(cellText(raw(cells, "normalSide")));
        if (side === null) {
          fail(r, "Tính chất phải là Nợ, Có hoặc Lưỡng tính");
          continue;
        }
        if (side) p.normal_side = side;
      }
      if (has("trackPartner")) {
        const flag = parseFlag(raw(cells, "trackPartner"));
        if (flag === null) {
          fail(r, "Theo dõi công nợ: dùng 1/0 hoặc Có/Không");
          continue;
        }
        p.track_partner = flag;
      }
      if (!exists) {
        const inferred = inferAccount(code);
        p.kind = inferred.kind;
        p.normal_side ??= inferred.normalSide;
        p.track_partner ??= inferred.trackPartner;
        p.track_item = inferred.trackItem;
      }
      r.status = exists ? "update" : "new";
      r.payload = p;
    }
  }

  if (kind === "partners") {
    const seen = new Map<string, number>();
    const typeCols = ["isCustomer", "isSupplier", "isEmployee", "isStudent"] as const;
    const flagKey = { isCustomer: "is_customer", isSupplier: "is_supplier", isEmployee: "is_employee", isStudent: "is_student" } as const;
    const text = (cells: readonly Cell[], key: string) => (has(key) ? cellText(raw(cells, key)) : undefined);
    for (const r of rows) {
      const cells = tableRow(r);
      const code = codeText(raw(cells, "code"));
      r.values.code = code;
      if (!code) {
        if (looksLikeTotal(Object.values(r.values)) || !r.values.name) skip(r, "Không phải dòng đối tượng");
        else fail(r, "Thiếu mã đối tượng");
        continue;
      }
      const upper = code.toUpperCase();
      const dup = seen.get(upper);
      if (dup) {
        fail(r, `Trùng mã với dòng ${dup}`);
        continue;
      }
      seen.set(upper, r.row);
      const exists = partnerCodes.has(upper);
      const name = text(cells, "name") ?? "";
      const taxCode = text(cells, "taxCode")?.replace(/\s/g, "");
      const parsed = partnerSchema.safeParse({
        code,
        name: exists && !has("name") ? "-" : name,
        taxCode,
        idNumber: text(cells, "idNumber"),
        address: text(cells, "address"),
        phone: text(cells, "phone"),
        email: text(cells, "email"),
        contactName: text(cells, "contactName"),
        groupCode: text(cells, "groupCode"),
        bankAccountNo: text(cells, "bankAccountNo"),
        bankName: text(cells, "bankName"),
        note: text(cells, "note"),
      });
      if (!parsed.success) {
        fail(r, parsed.error.issues[0]?.message ?? "Dữ liệu không hợp lệ");
        continue;
      }
      const p: PartnerImportRow = { row: r.row, code };
      if (has("name")) p.name = name;
      const opt = (key: string, col: keyof PartnerImportRow, value = text(cells, key)) => {
        if (value !== undefined) (p as unknown as Record<string, string | null>)[col] = value || null;
      };
      opt("taxCode", "tax_code", taxCode);
      opt("idNumber", "id_number");
      opt("address", "address");
      opt("phone", "phone");
      opt("email", "email");
      opt("contactName", "contact_name");
      opt("groupCode", "group_code");
      opt("bankAccountNo", "bank_account_no");
      opt("bankName", "bank_name");
      opt("note", "note");

      let flags: Partial<Record<(typeof flagKey)[keyof typeof flagKey], boolean>> = {};
      if (has("type") && text(cells, "type")) {
        const t = parseTypes(text(cells, "type")!);
        if (!t) {
          fail(r, "Loại không rõ — dùng KH, NCC, NV, HV (nhiều loại ngăn bằng dấu phẩy)");
          continue;
        }
        flags = t;
      } else if (typeCols.some(has)) {
        let bad = false;
        for (const k of typeCols) {
          if (!has(k)) continue;
          const v = parseFlag(raw(cells, k));
          if (v === null) bad = true;
          else flags[flagKey[k]] = v;
        }
        if (bad) {
          fail(r, "Cột loại đối tượng: dùng 1/0 hoặc Có/Không");
          continue;
        }
      }
      const defaultFlag = ctx.partnerDefault === "supplier" ? "is_supplier" : "is_customer";
      if (exists) {
        if (Object.keys(flags).length === 0) flags[defaultFlag] = true;
      } else {
        const anyType = Object.values(flags).some(Boolean);
        flags = {
          is_customer: flags.is_customer ?? false,
          is_supplier: flags.is_supplier ?? false,
          is_employee: flags.is_employee ?? false,
          is_student: flags.is_student ?? false,
          ...(anyType ? {} : { [defaultFlag]: true }),
        };
        if (!name) {
          fail(r, "Thiếu tên đối tượng");
          continue;
        }
      }
      Object.assign(p, flags);
      r.status = exists ? "update" : "new";
      r.payload = p;
    }
  }

  if (kind === "items") {
    const seen = new Map<string, number>();
    const itemCodes = new Set((ctx.items ?? []).map((i) => i.code.toUpperCase()));
    const postable = new Set(ctx.accounts.filter((a) => a.is_postable).map((a) => a.code));
    const text = (cells: readonly Cell[], key: string) => (has(key) ? cellText(raw(cells, key)) : undefined);
    for (const r of rows) {
      const cells = tableRow(r);
      const code = codeText(raw(cells, "code"));
      r.values.code = code;
      if (!code) {
        if (looksLikeTotal(Object.values(r.values)) || !r.values.name) skip(r, "Không phải dòng hàng hóa");
        else fail(r, "Thiếu mã hàng");
        continue;
      }
      if (code.length > 32) {
        fail(r, "Mã hàng tối đa 32 ký tự");
        continue;
      }
      const upper = code.toUpperCase();
      const dup = seen.get(upper);
      if (dup) {
        fail(r, `Trùng mã với dòng ${dup}`);
        continue;
      }
      seen.set(upper, r.row);
      const exists = itemCodes.has(upper);
      const p: ItemImportRow = { row: r.row, code };
      const name = text(cells, "name");
      if (name !== undefined) p.name = name;
      if (!exists && !name) {
        fail(r, "Thiếu tên hàng");
        continue;
      }
      const kindText = text(cells, "kind");
      if (kindText) {
        const k = ITEM_KIND_WORDS[normalizeHeader(kindText)];
        if (!k) {
          fail(r, "Loại không rõ — dùng Hàng hóa, Sách, Vật tư, Thành phẩm, Công cụ, Dịch vụ");
          continue;
        }
        p.kind = k;
      }
      const uom = text(cells, "uom");
      if (uom) p.uom = uom;
      const vatText = text(cells, "vatCode");
      if (vatText) {
        const v = parseVatCode(vatText);
        if (!v) {
          fail(r, `Mã thuế ${vatText} không hợp lệ — dùng 0, 5, 8, 10 hoặc KCT`);
          continue;
        }
        p.vat_code = v;
      }
      let bad = "";
      for (const [key, col] of [
        ["salePrice", "sale_price"],
        ["purchasePrice", "purchase_price"],
      ] as const) {
        if (!has(key)) continue;
        const c = raw(cells, key);
        if (cellText(c) === "") {
          p[col] = null;
          continue;
        }
        const n = parseLooseAmount(c ?? null);
        if (n === null || n < 0) bad = `Giá không hợp lệ: ${cellText(c)}`;
        else p[col] = n;
      }
      for (const [key, col] of [
        ["revenueAccount", "revenue_account"],
        ["inventoryAccount", "inventory_account"],
      ] as const) {
        if (!has(key)) continue;
        const acc = accountCode(raw(cells, key));
        if (acc && !postable.has(acc)) bad ||= `Tài khoản ${acc} không tồn tại hoặc không phải tài khoản chi tiết`;
        p[col] = acc || null;
      }
      if (bad) {
        fail(r, bad);
        continue;
      }
      const group = text(cells, "groupCode");
      if (group !== undefined) p.group_code = group || null;
      const barcode = text(cells, "barcode");
      if (barcode !== undefined) p.barcode = barcode || null;
      r.status = exists ? "update" : "new";
      r.payload = p;
    }
  }

  let totals: Preview["totals"];
  if (kind === "opening-accounts" || kind === "opening-partners") {
    totals = { debit: 0, credit: 0, skippedDebit: 0, skippedCredit: 0 };
    const seen = new Map<string, number>();
    for (const r of rows) {
      const cells = tableRow(r);
      const account = accountCode(raw(cells, "account"));
      r.values.account = account;
      if (!/^\d{3,16}$/.test(account)) {
        if (looksLikeTotal(Object.values(r.values)) || account === "") skip(r, "Không phải dòng tài khoản");
        else fail(r, "Số hiệu tài khoản chỉ gồm chữ số (3–16 ký tự)");
        continue;
      }
      const d = parseLooseAmount(raw(cells, "debit") ?? null);
      const c = parseLooseAmount(raw(cells, "credit") ?? null);
      const badD = d === null && cellText(raw(cells, "debit")) !== "";
      const badC = c === null && cellText(raw(cells, "credit")) !== "";
      if (badD || badC) {
        fail(r, `Số tiền không hợp lệ: ${badD ? r.values.debit : r.values.credit}`);
        continue;
      }
      // Số âm ở cột Nợ là dư Có và ngược lại
      let debit = 0;
      let credit = 0;
      for (const [v, side] of [
        [d ?? 0, "debit"],
        [c ?? 0, "credit"],
      ] as const) {
        if ((v >= 0) === (side === "debit")) debit += Math.abs(v);
        else credit += Math.abs(v);
      }
      debit = round2(debit);
      credit = round2(credit);
      if (debit === 0 && credit === 0) {
        skip(r, "Không có số dư");
        continue;
      }
      const acc = accountByCode.get(account);
      if (!acc) {
        fail(r, `Chưa có tài khoản ${account} — nhập danh mục tài khoản trước`);
        continue;
      }
      if (!acc.is_postable) {
        skip(r, "Tài khoản tổng hợp — số dư lấy từ tài khoản chi tiết");
        continue;
      }
      if (kind === "opening-accounts") {
        if (acc.track_partner) {
          skip(r, "Tài khoản theo dõi công nợ — nhập ở mẫu Số dư công nợ");
          totals.skippedDebit = round2(totals.skippedDebit + debit);
          totals.skippedCredit = round2(totals.skippedCredit + credit);
          continue;
        }
        const dup = seen.get(account);
        if (dup) {
          fail(r, `Trùng tài khoản với dòng ${dup}`);
          continue;
        }
        seen.set(account, r.row);
        r.payload = { row: r.row, account, debit, credit };
      } else {
        if (!acc.track_partner) {
          fail(r, `Tài khoản ${account} không theo dõi công nợ — nhập ở mẫu Số dư tài khoản`);
          continue;
        }
        const partner = codeText(raw(cells, "partnerCode"));
        r.values.partnerCode = partner;
        if (!partner) {
          fail(r, "Thiếu mã đối tượng");
          continue;
        }
        if (!partnerCodes.has(partner.toUpperCase())) {
          fail(r, `Chưa có đối tượng ${partner} — nhập danh mục đối tượng trước`);
          continue;
        }
        const key = `${account}|${partner.toUpperCase()}`;
        const dup = seen.get(key);
        if (dup) {
          fail(r, `Trùng tài khoản + đối tượng với dòng ${dup}`);
          continue;
        }
        seen.set(key, r.row);
        r.payload = { row: r.row, account, partner_code: partner, debit, credit };
      }
      r.status = "new";
      totals.debit = round2(totals.debit + debit);
      totals.credit = round2(totals.credit + credit);
    }
  }

  if (kind === "opening-stock") {
    const seen = new Map<string, number>();
    const warehouses = new Set((ctx.warehouses ?? []).map((w) => w.code.toUpperCase()));
    const items = new Map((ctx.items ?? []).map((i) => [i.code.toUpperCase(), i]));
    for (const r of rows) {
      const cells = tableRow(r);
      const wh = codeText(raw(cells, "warehouseCode"));
      const code = codeText(raw(cells, "itemCode"));
      r.values.warehouseCode = wh;
      r.values.itemCode = code;
      if (!code) {
        if (looksLikeTotal(Object.values(r.values)) || !r.values.itemName) skip(r, "Không phải dòng hàng hóa");
        else fail(r, "Thiếu mã hàng");
        continue;
      }
      const qty = parseLooseAmount(raw(cells, "quantity") ?? null);
      const amount = parseLooseAmount(raw(cells, "amount") ?? null);
      if ((qty === null && cellText(raw(cells, "quantity")) !== "") || (amount === null && cellText(raw(cells, "amount")) !== "")) {
        fail(r, "Số lượng / giá trị không hợp lệ");
        continue;
      }
      if ((qty ?? 0) < 0 || (amount ?? 0) < 0) {
        fail(r, "Số lượng, giá trị phải là số không âm");
        continue;
      }
      if (!qty && !amount) {
        skip(r, "Không có tồn");
        continue;
      }
      if (!qty) {
        fail(r, "Có giá trị nhưng số lượng bằng 0");
        continue;
      }
      if (!wh) {
        fail(r, "Thiếu mã kho");
        continue;
      }
      if (ctx.warehouses && !warehouses.has(wh.toUpperCase())) {
        fail(r, `Chưa có kho ${wh} — thêm ở Tồn kho › Danh mục kho`);
        continue;
      }
      const it = items.get(code.toUpperCase());
      if (ctx.items && !it) {
        fail(r, `Chưa có mã hàng ${code} — nhập danh mục hàng hóa trước`);
        continue;
      }
      if (it && it.track_inventory === false) {
        fail(r, `Mặt hàng ${code} không theo dõi tồn kho`);
        continue;
      }
      const account = has("account") ? accountCode(raw(cells, "account")) : "";
      const key = `${wh.toUpperCase()}|${code.toUpperCase()}`;
      const dup = seen.get(key);
      if (dup) {
        fail(r, `Trùng mã kho + mã hàng với dòng ${dup}`);
        continue;
      }
      seen.set(key, r.row);
      r.payload = { row: r.row, warehouse_code: wh, item_code: code, quantity: qty, amount: round2(amount ?? 0), ...(account ? { account } : {}) };
      r.status = "new";
    }
  }

  if (kind === "students") {
    const seen = new Map<string, number>();
    const existing = new Set(ctx.partners.map((p) => p.code.toUpperCase()));
    const classes = new Set((ctx.classes ?? []).map((c) => c.code.toUpperCase()));
    const text = (cells: readonly Cell[], key: string) => (has(key) ? cellText(raw(cells, key)) : "");
    for (const r of rows) {
      const cells = tableRow(r);
      const code = codeText(raw(cells, "code")).toUpperCase();
      const name = text(cells, "name");
      r.values.code = code;
      if (!code) {
        if (looksLikeTotal(Object.values(r.values)) || !name) skip(r, "Không phải dòng học viên");
        else fail(r, "Thiếu mã học viên");
        continue;
      }
      if (code.length > 16) {
        fail(r, "Mã học viên tối đa 16 ký tự");
        continue;
      }
      if (!name) {
        fail(r, "Thiếu họ tên học viên");
        continue;
      }
      const dup = seen.get(code);
      if (dup) {
        fail(r, `Trùng mã ${code} với dòng ${dup}`);
        continue;
      }
      const birth = dateText(raw(cells, "birthDate"));
      const start = dateText(raw(cells, "startDate"));
      if (birth === null || start === null) {
        fail(r, "Ngày không hợp lệ (dạng ngày/tháng/năm)");
        continue;
      }
      const level = parseLevel(text(cells, "level"));
      if (level === undefined) {
        fail(r, "Cấp phải là Tốt, Mã, Tượng, Xe, Hậu hoặc Vua");
        continue;
      }
      const email = text(cells, "email");
      if (email && !/^[^@\s]+@[^@\s]+\.[^@\s]+$/.test(email)) {
        fail(r, `Email phụ huynh không hợp lệ: ${email}`);
        continue;
      }
      const classCode = text(cells, "classCode").toUpperCase();
      if (classCode && ctx.classes && !classes.has(classCode)) {
        fail(r, `Chưa có lớp ${classCode} — thêm ở Đào tạo › Lớp học`);
        continue;
      }
      seen.set(code, r.row);
      r.payload = {
        row: r.row,
        code,
        name,
        ...optField("birth_date", birth),
        ...optField("guardian_name", text(cells, "guardianName")),
        ...optField("guardian_phone", text(cells, "guardianPhone")),
        ...optField("email", email),
        ...optField("school", text(cells, "school")),
        ...optField("level", level),
        ...optField("address", text(cells, "address")),
        ...optField("class_code", classCode),
        ...optField("start_date", start),
      } as StudentImportRow;
      r.status = existing.has(code) ? "update" : "new";
    }
  }

  const counts: Record<RowStatus, number> = { new: 0, update: 0, skip: 0, error: 0 };
  for (const r of rows) counts[r.status]++;
  return totals ? { kind, rows, counts, totals } : { kind, rows, counts };
}

/** Gắn lỗi máy chủ trả về (theo số dòng) vào bản xem trước */
export function applyServerErrors(preview: Preview, errors: ReadonlyArray<{ row: number; message: string }>): Preview {
  const byRow = new Map(errors.map((e) => [e.row, e.message]));
  const rows = preview.rows.map((r) => (byRow.has(r.row) ? { ...r, status: "error" as const, message: byRow.get(r.row)! } : r));
  const counts: Record<RowStatus, number> = { new: 0, update: 0, skip: 0, error: 0 };
  for (const r of rows) counts[r.status]++;
  return { ...preview, rows, counts };
}

/** Các dòng sẽ gửi lên máy chủ */
export function payloadOf<P extends ImportPayload>(preview: Preview<P>): P[] {
  return preview.rows.filter((r) => (r.status === "new" || r.status === "update") && r.payload).map((r) => r.payload!);
}

/** Dòng tiêu đề + dòng mẫu của tệp mẫu */
export function templateRows(kind: ImportKind): string[][] {
  const spec = IMPORT_SPECS[kind];
  return [spec.fields.map((f) => f.label), ...spec.sample.map((r) => [...r])];
}

/** Trường bắt buộc chưa được ghép cột (để chặn bước tiếp theo) */
export function missingRequired(kind: ImportKind, map: ColumnMap): string[] {
  const spec = IMPORT_SPECS[kind];
  const missing = spec.fields.filter((f) => f.required && (map[f.key] === null || map[f.key] === undefined)).map((f) => f.label);
  if ((kind === "opening-accounts" || kind === "opening-partners") && map.debit == null && map.credit == null) missing.push("Dư Nợ hoặc Dư Có");
  return missing;
}

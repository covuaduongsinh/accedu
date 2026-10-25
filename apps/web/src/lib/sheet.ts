import { parseDelimited, type Table } from "@accedu/core";

export interface SheetTable {
  name: string;
  rows: Table;
}

/** Tệp CSV từ Excel/FAO có thể là UTF-8, UTF-16 (có BOM) hoặc bảng mã Windows tiếng Việt */
async function readText(file: Blob): Promise<string> {
  const buf = new Uint8Array(await file.arrayBuffer());
  if (buf[0] === 0xff && buf[1] === 0xfe) return new TextDecoder("utf-16le").decode(buf);
  if (buf[0] === 0xfe && buf[1] === 0xff) return new TextDecoder("utf-16be").decode(buf);
  try {
    return new TextDecoder("utf-8", { fatal: true }).decode(buf);
  } catch {
    return new TextDecoder("windows-1258").decode(buf);
  }
}

/** Đọc tệp .xlsx (mọi sheet) hoặc .csv/.tsv/.txt. Thư viện Excel chỉ tải khi cần. */
export async function readSpreadsheet(file: File): Promise<SheetTable[]> {
  const name = file.name.toLowerCase();
  if (/\.(csv|tsv|txt)$/.test(name)) return [{ name: file.name, rows: parseDelimited(await readText(file)) }];
  if (name.endsWith(".xls")) {
    throw new Error(
      "Tệp .xls (Excel 97–2003) chưa đọc được: mở bằng Excel → Lưu thành .xlsx rồi chọn lại, hoặc sao chép vùng dữ liệu và dán vào ô bên dưới.",
    );
  }
  const { default: readXlsxFile } = await import("read-excel-file/browser");
  try {
    const sheets = await readXlsxFile(file);
    return sheets.map((s) => ({ name: s.sheet, rows: s.data as unknown as Table }));
  } catch {
    throw new Error("Không đọc được tệp Excel — kiểm tra tệp có đúng định dạng .xlsx và không đặt mật khẩu.");
  }
}

import { execFileSync } from "node:child_process";
import { mkdtempSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { expect, test, type Page } from "@playwright/test";
import { strToU8, zipSync } from "fflate";
import readXlsxFile from "read-excel-file/node";
import writeXlsxFile from "write-excel-file/node";
import { startMockAnthropic } from "./mock-anthropic";

const SHOTS = process.env.E2E_SHOTS;
const stamp = Date.now().toString(36);
const email = `chu-${stamp}@duongsinh.test`;
const tempPassword = "TamThoi2026";
const password = "VuiTriTue@2026";
const slug = `ds-${stamp}`;
const staffEmail = `ketoan-${stamp}@duongsinh.test`;
const coachEmail = `hlv-${stamp}@duongsinh.test`;
const parentEmail = `phuhuynh-${stamp}@duongsinh.test`;
/**
 * Hộp thư thử của Supabase local (Mailpit): API đọc thư; SMTP trong mạng docker cho Edge Function.
 * SMTP_HOST là IP container Mailpit (CI tự lấy): Deno không phân giải được tên container có dấu "_".
 */
const MAILPIT = process.env.E2E_MAILPIT_URL ?? "http://127.0.0.1:54324";
const SMTP_HOST = process.env.E2E_SMTP_HOST ?? "supabase_inbucket_accedu";
const SMTP_PORT = process.env.E2E_SMTP_PORT ?? "1025";
/** Claude API giả cho "Hỏi AccEdu": cổng trên máy chạy test, Edge Function gọi tới qua host.docker.internal */
const AI_MOCK_PORT = Number(process.env.E2E_AI_MOCK_PORT ?? 54398);
const AI_MOCK_URL = process.env.E2E_AI_MOCK_URL ?? `http://host.docker.internal:${AI_MOCK_PORT}`;

/** Tài khoản do quản trị cấp: chủ sở hữu tạo bằng GoTrue admin API (như workflow triển khai) + app.bootstrap_owner */
test.beforeAll(async () => {
  const url = process.env.E2E_SUPABASE_URL;
  const serviceKey = process.env.E2E_SERVICE_ROLE_KEY;
  const dbUrl = process.env.E2E_DB_URL;
  if (!url || !serviceKey || !dbUrl) throw new Error("Cần E2E_SUPABASE_URL, E2E_SERVICE_ROLE_KEY, E2E_DB_URL (lấy từ `supabase status -o env`)");
  const res = await fetch(`${url}/auth/v1/admin/users`, {
    method: "POST",
    headers: { apikey: serviceKey, authorization: `Bearer ${serviceKey}`, "content-type": "application/json" },
    body: JSON.stringify({
      email,
      password: tempPassword,
      email_confirm: true,
      user_metadata: { full_name: "Kế toán trưởng Dương Sinh", must_change_password: true },
    }),
  });
  const user = (await res.json()) as { id?: string; msg?: string };
  if (!res.ok || !user.id) throw new Error(`Tạo chủ sở hữu lỗi: ${res.status} ${user.msg ?? ""}`);
  execFileSync("psql", [dbUrl, "-v", "ON_ERROR_STOP=1", "-qc", `select app.bootstrap_owner('${user.id}', 'goc-${stamp}', 'Đơn vị gốc E2E')`], {
    stdio: "inherit",
  });
  // Hộp thư gửi email nhắc học phí → Mailpit local (như deploy ghi Vault trên VPS)
  execFileSync(
    "psql",
    [
      dbUrl,
      "-v",
      "ON_ERROR_STOP=1",
      "-qc",
      `select app.vault_set('accedu_smtp_host', '${SMTP_HOST}'), app.vault_set('accedu_smtp_port', '${SMTP_PORT}'),
              app.vault_set('accedu_smtp_from', 'no-reply@duongsinh.test')`,
    ],
    { stdio: "inherit" },
  );
});

async function changeTempPassword(page: Page, newPassword: string) {
  await expect(page.getByText("Lần đầu đăng nhập")).toBeVisible();
  await page.getByLabel(/^Mật khẩu mới/).fill(newPassword);
  await page.getByLabel("Nhập lại mật khẩu mới").fill(newPassword);
  await page.getByRole("button", { name: "Lưu mật khẩu mới" }).click();
  await expect(page.getByText("Chọn đơn vị làm việc")).toBeVisible();
}

async function shot(page: Page, name: string) {
  if (SHOTS) await page.screenshot({ path: `${SHOTS}/${name}.png`, fullPage: false });
}

/** Tệp XML hóa đơn điện tử (TT78) giả lập hóa đơn người bán gửi — dữ liệu giả hoàn toàn */
function einvoiceXml(o: { mst: string; seller: string; number: string; lines: Array<[string, string, number, number, string]>; tax: number }): string {
  const lines = o.lines
    .map(([name, uom, qty, price, rate], i) => `<HHDVu><TChat>1</TChat><STT>${i + 1}</STT><THHDVu>${name}</THHDVu><DVTinh>${uom}</DVTinh><SLuong>${qty}</SLuong><DGia>${price}</DGia><ThTien>${qty * price}</ThTien><TSuat>${rate}</TSuat></HHDVu>`)
    .join("");
  const net = o.lines.reduce((s, [, , q, p]) => s + q * p, 0);
  return `<?xml version="1.0" encoding="UTF-8"?><HDon><DLHDon Id="data"><TTChung><PBan>2.0.1</PBan><KHMSHDon>1</KHMSHDon><KHHDon>C26TSM</KHHDon><SHDon>${o.number}</SHDon><NLap>2026-10-20</NLap><DVTTe>VND</DVTTe><TGia>1</TGia></TTChung><NDHDon><NBan><Ten>${o.seller}</Ten><MST>${o.mst}</MST><DChi>Số 1 Phố Mẫu, Hà Nội</DChi></NBan><NMua><Ten>Đơn vị E2E</Ten><MST>0108888888</MST></NMua><DSHHDVu>${lines}</DSHHDVu><TToan><TgTCThue>${net}</TgTCThue><TgTThue>${o.tax}</TgTThue><TgTTTBSo>${net + o.tax}</TgTTTBSo></TToan></NDHDon></DLHDon><MCCQT>00E2E0000000000000000000000000000</MCCQT></HDon>`;
}

/** Tệp Excel giả lập tệp FAO xuất ra (dữ liệu giả hoàn toàn) */
const fixtures = mkdtempSync(join(tmpdir(), "accedu-e2e-"));
async function xlsx(name: string, rows: Array<Array<string | number | null>>): Promise<string> {
  const path = join(fixtures, name);
  await writeXlsxFile(rows.map((r) => r.map((v) => (v === null ? null : { value: v, type: typeof v === "number" ? Number : String })))).toFile(path);
  return path;
}

async function signIn(page: Page) {
  await page.goto("/login");
  await page.getByLabel("Email").fill(email);
  await page.getByLabel("Mật khẩu").fill(password);
  await page.getByRole("button", { name: "Đăng nhập" }).click();
  await expect(page.getByText("Chọn đơn vị làm việc")).toBeVisible();
}

test.describe.serial("Luồng kế toán cơ bản", () => {
  test("đăng nhập lần đầu bắt đổi mật khẩu, tạo đơn vị với hệ thống tài khoản TT133", async ({ page }) => {
    await page.goto("/login");
    await expect(page.getByText(/Liên hệ quản trị đơn vị/)).toBeVisible();
    await shot(page, "01-dang-nhap");
    await page.getByLabel("Email").fill(email);
    await page.getByLabel("Mật khẩu").fill(tempPassword);
    await page.getByRole("button", { name: "Đăng nhập" }).click();
    await changeTempPassword(page, password);

    await page.getByLabel("Tên đơn vị").fill("Công ty CP Cờ vua Dương Sinh");
    await page.getByLabel("Mã truy cập (đường dẫn)").fill(slug);
    await page.getByLabel("Chế độ kế toán").selectOption("TT133");
    await page.getByRole("button", { name: "Tạo đơn vị" }).click();
    await expect(page.getByRole("heading", { name: "Tổng quan" })).toBeVisible();
    await expect(page.getByText(`/${slug.toUpperCase()}`)).toBeVisible();
    await shot(page, "02-tong-quan");
  });

  test("danh mục tài khoản & thêm khách hàng", async ({ page }) => {
    await signIn(page);
    await page.goto(`/${slug}/general/accounts`);
    await expect(page.getByText(/Thông tư 133\/2016\/TT-BTC — 126 tài khoản/)).toBeVisible();
    await expect(page.getByRole("gridcell", { name: "Phải thu của khách hàng" })).toBeVisible();
    await shot(page, "03-danh-muc-tai-khoan");

    await page.goto(`/${slug}/sales/customers`);
    await page.getByRole("button", { name: "Mới", exact: true }).click();
    await page.getByLabel("Mã", { exact: true }).fill("HV001");
    await page.getByLabel("Tên", { exact: true }).fill("Phụ huynh bé Minh An");
    await page.getByLabel("Địa chỉ").fill("Hà Nội");
    await page.getByRole("button", { name: "Lưu" }).click();
    await expect(page.getByRole("gridcell", { name: "Phụ huynh bé Minh An" })).toBeVisible();
  });

  test("lập phiếu thu, ghi sổ, bảng cân đối phát sinh cân", async ({ page }) => {
    await signIn(page);
    await page.goto(`/${slug}/cash/receipts`);
    await page.getByRole("button", { name: "Mới", exact: true }).click();
    const dialog = page.getByRole("dialog");
    await dialog.getByLabel("Mã khách").first().fill("HV001");
    await dialog.getByLabel("Lý do nộp").fill("Thu học phí lớp Tốt tháng 10");
    await dialog.getByLabel("Tài khoản dòng 1").fill("131");
    await dialog.getByLabel("Số tiền dòng 1").fill("1500000");
    await expect(dialog.getByText("Một triệu năm trăm nghìn đồng chẵn")).toBeVisible();
    await shot(page, "04-phieu-thu");
    await dialog.getByRole("button", { name: "Lưu & ghi sổ" }).click();
    await expect(page.getByRole("gridcell", { name: "PT0001" })).toBeVisible();
    await expect(page.getByText("Đã ghi sổ").first()).toBeVisible();
    await shot(page, "05-danh-sach-phieu-thu");

    await page.goto(`/${slug}/general/trial-balance`);
    await expect(page.getByText("✓ Cân")).toBeVisible();
    const row111 = page.locator(".ag-row", { hasText: "Tiền mặt" }).first();
    await expect(row111).toContainText("1.500.000");
    await shot(page, "06-can-doi-phat-sinh");
  });

  test("đồng bộ thời gian thực giữa hai thiết bị", async ({ browser }) => {
    const a = await browser.newPage();
    const b = await browser.newPage();
    await signIn(a);
    await signIn(b);
    await b.goto(`/${slug}/cash/payments`);
    await expect(b.getByText("Đã đồng bộ")).toBeVisible({ timeout: 15_000 });

    await a.goto(`/${slug}/cash/payments`);
    await a.getByRole("button", { name: "Mới", exact: true }).click();
    const d = a.getByRole("dialog");
    await d.getByLabel("Lý do chi").fill("Mua bàn cờ cho CLB");
    await d.getByLabel("Tài khoản dòng 1").fill("6422");
    await d.getByLabel("Số tiền dòng 1").fill("350000");
    await d.getByRole("button", { name: "Lưu & ghi sổ" }).click();
    await expect(a.getByRole("gridcell", { name: "PC0001" })).toBeVisible();

    // Thiết bị B không tải lại trang vẫn thấy phiếu chi mới
    await expect(b.getByRole("gridcell", { name: "Mua bàn cờ cho CLB" })).toBeVisible({ timeout: 10_000 });
    await shot(b, "07-dong-bo-realtime");
  });

  test("quản trị tạo tài khoản kế toán; kế toán đăng nhập và đổi mật khẩu tạm", async ({ page, browser }) => {
    await signIn(page);
    await page.goto(`/${slug}/system/users`);
    await page.getByLabel("Email", { exact: true }).fill(staffEmail);
    await page.getByLabel("Họ và tên").fill("Kế toán viên E2E");
    await page.getByRole("button", { name: "Tạo / thêm" }).click();
    const issued = page.getByRole("status").filter({ hasText: staffEmail });
    await expect(issued).toBeVisible();
    const temp = (await issued.locator("code").textContent())?.trim() ?? "";
    expect(temp).toMatch(/^[A-Za-z]{6}\d{4}$/);
    await expect(page.getByRole("cell", { name: staffEmail })).toBeVisible();
    await shot(page, "09-tao-tai-khoan");

    const staff = await browser.newPage();
    await staff.goto("/login");
    await staff.getByLabel("Email").fill(staffEmail);
    await staff.getByLabel("Mật khẩu").fill(temp);
    await staff.getByRole("button", { name: "Đăng nhập" }).click();
    await changeTempPassword(staff, "KeToan2026");
    await expect(staff.getByText(`/${slug.toUpperCase()} · TT133`)).toBeVisible();
    await staff.close();
  });

  test("số dư đầu kỳ nhập trên lưới", async ({ page }) => {
    await signIn(page);
    await page.goto(`/${slug}/general/opening-balances`);
    const editCell = async (code: string, col: "debit" | "credit", value: string) => {
      const cell = page.locator(`.ag-row[row-id="${code}"] [col-id="${col}"]`);
      await cell.scrollIntoViewIfNeeded();
      await cell.click();
      await page.keyboard.type(value);
      await page.keyboard.press("Enter");
    };
    await editCell("1111", "debit", "50000000");
    await expect(page.getByText(/Lệch 50\.000\.000/)).toBeVisible();
    // Lưới ảo hóa hàng: cuộn xuống để AG Grid dựng hàng 4111
    await page.locator('.ag-row[row-id="1111"]').hover();
    for (let i = 0; i < 10 && !(await page.locator('.ag-row[row-id="4111"]').count()); i++) await page.mouse.wheel(0, 800);
    await editCell("4111", "credit", "50000000");
    await expect(page.getByText("Cân: Nợ = Có")).toBeVisible();
    await page.getByRole("button", { name: "Lưu số dư" }).click();
    await expect(page.getByText(/Đã lưu số dư đầu kỳ \(2 tài khoản\)/)).toBeVisible();
    await shot(page, "08-so-du-dau-ky");
  });

  test("chuyển dữ liệu từ FAO: nhập tài khoản, đối tượng, số dư công nợ và số dư tài khoản từ Excel", async ({ page }) => {
    await signIn(page);
    // 1. Danh mục tài khoản: tệp có tên báo cáo phía trên dòng tiêu đề như FAO
    await page.goto(`/${slug}/general/accounts`);
    await page.getByRole("button", { name: "Nhập từ Excel" }).click();
    const dialog = page.getByRole("dialog");
    await dialog.getByLabel("Chọn tệp Excel").setInputFiles(
      await xlsx("danh-muc-tai-khoan.xlsx", [
        ["DANH MỤC TÀI KHOẢN", null, null],
        [null, null, null],
        ["Tài khoản", "Tên tài khoản", "Tk theo dõi công nợ"],
        ["11211", "TGNH mẫu A", 0],
        ["11212", "TGNH mẫu B", 0],
        ["1111", "Tiền Việt Nam", 0],
      ]),
    );
    await expect(dialog.getByLabel("Cột cho Tài khoản", { exact: true })).toHaveValue("0");
    await dialog.getByRole("button", { name: "Xem trước" }).click();
    await expect(dialog.getByText("Mới 2")).toBeVisible();
    await expect(dialog.getByText("Cập nhật 1")).toBeVisible();
    await shot(page, "10-nhap-excel-xem-truoc");
    await dialog.getByRole("button", { name: "Nhập 3 dòng" }).click();
    await expect(page.getByText(/thêm 2, cập nhật 0, không đổi 1/)).toBeVisible();
    await expect(page.getByRole("gridcell", { name: "TGNH mẫu B" })).toBeVisible();

    // 2. Đối tượng: dán thẳng từ Excel (tab)
    await page.goto(`/${slug}/sales/customers`);
    await page.getByRole("button", { name: "Nhập từ Excel" }).click();
    await dialog.getByLabel("Dữ liệu dán từ Excel").fill("Mã khách\tTên khách hàng\tLoại\nHV002\tHọc viên Mẫu Hai\tHV\nNCC01\tCông ty Sách Mẫu\tNCC");
    await dialog.getByRole("button", { name: "Dùng dữ liệu đã dán" }).click();
    await dialog.getByRole("button", { name: "Xem trước" }).click();
    await dialog.getByRole("button", { name: "Nhập 2 dòng" }).click();
    await expect(page.getByRole("gridcell", { name: "Học viên Mẫu Hai" })).toBeVisible();

    // 3. Số dư công nợ theo đối tượng
    await page.goto(`/${slug}/general/opening-balances`);
    await page.getByRole("tab", { name: /Số dư công nợ/ }).click();
    await page.getByRole("button", { name: "Nhập từ Excel" }).click();
    await dialog.getByLabel("Chọn tệp Excel").setInputFiles(
      await xlsx("so-du-cong-no.xlsx", [
        ["Tài khoản", "Mã khách", "Tên khách hàng", "Dư nợ", "Dư có"],
        ["131", "HV002", "Học viên Mẫu Hai", 3_000_000, 0],
        ["331", "NCC01", "Công ty Sách Mẫu", 0, 3_000_000],
      ]),
    );
    await dialog.getByRole("button", { name: "Xem trước" }).click();
    await expect(dialog.getByText("Cân", { exact: true })).toBeVisible();
    await dialog.getByRole("button", { name: "Nhập 2 dòng" }).click();
    await expect(page.getByRole("gridcell", { name: "Công ty Sách Mẫu" })).toBeVisible();

    // 4. Số dư tài khoản lấy thẳng từ Bảng cân đối phát sinh (tiêu đề 2 tầng), chọn cột cuối kỳ
    await page.getByRole("tab", { name: "Số dư tài khoản" }).click();
    await page.getByRole("button", { name: "Nhập từ Excel" }).click();
    await dialog.getByLabel("Chọn tệp Excel").setInputFiles(
      await xlsx("can-doi-phat-sinh.xlsx", [
        ["BẢNG CÂN ĐỐI SỐ PHÁT SINH", null, null, null, null, null, null, null],
        ["Tài khoản", "Tên tài khoản", "Số dư đầu kỳ", null, "Phát sinh trong kỳ", null, "Số dư cuối kỳ", null],
        [null, null, "Nợ", "Có", "Nợ", "Có", "Nợ", "Có"],
        ["112", "Tiền gửi ngân hàng", 1, 0, 0, 0, 20_000_000, 0],
        ["1111", "Tiền Việt Nam", 1, 0, 0, 0, 50_000_000, 0],
        ["11211", "TGNH mẫu A", 0, 0, 0, 0, 20_000_000, 0],
        ["131", "Phải thu của khách hàng", 0, 0, 0, 0, 3_000_000, 0],
        ["331", "Phải trả cho người bán", 0, 0, 0, 0, 0, 3_000_000],
        ["4111", "Vốn góp của chủ sở hữu", 0, 2, 0, 0, 0, 70_000_000],
        ["Tổng cộng", null, null, null, null, null, 93_000_000, 73_000_000],
      ]),
    );
    await dialog.getByRole("radio", { name: "Cuối kỳ" }).check();
    await expect(dialog.getByLabel("Cột cho Dư Nợ")).toHaveValue("6");
    await shot(page, "11-ghep-cot-can-doi-phat-sinh");
    await dialog.getByRole("button", { name: "Xem trước" }).click();
    await expect(dialog.getByText("Tính cả công nợ thì tổng Nợ = tổng Có.")).toBeVisible();
    await dialog.getByRole("button", { name: "Nhập 3 dòng" }).click();
    await expect(page.getByText("Cân: Nợ = Có")).toBeVisible();

    await page.getByRole("tab", { name: /Số dư công nợ/ }).click();
    await expect(page.getByRole("gridcell", { name: "Học viên Mẫu Hai" })).toBeVisible();
    await shot(page, "12-so-du-cong-no");

    await page.goto(`/${slug}/system/import`);
    await expect(page.getByText(/Tổng dư Nợ 73\.000\.000 · Tổng dư Có 73\.000\.000/)).toBeVisible();
    await shot(page, "13-chuyen-du-lieu-fao");

    // Tệp mẫu là .xlsx thật, nhập ngược lại được
    const download = page.waitForEvent("download");
    await page.getByRole("button", { name: "Tệp mẫu" }).first().click();
    const file = await (await download).path();
    const [sheet] = await readXlsxFile(file);
    expect(sheet?.sheet).toBe("Nhập liệu");
    expect(sheet?.data[0]?.slice(0, 2)).toEqual(["Tài khoản", "Tên tài khoản"]);
  });

  test("hóa đơn dịch vụ học phí (KCT), hóa đơn bán sách có thuế, sổ công nợ khách hàng", async ({ page }) => {
    await signIn(page);
    // Danh mục hàng hóa
    await page.goto(`/${slug}/inventory/items`);
    await page.getByRole("button", { name: "Mới", exact: true }).click();
    const form = page.getByRole("dialog");
    await form.getByLabel("Mã hàng").fill("SACH-NM");
    await form.getByLabel("Loại").selectOption("book");
    await form.getByLabel("Tên hàng, dịch vụ").fill("Sách cờ vua nhập môn");
    await form.getByLabel("Đơn vị tính").fill("Cuốn");
    await form.getByLabel("Thuế suất GTGT").selectOption("5");
    await form.getByLabel("Giá bán").fill("120000");
    await form.getByRole("button", { name: "Lưu", exact: true }).click();
    await expect(page.getByRole("gridcell", { name: "Sách cờ vua nhập môn" })).toBeVisible();

    // Tồn kho đầu kỳ của sách: dán từ Excel (hóa đơn bán hàng theo dõi tồn kho sẽ xuất kho)
    const dialog = page.getByRole("dialog");
    await page.goto(`/${slug}/general/opening-balances`);
    await page.getByRole("tab", { name: /Tồn kho/ }).click();
    await page.getByRole("button", { name: "Nhập từ Excel" }).click();
    await dialog.getByLabel("Dữ liệu dán từ Excel").fill("Mã kho\tMã hàng\tSố lượng tồn\tGiá trị tồn\nKHO\tSACH-NM\t10\t800000");
    await dialog.getByRole("button", { name: "Dùng dữ liệu đã dán" }).click();
    await dialog.getByRole("button", { name: "Xem trước" }).click();
    await dialog.getByRole("button", { name: "Nhập 1 dòng" }).click();
    await expect(page.getByText(/Đã nhập tồn kho đầu kỳ: 1 dòng, giá trị 800.000/)).toBeVisible();
    await expect(page.getByRole("gridcell", { name: "SACH-NM" })).toBeVisible();
    await shot(page, "24-ton-kho-dau-ky");

    // Hóa đơn dịch vụ học phí: mặc định không chịu thuế
    await page.goto(`/${slug}/sales/service-invoices`);
    await page.getByRole("button", { name: "Mới", exact: true }).click();
    const inv = page.getByRole("dialog");
    await inv.getByLabel("Mã khách").first().fill("HV002");
    await inv.getByLabel("Diễn giải dòng 1").fill("Học phí lớp Tốt tháng 10");
    await inv.getByLabel("Thành tiền dòng 1").fill("3000000");
    await expect(inv.getByLabel("Thuế suất dòng 1")).toHaveValue("KCT");
    await expect(inv.getByTestId("invoice-total")).toHaveText("3.000.000");
    await inv.getByRole("button", { name: "Lưu & ghi sổ" }).click();
    await expect(page.getByText("Đã ghi sổ").first()).toBeVisible();

    // Hóa đơn bán sách: chọn mã hàng tự điền giá, thuế 5%
    await page.goto(`/${slug}/sales/invoices`);
    await page.getByRole("button", { name: "Mới", exact: true }).click();
    await inv.getByLabel("Mã khách").first().fill("HV002");
    await inv.getByLabel("Mã hàng dòng 1").fill("SACH-NM");
    await expect(inv.getByLabel("Diễn giải dòng 1")).toHaveValue("Sách cờ vua nhập môn");
    await inv.getByLabel("Số lượng dòng 1").fill("2");
    await expect(inv.getByTestId("invoice-total")).toHaveText("252.000");
    // Sách theo dõi tồn kho: xuất từ Kho chính, giá vốn ước tính 2 × 80.000
    await expect(inv.getByLabel("Kho dòng 1")).not.toHaveValue("");
    await expect(inv.getByTestId("ton-1")).toHaveText("10");
    await expect(inv.getByTestId("gia-von-1")).toHaveText("160.000");
    await expect(inv.getByTestId("invoice-gross-profit")).toHaveText("80.000");
    await shot(page, "14-hoa-don-ban-hang");
    await inv.getByRole("button", { name: "Lưu & ghi sổ" }).click();
    await expect(page.getByRole("gridcell", { name: "252.000" }).first()).toBeVisible();

    // Sổ chi tiết công nợ: số dư đầu kỳ 3.000.000 (nhập từ Excel) + 3.000.000 + 252.000
    await page.goto(`/${slug}/sales/receivable-ledger?partner=HV002&from=2026-01-01&to=2026-12-31`);
    await expect(page.locator(".ag-row", { hasText: "Số dư cuối kỳ" })).toContainText("6.252.000");
    await shot(page, "15-so-cong-no");
    await page.goto(`/${slug}/sales/receivable-summary`);
    await expect(page.locator(".ag-row", { hasText: "HV002" })).toContainText("6.252.000");
  });

  test("thu tiền theo hóa đơn: phân bổ tự động, tình hình thanh toán, tuổi nợ, bảng kê bán ra", async ({ page }) => {
    await signIn(page);
    await page.goto(`/${slug}/cash/receipts`);
    await page.getByRole("button", { name: "Mới", exact: true }).click();
    const dialog = page.getByRole("dialog");
    await dialog.getByLabel("Mã khách").first().fill("HV002");
    await dialog.getByRole("button", { name: "Thu theo hóa đơn" }).click();
    const panel = dialog.getByRole("region", { name: "thu theo hóa đơn" });
    // Hai hóa đơn còn nợ: học phí 3.000.000 và sách 252.000
    await expect(panel.locator("tbody tr")).toHaveCount(2);
    await panel.getByLabel("Số tiền thu theo hóa đơn").fill("3252000");
    await panel.getByRole("button", { name: "Phân bổ tự động" }).click();
    await expect(panel.getByTestId("settle-allocated")).toHaveText("3.252.000");
    await shot(page, "16-thu-theo-hoa-don");
    await panel.getByRole("button", { name: "Đưa vào phiếu" }).click();
    await expect(dialog.getByLabel("Tài khoản dòng 2")).toHaveValue("131");
    await expect(dialog.getByLabel("Hóa đơn dòng 1")).not.toHaveValue("");
    await expect(dialog.getByLabel("Hóa đơn dòng 2")).not.toHaveValue("");
    await expect(dialog.getByText("3.252.000").first()).toBeVisible();
    await shot(page, "17-phieu-thu-theo-hoa-don");
    await dialog.getByRole("button", { name: "Lưu & ghi sổ" }).click();
    await expect(page.getByRole("gridcell", { name: "3.252.000" }).first()).toBeVisible();

    // Hóa đơn sách: đã thu đủ
    await page.goto(`/${slug}/sales/invoices`);
    await page.getByRole("gridcell", { name: "252.000" }).first().dblclick();
    await expect(dialog.getByTestId("invoice-paid")).toHaveText("252.000");
    await expect(dialog.getByTestId("invoice-remaining")).toHaveText("0");
    await shot(page, "18-tinh-hinh-thanh-toan");

    // Tuổi nợ: chỉ còn số dư đầu kỳ 3.000.000 (nhập từ Excel, không theo hóa đơn)
    await page.goto(`/${slug}/sales/aging`);
    // HV002 chỉ còn số dư đầu kỳ ở cột "Không theo hóa đơn"; HV001 trả trước 1.500.000 (dư Có)
    await expect(page.locator(".ag-row", { hasText: "HV002" }).first()).toHaveText(/Học viên Mẫu Hai\s*3\.000\.000\s*3\.000\.000/);
    await expect(page.locator(".ag-row", { hasText: "HV001" }).first()).toContainText("-1.500.000");
    await shot(page, "19-tuoi-no-phai-thu");

    // Bảng kê bán ra: nhóm không chịu thuế (học phí) và nhóm 5% (sách)
    await page.goto(`/${slug}/general/vat-out`);
    await expect(page.getByText("Hàng hóa, dịch vụ không chịu thuế GTGT")).toBeVisible();
    await expect(page.getByText("Hàng hóa, dịch vụ chịu thuế suất 5%")).toBeVisible();
    await expect(page.locator(".ag-row", { hasText: "Sách cờ vua nhập môn" }).first()).toContainText("12.000");
    await shot(page, "20-bang-ke-ban-ra");
  });

  test("nhập hóa đơn điện tử đầu vào từ XML/ZIP: xem trước, tạo hóa đơn mua nháp, bỏ qua hóa đơn đã có", async ({ page }) => {
    await signIn(page);
    const goods = einvoiceXml({
      mst: "0109999991",
      seller: "Công ty TNHH Văn phòng phẩm Mẫu",
      number: "123",
      lines: [
        ["Sách cờ vua nhập môn", "Cuốn", 10, 80_000, "5%"],
        ["Bàn cờ gỗ tiêu chuẩn", "Bộ", 3, 333_333, "10%"],
      ],
      tax: 140_000,
    });
    const service = einvoiceXml({ mst: "0107777777", seller: "Công ty Dịch vụ Sân Mẫu", number: "45", lines: [["Phí thuê sân thi đấu", "Buổi", 2, 2_500_000, "10%"]], tax: 500_000 });
    const zip = Buffer.from(zipSync({ "hd-45.xml": strToU8(service), "hd-45.pdf": strToU8("%PDF-1.4 gia") }));

    await page.goto(`/${slug}/purchase/input-invoices`);
    await page.getByLabel("Chọn tệp hóa đơn XML").setInputFiles([
      { name: "hd-123.xml", mimeType: "text/xml", buffer: Buffer.from(goods) },
      { name: "hd-45.zip", mimeType: "application/zip", buffer: zip },
    ]);
    await expect(page.getByTestId("status-123")).toContainText("Mới");
    await expect(page.getByTestId("status-45")).toContainText("Mới");
    await expect(page.getByText("NCC mới")).toHaveCount(2);
    // Gợi ý loại: sách, bàn cờ → mua hàng; thuê sân → mua dịch vụ (TK mặc định theo TT133)
    await expect(page.getByLabel("Loại hóa đơn 123")).toHaveValue("HDM");
    await expect(page.getByLabel("TK Nợ hóa đơn 123")).toHaveValue("156");
    await expect(page.getByLabel("Loại hóa đơn 45")).toHaveValue("HMV");
    await expect(page.getByLabel("TK Nợ hóa đơn 45")).toHaveValue("6422");
    await expect(page.getByText("1.939.999")).toBeVisible();
    // Sách khớp mã hàng SACH-NM theo tên → dòng hóa đơn mua gắn mã hàng, ghi sổ sẽ nhập kho
    await expect(page.getByTestId("items-123")).toHaveText("1/2");
    await expect(page.getByTestId("items-45")).toHaveText("0/1");
    await page.getByRole("button", { name: "Chi tiết hóa đơn 123" }).click();
    await expect(page.getByText("Bàn cờ gỗ tiêu chuẩn")).toBeVisible();
    await shot(page, "21-hoa-don-dau-vao-xem-truoc");

    await page.getByRole("button", { name: "Tạo 2 hóa đơn mua (nháp)" }).click();
    await expect(page.getByText("Đã tạo 2 hóa đơn mua nháp, 2 nhà cung cấp mới")).toBeVisible();
    await expect(page.getByTestId("status-123")).toContainText(/Đã tạo MH\d+/);
    await expect(page.getByTestId("status-45")).toContainText(/Đã tạo MV\d+/);
    await shot(page, "22-hoa-don-dau-vao-da-tao");

    // Thả lại cùng tệp: đã có, không tạo trùng
    await page.getByRole("button", { name: "Xóa danh sách" }).click();
    await page.getByLabel("Chọn tệp hóa đơn XML").setInputFiles([{ name: "hd-123.xml", mimeType: "text/xml", buffer: Buffer.from(goods) }]);
    await expect(page.getByTestId("status-123")).toContainText(/Đã có MH\d+/);
    await expect(page.getByRole("button", { name: "Tạo 0 hóa đơn mua (nháp)" })).toBeDisabled();

    // Hóa đơn mua nháp đúng tổng tiền, chờ kế toán ghi sổ
    await page.goto(`/${slug}/purchase/invoices`);
    const row = page.locator(".ag-row", { hasText: "1.939.999" }).first();
    await expect(row).toContainText("Lập chứng từ");
    await shot(page, "23-hoa-don-mua-nhap");
  });

  test("kho hàng: hóa đơn mua nhập kho, phiếu xuất tính giá vốn, chặn xuất âm, nhập–xuất–tồn, thẻ kho, hóa đơn bán có giá vốn, lãi gộp", async ({ page }) => {
    await signIn(page);
    const dialog = page.getByRole("dialog");

    // Hóa đơn mua 10 cuốn × 90.000 vào Kho chính → bình quân 85.000
    await page.goto(`/${slug}/purchase/invoices`);
    await page.getByRole("button", { name: "Mới", exact: true }).click();
    await dialog.getByLabel("Mã NCC").first().fill("NCC01");
    await dialog.getByLabel("Số hóa đơn").fill("888");
    await dialog.getByLabel("Mã hàng dòng 1").fill("SACH-NM");
    await dialog.getByLabel("Số lượng dòng 1").fill("10");
    await dialog.getByLabel("Đơn giá dòng 1").fill("90000");
    await expect(dialog.getByLabel("Kho dòng 1")).not.toHaveValue("");
    await expect(dialog.getByTestId("invoice-total")).toHaveText("945.000");
    await dialog.getByRole("button", { name: "Lưu & ghi sổ" }).click();
    await expect(page.getByRole("gridcell", { name: "945.000" }).first()).toBeVisible();

    // Phiếu xuất 5 cuốn: giá vốn 425.000
    await page.goto(`/${slug}/inventory/issues`);
    await page.getByRole("button", { name: "Mới", exact: true }).click();
    await dialog.getByLabel("Diễn giải").fill("Xuất sách tặng CLB");
    await dialog.getByLabel("TK nợ (giá vốn / chi phí)").fill("6421");
    await dialog.getByLabel("Mã hàng dòng 1").fill("SACH-NM");
    // 10 tồn đầu + 10 mua − 2 đã bán
    await expect(dialog.getByTestId("ton-1")).toHaveText("18");
    await dialog.getByLabel("Số lượng dòng 1").fill("5");
    await expect(dialog.getByTestId("gia-von-1")).toHaveText("425.000");
    await shot(page, "25-phieu-xuat-kho");
    await dialog.getByRole("button", { name: "Lưu & ghi sổ" }).click();
    await expect(page.getByRole("gridcell", { name: "425.000" }).first()).toBeVisible();

    // Xuất quá số tồn: chặn ngay trên form
    await page.getByRole("button", { name: "Mới", exact: true }).click();
    await dialog.getByLabel("Mã hàng dòng 1").fill("SACH-NM");
    await dialog.getByLabel("Số lượng dòng 1").fill("100");
    await expect(dialog.getByText(/SACH-NM tại kho chỉ còn 13 Cuốn/)).toBeVisible();
    await expect(dialog.getByRole("button", { name: "Lưu & ghi sổ" })).toBeDisabled();
    await dialog.getByRole("button", { name: "Đóng", exact: true }).last().click();

    // Nhập – xuất – tồn và thẻ kho
    await page.goto(`/${slug}/inventory/stock-summary`);
    const row = page.locator(".ag-row", { hasText: "SACH-NM" }).first();
    // Cùng ngày: nhập trước, xuất sau → bình quân 85.000; còn 13 cuốn
    await expect(row).toContainText("1.105.000");
    await expect(row).toContainText("13");
    await shot(page, "26-nhap-xuat-ton");
    await row.dblclick();
    await expect(page.getByRole("heading", { name: "Thẻ kho / sổ chi tiết vật tư" })).toBeVisible();
    await expect(page.locator(".ag-row", { hasText: "Tồn cuối kỳ" })).toContainText("1.105.000");
    await expect(page.locator(".ag-row", { hasText: /PX\d+/ })).toContainText("425.000");
    // Hóa đơn bán 2 cuốn tính lại theo bình quân sau khi mua: 2 × 85.000
    await expect(page.locator(".ag-row", { hasText: /HD\d+/ }).first()).toContainText("170.000");
    await shot(page, "27-the-kho");

    // Hóa đơn bán 3 cuốn: tự xuất kho, giá vốn 3 × 85.000, lãi gộp 360.000 − 255.000
    await page.goto(`/${slug}/sales/invoices`);
    await page.getByRole("button", { name: "Mới", exact: true }).click();
    await dialog.getByLabel("Mã khách").first().fill("HV002");
    await dialog.getByLabel("Mã hàng dòng 1").fill("SACH-NM");
    await dialog.getByLabel("Số lượng dòng 1").fill("3");
    await expect(dialog.getByTestId("ton-1")).toHaveText("13");
    await expect(dialog.getByTestId("gia-von-1")).toHaveText("255.000");
    await expect(dialog.getByTestId("invoice-gross-profit")).toHaveText("105.000");
    await shot(page, "29-hoa-don-ban-gia-von");
    await dialog.getByRole("button", { name: "Lưu & ghi sổ" }).click();
    await expect(page.getByRole("gridcell", { name: "378.000" }).first()).toBeVisible();
    await page.goto(`/${slug}/inventory/stock-summary`);
    await expect(page.locator(".ag-row", { hasText: "SACH-NM" }).first()).toContainText("850.000");

    // Lãi gộp theo mặt hàng: sách bán 5 cuốn, doanh thu 600.000, giá vốn 170.000 + 255.000
    await page.goto(`/${slug}/sales/gross-profit`);
    const gp = page.locator(".ag-row", { hasText: "SACH-NM" }).first();
    await expect(gp).toContainText("600.000");
    await expect(gp).toContainText("425.000");
    await expect(gp).toContainText("175.000");
    await expect(gp).toContainText("29,2%");
    await shot(page, "30-lai-gop");
    await page.getByLabel("Xem lãi gộp theo").selectOption("customer");
    await expect(page.locator(".ag-row", { hasText: "HV002" }).first()).toContainText("425.000");

    // Đổi sang bình quân cả tháng rồi đổi lại
    await page.goto(`/${slug}/inventory/costing`);
    page.once("dialog", (d) => void d.accept());
    await page.getByRole("radio", { name: /Bình quân cả tháng/ }).click();
    await expect(page.getByText(/Đã đổi phương pháp tính giá/)).toBeVisible();
    await expect(page.getByRole("radio", { name: /Bình quân cả tháng/ })).toBeChecked();
    await shot(page, "28-tinh-gia-von");
    page.once("dialog", (d) => void d.accept());
    await page.getByRole("radio", { name: /Bình quân di động/ }).click();
    await expect(page.getByRole("radio", { name: /Bình quân di động/ })).toBeChecked();
  });

  test("khóa sổ, lớp học", async ({ page }) => {
    await signIn(page);
    await page.goto(`/${slug}/project/jobs`);
    await page.getByRole("button", { name: "Mới", exact: true }).click();
    await page.getByLabel("Mã", { exact: true }).fill("TOT-K12");
    await page.getByLabel("Tên", { exact: true }).fill("Lớp Tốt K12 — sáng thứ 7");
    await page.getByRole("button", { name: "Lưu", exact: true }).click();
    await expect(page.getByRole("gridcell", { name: "Lớp Tốt K12 — sáng thứ 7" })).toBeVisible();

    await page.goto(`/${slug}/system/periods`);
    page.once("dialog", (d) => void d.accept());
    await page.getByLabel("Khóa số liệu đến ngày").fill("2026-01-31");
    await page.getByRole("button", { name: "Khóa sổ" }).click();
    await expect(page.getByText(/đang khóa đến hết ngày/)).toBeVisible();
    await expect(page.getByText("31/01/2026").first()).toBeVisible();
  });

  test("học viên & học phí: lớp theo tháng, nhập học viên từ Excel, lập học phí (3387), thu tiền, thông báo VietQR", async ({ page }) => {
    await signIn(page);
    const dialog = page.getByRole("dialog");

    // Tài khoản nhận học phí (VietQR)
    await page.goto(`/${slug}/system/company`);
    await page.getByLabel("Ngân hàng nhận học phí").selectOption("970436");
    await page.getByLabel("Số tài khoản").fill("0123456789");
    await page.getByLabel("Tên chủ tài khoản").fill("Cong ty CP Co vua Mau");
    await expect(page.getByRole("img", { name: "Mã VietQR tài khoản nhận học phí" })).toBeVisible();
    await page.getByRole("button", { name: "Lưu tài khoản nhận học phí" }).click();
    await expect(page.getByText("Đã lưu tài khoản nhận học phí")).toBeVisible();

    // Lớp theo tháng 600.000
    await page.goto(`/${slug}/education/classes`);
    await page.getByRole("button", { name: "Mới", exact: true }).click();
    await dialog.getByLabel("Mã lớp").fill("TOT-K15");
    await dialog.getByLabel("Tên lớp").fill("Lớp Tốt K15 — chiều chủ nhật");
    await dialog.getByLabel("Cấp").selectOption("tot");
    await dialog.getByLabel("Học phí mỗi tháng").fill("600000");
    await dialog.getByRole("button", { name: "Lưu", exact: true }).click();
    await expect(page.getByRole("gridcell", { name: "Lớp Tốt K15 — chiều chủ nhật" })).toBeVisible();

    // Nhập 2 học viên từ Excel, ghi danh vào lớp
    await page.goto(`/${slug}/education/students`);
    await page.getByRole("button", { name: "Nhập từ Excel" }).click();
    await dialog
      .getByLabel("Dữ liệu dán từ Excel")
      .fill("Mã HV\tHọ tên học viên\tPhụ huynh\tSĐT phụ huynh\tCấp\tMã lớp\nHV101\tHọc viên Mẫu Linh\tPhụ huynh Linh\t0900000101\tTốt\tTOT-K15\nHV102\tHọc viên Mẫu Khang\tPhụ huynh Khang\t0900000102\tTốt\tTOT-K15");
    await dialog.getByRole("button", { name: "Dùng dữ liệu đã dán" }).click();
    await dialog.getByRole("button", { name: "Xem trước" }).click();
    await dialog.getByRole("button", { name: "Nhập 2 dòng" }).click();
    await expect(page.getByText("Đã nhập học viên: thêm 2, cập nhật 0, ghi danh 2")).toBeVisible();
    await expect(page.locator(".ag-row", { hasText: "HV101" })).toContainText("TOT-K15");
    await shot(page, "31-hoc-vien");

    // Lập học phí tháng này: 2 phiếu × 600.000, ghi sổ luôn
    await page.goto(`/${slug}/education/tuition`);
    await page.getByRole("button", { name: "Lập học phí" }).click();
    await expect(dialog.getByText(/Sẽ lập 2 phiếu học phí, tổng 1.200.000/)).toBeVisible();
    await dialog.getByRole("button", { name: "Lập 2 phiếu học phí" }).click();
    await expect(page.getByText(/Đã lập 2 phiếu học phí, tổng 1.200.000 \(đã ghi sổ\)/)).toBeVisible();
    await expect(page.locator(".ag-row", { hasText: "HV101" })).toContainText("Chưa đóng");

    // Thu tiền mặt học viên HV101
    await page.locator(".ag-row", { hasText: "HV101" }).getByRole("gridcell", { name: "HV101" }).click();
    page.once("dialog", (d) => void d.accept());
    await page.getByRole("button", { name: "Thu tiền mặt" }).click();
    await expect(page.getByText(/Đã thu 600.000: PT\d+/)).toBeVisible();
    await expect(page.locator(".ag-row", { hasText: "HV101" })).toContainText("Đã đóng");
    await expect(page.locator(".ag-row", { hasText: "HV102" })).toContainText("Chưa đóng");
    await shot(page, "32-hoc-phi");

    // Thông báo học phí HV102 có mã VietQR
    await page.locator(".ag-row", { hasText: "HV102" }).getByRole("gridcell", { name: "HV102" }).click();
    await page.getByRole("button", { name: "Thông báo học phí" }).click();
    const notice = page.getByRole("region", { name: "Thông báo học phí Học viên Mẫu Khang" });
    await expect(notice.getByTestId("notice-total")).toHaveText("600.000");
    await expect(notice.getByTestId("notice-note")).toHaveText(/^HP HV102 DV\d+$/);
    await expect(notice.getByRole("img", { name: "Mã VietQR học phí HV102" })).toBeVisible();
    await shot(page, "33-thong-bao-hoc-phi");
    await page.getByRole("button", { name: "Đóng" }).click();

    // Sổ công nợ: còn phải thu 600.000 của HV102
    await page.goto(`/${slug}/sales/receivable-summary`);
    await expect(page.locator(".ag-row", { hasText: "HV102" })).toContainText("600.000");
  });

  test("HLV điểm danh trên tài khoản riêng, kế toán phân bổ doanh thu học phí 3387 → 5113", async ({ page, browser }) => {
    await signIn(page);
    const dialog = page.getByRole("dialog");
    const today = new Date(Date.now() + 7 * 3_600_000).toISOString().slice(0, 10);

    // Quản trị tạo tài khoản HLV
    await page.goto(`/${slug}/system/users`);
    await page.getByLabel("Email", { exact: true }).fill(coachEmail);
    await page.getByLabel("Họ và tên").fill("HLV Mẫu E2E");
    await page.getByLabel("Vai trò").selectOption("coach");
    await page.getByRole("button", { name: "Tạo / thêm" }).click();
    const issued = page.getByRole("status").filter({ hasText: coachEmail });
    await expect(issued).toBeVisible();
    const temp = (await issued.locator("code").textContent())?.trim() ?? "";

    // Gán HLV điểm danh cho lớp TOT-K15
    await page.goto(`/${slug}/education/classes`);
    await page.getByRole("gridcell", { name: "TOT-K15" }).click();
    await page.getByRole("button", { name: "Sửa", exact: true }).click();
    await dialog.getByLabel("HLV điểm danh", { exact: true }).selectOption({ label: "HLV Mẫu E2E · Huấn luyện viên" });
    await dialog.getByRole("button", { name: "Lưu", exact: true }).click();
    await expect(page.locator(".ag-row", { hasText: "TOT-K15" })).toContainText("HLV Mẫu E2E");

    // HLV đăng nhập: chỉ thấy Điểm danh, không vào được sổ sách
    const coach = await browser.newPage();
    await coach.goto("/login");
    await coach.getByLabel("Email").fill(coachEmail);
    await coach.getByLabel("Mật khẩu").fill(temp);
    await coach.getByRole("button", { name: "Đăng nhập" }).click();
    await changeTempPassword(coach, "HuanLuyen2026");
    await coach.getByText(`/${slug.toUpperCase()} · TT133`).click();
    await expect(coach.getByRole("heading", { name: "Điểm danh", exact: true })).toBeVisible();
    await expect(coach).toHaveURL(new RegExp(`/${slug}/education/attendance$`));
    await expect(coach.getByRole("button", { name: "Đào tạo" })).toBeVisible();
    await expect(coach.getByRole("button", { name: "Tổng hợp" })).toHaveCount(0);
    await coach.getByTestId("att-HV101-present").click();
    await coach.getByTestId("att-HV102-excused").click();
    await coach.getByLabel("Nội dung buổi học").fill("Khai cuộc Ý");
    await coach.getByTestId("att-save").click();
    await expect(coach.getByText(/Đã lưu điểm danh .*: 2 học viên/)).toBeVisible();
    await expect(coach.getByTestId(`cell-HV101-${today}`)).toHaveText("✓");
    await expect(coach.getByTestId(`cell-HV102-${today}`)).toHaveText("P");
    await shot(coach, "34-hlv-diem-danh");
    await coach.goto(`/${slug}/general/trial-balance`);
    await expect(coach).toHaveURL(new RegExp(`/${slug}/education/attendance$`));
    await coach.close();

    // Kế toán phân bổ doanh thu tháng này: 2 × 600.000 vào 5113, số dư 3387 về 0
    await page.goto(`/${slug}/education/revenue`);
    await page.getByLabel("Tháng phân bổ").fill(today.slice(0, 7));
    await page.getByRole("button", { name: "Xem trước" }).click();
    await expect(page.getByText(/Xem trước tháng .*: 2 dòng, 1.200.000/)).toBeVisible();
    await page.getByRole("button", { name: "Lập phiếu phân bổ" }).click();
    await expect(page.getByText(/Đã lập phiếu PK\d+: 1.200.000 vào doanh thu 5113/)).toBeVisible();
    await expect(page.getByTestId("deferred-total")).toHaveText("0");
    await expect(page.getByTestId("deferred-ledger")).toHaveText("0");
    await expect(page.getByText("Khớp sổ cái")).toBeVisible();
    await shot(page, "35-phan-bo-doanh-thu");
  });

  test("lương HLV theo buổi dạy (cộng tác viên khấu trừ TNCN), email nhắc học phí có mã VietQR", async ({ page }) => {
    await signIn(page);
    const dialog = page.getByRole("dialog");
    const today = new Date(Date.now() + 7 * 3_600_000).toISOString().slice(0, 10);

    // HLV là đối tượng nhân viên
    await page.goto(`/${slug}/sales/customers`);
    await page.getByRole("button", { name: "Mới", exact: true }).click();
    await page.getByLabel("Mã", { exact: true }).fill("GV01");
    await page.getByLabel("Tên", { exact: true }).fill("HLV Cộng tác Mẫu");
    await page.getByLabel("Nhân viên").check();
    await page.getByRole("button", { name: "Lưu" }).click();
    await expect(page.getByRole("gridcell", { name: "HLV Cộng tác Mẫu" })).toBeVisible();

    // Khai báo HLV: cộng tác viên 2.500.000 đ/buổi, gắn tài khoản điểm danh của HLV
    await page.goto(`/${slug}/education/coach-pay`);
    await page.getByRole("button", { name: "Khai báo HLV" }).click();
    await dialog.getByLabel("Mã nhân viên HLV").fill("GV01");
    await dialog.getByLabel("Loại HLV").selectOption("contractor");
    await dialog.getByLabel("Đơn giá buổi").fill("2500000");
    await dialog.getByLabel("Tài khoản điểm danh của HLV").selectOption({ label: "HLV Mẫu E2E · Huấn luyện viên" });
    await dialog.getByRole("button", { name: "Lưu", exact: true }).click();
    await expect(page.getByText("Đã lưu HLV GV01")).toBeVisible();

    // Buổi hôm nay HLV điểm danh trước khi khai báo → kế toán gán HLV dạy
    await page.goto(`/${slug}/education/attendance`);
    await page.getByLabel("Lớp điểm danh").selectOption({ label: "TOT-K15 — Lớp Tốt K15 — chiều chủ nhật" });
    await page.getByLabel("HLV dạy buổi này").selectOption({ label: "GV01 — HLV Cộng tác Mẫu" });
    await expect(page.getByText("Đã đổi HLV nhận lương của buổi học")).toBeVisible();

    // Lương tháng này: 1 buổi × 2.500.000, khấu trừ 10% TNCN
    await page.goto(`/${slug}/education/coach-pay`);
    await page.getByLabel("Tháng lương").fill(today.slice(0, 7));
    await page.getByRole("button", { name: "Xem trước" }).click();
    await expect(page.getByTestId("pay-gross")).toHaveText("2.500.000");
    await expect(page.getByTestId("pay-pit")).toHaveText("250.000");
    await expect(page.getByTestId("pay-GV01")).toContainText("TOT-K15: 1 buổi × 2.500.000");
    await page.getByRole("button", { name: "Lập phiếu lương" }).click();
    await expect(page.getByText(/Đã lập phiếu lương PK\d+: 2.500.000/)).toBeVisible();
    await shot(page, "36-luong-hlv");

    // Email phụ huynh của HV102
    await page.goto(`/${slug}/education/students`);
    await page.locator(".ag-row", { hasText: "HV102" }).getByRole("gridcell", { name: "HV102" }).dblclick();
    await dialog.getByLabel("Email phụ huynh").fill(parentEmail);
    await dialog.getByRole("button", { name: "Lưu", exact: true }).click();
    await expect(page.getByText("Đã lưu học viên")).toBeVisible();

    // Gửi email nhắc học phí: xem trước rồi gửi
    await page.goto(`/${slug}/education/tuition`);
    await page.locator(".ag-row", { hasText: "HV102" }).getByRole("gridcell", { name: "HV102" }).click();
    await page.getByRole("button", { name: "Gửi email nhắc" }).click();
    await expect(dialog.getByTestId("mail-HV102")).toContainText(parentEmail);
    await expect(dialog.getByTestId("mail-HV102")).toContainText("Sẽ gửi");
    await dialog.getByRole("button", { name: "Gửi 1 email" }).click();
    await expect(page.getByText(/Đã gửi 1 email/)).toBeVisible();
    await expect(dialog.getByTestId("mail-HV102")).toContainText("Đã gửi");
    await shot(page, "37-gui-email-nhac");

    // Thư đến hộp thư phụ huynh: tiêu đề, số tiền, mã VietQR đính kèm
    let msg: { ID: string; Subject: string } | undefined;
    await expect
      .poll(async () => {
        const list = (await (await fetch(`${MAILPIT}/api/v1/messages?limit=50`)).json()) as { messages: Array<{ ID: string; Subject: string; To: Array<{ Address: string }> }> };
        msg = list.messages.find((m) => m.To.some((t) => t.Address === parentEmail));
        return msg?.Subject ?? "";
      })
      .toContain("Thông báo học phí Học viên Mẫu Khang");
    const detail = (await (await fetch(`${MAILPIT}/api/v1/message/${msg!.ID}`)).json()) as { Text: string; Inline: Array<{ FileName: string }> };
    expect(detail.Text).toContain("600.000 đ");
    expect(detail.Text).toMatch(/Nội dung: HP HV102 DV\d+/);
    expect(detail.Inline.map((i) => i.FileName)).toEqual(["vietqr.gif"]);
    await page.goto(`${MAILPIT}/view/${msg!.ID}.html`);
    await shot(page, "38-email-phu-huynh");
  });

  test("Hỏi AccEdu: chưa cấu hình khóa thì báo rõ; có khóa thì AI tra báo cáo học phí bằng quyền người hỏi", async ({ page }) => {
    const dbUrl = process.env.E2E_DB_URL!;
    const vault = (sql: string) => execFileSync("psql", [dbUrl, "-v", "ON_ERROR_STOP=1", "-qc", sql], { stdio: "inherit" });
    const clearAi = () => vault("delete from vault.secrets where name in ('accedu_anthropic_api_key', 'accedu_anthropic_base_url')");
    clearAi();
    await signIn(page);
    await page.goto(`/${slug}`);
    const panel = page.getByRole("dialog", { name: "Hỏi AccEdu" });

    // Chưa có khóa Anthropic: báo cấu hình, không trừ hạn mức
    await page.getByRole("button", { name: "Hỏi AccEdu", exact: true }).click();
    await expect(panel.getByTestId("ai-quota")).toHaveText("Còn 100/100 câu hỏi hôm nay");
    await panel.getByLabel("Câu hỏi cho AccEdu").fill("Doanh thu tháng này bao nhiêu?");
    await panel.getByLabel("Câu hỏi cho AccEdu").press("Enter");
    await expect(panel.getByTestId("ai-error")).toContainText("Chưa cấu hình AI hỏi đáp");
    await shot(page, "41-hoi-accedu-chua-cau-hinh");

    // Có khóa (giả) → Edge Function gọi Claude API giả; tool tình hình học phí chạy trên dữ liệu thật
    const mock = await startMockAnthropic(AI_MOCK_PORT);
    try {
      vault(`select app.vault_set('accedu_anthropic_api_key', 'e2e-khoa-gia'), app.vault_set('accedu_anthropic_base_url', '${AI_MOCK_URL}')`);
      await page.reload();
      await page.getByRole("button", { name: "Hỏi AccEdu", exact: true }).click();
      await panel.getByRole("button", { name: "Tháng này còn bao nhiêu học viên chưa đóng học phí?" }).click();
      const answer = panel.getByTestId("ai-answer");
      await expect(answer).toContainText("chưa đóng đủ học phí", { timeout: 30_000 });
      await expect(answer).toContainText("HV102 Học viên Mẫu Khang: 600.000 đ");
      await expect(answer).toContainText("Đã tra: Tình hình học phí");
      await expect(panel.getByTestId("ai-quota")).toHaveText("Còn 99/100 câu hỏi hôm nay");
      await shot(page, "42-hoi-accedu");

      // Yêu cầu gửi Claude: model, dự phòng khi bị từ chối, effort, bộ tool kế toán; không lộ số điện thoại phụ huynh
      expect(mock.calls).toHaveLength(2);
      const [first, second] = mock.calls;
      expect(first!.headers["anthropic-beta"]).toContain("server-side-fallback-2026-07-01");
      expect(first!.body).toMatchObject({ model: "claude-opus-5-5", fallbacks: "default", output_config: { effort: "medium" }, stream: true });
      expect(first!.body.tools!.map((t) => t.name)).toContain("tuition_status");
      expect(JSON.stringify(second!.body.messages)).not.toMatch(/guardian_phone/);

      // Thông tin đơn vị: hạn mức và số câu hôm nay
      await page.goto(`/${slug}/system/company`);
      await expect(page.getByTestId("ai-today")).toHaveText("Đã hỏi 1 / 100 câu");
    } finally {
      await mock.close();
      clearAi();
    }
  });
});

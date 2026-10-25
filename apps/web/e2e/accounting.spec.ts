import { execFileSync } from "node:child_process";
import { mkdtempSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { expect, test, type Page } from "@playwright/test";
import readXlsxFile from "read-excel-file/node";
import writeXlsxFile from "write-excel-file/node";

const SHOTS = process.env.E2E_SHOTS;
const stamp = Date.now().toString(36);
const email = `chu-${stamp}@duongsinh.test`;
const tempPassword = "TamThoi2026";
const password = "VuiTriTue@2026";
const slug = `ds-${stamp}`;
const staffEmail = `ketoan-${stamp}@duongsinh.test`;

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
});

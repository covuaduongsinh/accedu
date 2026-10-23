import { expect, test, type Page } from "@playwright/test";

const SHOTS = process.env.E2E_SHOTS;
const stamp = Date.now().toString(36);
const email = `ketoan-${stamp}@duongsinh.test`;
const password = "VuiTriTue@2026";
const slug = `ds-${stamp}`;

async function shot(page: Page, name: string) {
  if (SHOTS) await page.screenshot({ path: `${SHOTS}/${name}.png`, fullPage: false });
}

async function signIn(page: Page) {
  await page.goto("/login");
  await page.getByLabel("Email").fill(email);
  await page.getByLabel("Mật khẩu").fill(password);
  await page.getByRole("button", { name: "Đăng nhập" }).click();
  await expect(page.getByText("Chọn đơn vị làm việc")).toBeVisible();
}

test.describe.serial("Luồng kế toán cơ bản", () => {
  test("đăng ký, tạo đơn vị với hệ thống tài khoản TT133", async ({ page }) => {
    await page.goto("/login");
    await shot(page, "01-dang-nhap");
    await page.getByRole("button", { name: /Chưa có tài khoản/ }).click();
    await page.getByLabel("Họ và tên").fill("Kế toán Dương Sinh");
    await page.getByLabel("Email").fill(email);
    await page.getByLabel("Mật khẩu").fill(password);
    await page.getByRole("button", { name: "Đăng ký" }).click();
    await expect(page.getByText("Chọn đơn vị làm việc")).toBeVisible();

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
});

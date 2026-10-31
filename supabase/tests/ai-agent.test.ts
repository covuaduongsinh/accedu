import { describe, expect, it } from "vitest";
import {
  AI_MODEL,
  MAX_ROWS,
  MAX_TOOL_ROUNDS,
  REFUSAL_ANSWER,
  TOO_MANY_ROUNDS_ANSWER,
  askAccEdu,
  echoContent,
  estimateCost,
  limitRows,
  toolsFor,
  type AiDataSource,
  type ClaudeClient,
  type ClaudeResponse,
  type ContentBlock,
} from "../functions/_shared/ai-agent.ts";

const TODAY = "2026-10-30";
const TENANT = "00000000-0000-4000-8000-000000000001";

const usage = { input_tokens: 1000, output_tokens: 200, cache_read_input_tokens: 3000, cache_creation_input_tokens: 500 };
const reply = (content: ContentBlock[], stop_reason: string): ClaudeResponse => ({ model: AI_MODEL, content, stop_reason, usage });
const toolUse = (id: string, name: string, input: Record<string, unknown> = {}): ContentBlock => ({ type: "tool_use", id, name, input });
const text = (t: string): ContentBlock => ({ type: "text", text: t });

/** Client giả: trả lần lượt các phản hồi đã soạn (hết thì lặp phản hồi cuối), ghi lại tham số mỗi lần gọi */
function fakeClient(script: ClaudeResponse[]) {
  const calls: Array<Record<string, unknown>> = [];
  const client: ClaudeClient = {
    async create(params) {
      calls.push(structuredClone(params));
      return script[Math.min(calls.length - 1, script.length - 1)]!;
    },
  };
  return { client, calls };
}

/** Nguồn dữ liệu giả: mỗi RPC một hàm; ghi lại các lần gọi */
function fakeDb(handlers: Record<string, (args: Record<string, unknown>) => unknown>, tables: Record<string, Array<Record<string, unknown>>> = {}) {
  const calls: Array<{ fn: string; args: Record<string, unknown> }> = [];
  const db: AiDataSource = {
    async rpc(fn, args) {
      calls.push({ fn, args });
      const h = handlers[fn];
      if (!h) throw new Error(`Không có RPC ${fn}`);
      return h(args);
    },
    async select(table) {
      calls.push({ fn: `select:${table}`, args: {} });
      return tables[table] ?? [];
    },
  };
  return { db, calls };
}

const tuitionRows = [
  { bill_id: "b1", class_code: "TOT-K15", class_name: "Lớp Tốt K15", billing: "monthly", student_code: "HV101", student_name: "Học viên A", guardian_phone: "0900000001", period_start: "2026-10-01", amount: 600000, paid: 600000, remaining: 0, invoice_number: "DV0001", invoice_status: "posted" },
  { bill_id: "b2", class_code: "TOT-K15", class_name: "Lớp Tốt K15", billing: "monthly", student_code: "HV102", student_name: "Học viên B", guardian_phone: "0900000002", period_start: "2026-10-01", amount: 600000, paid: 0, remaining: 600000, invoice_number: "DV0002", invoice_status: "posted" },
  { bill_id: "b3", class_code: "MA-K3", class_name: "Lớp Mã K3", billing: "course", student_code: "HV103", student_name: "Học viên C", period_start: "2026-10-05", sessions: 12, amount: "2400000.00", paid: "400000.00", remaining: "2000000.00", invoice_number: "DV0003", invoice_status: "posted" },
  { bill_id: "b4", class_code: "MA-K3", class_name: "Lớp Mã K3", billing: "course", student_code: "HV104", student_name: "Học viên D", period_start: "2026-10-05", sessions: 12, amount: 2400000, paid: 0, remaining: 2400000, invoice_number: "DV0004", invoice_status: "cancelled" },
];

describe("Hỏi AccEdu: vòng lặp tool use", () => {
  it("gọi tool báo cáo bằng quyền người hỏi rồi trả lời; tham số Claude đúng chuẩn", async () => {
    const { client, calls } = fakeClient([
      reply([{ type: "thinking", thinking: "", signature: "sig" }, toolUse("t1", "tuition_status", { month: "2026-10", unpaid_only: true })], "tool_use"),
      reply([text("Tháng 10/2026 còn 2 học viên chưa đóng học phí, tổng 2.600.000 đ.\nNguồn: Tình hình học phí, tháng 10/2026")], "end_turn"),
    ]);
    const { db, calls: dbCalls } = fakeDb({ rpt_tuition_status: () => tuitionRows });
    const r = await askAccEdu({ client, db, tenantId: TENANT, role: "accountant", question: "Tháng này ai chưa đóng học phí?", today: TODAY });

    expect(r.status).toBe("ok");
    expect(r.answer).toContain("2.600.000 đ");
    expect(r.tools).toEqual(["Tình hình học phí"]);
    expect(r.rounds).toBe(1);
    expect(r.usage).toEqual({ input_tokens: 2000, output_tokens: 400, cache_read_tokens: 6000, cache_write_tokens: 1000 });
    expect(r.cost_usd).toBe(estimateCost(r.usage));
    expect(r.cost_usd).toBeCloseTo((2000 * 4 + 400 * 20 + 1000 * 5 + 6000 * 0.2) / 1e6, 6);

    expect(dbCalls).toEqual([{ fn: "rpt_tuition_status", args: { p_tenant: TENANT, p_as_of: TODAY, p_class: null, p_month: "2026-10-01" } }]);

    const first = calls[0]!;
    expect(first).toMatchObject({
      model: "claude-opus-5-5",
      max_tokens: 16000,
      betas: ["server-side-fallback-2026-07-01"],
      fallbacks: "default",
      output_config: { effort: "medium" },
      tool_choice: { type: "auto" },
      cache_control: { type: "ephemeral" },
    });
    expect(first).not.toHaveProperty("thinking");
    expect((first.system as Array<Record<string, unknown>>)[0]).toMatchObject({ type: "text", cache_control: { type: "ephemeral" } });
    const firstMessages = first.messages as Array<{ role: string; content: string }>;
    expect(firstMessages[0]!.content).toContain("Hôm nay: 30/10/2026 (2026-10-30). Người hỏi: Kế toán.");

    // Lượt 2: gửi lại nguyên nội dung trả lời (kể cả thinking) + tool_result
    const msgs = calls[1]!.messages as Array<{ role: string; content: unknown }>;
    expect(msgs).toHaveLength(3);
    expect(msgs[1]!.role).toBe("assistant");
    expect((msgs[1]!.content as ContentBlock[]).map((b) => b.type)).toEqual(["thinking", "tool_use"]);
    const result = (msgs[2]!.content as Array<Record<string, unknown>>)[0]!;
    expect(result).toMatchObject({ type: "tool_result", tool_use_id: "t1" });
    expect(result.is_error).toBeUndefined();
    const out = JSON.parse(String(result.content));
    // Bỏ phiếu đã hủy, chỉ phiếu còn nợ; tổng cộng tính sẵn; không gửi số điện thoại / id
    expect(out.summary).toEqual({ bills: 2, amount: 3000000, paid: 400000, remaining: 2600000, students_owing: 2 });
    expect(out.rows.map((x: Record<string, unknown>) => x.student_code)).toEqual(["HV102", "HV103"]);
    expect(out.rows[1]).toMatchObject({ amount: 2400000, remaining: 2000000 });
    expect(JSON.stringify(out)).not.toMatch(/guardian_phone|bill_id|0900000002/);
  });

  it(`dừng sau ${MAX_TOOL_ROUNDS} lượt tra cứu`, async () => {
    const { client, calls } = fakeClient([reply([toolUse("t", "list_classes")], "tool_use")]);
    const { db, calls: dbCalls } = fakeDb({ my_classes: () => [{ class_id: "c1", code: "TOT-K15", name: "Lớp Tốt K15", students: 12 }] });
    const r = await askAccEdu({ client, db, tenantId: TENANT, role: "owner", question: "Liệt kê lớp", today: TODAY });
    expect(dbCalls).toHaveLength(MAX_TOOL_ROUNDS);
    // 8 lượt chạy tool + 1 lượt báo hết lượt + 1 lượt model vẫn đòi tool → dừng
    expect(calls).toHaveLength(MAX_TOOL_ROUNDS + 2);
    const lastResults = (calls.at(-1)!.messages as Array<{ content: unknown }>).at(-1)!.content as Array<Record<string, unknown>>;
    expect(lastResults[0]).toMatchObject({ is_error: true });
    expect(String(lastResults[0]!.content)).toContain("hết lượt");
    expect(r.answer).toBe(TOO_MANY_ROUNDS_ANSWER);
    expect(r.tools).toEqual(["Danh sách lớp"]);
  });

  it("refusal: trả lời từ chối lịch sự, không đọc nội dung", async () => {
    const { client } = fakeClient([reply([], "refusal")]);
    const { db } = fakeDb({});
    const r = await askAccEdu({ client, db, tenantId: TENANT, role: "accountant", question: "?", today: TODAY });
    expect(r).toMatchObject({ status: "refused", answer: REFUSAL_ANSWER, tools: [] });
  });

  it("tool lỗi (thiếu quyền, tham số sai) → tool_result is_error để AI giải thích", async () => {
    const { client, calls } = fakeClient([
      reply([toolUse("a", "coach_pay_preview", { month: "2026-10" }), toolUse("b", "trial_balance", { from: "01/10/2026" })], "tool_use"),
      reply([text("Bạn chưa có quyền xem lương HLV.")], "end_turn"),
    ]);
    const { db } = fakeDb({
      generate_coach_pay: () => {
        throw new Error("Bạn không có quyền lập lương HLV");
      },
    });
    const r = await askAccEdu({ client, db, tenantId: TENANT, role: "viewer", question: "Lương HLV tháng 10?", today: TODAY });
    const results = (calls[1]!.messages as Array<{ content: unknown }>)[2]!.content as Array<Record<string, unknown>>;
    expect(results).toEqual([
      { type: "tool_result", tool_use_id: "a", is_error: true, content: "Bạn không có quyền lập lương HLV" },
      { type: "tool_result", tool_use_id: "b", is_error: true, content: "Ngày không hợp lệ: 01/10/2026 (cần dạng YYYY-MM-DD)" },
    ]);
    expect(r.tools).toEqual([]);
    expect(r.answer).toContain("chưa có quyền");
  });

  it("HLV chỉ có bộ tool hẹp; gọi tool kế toán bị từ chối", async () => {
    expect(toolsFor("coach").map((t) => t.name)).toEqual(["attendance_month", "my_teaching", "list_classes"]);
    expect(toolsFor("accountant").map((t) => t.name)).not.toContain("my_teaching");
    expect(toolsFor("viewer").map((t) => t.name)).toContain("trial_balance");

    const { client, calls } = fakeClient([reply([toolUse("x", "trial_balance")], "tool_use"), reply([text("Không xem được.")], "end_turn")]);
    const { db, calls: dbCalls } = fakeDb({});
    await askAccEdu({ client, db, tenantId: TENANT, role: "coach", question: "Doanh thu tháng này?", today: TODAY });
    expect((calls[0]!.tools as Array<{ name: string }>).map((t) => t.name)).toEqual(["attendance_month", "my_teaching", "list_classes"]);
    expect((calls[0]!.messages as Array<{ content: string }>)[0]!.content).toContain("Người hỏi: Huấn luyện viên.");
    const results = (calls[1]!.messages as Array<{ content: unknown }>)[2]!.content as Array<Record<string, unknown>>;
    expect(results[0]).toMatchObject({ is_error: true, content: "Công cụ này không dùng được với vai trò của người hỏi." });
    expect(dbCalls).toHaveLength(0);
  });

  it("điểm danh tháng: tìm lớp theo mã qua my_classes, tổng hợp có mặt / vắng / phép", async () => {
    const { client, calls } = fakeClient([reply([toolUse("t", "attendance_month", { class_code: "tot-k15" })], "tool_use"), reply([text("ok")], "end_turn")]);
    const { db, calls: dbCalls } = fakeDb({
      my_classes: () => [{ class_id: "c1", code: "TOT-K15", name: "Lớp Tốt K15" }],
      rpt_attendance: () => [
        { student_code: "HV101", student_name: "A", held_on: "2026-10-03", status: "present", remaining: null },
        { student_code: "HV101", student_name: "A", held_on: "2026-10-10", status: "absent", remaining: null },
        { student_code: "HV102", student_name: "B", held_on: "2026-10-03", status: "excused", remaining: 4 },
        { student_code: "HV102", student_name: "B", held_on: "2026-10-10", status: "present", remaining: 4 },
      ],
    });
    await askAccEdu({ client, db, tenantId: TENANT, role: "coach", question: "Điểm danh lớp Tốt K15", today: TODAY });
    expect(dbCalls[1]).toEqual({ fn: "rpt_attendance", args: { p_tenant: TENANT, p_class: "c1", p_month: "2026-10-01" } });
    const out = JSON.parse(String(((calls[1]!.messages as Array<{ content: unknown }>)[2]!.content as Array<Record<string, unknown>>)[0]!.content));
    expect(out).toMatchObject({ class_code: "TOT-K15", month: "2026-10", sessions: ["2026-10-03", "2026-10-10"] });
    expect(out.rows).toEqual([
      { student_code: "HV101", student_name: "A", present: 1, absent: 1, excused: 0 },
      { student_code: "HV102", student_name: "B", present: 1, absent: 0, excused: 1, remaining: 4 },
    ]);
  });

  it("cắt gọn kết quả: tối đa 200 dòng, bỏ tài khoản không có số liệu", async () => {
    const many = Array.from({ length: 250 }, (_, i) => ({ code: `HV${i}` }));
    expect(limitRows(many)).toMatchObject({ total: 250, truncated: true });
    expect(limitRows(many).rows).toHaveLength(MAX_ROWS);

    const { client, calls } = fakeClient([reply([toolUse("t", "trial_balance", { max_level: 1 })], "tool_use"), reply([text("ok")], "end_turn")]);
    const { db, calls: dbCalls } = fakeDb({
      rpt_trial_balance: () => [
        { account_code: "111", account_name: "Tiền mặt", level: 1, opening_debit: 0, opening_credit: 0, debit: 5000000, credit: 1000000, closing_debit: 4000000, closing_credit: 0 },
        { account_code: "112", account_name: "Tiền gửi", level: 1, opening_debit: 0, opening_credit: 0, debit: 0, credit: 0, closing_debit: 0, closing_credit: 0 },
      ],
    });
    await askAccEdu({ client, db, tenantId: TENANT, role: "chief_accountant", question: "Tiền mặt?", today: TODAY });
    expect(dbCalls[0]!.args).toEqual({ p_tenant: TENANT, p_from: "2026-10-01", p_to: TODAY, p_max_level: 1 });
    const out = JSON.parse(String(((calls[1]!.messages as Array<{ content: unknown }>)[2]!.content as Array<Record<string, unknown>>)[0]!.content));
    expect(out).toEqual({
      total: 1,
      truncated: false,
      rows: [{ account_code: "111", account_name: "Tiền mặt", level: 1, opening_debit: 0, opening_credit: 0, debit: 5000000, credit: 1000000, closing_debit: 4000000, closing_credit: 0 }],
    });
  });

  it("danh sách học viên không gửi số điện thoại / email; lọc theo cấp và từ khóa", async () => {
    const { client, calls } = fakeClient([reply([toolUse("t", "list_students", { level: "ma" })], "tool_use"), reply([text("ok")], "end_turn")]);
    const { db } = fakeDb(
      {},
      {
        partners: [
          { code: "HV2", name: "Bình", is_active: true, phone: "0901", student_profiles: { level: "ma", school: "TH Mẫu", joined_on: "2026-09-01" } },
          { code: "HV1", name: "An", is_active: true, student_profiles: [{ level: "tot" }] },
          { code: "HV3", name: "Cúc", is_active: false, student_profiles: { level: "ma" } },
        ],
      },
    );
    await askAccEdu({ client, db, tenantId: TENANT, role: "accountant", question: "Học viên cấp Mã", today: TODAY });
    const out = JSON.parse(String(((calls[1]!.messages as Array<{ content: unknown }>)[2]!.content as Array<Record<string, unknown>>)[0]!.content));
    expect(out.rows).toEqual([{ code: "HV2", name: "Bình", is_active: true, level: "ma", school: "TH Mẫu", joined_on: "2026-09-01" }]);
  });

  it("đối chiếu sao kê: số dư sổ / sao kê, giao dịch chưa khớp trong tháng kèm gợi ý; chỉ TK 112", async () => {
    const { client, calls } = fakeClient([
      reply([toolUse("t", "bank_reconciliation", { as_of: "2026-10-31" }), toolUse("u", "bank_reconciliation", { account: "1111" })], "tool_use"),
      reply([text("ok")], "end_turn"),
    ]);
    const { db, calls: dbCalls } = fakeDb({
      rpt_bank_reconciliation: () => ({ account: "1121", as_of: "2026-10-31", book_balance: 7414000, statement_balance: 8664000, difference: 1250000, unmatched_count: 1, unmatched_in: 900000, unmatched_out: 0, book_only: [{ voucher_id: "v", number: "BN0001", posting_date: "2026-10-20", amount: -300000, description: "VPP" }] }),
      rpt_bank_lines: () => [
        { id: "a", txn_date: "2026-10-05", ref: "FT1", description: "HP HV101", amount_in: 1200000, amount_out: 0, status: "matched", suggestion: null },
        { id: "b", txn_date: "2026-10-06", ref: "FT3", description: "HPHV103", amount_in: 900000, amount_out: 0, status: "suggested", suggestion: { kind: "tuition", sure: false, partner_code: "HV103", partner_id: "x", allocations: [] } },
        { id: "c", txn_date: "2026-10-31", ref: "X9", description: "CHUYEN NHAM", amount_in: 50000, amount_out: 0, status: "ignored", suggestion: null },
      ],
    });
    await askAccEdu({ client, db, tenantId: TENANT, role: "accountant", question: "Sao kê tháng 10 còn gì chưa khớp?", today: TODAY });
    expect(dbCalls).toEqual([
      { fn: "rpt_bank_reconciliation", args: { p_tenant: TENANT, p_account: "1121", p_as_of: "2026-10-31" } },
      { fn: "rpt_bank_lines", args: { p_tenant: TENANT, p_account: "1121", p_from: "2026-10-01", p_to: "2026-10-31" } },
    ]);
    const results = (calls[1]!.messages as Array<{ content: unknown }>)[2]!.content as Array<Record<string, unknown>>;
    const out = JSON.parse(String(results[0]!.content));
    expect(out).toMatchObject({ book_balance: 7414000, statement_balance: 8664000, difference: 1250000, unmatched_count: 1, book_only: [{ number: "BN0001", amount: -300000 }] });
    expect(out.unmatched_lines.rows).toEqual([
      { txn_date: "2026-10-06", ref: "FT3", description: "HPHV103", amount_in: 900000, amount_out: 0, status: "suggested", suggestion: { kind: "tuition", sure: false, partner_code: "HV103" } },
    ]);
    expect(results[1]).toMatchObject({ is_error: true, content: "Tài khoản phải là TK tiền gửi ngân hàng (đầu 112)" });
    expect(toolsFor("coach").map((t) => t.name)).not.toContain("bank_reconciliation");
  });

  it("sổ TSCĐ / CCDC: tổng giá trị còn lại, mức tháng tới (không tính tài sản đã ghi giảm)", async () => {
    const { client, calls } = fakeClient([reply([toolUse("t", "fixed_assets", {}), toolUse("u", "fixed_assets", { kind: "tool", as_of: "2026-10-31" })], "tool_use"), reply([text("ok")], "end_turn")]);
    const asset = (code: string, status: string, cost: number, accumulated: number, next: number) => ({
      id: code,
      code,
      name: `Tài sản ${code}`,
      start_on: "2026-01-01",
      months: 36,
      cost,
      accumulated,
      remaining: cost - accumulated,
      months_left: 10,
      next_amount: next,
      status,
      asset_account: "2111",
      note: "nội bộ",
    });
    const { db, calls: dbCalls } = fakeDb({
      rpt_assets: (args) =>
        args.p_kind === "fixed" ? [asset("MAYCHIEU", "active", 36_000_000, 1_548_387, 1_000_000), asset("CU", "disposed", 10_000_000, 10_000_000, 0)] : [asset("DONGHO", "active", 3_000_000, 250_000, 250_000)],
    });
    await askAccEdu({ client, db, tenantId: TENANT, role: "accountant", question: "TSCĐ còn lại bao nhiêu?", today: TODAY });
    expect(dbCalls).toEqual([
      { fn: "rpt_assets", args: { p_tenant: TENANT, p_kind: "fixed", p_as_of: TODAY } },
      { fn: "rpt_assets", args: { p_tenant: TENANT, p_kind: "tool", p_as_of: "2026-10-31" } },
    ]);
    const results = (calls[1]!.messages as Array<{ content: unknown }>)[2]!.content as Array<Record<string, unknown>>;
    const fixed = JSON.parse(String(results[0]!.content));
    expect(fixed).toMatchObject({ kind: "fixed", count: 1, cost: 36_000_000, accumulated: 1_548_387, remaining: 34_451_613, next_month_total: 1_000_000 });
    expect(fixed.assets.rows).toHaveLength(2);
    expect(fixed.assets.rows[0]).not.toHaveProperty("note");
    expect(JSON.parse(String(results[1]!.content))).toMatchObject({ kind: "tool", count: 1, remaining: 2_750_000 });
    expect(toolsFor("coach").map((t) => t.name)).not.toContain("fixed_assets");
  });

  it("việc cuối tháng: trạng thái từng bước và kết quả kết chuyển của tháng", async () => {
    const { client, calls } = fakeClient([reply([toolUse("t", "period_checklist", { month: "2026-10-15" })], "tool_use"), reply([text("ok")], "end_turn")]);
    const { db, calls: dbCalls } = fakeDb({
      rpt_period_checklist: () => ({
        month: "2026-10-01",
        pending: 1,
        items: [
          { key: "drafts", label: "Ghi sổ các chứng từ trong tháng", status: "done", detail: "Mọi chứng từ trong tháng đã ghi sổ", count: 0, path: "general/journal" },
          { key: "lock", label: "Khóa sổ", status: "pending", detail: "Chưa khóa sổ", count: 0, path: "system/periods" },
        ],
      }),
      rpt_period_closings: () => [
        { kind: "pl", month: "2026-10-01", number: "PK0042", voucher_id: "v", revenue: 49200000, expense: 28500000, profit: 20700000 },
        { kind: "pl", month: "2026-09-01", number: "PK0030", voucher_id: "w", revenue: 1, expense: 1, profit: 0 },
      ],
    });
    await askAccEdu({ client, db, tenantId: TENANT, role: "accountant", question: "Tháng 10 còn việc gì trước khi khóa sổ?", today: TODAY });
    expect(dbCalls.map((c) => c.fn)).toEqual(["rpt_period_checklist", "rpt_period_closings"]);
    expect(dbCalls[0]!.args).toEqual({ p_tenant: TENANT, p_month: "2026-10-01" });
    const out = JSON.parse(String(((calls[1]!.messages as Array<{ content: unknown }>)[2]!.content as Array<Record<string, unknown>>)[0]!.content));
    expect(out).toEqual({
      month: "2026-10-01",
      pending: 1,
      items: [
        { label: "Ghi sổ các chứng từ trong tháng", status: "done", detail: "Mọi chứng từ trong tháng đã ghi sổ" },
        { label: "Khóa sổ", status: "pending", detail: "Chưa khóa sổ" },
      ],
      closing: { number: "PK0042", revenue: 49200000, expense: 28500000, profit: 20700000 },
    });
    expect(toolsFor("coach").map((t) => t.name)).not.toContain("period_checklist");
  });

  it("max_tokens: báo câu trả lời bị cắt", async () => {
    const { client } = fakeClient([reply([text("Danh sách rất dài…")], "max_tokens")]);
    const r = await askAccEdu({ client, db: fakeDb({}).db, tenantId: TENANT, role: "owner", question: "?", today: TODAY });
    expect(r.answer).toMatch(/^Danh sách rất dài…\n\n\(Câu trả lời quá dài nên bị cắt/);
  });

  it("model dự phòng tiếp quản giữa chừng: bỏ thinking / tool_use trước khối fallback khi gửi lại và khi chạy tool", async () => {
    const content: ContentBlock[] = [
      { type: "thinking", thinking: "", signature: "a" },
      text("Để tra "),
      toolUse("old", "list_classes"),
      { type: "fallback", from: { model: AI_MODEL }, to: { model: "claude-opus-4-8" } },
      toolUse("new", "list_classes"),
    ];
    expect(echoContent(content).map((b) => b.type)).toEqual(["text", "fallback", "tool_use"]);
    expect(echoContent([text("a")])).toEqual([text("a")]);

    const { client, calls } = fakeClient([{ ...reply(content, "tool_use"), model: "claude-opus-4-8" }, reply([text("Xong")], "end_turn")]);
    const { db, calls: dbCalls } = fakeDb({ my_classes: () => [] });
    const r = await askAccEdu({ client, db, tenantId: TENANT, role: "owner", question: "Lớp?", today: TODAY });
    expect(dbCalls).toHaveLength(1);
    const results = (calls[1]!.messages as Array<{ content: unknown }>)[2]!.content as Array<Record<string, unknown>>;
    expect(results.map((x) => x.tool_use_id)).toEqual(["new"]);
    expect(r.answer).toBe("Xong");
  });
});

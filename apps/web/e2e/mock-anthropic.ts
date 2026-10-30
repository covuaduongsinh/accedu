// Máy chủ Claude API giả cho E2E "Hỏi AccEdu": trả lời /v1/messages theo dạng SSE như API thật. Lượt đầu gọi tool
// tuition_status (chỉ phiếu còn nợ); lượt sau soạn câu trả lời từ đúng kết quả tool mà Edge Function gửi lên — chứng minh
// tool đã chạy bằng quyền người hỏi trên dữ liệu thật của đơn vị. Không gọi API thật trong CI.
import { createServer, type IncomingHttpHeaders, type Server, type ServerResponse } from "node:http";

type Block = { type: string; [key: string]: unknown };
export interface MockCall {
  headers: IncomingHttpHeaders;
  body: { model: string; stream?: boolean; tools?: Array<{ name: string }>; messages: Array<{ role: string; content: unknown }>; [key: string]: unknown };
}

const vnd = (n: number) => new Intl.NumberFormat("vi-VN").format(n);

function events(res: ServerResponse, model: string, content: Block[], stopReason: string) {
  const send = (event: string, data: unknown) => res.write(`event: ${event}\ndata: ${JSON.stringify(data)}\n\n`);
  res.writeHead(200, { "content-type": "text/event-stream", "cache-control": "no-cache" });
  send("message_start", {
    type: "message_start",
    message: { id: `msg_e2e_${Date.now()}`, type: "message", role: "assistant", model, content: [], stop_reason: null, stop_sequence: null, usage: { input_tokens: 1200, output_tokens: 1, cache_read_input_tokens: 800, cache_creation_input_tokens: 0 } },
  });
  content.forEach((b, index) => {
    if (b.type === "text") {
      send("content_block_start", { type: "content_block_start", index, content_block: { type: "text", text: "" } });
      send("content_block_delta", { type: "content_block_delta", index, delta: { type: "text_delta", text: b.text } });
    } else {
      send("content_block_start", { type: "content_block_start", index, content_block: { type: "tool_use", id: b.id, name: b.name, input: {} } });
      send("content_block_delta", { type: "content_block_delta", index, delta: { type: "input_json_delta", partial_json: JSON.stringify(b.input) } });
    }
    send("content_block_stop", { type: "content_block_stop", index });
  });
  send("message_delta", { type: "message_delta", delta: { stop_reason: stopReason, stop_sequence: null }, usage: { output_tokens: 150 } });
  send("message_stop", { type: "message_stop" });
  res.end();
}

/** Câu trả lời soạn từ kết quả tool tình hình học phí */
function answerFrom(result: string): string {
  const out = JSON.parse(result) as { summary?: { students_owing: number; remaining: number }; rows?: Array<{ student_code: string; student_name: string; remaining: number }> };
  if (!out.summary) return "Chưa có số liệu học phí.";
  const lines = (out.rows ?? []).slice(0, 10).map((r) => `- ${r.student_code} ${r.student_name}: ${vnd(r.remaining)} đ`);
  return [`Hiện có **${out.summary.students_owing} học viên** chưa đóng đủ học phí, tổng còn phải thu ${vnd(out.summary.remaining)} đ.`, ...lines, "Nguồn: Tình hình học phí, mọi kỳ"].join("\n");
}

export async function startMockAnthropic(port: number): Promise<{ calls: MockCall[]; close: () => Promise<void> }> {
  const calls: MockCall[] = [];
  const server: Server = createServer((req, res) => {
    let raw = "";
    req.on("data", (c: Buffer) => (raw += c.toString("utf8")));
    req.on("end", () => {
      if (req.method !== "POST" || !req.url?.startsWith("/v1/messages")) {
        res.writeHead(404).end();
        return;
      }
      const body = JSON.parse(raw) as MockCall["body"];
      calls.push({ headers: req.headers, body });
      const last = body.messages.at(-1);
      const results = Array.isArray(last?.content) ? (last.content as Block[]).filter((b) => b.type === "tool_result") : [];
      if (results.length) {
        events(res, body.model, [{ type: "text", text: answerFrom(String(results[0]!.content)) }], "end_turn");
      } else {
        events(res, body.model, [{ type: "tool_use", id: "toolu_e2e_1", name: "tuition_status", input: { unpaid_only: true } }], "tool_use");
      }
    });
  });
  await new Promise<void>((resolve) => server.listen(port, "0.0.0.0", resolve));
  return { calls, close: () => new Promise<void>((resolve) => server.close(() => resolve())) };
}

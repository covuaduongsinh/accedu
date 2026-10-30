import { api, friendlyError, qk, type AiAnswer } from "@accedu/api";
import { useAiHistory, useAiQuota, useDb } from "@accedu/api/react";
import { formatDateVN } from "@accedu/core";
import { useMutation, useQueryClient } from "@tanstack/react-query";
import { History, Send, Sparkles, X } from "lucide-react";
import { Fragment, useEffect, useRef, useState, type ReactNode } from "react";
import { Button } from "../../components/ui";
import { useSession } from "../../lib/session";
import { isCoach, useTenantCtx } from "../../lib/tenant";

const MAX_QUESTION = 1000;

const STAFF_SUGGESTIONS = [
  "Tháng này còn bao nhiêu học viên chưa đóng học phí?",
  "Doanh thu học phí tháng này theo từng lớp?",
  "Lớp nào có học viên sắp hết khóa (còn 2 buổi trở xuống)?",
  "Tiền mặt và tiền gửi ngân hàng hiện còn bao nhiêu?",
];
const COACH_SUGGESTIONS = [
  "Tháng này tôi đã dạy bao nhiêu buổi?",
  "Điểm danh tháng này các lớp của tôi thế nào?",
  "Học viên nào vắng nhiều nhất tháng này?",
];

interface Turn {
  question: string;
  answer?: AiAnswer;
  error?: string;
}

/** Chữ đậm **…** trong câu trả lời */
function inline(text: string): ReactNode {
  return text.split(/(\*\*[^*]+\*\*)/g).map((part, i) =>
    part.startsWith("**") && part.endsWith("**") ? <strong key={i}>{part.slice(2, -2)}</strong> : <Fragment key={i}>{part}</Fragment>,
  );
}

/** Câu trả lời: đoạn văn, gạch đầu dòng "- ", dòng "Nguồn:" in nghiêng */
export function AnswerText({ text }: { text: string }) {
  const blocks: ReactNode[] = [];
  let list: string[] = [];
  const flush = () => {
    if (list.length) {
      blocks.push(
        <ul key={`l${blocks.length}`} className="ml-4 list-disc space-y-0.5">
          {list.map((li, i) => (
            <li key={i}>{inline(li)}</li>
          ))}
        </ul>,
      );
      list = [];
    }
  };
  for (const raw of text.split("\n")) {
    const line = raw.trimEnd();
    if (/^\s*[-•*]\s+/.test(line)) {
      list.push(line.replace(/^\s*[-•*]\s+/, ""));
      continue;
    }
    flush();
    if (!line.trim()) continue;
    blocks.push(
      <p key={`p${blocks.length}`} className={line.startsWith("Nguồn:") ? "text-xs italic text-muted" : ""}>
        {inline(line)}
      </p>,
    );
  }
  flush();
  return <div className="space-y-1.5 text-sm leading-relaxed">{blocks}</div>;
}

function Elapsed() {
  const [s, setS] = useState(0);
  useEffect(() => {
    const id = setInterval(() => setS((x) => x + 1), 1000);
    return () => clearInterval(id);
  }, []);
  return <span>{s} giây</span>;
}

/** Khung "Hỏi AccEdu" bên phải màn hình: hỏi số liệu bằng tiếng Việt, AI tra các báo cáo theo quyền của người hỏi */
export function AskPanel({ onClose }: { onClose: () => void }) {
  const { tenant, role } = useTenantCtx();
  const db = useDb();
  const qc = useQueryClient();
  const session = useSession();
  const quota = useAiQuota(tenant.id);
  const history = useAiHistory(tenant.id, { userId: session?.user.id ?? null, limit: 20 });
  const [question, setQuestion] = useState("");
  const [turns, setTurns] = useState<Turn[]>([]);
  const [showHistory, setShowHistory] = useState(false);
  const bottom = useRef<HTMLDivElement>(null);
  const suggestions = isCoach(role) ? COACH_SUGGESTIONS : STAFF_SUGGESTIONS;

  const ask = useMutation({
    mutationFn: (q: string) => api.askAi(db, tenant.id, q),
    onMutate: (q) => setTurns((t) => [...t, { question: q }]),
    onSuccess: (answer) => setTurns((t) => t.map((x, i) => (i === t.length - 1 ? { ...x, answer } : x))),
    onError: (e) => setTurns((t) => t.map((x, i) => (i === t.length - 1 ? { ...x, error: friendlyError(e) } : x))),
    onSettled: () => void qc.invalidateQueries({ queryKey: qk.ai(tenant.id) }),
  });

  useEffect(() => {
    const onKey = (e: KeyboardEvent) => e.key === "Escape" && onClose();
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [onClose]);
  useEffect(() => bottom.current?.scrollIntoView({ behavior: "smooth" }), [turns]);

  function submit(q = question) {
    const text = q.trim();
    if (!text || ask.isPending) return;
    setQuestion("");
    setShowHistory(false);
    ask.mutate(text);
  }

  const q = quota.data;
  return (
    <aside
      role="dialog"
      aria-label="Hỏi AccEdu"
      className="no-print fixed inset-y-0 right-0 z-50 flex w-full max-w-md flex-col border-l border-line bg-white shadow-2xl"
    >
      <header className="bg-navy-500 px-4 py-2.5 text-white">
        <div className="flex items-center gap-2">
          <Sparkles size={16} className="text-gold-300" />
          <h2 className="text-sm font-semibold">Hỏi AccEdu</h2>
          <button
            type="button"
            className="ml-auto flex items-center gap-1 text-xs text-white/80 hover:text-white"
            onClick={() => setShowHistory((v) => !v)}
          >
            <History size={13} /> Lịch sử
          </button>
          <button type="button" aria-label="Đóng Hỏi AccEdu" className="text-white/80 hover:text-white" onClick={onClose}>
            <X size={16} />
          </button>
        </div>
        <p className="mt-0.5 text-[11px] text-navy-100" data-testid="ai-quota">
          {q ? (q.limit === 0 ? "Đơn vị đã tắt AI hỏi đáp" : `Còn ${q.remaining}/${q.limit} câu hỏi hôm nay`) : "Hỏi số liệu bằng tiếng Việt — AI tra các báo cáo bạn được xem"}
        </p>
      </header>
      <div className="h-1 bg-gold-500" />

      <div className="flex-1 space-y-4 overflow-y-auto p-4">
        {showHistory ? (
          <section>
            <h3 className="mb-2 text-xs font-semibold uppercase text-navy-700">Câu hỏi gần đây của bạn</h3>
            {history.data?.length ? (
              <ul className="space-y-2">
                {history.data.map((h) => (
                  <li key={h.id} className="rounded-md border border-line p-2">
                    <p className="text-xs text-muted">{formatDateVN(h.asked_on)}</p>
                    <p className="text-sm font-medium text-navy-700">{h.question}</p>
                    {h.status === "ok" && h.answer ? <AnswerText text={h.answer} /> : null}
                    {h.status === "pending" ? <p className="text-xs text-muted">Đang trả lời…</p> : null}
                    {h.status === "error" || h.status === "refused" ? <p className="text-xs text-danger">{h.error ?? h.answer}</p> : null}
                  </li>
                ))}
              </ul>
            ) : (
              <p className="text-sm text-muted">Chưa có câu hỏi nào.</p>
            )}
          </section>
        ) : turns.length === 0 ? (
          <section>
            <p className="mb-3 text-sm text-ink">
              Hỏi về học phí, lớp học, điểm danh, công nợ, doanh thu, tồn kho… AI chỉ đọc số liệu, không sửa chứng từ.
            </p>
            <div className="flex flex-col gap-2">
              {suggestions.map((s) => (
                <button
                  key={s}
                  type="button"
                  className="rounded-md border border-navy-100 bg-navy-50 px-3 py-2 text-left text-sm text-navy-700 hover:border-gold-400 hover:bg-gold-50"
                  onClick={() => submit(s)}
                >
                  {s}
                </button>
              ))}
            </div>
          </section>
        ) : (
          turns.map((t, i) => (
            <div key={i} className="space-y-2">
              <p className="ml-8 rounded-lg bg-navy-500 px-3 py-2 text-sm text-white">{t.question}</p>
              {t.answer ? (
                <div className="mr-4 rounded-lg border border-line bg-canvas px-3 py-2" data-testid="ai-answer">
                  {t.answer.status === "error" ? (
                    <p className="text-sm text-danger">{t.answer.error ?? "AI gặp lỗi, Thầy/Cô thử lại sau."}</p>
                  ) : (
                    <AnswerText text={t.answer.answer} />
                  )}
                  {t.answer.tools.length ? <p className="mt-2 text-[11px] text-muted">Đã tra: {t.answer.tools.join(", ")}</p> : null}
                </div>
              ) : t.error ? (
                <p className="mr-4 rounded-lg border border-red-200 bg-red-50 px-3 py-2 text-sm text-danger" data-testid="ai-error">
                  {t.error}
                </p>
              ) : (
                <p className="mr-4 flex items-center gap-2 rounded-lg border border-line bg-canvas px-3 py-2 text-sm text-muted">
                  <Sparkles size={14} className="animate-pulse text-gold-500" /> AI đang tra cứu số liệu… <Elapsed />
                </p>
              )}
            </div>
          ))
        )}
        <div ref={bottom} />
      </div>

      <form
        className="border-t border-line p-3"
        onSubmit={(e) => {
          e.preventDefault();
          submit();
        }}
      >
        <textarea
          aria-label="Câu hỏi cho AccEdu"
          value={question}
          maxLength={MAX_QUESTION}
          rows={2}
          placeholder="Ví dụ: Học viên nào còn nợ học phí tháng 10?"
          className="w-full resize-none rounded-md border border-line px-2.5 py-1.5 text-sm outline-none focus:border-navy-400 focus:ring-2 focus:ring-navy-100"
          onChange={(e) => setQuestion(e.target.value)}
          onKeyDown={(e) => {
            if (e.key === "Enter" && !e.shiftKey) {
              e.preventDefault();
              submit();
            }
          }}
        />
        <div className="mt-1.5 flex items-center justify-between">
          <span className="text-[11px] text-muted">Enter để gửi · Shift+Enter xuống dòng</span>
          <Button type="submit" icon={<Send size={14} />} disabled={!question.trim() || ask.isPending}>
            Hỏi
          </Button>
        </div>
      </form>
    </aside>
  );
}

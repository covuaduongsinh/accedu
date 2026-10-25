import { friendlyError, fromVoucherRow, type AccountRow, type PartnerRow, type VoucherRow, type VoucherWithLines } from "@accedu/api";
import { useAccounts, usePartners, useSaveVoucher, useVoucher } from "@accedu/api/react";
import { amountInWords, buildLedgerEntries, formatAmount, parseAmount, todayVN, type VoucherInput } from "@accedu/core";
import { Plus, Save, Send, Trash2 } from "lucide-react";
import { useId, useMemo, useState } from "react";
import { toast } from "sonner";
import { Badge, Button, Empty, Field, Input } from "../../components/ui";
import { platform } from "../../lib/supabase";
import { canPost, useTenantCtx } from "../../lib/tenant";
import { STATUS_BADGE, type VoucherUiConfig } from "./config";

interface LineDraft {
  key: string;
  account: string;
  debit: string;
  credit: string;
  amount: string;
  description: string;
  partnerCode: string;
}

interface HeaderDraft {
  issueDate: string;
  postingDate: string;
  number: string;
  partnerCode: string;
  contactName: string;
  address: string;
  description: string;
  headerAccount: string;
  originalDocuments: string;
}

let seq = 0;
const newLine = (): LineDraft => ({ key: `l${++seq}`, account: "", debit: "", credit: "", amount: "", description: "", partnerCode: "" });

interface Initial {
  header: HeaderDraft;
  lines: LineDraft[];
  version?: number;
  status?: VoucherRow["status"];
}

function blankInitial(cfg: VoucherUiConfig): Initial {
  const today = todayVN();
  return {
    header: {
      issueDate: today,
      postingDate: today,
      number: "",
      partnerCode: "",
      contactName: "",
      address: "",
      description: "",
      headerAccount: cfg.defaultHeaderAccount ?? "",
      originalDocuments: "",
    },
    lines: [newLine()],
  };
}

/** Chuyển chứng từ đã lưu thành trạng thái form */
function initialFromVoucher(row: VoucherWithLines, partners: PartnerRow[], cfg: VoucherUiConfig): Initial {
  const v = fromVoucherRow(row);
  const codeOf = (pid: string | null | undefined) => (pid && partners.find((p) => p.id === pid)?.code) || "";
  return {
    version: v.version,
    status: v.status,
    header: {
      issueDate: v.issueDate,
      postingDate: v.postingDate,
      number: v.number ?? "",
      partnerCode: codeOf(v.partnerId),
      contactName: v.contactName ?? "",
      address: v.address ?? "",
      description: v.description ?? "",
      headerAccount: v.headerAccount ?? "",
      originalDocuments: v.originalDocuments ?? "",
    },
    lines: v.lines.map((l) => {
      const isDebit = cfg.style === "single" ? !!l.debitAccount : cfg.headerSide === "credit";
      const account = cfg.style === "pair" ? (cfg.headerSide === "debit" ? l.creditAccount : l.debitAccount) : (l.debitAccount ?? l.creditAccount);
      return {
        key: `l${++seq}`,
        account: account ?? "",
        debit: cfg.style === "single" && isDebit ? formatAmount(l.amount) : "",
        credit: cfg.style === "single" && !isDebit ? formatAmount(l.amount) : "",
        amount: cfg.style === "pair" ? formatAmount(l.amount) : "",
        description: l.description ?? "",
        partnerCode: codeOf(l.partnerId),
      };
    }),
  };
}

/** Nạp dữ liệu rồi mới dựng form (form giữ trạng thái riêng, không đồng bộ ngược từ server khi đang sửa). */
export function VoucherEditor({ cfg, id, onClose }: { cfg: VoucherUiConfig; id: string | null; onClose: () => void }) {
  const { tenant } = useTenantCtx();
  const partners = usePartners(tenant.id);
  const existing = useVoucher(id ?? undefined);
  if (id && (!existing.data || !partners.data)) return <Empty>Đang tải chứng từ...</Empty>;
  const initial = id && existing.data ? initialFromVoucher(existing.data, partners.data ?? [], cfg) : blankInitial(cfg);
  return <VoucherForm cfg={cfg} id={id} initial={initial} onClose={onClose} />;
}

function VoucherForm({ cfg, id, initial, onClose }: { cfg: VoucherUiConfig; id: string | null; initial: Initial; onClose: () => void }) {
  const { tenant, role } = useTenantCtx();
  const accounts = useAccounts(tenant.id);
  const partners = usePartners(tenant.id);
  const save = useSaveVoucher(tenant.id, platform);
  const listId = useId();

  const [header, setHeader] = useState<HeaderDraft>(initial.header);
  const [lines, setLines] = useState<LineDraft[]>(initial.lines);
  const version = initial.version;

  const postable = useMemo(() => (accounts.data ?? []).filter((a) => a.is_postable && a.is_active), [accounts.data]);
  const byCode = useMemo(() => new Map((accounts.data ?? []).map((a) => [a.code, a])), [accounts.data]);
  const partnerByCode = useMemo(() => new Map((partners.data ?? []).map((p) => [p.code, p])), [partners.data]);

  const status = initial.status;
  const readOnly = status === "posted" || status === "cancelled" || role === "viewer";

  function toInput(): VoucherInput & { id?: string; version?: number } {
    const partner = partnerByCode.get(header.partnerCode.trim());
    return {
      ...(id ? { id } : {}),
      ...(version ? { version } : {}),
      voucherType: cfg.type,
      ...(header.number ? { number: header.number } : {}),
      issueDate: header.issueDate,
      postingDate: header.postingDate,
      partnerId: partner?.id ?? null,
      ...(partner ? { partnerName: partner.name } : {}),
      contactName: header.contactName,
      address: header.address || partner?.address || "",
      description: header.description,
      headerAccount: cfg.style === "pair" ? header.headerAccount : null,
      originalDocuments: header.originalDocuments,
      lines: lines
        .filter((l) => l.account.trim())
        .map((l, i) => {
          const lp = partnerByCode.get(l.partnerCode.trim());
          const base = {
            lineNo: i + 1,
            description: l.description || header.description,
            partnerId: lp?.id ?? partner?.id ?? null,
          };
          if (cfg.style === "pair") {
            const amount = parseAmount(l.amount) ?? 0;
            return cfg.headerSide === "debit"
              ? { ...base, creditAccount: l.account.trim(), amount }
              : { ...base, debitAccount: l.account.trim(), amount };
          }
          const d = parseAmount(l.debit) ?? 0;
          const c = parseAmount(l.credit) ?? 0;
          return d > 0 ? { ...base, debitAccount: l.account.trim(), amount: d } : { ...base, creditAccount: l.account.trim(), amount: c };
        }),
    };
  }

  // Kiểm tra cân Nợ/Có ngay trên client (cùng logic với server)
  const preview = buildLedgerEntries(
    toInput().lines.map((l) => ({
      lineNo: l.lineNo,
      debitAccount: l.debitAccount ?? (cfg.headerSide === "debit" ? header.headerAccount : null),
      creditAccount: l.creditAccount ?? (cfg.headerSide === "credit" ? header.headerAccount : null),
      amount: l.amount,
    })),
  );
  const total = preview.ok ? preview.totalDebit : 0;

  async function submit(post: boolean) {
    try {
      await save.mutateAsync({ voucher: toInput(), post });
      toast.success(post ? "Đã lưu và ghi sổ" : "Đã lưu chứng từ");
      onClose();
    } catch (e) {
      toast.error(friendlyError(e));
    }
  }

  const setLine = (key: string, patch: Partial<LineDraft>) =>
    setLines((ls) => ls.map((l) => (l.key === key ? { ...l, ...patch } : l)));

  return (
    <div className="space-y-3" onKeyDown={(e) => {
      if (e.ctrlKey && e.key.toLowerCase() === "s") {
        e.preventDefault();
        if (!readOnly) void submit(false);
      }
    }}>
      <datalist id={`${listId}-acc`}>
        {postable.map((a) => (
          <option key={a.code} value={a.code}>
            {a.name}
          </option>
        ))}
      </datalist>
      <datalist id={`${listId}-partner`}>
        {(partners.data ?? []).map((p) => (
          <option key={p.id} value={p.code}>
            {p.name}
          </option>
        ))}
      </datalist>

      {status ? (
        <div className="flex items-center gap-2 text-xs">
          Trạng thái: <Badge tone={STATUS_BADGE[status].tone}>{STATUS_BADGE[status].label}</Badge>
          {status === "posted" ? <span className="text-muted">— bỏ ghi sổ để sửa</span> : null}
        </div>
      ) : null}

      <div className="grid grid-cols-1 gap-3 md:grid-cols-4">
        <Field label={cfg.partnerLabel}>
          <Input
            list={`${listId}-partner`}
            value={header.partnerCode}
            disabled={readOnly}
            onChange={(e) => {
              const p = partnerByCode.get(e.target.value);
              setHeader((h) => ({ ...h, partnerCode: e.target.value, ...(p ? { address: p.address ?? "", contactName: h.contactName || p.name } : {}) }));
            }}
          />
          <PartnerName p={partnerByCode.get(header.partnerCode)} />
        </Field>
        <Field label={cfg.contactLabel}>
          <Input value={header.contactName} disabled={readOnly} onChange={(e) => setHeader({ ...header, contactName: e.target.value })} />
        </Field>
        <Field label="Ngày hạch toán">
          <Input type="date" value={header.postingDate} disabled={readOnly} onChange={(e) => setHeader({ ...header, postingDate: e.target.value, issueDate: e.target.value })} />
        </Field>
        <Field label="Số chứng từ" hint="Để trống: tự cấp theo quyển">
          <Input value={header.number} disabled={readOnly} placeholder="Tự động" onChange={(e) => setHeader({ ...header, number: e.target.value })} />
        </Field>
        <Field label={cfg.descriptionLabel} className="md:col-span-2">
          <Input value={header.description} disabled={readOnly} onChange={(e) => setHeader({ ...header, description: e.target.value })} />
        </Field>
        {cfg.style === "pair" ? (
          <Field label={cfg.headerAccountLabel ?? "Tài khoản"}>
            <Input
              list={`${listId}-acc`}
              value={header.headerAccount}
              disabled={readOnly}
              onChange={(e) => setHeader({ ...header, headerAccount: e.target.value })}
            />
            <AccountName a={byCode.get(header.headerAccount)} />
          </Field>
        ) : (
          <div />
        )}
        <Field label="Kèm theo chứng từ gốc">
          <Input value={header.originalDocuments} disabled={readOnly} onChange={(e) => setHeader({ ...header, originalDocuments: e.target.value })} />
        </Field>
      </div>

      <div className="overflow-x-auto rounded-md border border-line">
        <table className="w-full text-sm">
          <thead className="bg-navy-50 text-xs text-navy-700">
            <tr>
              <th className="w-10 px-2 py-1.5 text-left">#</th>
              <th className="w-40 px-2 text-left">{cfg.style === "pair" ? cfg.lineAccountLabel : "Tài khoản"}</th>
              <th className="px-2 text-left">Tên tài khoản</th>
              <th className="w-32 px-2 text-left">Mã khách</th>
              {cfg.style === "pair" ? (
                <th className="w-40 px-2 text-right">Số tiền</th>
              ) : (
                <>
                  <th className="w-36 px-2 text-right">Phát sinh nợ</th>
                  <th className="w-36 px-2 text-right">Phát sinh có</th>
                </>
              )}
              <th className="px-2 text-left">Diễn giải</th>
              <th className="w-10" />
            </tr>
          </thead>
          <tbody>
            {lines.map((l, i) => (
              <tr key={l.key} className="border-t border-line">
                <td className="px-2 text-muted">{i + 1}</td>
                <td className="px-1 py-1">
                  <Input list={`${listId}-acc`} value={l.account} disabled={readOnly} aria-label={`Tài khoản dòng ${i + 1}`} onChange={(e) => setLine(l.key, { account: e.target.value })} />
                </td>
                <td className="px-2 text-xs text-muted">{byCode.get(l.account)?.name}</td>
                <td className="px-1">
                  <Input list={`${listId}-partner`} value={l.partnerCode} disabled={readOnly} onChange={(e) => setLine(l.key, { partnerCode: e.target.value })} />
                </td>
                {cfg.style === "pair" ? (
                  <td className="px-1">
                    <AmountInput value={l.amount} disabled={readOnly} label={`Số tiền dòng ${i + 1}`} onChange={(v) => setLine(l.key, { amount: v })} />
                  </td>
                ) : (
                  <>
                    <td className="px-1">
                      <AmountInput value={l.debit} disabled={readOnly} label={`Nợ dòng ${i + 1}`} onChange={(v) => setLine(l.key, { debit: v, credit: "" })} />
                    </td>
                    <td className="px-1">
                      <AmountInput value={l.credit} disabled={readOnly} label={`Có dòng ${i + 1}`} onChange={(v) => setLine(l.key, { credit: v, debit: "" })} />
                    </td>
                  </>
                )}
                <td className="px-1">
                  <Input
                    value={l.description}
                    disabled={readOnly}
                    placeholder={header.description}
                    onChange={(e) => setLine(l.key, { description: e.target.value })}
                    onKeyDown={(e) => {
                      if (e.key === "Enter" && i === lines.length - 1 && !readOnly) setLines([...lines, newLine()]);
                    }}
                  />
                </td>
                <td className="px-1 text-center">
                  {!readOnly && lines.length > 1 ? (
                    <button type="button" aria-label="Xóa dòng" className="text-muted hover:text-danger" onClick={() => setLines(lines.filter((x) => x.key !== l.key))}>
                      <Trash2 size={14} />
                    </button>
                  ) : null}
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>

      <div className="flex flex-wrap items-start justify-between gap-3">
        <div className="text-xs">
          {!readOnly ? (
            <Button variant="ghost" icon={<Plus size={14} />} onClick={() => setLines([...lines, newLine()])}>
              Thêm dòng
            </Button>
          ) : null}
          {!preview.ok && lines.some((l) => l.account) ? (
            <ul className="mt-1 text-danger">
              {preview.errors.map((e) => (
                <li key={e.message}>{e.message}</li>
              ))}
            </ul>
          ) : null}
        </div>
        <div className="text-right">
          <div className="text-sm">
            Tổng tiền: <span className="num text-base font-semibold text-navy-700">{formatAmount(total)}</span> VND
          </div>
          <div className="text-xs italic text-muted">{total > 0 ? amountInWords(total) : ""}</div>
        </div>
      </div>

      <div className="flex justify-end gap-2 border-t border-line pt-3">
        <Button variant="secondary" onClick={onClose}>
          Đóng
        </Button>
        {!readOnly ? (
          <>
            <Button variant="secondary" icon={<Save size={14} />} disabled={save.isPending} onClick={() => void submit(false)}>
              Lưu (Ctrl+S)
            </Button>
            {canPost(role) ? (
              <Button icon={<Send size={14} />} disabled={save.isPending || !preview.ok} onClick={() => void submit(true)}>
                Lưu & ghi sổ
              </Button>
            ) : null}
          </>
        ) : null}
      </div>
    </div>
  );
}

export function AmountInput({ value, onChange, disabled, label }: { value: string; onChange: (v: string) => void; disabled?: boolean; label: string }) {
  const [focused, setFocused] = useState(false);
  const n = parseAmount(value);
  return (
    <Input
      aria-label={label}
      inputMode="decimal"
      className="num"
      disabled={disabled}
      value={focused ? value : n === null ? value : formatAmount(n)}
      onFocus={() => setFocused(true)}
      onBlur={() => setFocused(false)}
      onChange={(e) => onChange(e.target.value.replace(/[^\d,.-]/g, ""))}
    />
  );
}

export function AccountName({ a }: { a: AccountRow | undefined }) {
  return <span className="truncate text-xs text-muted">{a?.name ?? " "}</span>;
}

export function PartnerName({ p }: { p: PartnerRow | undefined }) {
  return <span className="truncate text-xs text-muted">{p?.name ?? " "}</span>;
}

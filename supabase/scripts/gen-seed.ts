// Sinh supabase/seed.sql từ hệ thống tài khoản mẫu trong packages/core.
// Chạy: node supabase/scripts/gen-seed.ts   (Node ≥ 22.18 tự bỏ kiểu TypeScript)
import { writeFileSync } from "node:fs";
import { COA_TT133, COA_TT99, type CoaAccount } from "../../packages/core/src/accounting/coa.ts";

const q = (s: string | null) => (s === null ? "null" : `'${s.replaceAll("'", "''")}'`);
const rows = (regime: string, list: readonly CoaAccount[]) =>
  list
    .map(
      (a) =>
        `  (${q(regime)}, ${q(a.code)}, ${q(a.name)}, ${q(a.parent)}, ${a.level}, ${q(a.kind)}, ${q(a.normalSide)}, ${a.trackPartner}, ${a.trackItem})`,
    )
    .join(",\n");

const sql = `-- TỰ SINH bởi supabase/scripts/gen-seed.ts — không sửa tay.
-- Hệ thống tài khoản mẫu TT99/2025 (${COA_TT99.length} tk) và TT133/2016 (${COA_TT133.length} tk).
insert into public.coa_templates (regime, code, name, parent_code, level, kind, normal_side, track_partner, track_item) values
${rows("TT99", COA_TT99)},
${rows("TT133", COA_TT133)}
on conflict (regime, code) do update set
  name = excluded.name, parent_code = excluded.parent_code, level = excluded.level, kind = excluded.kind,
  normal_side = excluded.normal_side, track_partner = excluded.track_partner, track_item = excluded.track_item;
`;
writeFileSync(new URL("../seed.sql", import.meta.url), sql);
process.stdout.write(`seed.sql: ${COA_TT99.length} + ${COA_TT133.length} tài khoản\n`);

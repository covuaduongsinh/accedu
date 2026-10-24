export function SetupNeeded() {
  return (
    <div className="chess-pattern flex min-h-full items-center justify-center p-6">
      <div className="max-w-lg rounded-lg bg-white p-6 shadow">
        <h1 className="mb-2 text-lg font-semibold text-navy-700">Chưa cấu hình kết nối Supabase</h1>
        <p className="mb-3 text-sm text-muted">
          Tạo file <code>apps/web/.env.local</code> với hai biến sau rồi chạy lại <code>pnpm dev:web</code>:
        </p>
        <pre className="rounded bg-navy-900 p-3 text-xs text-gold-200">
          VITE_SUPABASE_URL=https://supabaseaccedu.dsc.edu.vn{"\n"}VITE_SUPABASE_ANON_KEY=&lt;anon key&gt;
        </pre>
      </div>
    </div>
  );
}

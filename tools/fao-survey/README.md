# Bộ công cụ khảo sát FAO bằng REA

Tái tạo các file trong `docs/research/fao/` (chỉ đọc, theo [P0](../../docs/plans/P0-khao-sat-fao.md)).

```bash
npm i -g rea-agents@6.7.0            # hoặc: npx -y rea-agents@6.7.0 ...
export FAO_PASSWORD='...'            # KHÔNG ghi vào file
mkdir -p research-raw                # đã gitignore — chứa dữ liệu thật

# 1. Sinh kịch bản: đăng nhập → mở từng trang (dấu + = bấm "Mới" rồi Esc, không lưu) → đăng xuất
#    FORCE=1 khi phiên trước chưa thoát (FAO chỉ cho 1 phiên/người dùng)
FORCE=1 python3 tools/fao-survey/gen_scenario.py research-raw/s.json \
  "$PWD/tools/fao-survey/chrome-proxy.sh" "+cactpt1.aspx,+gltk.aspx,rpt_glcd1d.aspx" url,accessibility

# 2. Chạy REA (lô ≤ 5 trang để không tràn ngân sách sự kiện)
rea capture-browser-scenario research-raw/s.json --format json > research-raw/s-capture.json

# 3. Trích metadata XHR → sinh tài liệu
python3 tools/fao-survey/extract_xhr.py research-raw/s-capture.json research-raw/s-xhr.json
python3 tools/fao-survey/make_docs.py
```

`gen_scenario.py` cần `research-raw/menu0.json` (phản hồi `GetMenuItem`, lấy từ capture đăng nhập đầu tiên).

## Lưu ý

- Chỉ đọc: kịch bản chỉ `goto`, bấm menu, bấm **Mới** rồi **Esc**; không bấm Lưu/Xóa/Ghi sổ.
- Đăng nhập lại khi phiên cũ còn sẽ **đóng phiên đang mở** (kể cả phiên của người dùng thật) — báo trước cho kế toán.
- Trên Windows (`D:\code\rea`): bỏ `chrome-proxy.sh`, đặt `executable_path` là đường dẫn tuyệt đối tới `chrome.exe`.
- Đề xuất cho repo `rea` (fork): cho phép truyền `HTTPS_PROXY`/`NO_PROXY` vào trình duyệt
  (`allowedBrowserEnvironment` trong `src/browser/PlaywrightScenarioBrowser.ts`) để chạy được sau proxy doanh nghiệp.

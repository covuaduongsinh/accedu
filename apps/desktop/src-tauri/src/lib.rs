use std::fs;
use std::path::PathBuf;

/// Ghi file xuất (CSV/XML tờ khai/PDF) ra đường dẫn người dùng đã chọn qua hộp thoại lưu.
#[tauri::command]
fn save_export(path: PathBuf, contents: String) -> Result<(), String> {
    fs::write(&path, contents.as_bytes()).map_err(|e| format!("Không ghi được file {}: {e}", path.display()))
}

/// Thông tin môi trường desktop hiển thị ở mục "Thông tin sản phẩm".
#[tauri::command]
fn app_info() -> serde_json::Value {
    serde_json::json!({
        "name": "AccEdu",
        "version": env!("CARGO_PKG_VERSION"),
        "os": std::env::consts::OS,
        "arch": std::env::consts::ARCH,
    })
}

#[cfg_attr(mobile, tauri::mobile_entry_point)]
pub fn run() {
    let builder = tauri::Builder::default();

    // Chỉ một cửa sổ AccEdu: mở lần hai sẽ đưa cửa sổ cũ lên trước
    #[cfg(desktop)]
    let builder = builder.plugin(tauri_plugin_single_instance::init(|app, _args, _cwd| {
        use tauri::Manager;
        if let Some(w) = app.get_webview_window("main") {
            let _ = w.set_focus();
        }
    }));

    builder
        .plugin(tauri_plugin_window_state::Builder::default().build())
        .plugin(tauri_plugin_opener::init())
        .plugin(tauri_plugin_dialog::init())
        .plugin(tauri_plugin_fs::init())
        .invoke_handler(tauri::generate_handler![save_export, app_info])
        .run(tauri::generate_context!())
        .expect("Không khởi động được AccEdu desktop");
}

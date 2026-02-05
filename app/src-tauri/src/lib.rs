// Learn more about Tauri commands at https://tauri.app/develop/calling-rust/
use tauri::Manager;

mod commands;
mod crypto;
mod database;
mod state;

#[tauri::command]
fn greet(name: &str) -> String {
    format!("Hello, {}! You've been greeted from Rust!", name)
}

#[cfg_attr(mobile, tauri::mobile_entry_point)]
pub fn run() {
    tauri::Builder::default()
        .setup(|app| {
            let app_state = state::AppState::new(app.handle())
                .map_err(|e| format!("failed to init app state: {e}"))?;
            database::init_database(&app_state.db_path)
                .map_err(|e| format!("failed to init database: {e}"))?;

            app.manage(app_state);
            Ok(())
        })
        .plugin(tauri_plugin_opener::init())
        .invoke_handler(tauri::generate_handler![
            greet,
            commands::auth::get_auth_status,
            commands::auth::set_password,
            commands::auth::verify_password,
            commands::diary::get_diary,
            commands::diary::save_diary,
        ])
        .run(tauri::generate_context!())
        .expect("error while running tauri application");
}

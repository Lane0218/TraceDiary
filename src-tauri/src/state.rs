use std::error::Error;
use std::path::PathBuf;

use tauri::{AppHandle, Manager};

/// 全局应用状态（只存放可安全共享的信息）。
///
/// 注意：
/// - 不要在这里保存明文密码/密钥
/// - 加密主密钥从 Windows Credential Manager（keyring）读取
#[derive(Debug)]
pub struct AppState {
    pub app_data_dir: PathBuf,
    pub db_path: PathBuf,
}

impl AppState {
    pub fn new(app: &AppHandle) -> Result<Self, Box<dyn Error>> {
        let app_data_dir = app.path().app_data_dir()?;
        let db_path = app_data_dir.join("database").join("trace.db");

        Ok(Self {
            app_data_dir,
            db_path,
        })
    }

    pub fn diaries_dir(&self) -> PathBuf {
        self.app_data_dir.join("diaries")
    }

    #[allow(dead_code)]
    pub fn summaries_dir(&self) -> PathBuf {
        self.app_data_dir.join("summaries")
    }
}

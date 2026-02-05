use std::time::{SystemTime, UNIX_EPOCH};

use serde::{Deserialize, Serialize};
use tauri::State;

use crate::crypto::{keyring_store, password};
use crate::database::{open_connection, settings_repo};
use crate::state::AppState;

const SEVEN_DAYS_SECONDS: u64 = 7 * 24 * 60 * 60;

#[derive(Debug, Serialize, Deserialize)]
pub struct AuthStatus {
    pub password_set: bool,
    pub needs_verify: bool,
}

fn now_unix_seconds() -> Result<u64, String> {
    let now = SystemTime::now()
        .duration_since(UNIX_EPOCH)
        .map_err(|e| format!("failed to get system time: {e}"))?;
    Ok(now.as_secs())
}

fn parse_unix_seconds(s: &str) -> Option<u64> {
    s.trim().parse::<u64>().ok()
}

#[tauri::command]
pub fn get_auth_status(state: State<'_, AppState>) -> Result<AuthStatus, String> {
    let conn = open_connection(&state.db_path).map_err(|e| format!("open db failed: {e}"))?;

    let password_hash = settings_repo::get_setting(&conn, "password_hash")
        .map_err(|e| format!("read password_hash failed: {e}"))?
        .unwrap_or_default();
    let password_set = !password_hash.is_empty();

    let last_verified_at = settings_repo::get_setting(&conn, "last_verified_at")
        .map_err(|e| format!("read last_verified_at failed: {e}"))?
        .unwrap_or_default();

    let needs_verify = if !password_set {
        false
    } else {
        let now = now_unix_seconds()?;
        match parse_unix_seconds(&last_verified_at) {
            None => true,
            Some(last) => now.saturating_sub(last) > SEVEN_DAYS_SECONDS,
        }
    };

    Ok(AuthStatus {
        password_set,
        needs_verify,
    })
}

#[tauri::command]
pub fn set_password(state: State<'_, AppState>, password_input: String) -> Result<(), String> {
    password::validate_password(&password_input)?;

    let conn = open_connection(&state.db_path).map_err(|e| format!("open db failed: {e}"))?;

    let password_hash =
        password::hash_password(&password_input).map_err(|e| format!("hash password failed: {e}"))?;
    settings_repo::set_setting(&conn, "password_hash", &password_hash)
        .map_err(|e| format!("save password_hash failed: {e}"))?;

    let (kdf_salt_b64, master_key) = password::derive_master_key_new_salt(&password_input)
        .map_err(|e| format!("derive master key failed: {e}"))?;
    settings_repo::set_setting(&conn, "kdf_salt", &kdf_salt_b64)
        .map_err(|e| format!("save kdf_salt failed: {e}"))?;

    keyring_store::store_master_key(&master_key)
        .map_err(|e| format!("store master key failed: {e}"))?;

    let now = now_unix_seconds()?.to_string();
    settings_repo::set_setting(&conn, "password_set_at", &now)
        .map_err(|e| format!("save password_set_at failed: {e}"))?;
    settings_repo::set_setting(&conn, "last_verified_at", &now)
        .map_err(|e| format!("save last_verified_at failed: {e}"))?;

    Ok(())
}

#[tauri::command]
pub fn verify_password(state: State<'_, AppState>, password_input: String) -> Result<(), String> {
    let conn = open_connection(&state.db_path).map_err(|e| format!("open db failed: {e}"))?;

    let password_hash = settings_repo::get_setting(&conn, "password_hash")
        .map_err(|e| format!("read password_hash failed: {e}"))?
        .unwrap_or_default();

    if password_hash.is_empty() {
        return Err("尚未设置密码".to_string());
    }

    password::verify_password(&password_input, &password_hash)
        .map_err(|e| format!("password verify failed: {e}"))?;

    let kdf_salt_b64 = settings_repo::get_setting(&conn, "kdf_salt")
        .map_err(|e| format!("read kdf_salt failed: {e}"))?
        .unwrap_or_default();
    if kdf_salt_b64.is_empty() {
        return Err("缺少 kdf_salt：请重新设置密码".to_string());
    }

    let master_key = password::derive_master_key_from_salt(&password_input, &kdf_salt_b64)
        .map_err(|e| format!("derive master key failed: {e}"))?;
    keyring_store::store_master_key(&master_key)
        .map_err(|e| format!("store master key failed: {e}"))?;

    let now = now_unix_seconds()?.to_string();
    settings_repo::set_setting(&conn, "last_verified_at", &now)
        .map_err(|e| format!("save last_verified_at failed: {e}"))?;

    Ok(())
}


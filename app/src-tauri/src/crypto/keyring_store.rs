use base64::engine::general_purpose::STANDARD;
use base64::Engine;

const SERVICE_NAME: &str = "TraceDiary";
const USERNAME: &str = "default";

pub fn store_master_key(master_key: &[u8]) -> Result<(), String> {
    if master_key.len() != 32 {
        return Err("master_key 长度必须为 32 字节".to_string());
    }

    let entry = keyring::Entry::new(SERVICE_NAME, USERNAME).map_err(|e| format!("{e}"))?;
    let encoded = STANDARD.encode(master_key);
    entry.set_password(&encoded).map_err(|e| format!("{e}"))
}

pub fn load_master_key() -> Result<Option<Vec<u8>>, String> {
    let entry = keyring::Entry::new(SERVICE_NAME, USERNAME).map_err(|e| format!("{e}"))?;

    match entry.get_password() {
        Ok(encoded) => {
            let decoded = STANDARD
                .decode(encoded)
                .map_err(|e| format!("decode master key failed: {e}"))?;
            if decoded.len() != 32 {
                return Err("master_key 长度错误".to_string());
            }
            Ok(Some(decoded))
        }
        Err(err) => {
            // 不同平台/版本的 keyring 错误类型不一致，这里做宽松处理：
            // 读取失败时返回 None（表示尚未解锁），其他错误由上层决定是否提示。
            let msg = err.to_string().to_lowercase();
            if msg.contains("no entry") || msg.contains("not found") {
                Ok(None)
            } else {
                Err(err.to_string())
            }
        }
    }
}


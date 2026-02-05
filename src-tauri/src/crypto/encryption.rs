use serde::{Deserialize, Serialize};

/// 加密文件负载格式（文本化存储，避免二进制文件带来的兼容性问题）。
#[derive(Debug, Serialize, Deserialize)]
struct EncryptedPayload {
    v: u8,
    nonce_b64: String,
    ciphertext_b64: String,
}

pub fn encrypt_text(master_key: &[u8], plaintext: &str) -> Result<String, String> {
    // 依赖：aes-gcm + base64 + rand_core
    use aes_gcm::aead::{Aead, KeyInit, OsRng};
    use aes_gcm::{Aes256Gcm, Nonce};
    use base64::engine::general_purpose::STANDARD;
    use base64::Engine;
    use rand_core::RngCore;

    if master_key.len() != 32 {
        return Err("master_key 长度必须为 32 字节".to_string());
    }

    let cipher = Aes256Gcm::new_from_slice(master_key)
        .map_err(|e| format!("init cipher failed: {e}"))?;

    let mut nonce_bytes = [0u8; 12];
    OsRng.fill_bytes(&mut nonce_bytes);
    let nonce = Nonce::from_slice(&nonce_bytes);

    let ciphertext = cipher
        .encrypt(nonce, plaintext.as_bytes())
        .map_err(|e| format!("encrypt failed: {e}"))?;

    let payload = EncryptedPayload {
        v: 1,
        nonce_b64: STANDARD.encode(nonce_bytes),
        ciphertext_b64: STANDARD.encode(ciphertext),
    };

    serde_json::to_string(&payload).map_err(|e| format!("serialize payload failed: {e}"))
}

pub fn decrypt_text(master_key: &[u8], encrypted_text: &str) -> Result<String, String> {
    use aes_gcm::aead::{Aead, KeyInit};
    use aes_gcm::{Aes256Gcm, Nonce};
    use base64::engine::general_purpose::STANDARD;
    use base64::Engine;

    if master_key.len() != 32 {
        return Err("master_key 长度必须为 32 字节".to_string());
    }

    let payload: EncryptedPayload =
        serde_json::from_str(encrypted_text).map_err(|e| format!("parse payload failed: {e}"))?;
    if payload.v != 1 {
        return Err("不支持的加密负载版本".to_string());
    }

    let nonce_bytes = STANDARD
        .decode(payload.nonce_b64)
        .map_err(|e| format!("decode nonce failed: {e}"))?;
    if nonce_bytes.len() != 12 {
        return Err("nonce 长度错误".to_string());
    }
    let nonce = Nonce::from_slice(&nonce_bytes);

    let ciphertext = STANDARD
        .decode(payload.ciphertext_b64)
        .map_err(|e| format!("decode ciphertext failed: {e}"))?;

    let cipher = Aes256Gcm::new_from_slice(master_key)
        .map_err(|e| format!("init cipher failed: {e}"))?;
    let plaintext_bytes = cipher
        .decrypt(nonce, ciphertext.as_ref())
        .map_err(|e| format!("decrypt failed: {e}"))?;

    String::from_utf8(plaintext_bytes).map_err(|e| format!("utf8 decode failed: {e}"))
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn encrypt_decrypt_roundtrip() {
        let key = [7u8; 32];
        let plaintext = "hello\nworld";

        let encrypted = encrypt_text(&key, plaintext).unwrap();
        let decrypted = decrypt_text(&key, &encrypted).unwrap();

        assert_eq!(decrypted, plaintext);
    }
}


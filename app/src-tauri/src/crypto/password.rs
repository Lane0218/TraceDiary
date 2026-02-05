use base64::engine::general_purpose::STANDARD;
use base64::Engine;

pub const MIN_PASSWORD_LENGTH: usize = 8;

pub fn validate_password(password: &str) -> Result<(), String> {
    if password.len() < MIN_PASSWORD_LENGTH {
        return Err(format!("密码至少需要 {MIN_PASSWORD_LENGTH} 位"));
    }

    let has_letter = password.chars().any(|c| c.is_alphabetic());
    let has_number = password.chars().any(|c| c.is_numeric());

    if !has_letter || !has_number {
        return Err("密码必须同时包含字母和数字".to_string());
    }

    Ok(())
}

pub fn hash_password(password: &str) -> Result<String, String> {
    use argon2::password_hash::SaltString;
    use argon2::{Argon2, PasswordHasher};
    use rand_core::OsRng;

    let salt = SaltString::generate(&mut OsRng);
    let argon2 = Argon2::default();

    argon2
        .hash_password(password.as_bytes(), &salt)
        .map(|phc| phc.to_string())
        .map_err(|e| format!("{e}"))
}

pub fn verify_password(password: &str, password_hash: &str) -> Result<(), String> {
    use argon2::password_hash::PasswordHash;
    use argon2::{Argon2, PasswordVerifier};

    let parsed = PasswordHash::new(password_hash).map_err(|e| format!("{e}"))?;
    Argon2::default()
        .verify_password(password.as_bytes(), &parsed)
        .map_err(|e| format!("{e}"))
}

pub fn derive_master_key_new_salt(password: &str) -> Result<(String, Vec<u8>), String> {
    use rand_core::RngCore;

    let mut salt_bytes = [0u8; 16];
    rand_core::OsRng.fill_bytes(&mut salt_bytes);
    let salt_b64 = STANDARD.encode(salt_bytes);

    let key = derive_master_key_from_salt(password, &salt_b64)?;
    Ok((salt_b64, key))
}

pub fn derive_master_key_from_salt(password: &str, salt_b64: &str) -> Result<Vec<u8>, String> {
    use argon2::Argon2;

    let salt = STANDARD
        .decode(salt_b64)
        .map_err(|e| format!("decode kdf_salt failed: {e}"))?;

    let mut out = vec![0u8; 32];
    Argon2::default()
        .hash_password_into(password.as_bytes(), &salt, &mut out)
        .map_err(|e| format!("argon2 kdf failed: {e}"))?;

    Ok(out)
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn validate_password_rules() {
        assert!(validate_password("1234567").is_err());
        assert!(validate_password("abcdefgh").is_err());
        assert!(validate_password("abcd1234").is_ok());
    }

    #[test]
    fn password_hash_verify_roundtrip() {
        let pw = "abcd1234";
        let hash = hash_password(pw).unwrap();
        verify_password(pw, &hash).unwrap();
        assert!(verify_password("wrong1234", &hash).is_err());
    }

    #[test]
    fn derive_key_is_stable_for_same_salt() {
        let pw = "abcd1234";
        let (salt_b64, k1) = derive_master_key_new_salt(pw).unwrap();
        let k2 = derive_master_key_from_salt(pw, &salt_b64).unwrap();
        assert_eq!(k1, k2);
        assert_eq!(k1.len(), 32);
    }
}


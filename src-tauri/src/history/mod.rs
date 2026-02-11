use aes_gcm::{
    aead::{Aead, KeyInit, OsRng},
    Aes256Gcm, Nonce,
};
use base64::Engine;
use crate::insertion::{InsertResult, InsertionMethod};
use directories::ProjectDirs;
use rand::RngCore;
use serde::{Deserialize, Serialize};
use std::{
    fs,
    path::{Path, PathBuf},
    time::{SystemTime, UNIX_EPOCH},
};

#[derive(Debug, Clone, Serialize, Deserialize, PartialEq, Eq)]
#[serde(rename_all = "camelCase")]
pub enum RetentionPolicy {
    Off,
    Days7,
    Days30,
    Forever,
}

impl Default for RetentionPolicy {
    fn default() -> Self {
        Self::Days30
    }
}

#[derive(Debug, Clone, Serialize, Deserialize, PartialEq, Eq)]
#[serde(rename_all = "camelCase")]
pub struct SessionHistoryRecord {
    pub record_id: String,
    pub timestamp_utc_ms: u64,
    pub preview: String,
    pub method: Option<InsertionMethod>,
    pub success: bool,
    pub source: String,
    pub message: Option<String>,
}

#[derive(Debug, Clone, Serialize, Deserialize, Default, PartialEq, Eq)]
#[serde(rename_all = "camelCase")]
pub struct SessionHistoryQuery {
    pub limit: Option<usize>,
    pub include_failed: Option<bool>,
}

#[derive(Debug, Clone, Serialize, Deserialize, PartialEq, Eq)]
#[serde(rename_all = "camelCase")]
pub struct HistoryEvent {
    pub action: String,
    pub policy: RetentionPolicy,
    pub retained_records: usize,
    pub message: Option<String>,
}

#[derive(Debug, thiserror::Error)]
pub enum HistoryError {
    #[error("failed to read history: {0}")]
    Read(std::io::Error),
    #[error("failed to write history: {0}")]
    Write(std::io::Error),
    #[error("failed to parse history JSON: {0}")]
    Parse(serde_json::Error),
    #[error("failed to encrypt history: {0}")]
    Encrypt(String),
    #[error("failed to decrypt history: {0}")]
    Decrypt(String),
    #[error("failed to decode history key: {0}")]
    KeyDecode(String),
    #[error("cannot resolve app data directory")]
    AppData,
}

#[derive(Debug, Clone, Serialize, Deserialize, Default)]
#[serde(rename_all = "camelCase")]
struct HistoryStore {
    retention_policy: RetentionPolicy,
    next_id: u64,
    records: Vec<SessionHistoryRecord>,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
struct EncryptedHistoryStore {
    version: u8,
    nonce_b64: String,
    ciphertext_b64: String,
}

pub struct HistoryManager {
    path: PathBuf,
    _key_path: PathBuf,
    key: [u8; 32],
    store: HistoryStore,
}

impl HistoryManager {
    pub fn new() -> Result<Self, HistoryError> {
        let proj_dirs =
            ProjectDirs::from("com", "voicewave", "localcore").ok_or(HistoryError::AppData)?;
        let path = proj_dirs.config_dir().join("history.json");
        let key_path = proj_dirs.config_dir().join("history.key");
        Self::from_paths(path, key_path)
    }

    pub fn from_paths(
        path: impl AsRef<Path>,
        key_path: impl AsRef<Path>,
    ) -> Result<Self, HistoryError> {
        let path = path.as_ref().to_path_buf();
        let key_path = key_path.as_ref().to_path_buf();
        let key = load_or_create_key(&key_path)?;
        let mut manager = Self {
            path,
            _key_path: key_path,
            key,
            store: HistoryStore {
                retention_policy: RetentionPolicy::Days30,
                next_id: 1,
                records: Vec::new(),
            },
        };
        manager.load()?;
        let _ = manager.prune_expired();
        Ok(manager)
    }

    pub fn get_records(&self, query: SessionHistoryQuery) -> Vec<SessionHistoryRecord> {
        let include_failed = query.include_failed.unwrap_or(true);
        let limit = query.limit.unwrap_or(50).max(1);

        self.store
            .records
            .iter()
            .rev()
            .filter(|row| include_failed || row.success)
            .take(limit)
            .cloned()
            .collect()
    }

    pub fn record_insertion(
        &mut self,
        result: &InsertResult,
        text: &str,
    ) -> Result<(), HistoryError> {
        if self.store.retention_policy == RetentionPolicy::Off {
            return Ok(());
        }

        let record = SessionHistoryRecord {
            record_id: self.next_record_id(),
            timestamp_utc_ms: now_utc_ms(),
            preview: text.chars().take(140).collect(),
            method: Some(result.method.clone()),
            success: result.success,
            source: "insertion".to_string(),
            message: result.message.clone(),
        };
        self.store.records.push(record);
        self.prune_expired()?;
        self.persist()
    }

    pub fn record_transcript(&mut self, transcript: &str) -> Result<(), HistoryError> {
        if self.store.retention_policy == RetentionPolicy::Off {
            return Ok(());
        }

        let record = SessionHistoryRecord {
            record_id: self.next_record_id(),
            timestamp_utc_ms: now_utc_ms(),
            preview: transcript.chars().take(140).collect(),
            method: None,
            success: true,
            source: "dictation".to_string(),
            message: None,
        };
        self.store.records.push(record);
        self.prune_expired()?;
        self.persist()
    }

    pub fn set_retention_policy(
        &mut self,
        policy: RetentionPolicy,
    ) -> Result<RetentionPolicy, HistoryError> {
        self.store.retention_policy = policy.clone();
        self.prune_expired()?;
        self.persist()?;
        Ok(policy)
    }

    pub fn retention_policy(&self) -> RetentionPolicy {
        self.store.retention_policy.clone()
    }

    pub fn prune_now(&mut self) -> Result<usize, HistoryError> {
        let before = self.store.records.len();
        self.prune_expired()?;
        self.persist()?;
        Ok(before.saturating_sub(self.store.records.len()))
    }

    pub fn clear(&mut self) -> Result<usize, HistoryError> {
        let removed = self.store.records.len();
        self.store.records.clear();
        self.persist()?;
        Ok(removed)
    }

    pub fn event(&self, action: &str, message: Option<String>) -> HistoryEvent {
        HistoryEvent {
            action: action.to_string(),
            policy: self.retention_policy(),
            retained_records: self.store.records.len(),
            message,
        }
    }

    fn next_record_id(&mut self) -> String {
        let id = self.store.next_id;
        self.store.next_id += 1;
        format!("hist-{id}")
    }

    fn prune_expired(&mut self) -> Result<(), HistoryError> {
        match self.store.retention_policy {
            RetentionPolicy::Off => {
                self.store.records.clear();
            }
            RetentionPolicy::Days7 => {
                let cutoff = now_utc_ms().saturating_sub(7 * 24 * 60 * 60 * 1000);
                self.store
                    .records
                    .retain(|row| row.timestamp_utc_ms >= cutoff);
            }
            RetentionPolicy::Days30 => {
                let cutoff = now_utc_ms().saturating_sub(30 * 24 * 60 * 60 * 1000);
                self.store
                    .records
                    .retain(|row| row.timestamp_utc_ms >= cutoff);
            }
            RetentionPolicy::Forever => {}
        }
        if self.store.records.len() > 1_000 {
            let keep_from = self.store.records.len() - 1_000;
            self.store.records = self.store.records.split_off(keep_from);
        }
        Ok(())
    }

    fn load(&mut self) -> Result<(), HistoryError> {
        if !self.path.exists() {
            return Ok(());
        }
        let raw = fs::read_to_string(&self.path).map_err(HistoryError::Read)?;
        if let Ok(encrypted) = serde_json::from_str::<EncryptedHistoryStore>(&raw) {
            self.store = decrypt_history_store(&encrypted, &self.key)?;
            return Ok(());
        }

        self.store = serde_json::from_str(&raw).map_err(HistoryError::Parse)?;
        self.persist()?;
        Ok(())
    }

    fn persist(&self) -> Result<(), HistoryError> {
        if let Some(parent) = self.path.parent() {
            fs::create_dir_all(parent).map_err(HistoryError::Write)?;
        }
        let encrypted = encrypt_history_store(&self.store, &self.key)?;
        let raw = serde_json::to_string_pretty(&encrypted).map_err(HistoryError::Parse)?;
        fs::write(&self.path, raw).map_err(HistoryError::Write)?;
        Ok(())
    }
}

fn now_utc_ms() -> u64 {
    SystemTime::now()
        .duration_since(UNIX_EPOCH)
        .map(|d| d.as_millis() as u64)
        .unwrap_or_default()
}

fn load_or_create_key(path: &PathBuf) -> Result<[u8; 32], HistoryError> {
    if path.exists() {
        let encoded = fs::read_to_string(path).map_err(HistoryError::Read)?;
        let bytes = base64::engine::general_purpose::STANDARD
            .decode(encoded.trim())
            .map_err(|err| HistoryError::KeyDecode(err.to_string()))?;
        if bytes.len() != 32 {
            return Err(HistoryError::KeyDecode(
                "history.key must decode to 32 bytes".to_string(),
            ));
        }
        let mut key = [0_u8; 32];
        key.copy_from_slice(&bytes);
        return Ok(key);
    }

    if let Some(parent) = path.parent() {
        fs::create_dir_all(parent).map_err(HistoryError::Write)?;
    }
    let mut key = [0_u8; 32];
    OsRng.fill_bytes(&mut key);
    let encoded = base64::engine::general_purpose::STANDARD.encode(key);
    fs::write(path, encoded).map_err(HistoryError::Write)?;
    Ok(key)
}

fn encrypt_history_store(
    store: &HistoryStore,
    key: &[u8; 32],
) -> Result<EncryptedHistoryStore, HistoryError> {
    let cipher = Aes256Gcm::new_from_slice(key)
        .map_err(|err| HistoryError::Encrypt(err.to_string()))?;
    let mut nonce_bytes = [0_u8; 12];
    OsRng.fill_bytes(&mut nonce_bytes);
    let nonce = Nonce::from_slice(&nonce_bytes);
    let plaintext = serde_json::to_vec(store).map_err(HistoryError::Parse)?;
    let ciphertext = cipher
        .encrypt(nonce, plaintext.as_ref())
        .map_err(|err| HistoryError::Encrypt(err.to_string()))?;

    Ok(EncryptedHistoryStore {
        version: 1,
        nonce_b64: base64::engine::general_purpose::STANDARD.encode(nonce_bytes),
        ciphertext_b64: base64::engine::general_purpose::STANDARD.encode(ciphertext),
    })
}

fn decrypt_history_store(
    encrypted: &EncryptedHistoryStore,
    key: &[u8; 32],
) -> Result<HistoryStore, HistoryError> {
    if encrypted.version != 1 {
        return Err(HistoryError::Decrypt(format!(
            "unsupported history encryption version {}",
            encrypted.version
        )));
    }

    let nonce_bytes = base64::engine::general_purpose::STANDARD
        .decode(encrypted.nonce_b64.as_bytes())
        .map_err(|err| HistoryError::Decrypt(err.to_string()))?;
    let ciphertext = base64::engine::general_purpose::STANDARD
        .decode(encrypted.ciphertext_b64.as_bytes())
        .map_err(|err| HistoryError::Decrypt(err.to_string()))?;
    if nonce_bytes.len() != 12 {
        return Err(HistoryError::Decrypt("nonce must be 12 bytes".to_string()));
    }

    let cipher = Aes256Gcm::new_from_slice(key)
        .map_err(|err| HistoryError::Decrypt(err.to_string()))?;
    let nonce = Nonce::from_slice(&nonce_bytes);
    let plaintext = cipher
        .decrypt(nonce, ciphertext.as_ref())
        .map_err(|err| HistoryError::Decrypt(err.to_string()))?;
    serde_json::from_slice(&plaintext).map_err(HistoryError::Parse)
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn retention_off_drops_records() {
        let key_path = std::env::temp_dir().join("voicewave-history-test.key");
        let key = load_or_create_key(&key_path).expect("key");
        let mut manager = HistoryManager {
            path: std::env::temp_dir().join("voicewave-history-test.json"),
            _key_path: key_path,
            key,
            store: HistoryStore::default(),
        };
        manager.store.retention_policy = RetentionPolicy::Forever;
        manager.store.records.push(SessionHistoryRecord {
            record_id: "hist-1".to_string(),
            timestamp_utc_ms: now_utc_ms(),
            preview: "hello".to_string(),
            method: None,
            success: true,
            source: "dictation".to_string(),
            message: None,
        });

        let _ = manager.set_retention_policy(RetentionPolicy::Off);
        assert!(manager.store.records.is_empty());
    }

    #[test]
    fn persisted_history_is_encrypted() {
        let temp = std::env::temp_dir().join(format!("voicewave-history-encrypted-{}.json", now_utc_ms()));
        let key_path = std::env::temp_dir().join(format!("voicewave-history-encrypted-{}.key", now_utc_ms()));
        let key = load_or_create_key(&key_path).expect("key");
        let mut manager = HistoryManager {
            path: temp.clone(),
            _key_path: key_path,
            key,
            store: HistoryStore::default(),
        };
        manager.store.retention_policy = RetentionPolicy::Forever;
        manager
            .record_transcript("secret phrase should not be plaintext")
            .expect("persist encrypted");

        let raw = fs::read_to_string(temp).expect("read persisted history");
        assert!(!raw.contains("secret phrase should not be plaintext"));
        assert!(raw.contains("ciphertextB64"));
    }
}

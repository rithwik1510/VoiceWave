use aes_gcm::{
    aead::{Aead, KeyInit, OsRng},
    Aes256Gcm, Nonce,
};
use base64::Engine;
use directories::ProjectDirs;
use rand::RngCore;
use serde::{Deserialize, Serialize};
use sha2::{Digest, Sha256};
use std::{
    fs,
    path::{Path, PathBuf},
    time::{SystemTime, UNIX_EPOCH},
};

const GRACE_WINDOW_MS: u64 = 7 * 24 * 60 * 60 * 1000;
const DEFAULT_CHECKOUT_URL: &str = "";
const DEFAULT_PORTAL_URL: &str = "";

#[derive(Debug, Clone, Serialize, Deserialize, PartialEq, Eq)]
#[serde(rename_all = "camelCase")]
pub enum EntitlementTier {
    Free,
    Pro,
}

#[derive(Debug, Clone, Serialize, Deserialize, PartialEq, Eq)]
#[serde(rename_all = "snake_case")]
pub enum EntitlementStatus {
    Free,
    ProActive,
    Grace,
    Expired,
    OwnerOverride,
}

#[derive(Debug, Clone, Serialize, Deserialize, PartialEq)]
#[serde(rename_all = "camelCase")]
pub struct BillingPlanDisplay {
    pub base_price_usd_monthly: f32,
    pub launch_price_usd_monthly: f32,
    pub launch_months: u8,
    pub display_base_price: String,
    pub display_launch_price: String,
    pub offer_copy: String,
}

impl Default for BillingPlanDisplay {
    fn default() -> Self {
        Self {
            base_price_usd_monthly: 4.0,
            launch_price_usd_monthly: 1.5,
            launch_months: 3,
            display_base_price: "$4/mo".to_string(),
            display_launch_price: "$1.50/mo".to_string(),
            offer_copy: "Launch offer: first 3 months at $1.50, then $4/month".to_string(),
        }
    }
}

#[derive(Debug, Clone, Serialize, Deserialize, PartialEq)]
#[serde(rename_all = "camelCase")]
pub struct EntitlementSnapshot {
    pub tier: EntitlementTier,
    pub status: EntitlementStatus,
    pub is_pro: bool,
    pub is_owner_override: bool,
    pub expires_at_utc_ms: Option<u64>,
    pub grace_until_utc_ms: Option<u64>,
    pub last_refreshed_at_utc_ms: u64,
    pub plan: BillingPlanDisplay,
    pub message: Option<String>,
}

#[derive(Debug, Clone, Serialize, Deserialize, PartialEq, Eq)]
#[serde(rename_all = "camelCase")]
pub struct CheckoutLaunchResult {
    pub url: String,
    pub launched: bool,
    pub message: Option<String>,
}

pub type PortalLaunchResult = CheckoutLaunchResult;

#[derive(Debug, thiserror::Error)]
pub enum BillingError {
    #[error("failed to read billing store: {0}")]
    Read(std::io::Error),
    #[error("failed to write billing store: {0}")]
    Write(std::io::Error),
    #[error("failed to parse billing store JSON: {0}")]
    Parse(serde_json::Error),
    #[error("failed to encrypt billing store: {0}")]
    Encrypt(String),
    #[error("failed to decrypt billing store: {0}")]
    Decrypt(String),
    #[error("failed to decode billing key: {0}")]
    KeyDecode(String),
    #[error("cannot resolve app data directory")]
    AppData,
    #[error("owner passphrase is invalid")]
    InvalidOwnerPassphrase,
}

#[derive(Debug, Clone, Serialize, Deserialize, Default)]
#[serde(rename_all = "camelCase")]
struct BillingStore {
    owner_override_enabled: bool,
    owner_override_set_at_utc_ms: Option<u64>,
    remote_pro_until_utc_ms: Option<u64>,
    last_refreshed_at_utc_ms: u64,
    last_status: Option<EntitlementStatus>,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
struct EncryptedBillingStore {
    version: u8,
    nonce_b64: String,
    ciphertext_b64: String,
}

pub struct BillingManager {
    path: PathBuf,
    _key_path: PathBuf,
    key: [u8; 32],
    store: BillingStore,
}

impl BillingManager {
    pub fn new() -> Result<Self, BillingError> {
        let proj_dirs =
            ProjectDirs::from("com", "voicewave", "localcore").ok_or(BillingError::AppData)?;
        let path = proj_dirs.config_dir().join("billing.json");
        let key_path = proj_dirs.config_dir().join("billing.key");
        Self::from_paths(path, key_path)
    }

    pub fn from_paths(path: impl AsRef<Path>, key_path: impl AsRef<Path>) -> Result<Self, BillingError> {
        let path = path.as_ref().to_path_buf();
        let key_path = key_path.as_ref().to_path_buf();
        let key = load_or_create_key(&key_path)?;
        let mut manager = Self {
            path,
            _key_path: key_path,
            key,
            store: BillingStore::default(),
        };
        manager.load()?;
        Ok(manager)
    }

    pub fn snapshot(&self) -> EntitlementSnapshot {
        self.compute_snapshot(None)
    }

    pub fn refresh_entitlement(&mut self) -> Result<EntitlementSnapshot, BillingError> {
        self.store.last_refreshed_at_utc_ms = now_utc_ms();

        if let Some(forced_until) = std::env::var("VOICEWAVE_PRO_UNTIL_UTC_MS")
            .ok()
            .and_then(|value| value.trim().parse::<u64>().ok())
            .filter(|value| *value > 0)
        {
            self.store.remote_pro_until_utc_ms = Some(forced_until);
        }

        self.persist()?;
        Ok(self.compute_snapshot(None))
    }

    pub fn restore_purchase(&mut self) -> Result<EntitlementSnapshot, BillingError> {
        self.refresh_entitlement()
    }

    pub fn set_owner_override(
        &mut self,
        enabled: bool,
        passphrase: &str,
    ) -> Result<EntitlementSnapshot, BillingError> {
        if !owner_passphrase_valid(passphrase) {
            return Err(BillingError::InvalidOwnerPassphrase);
        }

        self.store.owner_override_enabled = enabled;
        self.store.owner_override_set_at_utc_ms = if enabled { Some(now_utc_ms()) } else { None };
        self.store.last_refreshed_at_utc_ms = now_utc_ms();
        self.persist()?;
        Ok(self.compute_snapshot(Some("Owner override updated on this device.".to_string())))
    }

    pub fn start_checkout(&self) -> CheckoutLaunchResult {
        let url = std::env::var("VOICEWAVE_LEMON_CHECKOUT_URL")
            .ok()
            .filter(|value| !value.trim().is_empty())
            .unwrap_or_else(|| DEFAULT_CHECKOUT_URL.to_string());

        CheckoutLaunchResult {
            url,
            launched: false,
            message: Some(
                "Checkout link opening is disabled in this build. Configure billing URLs first."
                    .to_string(),
            ),
        }
    }

    pub fn open_billing_portal(&self) -> PortalLaunchResult {
        let url = std::env::var("VOICEWAVE_LEMON_PORTAL_URL")
            .ok()
            .filter(|value| !value.trim().is_empty())
            .unwrap_or_else(|| DEFAULT_PORTAL_URL.to_string());

        PortalLaunchResult {
            url,
            launched: false,
            message: Some(
                "Billing portal opening is disabled in this build. Configure billing URLs first."
                    .to_string(),
            ),
        }
    }

    fn compute_snapshot(&self, message: Option<String>) -> EntitlementSnapshot {
        let now = now_utc_ms();
        let plan = BillingPlanDisplay::default();

        if self.store.owner_override_enabled {
            return EntitlementSnapshot {
                tier: EntitlementTier::Pro,
                status: EntitlementStatus::OwnerOverride,
                is_pro: true,
                is_owner_override: true,
                expires_at_utc_ms: None,
                grace_until_utc_ms: None,
                last_refreshed_at_utc_ms: self.store.last_refreshed_at_utc_ms,
                plan,
                message,
            };
        }

        let expires_at = self.store.remote_pro_until_utc_ms;
        let grace_until = expires_at.map(|expires| expires.saturating_add(GRACE_WINDOW_MS));

        let (tier, status, is_pro) = match expires_at {
            Some(expires) if expires >= now => (EntitlementTier::Pro, EntitlementStatus::ProActive, true),
            Some(expires) if expires < now => {
                if let Some(grace) = grace_until {
                    if grace >= now {
                        (EntitlementTier::Pro, EntitlementStatus::Grace, true)
                    } else {
                        (EntitlementTier::Free, EntitlementStatus::Expired, false)
                    }
                } else {
                    (EntitlementTier::Free, EntitlementStatus::Expired, false)
                }
            }
            None => (EntitlementTier::Free, EntitlementStatus::Free, false),
            _ => (EntitlementTier::Free, EntitlementStatus::Free, false),
        };

        EntitlementSnapshot {
            tier,
            status,
            is_pro,
            is_owner_override: false,
            expires_at_utc_ms: expires_at,
            grace_until_utc_ms: grace_until,
            last_refreshed_at_utc_ms: self.store.last_refreshed_at_utc_ms,
            plan,
            message,
        }
    }

    fn load(&mut self) -> Result<(), BillingError> {
        if !self.path.exists() {
            return Ok(());
        }
        let raw = fs::read_to_string(&self.path).map_err(BillingError::Read)?;
        if let Ok(encrypted) = serde_json::from_str::<EncryptedBillingStore>(&raw) {
            self.store = decrypt_billing_store(&encrypted, &self.key)?;
            return Ok(());
        }

        self.store = serde_json::from_str(&raw).map_err(BillingError::Parse)?;
        self.persist()?;
        Ok(())
    }

    fn persist(&self) -> Result<(), BillingError> {
        if let Some(parent) = self.path.parent() {
            fs::create_dir_all(parent).map_err(BillingError::Write)?;
        }
        let encrypted = encrypt_billing_store(&self.store, &self.key)?;
        let raw = serde_json::to_string_pretty(&encrypted).map_err(BillingError::Parse)?;
        fs::write(&self.path, raw).map_err(BillingError::Write)?;
        Ok(())
    }
}

fn owner_passphrase_valid(passphrase: &str) -> bool {
    let candidate_hash = sha256_hex(passphrase.trim());

    if let Ok(expected_hash) = std::env::var("VOICEWAVE_OWNER_PASSPHRASE_HASH") {
        let expected = expected_hash.trim().to_ascii_lowercase();
        if expected.is_empty() {
            return false;
        }
        return candidate_hash == expected;
    }

    if cfg!(debug_assertions) {
        return passphrase.trim() == "Rishi";
    }

    false
}

fn sha256_hex(input: &str) -> String {
    let digest = Sha256::digest(input.as_bytes());
    digest.iter().map(|byte| format!("{byte:02x}")).collect()
}

fn load_or_create_key(path: &PathBuf) -> Result<[u8; 32], BillingError> {
    if path.exists() {
        let encoded = fs::read_to_string(path).map_err(BillingError::Read)?;
        let bytes = base64::engine::general_purpose::STANDARD
            .decode(encoded.trim())
            .map_err(|err| BillingError::KeyDecode(err.to_string()))?;
        if bytes.len() != 32 {
            return Err(BillingError::KeyDecode(
                "billing.key must decode to 32 bytes".to_string(),
            ));
        }
        let mut key = [0_u8; 32];
        key.copy_from_slice(&bytes);
        return Ok(key);
    }

    if let Some(parent) = path.parent() {
        fs::create_dir_all(parent).map_err(BillingError::Write)?;
    }
    let mut key = [0_u8; 32];
    OsRng.fill_bytes(&mut key);
    let encoded = base64::engine::general_purpose::STANDARD.encode(key);
    fs::write(path, encoded).map_err(BillingError::Write)?;
    Ok(key)
}

fn encrypt_billing_store(
    store: &BillingStore,
    key: &[u8; 32],
) -> Result<EncryptedBillingStore, BillingError> {
    let cipher =
        Aes256Gcm::new_from_slice(key).map_err(|err| BillingError::Encrypt(err.to_string()))?;
    let mut nonce_bytes = [0_u8; 12];
    OsRng.fill_bytes(&mut nonce_bytes);
    let nonce = Nonce::from_slice(&nonce_bytes);
    let plaintext = serde_json::to_vec(store).map_err(BillingError::Parse)?;
    let ciphertext = cipher
        .encrypt(nonce, plaintext.as_ref())
        .map_err(|err| BillingError::Encrypt(err.to_string()))?;

    Ok(EncryptedBillingStore {
        version: 1,
        nonce_b64: base64::engine::general_purpose::STANDARD.encode(nonce_bytes),
        ciphertext_b64: base64::engine::general_purpose::STANDARD.encode(ciphertext),
    })
}

fn decrypt_billing_store(
    encrypted: &EncryptedBillingStore,
    key: &[u8; 32],
) -> Result<BillingStore, BillingError> {
    if encrypted.version != 1 {
        return Err(BillingError::Decrypt(format!(
            "unsupported billing encryption version {}",
            encrypted.version
        )));
    }

    let nonce_bytes = base64::engine::general_purpose::STANDARD
        .decode(encrypted.nonce_b64.as_bytes())
        .map_err(|err| BillingError::Decrypt(err.to_string()))?;
    let ciphertext = base64::engine::general_purpose::STANDARD
        .decode(encrypted.ciphertext_b64.as_bytes())
        .map_err(|err| BillingError::Decrypt(err.to_string()))?;
    if nonce_bytes.len() != 12 {
        return Err(BillingError::Decrypt("nonce must be 12 bytes".to_string()));
    }

    let cipher =
        Aes256Gcm::new_from_slice(key).map_err(|err| BillingError::Decrypt(err.to_string()))?;
    let nonce = Nonce::from_slice(&nonce_bytes);
    let plaintext = cipher
        .decrypt(nonce, ciphertext.as_ref())
        .map_err(|err| BillingError::Decrypt(err.to_string()))?;
    serde_json::from_slice(&plaintext).map_err(BillingError::Parse)
}

fn now_utc_ms() -> u64 {
    SystemTime::now()
        .duration_since(UNIX_EPOCH)
        .map(|d| d.as_millis() as u64)
        .unwrap_or_default()
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn owner_override_forces_pro_snapshot() {
        let mut manager = BillingManager {
            path: std::env::temp_dir().join("voicewave-billing-test.json"),
            _key_path: std::env::temp_dir().join("voicewave-billing-test.key"),
            key: [7_u8; 32],
            store: BillingStore {
                owner_override_enabled: true,
                owner_override_set_at_utc_ms: Some(now_utc_ms()),
                remote_pro_until_utc_ms: None,
                last_refreshed_at_utc_ms: now_utc_ms(),
                last_status: None,
            },
        };

        let snapshot = manager.snapshot();
        assert!(snapshot.is_pro);
        assert_eq!(snapshot.status, EntitlementStatus::OwnerOverride);

        manager.store.owner_override_enabled = false;
        manager.store.remote_pro_until_utc_ms = Some(now_utc_ms().saturating_sub(1000));
        let expired = manager.snapshot();
        assert!(matches!(expired.status, EntitlementStatus::Grace | EntitlementStatus::Expired));
    }
}

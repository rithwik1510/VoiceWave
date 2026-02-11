use directories::ProjectDirs;
use serde::{Deserialize, Serialize};
use std::{
    fs,
    path::{Path, PathBuf},
};

#[derive(Debug, Clone, Copy, Serialize, Deserialize, PartialEq, Eq, Default)]
#[serde(rename_all = "lowercase")]
pub enum DecodeMode {
    #[default]
    Balanced,
    Fast,
    Quality,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(default, rename_all = "camelCase")]
pub struct VoiceWaveSettings {
    pub input_device: Option<String>,
    pub active_model: String,
    pub show_floating_hud: bool,
    pub vad_threshold: f32,
    pub max_utterance_ms: u64,
    pub release_tail_ms: u64,
    pub decode_mode: DecodeMode,
    pub diagnostics_opt_in: bool,
    pub toggle_hotkey: String,
    pub push_to_talk_hotkey: String,
    pub prefer_clipboard_fallback: bool,
}

impl Default for VoiceWaveSettings {
    fn default() -> Self {
        Self {
            input_device: None,
            active_model: "small.en".to_string(),
            show_floating_hud: true,
            vad_threshold: 0.014,
            max_utterance_ms: 30_000,
            release_tail_ms: 350,
            decode_mode: DecodeMode::Balanced,
            diagnostics_opt_in: false,
            toggle_hotkey: "Ctrl+Shift+Space".to_string(),
            push_to_talk_hotkey: "Ctrl+Alt+Space".to_string(),
            prefer_clipboard_fallback: false,
        }
    }
}

#[derive(Debug, thiserror::Error)]
pub enum SettingsError {
    #[error("failed to read settings file: {0}")]
    Read(std::io::Error),
    #[error("failed to write settings file: {0}")]
    Write(std::io::Error),
    #[error("failed to parse settings JSON: {0}")]
    Parse(serde_json::Error),
    #[error("cannot resolve app data directory")]
    AppData,
}

#[derive(Debug, Clone)]
pub struct SettingsStore {
    path: PathBuf,
}

impl SettingsStore {
    pub fn new() -> Result<Self, SettingsError> {
        let proj_dirs =
            ProjectDirs::from("com", "voicewave", "localcore").ok_or(SettingsError::AppData)?;
        let path = proj_dirs.config_dir().join("settings.json");
        Ok(Self { path })
    }

    pub fn from_path(path: impl AsRef<Path>) -> Self {
        Self {
            path: path.as_ref().to_path_buf(),
        }
    }

    pub fn load(&self) -> Result<VoiceWaveSettings, SettingsError> {
        if !self.path.exists() {
            return Ok(VoiceWaveSettings::default());
        }
        let raw = fs::read_to_string(&self.path).map_err(SettingsError::Read)?;
        serde_json::from_str(&raw).map_err(SettingsError::Parse)
    }

    pub fn save(&self, settings: &VoiceWaveSettings) -> Result<(), SettingsError> {
        if let Some(parent) = self.path.parent() {
            fs::create_dir_all(parent).map_err(SettingsError::Write)?;
        }
        let raw = serde_json::to_string_pretty(settings).map_err(SettingsError::Parse)?;
        fs::write(&self.path, raw).map_err(SettingsError::Write)?;
        Ok(())
    }
}

#[cfg(test)]
mod tests {
    use super::*;
    use std::time::{SystemTime, UNIX_EPOCH};

    fn temp_settings_path() -> PathBuf {
        let ts = SystemTime::now()
            .duration_since(UNIX_EPOCH)
            .expect("clock should be valid")
            .as_nanos();
        std::env::temp_dir().join(format!("voicewave-settings-{ts}.json"))
    }

    #[test]
    fn load_returns_default_if_missing() {
        let path = temp_settings_path();
        let store = SettingsStore::from_path(path);
        let loaded = store.load().expect("load should succeed");
        assert_eq!(loaded.active_model, "small.en");
    }

    #[test]
    fn save_then_load_round_trip() {
        let path = temp_settings_path();
        let store = SettingsStore::from_path(path.clone());
        let settings = VoiceWaveSettings {
            active_model: "medium.en".to_string(),
            vad_threshold: 0.025,
            max_utterance_ms: 22_000,
            release_tail_ms: 300,
            decode_mode: DecodeMode::Fast,
            diagnostics_opt_in: true,
            toggle_hotkey: "Ctrl+Shift+Space".to_string(),
            push_to_talk_hotkey: "Ctrl+Alt+Space".to_string(),
            prefer_clipboard_fallback: true,
            ..VoiceWaveSettings::default()
        };

        store.save(&settings).expect("save should succeed");
        let loaded = store.load().expect("load should succeed");

        assert_eq!(loaded.active_model, "medium.en");
        assert!((loaded.vad_threshold - 0.025).abs() < 1e-6);
        assert_eq!(loaded.max_utterance_ms, 22_000);
        assert_eq!(loaded.release_tail_ms, 300);
        assert_eq!(loaded.decode_mode, DecodeMode::Fast);
        assert!(loaded.diagnostics_opt_in);
        assert!(loaded.prefer_clipboard_fallback);
        let _ = std::fs::remove_file(path);
    }
}

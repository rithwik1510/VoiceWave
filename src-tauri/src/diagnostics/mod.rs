use crate::settings::{DecodeMode, VoiceWaveSettings};
use directories::ProjectDirs;
use serde::{Deserialize, Serialize};
use std::{
    fs,
    path::PathBuf,
    time::{SystemTime, UNIX_EPOCH},
};

#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct LatencyMetricRecord {
    pub session_id: u64,
    pub timestamp_utc_ms: u64,
    pub capture_ms: u64,
    pub release_to_transcribing_ms: u64,
    pub decode_ms: u64,
    pub post_ms: u64,
    pub insert_ms: u64,
    pub total_ms: u64,
    pub audio_duration_ms: u64,
    pub model_id: String,
    pub decode_mode: DecodeMode,
    pub watchdog_recovered: bool,
    pub segments_captured: u32,
    pub release_stop_detected_at_utc_ms: u64,
    pub model_init_ms: u64,
    pub audio_condition_ms: u64,
    pub decode_compute_ms: u64,
    pub runtime_cache_hit: bool,
    pub success: bool,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct DiagnosticsStatus {
    pub opt_in: bool,
    pub record_count: usize,
    pub last_export_path: Option<String>,
    pub last_exported_at_utc_ms: Option<u64>,
    pub watchdog_recovery_count: u64,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct DiagnosticsExportResult {
    pub file_path: String,
    pub exported_at_utc_ms: u64,
    pub record_count: usize,
    pub redaction_summary: String,
}

#[derive(Debug, Clone, Serialize, Deserialize, Default)]
#[serde(rename_all = "camelCase")]
struct DiagnosticsStore {
    records: Vec<LatencyMetricRecord>,
    last_export_path: Option<String>,
    last_exported_at_utc_ms: Option<u64>,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
struct DiagnosticsBundle {
    version: u8,
    app_version: String,
    exported_at_utc_ms: u64,
    redaction_summary: String,
    settings_snapshot: DiagnosticsSettingsSnapshot,
    aggregate: DiagnosticsAggregate,
    recent_records: Vec<LatencyMetricRecord>,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
struct DiagnosticsSettingsSnapshot {
    active_model: String,
    decode_mode: DecodeMode,
    vad_threshold: f32,
    max_utterance_ms: u64,
    release_tail_ms: u64,
    prefer_clipboard_fallback: bool,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
struct DiagnosticsAggregate {
    total_sessions: usize,
    successful_sessions: usize,
    success_rate_percent: f32,
    watchdog_recovery_count: u64,
    p50_total_ms: u64,
    p95_total_ms: u64,
    p50_release_to_transcribing_ms: u64,
    p95_release_to_transcribing_ms: u64,
}

#[derive(Debug, thiserror::Error)]
pub enum DiagnosticsError {
    #[error("failed to read diagnostics store: {0}")]
    Read(std::io::Error),
    #[error("failed to write diagnostics store: {0}")]
    Write(std::io::Error),
    #[error("failed to parse diagnostics JSON: {0}")]
    Parse(serde_json::Error),
    #[error("cannot resolve app data directory")]
    AppData,
    #[error("diagnostics export requires opt-in to be enabled")]
    OptInRequired,
}

pub struct DiagnosticsManager {
    store_path: PathBuf,
    export_dir: PathBuf,
    store: DiagnosticsStore,
}

impl DiagnosticsManager {
    const MAX_RECORDS: usize = 5_000;
    const EXPORT_RECENT_LIMIT: usize = 500;

    pub fn new() -> Result<Self, DiagnosticsError> {
        let proj_dirs =
            ProjectDirs::from("com", "voicewave", "localcore").ok_or(DiagnosticsError::AppData)?;
        let store_path = proj_dirs.config_dir().join("diagnostics.json");
        let export_dir = proj_dirs.data_dir().join("diagnostics-exports");
        let mut manager = Self {
            store_path,
            export_dir,
            store: DiagnosticsStore::default(),
        };
        manager.load()?;
        Ok(manager)
    }

    pub fn record_latency(&mut self, record: LatencyMetricRecord) -> Result<(), DiagnosticsError> {
        self.store.records.push(record);
        if self.store.records.len() > Self::MAX_RECORDS {
            let drop_count = self.store.records.len() - Self::MAX_RECORDS;
            self.store.records.drain(0..drop_count);
        }
        self.persist()
    }

    pub fn status(&self, opt_in: bool, watchdog_recovery_count: u64) -> DiagnosticsStatus {
        DiagnosticsStatus {
            opt_in,
            record_count: self.store.records.len(),
            last_export_path: self.store.last_export_path.clone(),
            last_exported_at_utc_ms: self.store.last_exported_at_utc_ms,
            watchdog_recovery_count,
        }
    }

    pub fn export_bundle(
        &mut self,
        opt_in: bool,
        app_version: &str,
        settings: &VoiceWaveSettings,
        watchdog_recovery_count: u64,
    ) -> Result<DiagnosticsExportResult, DiagnosticsError> {
        if !opt_in {
            return Err(DiagnosticsError::OptInRequired);
        }

        fs::create_dir_all(&self.export_dir).map_err(DiagnosticsError::Write)?;
        let exported_at = now_utc_ms();
        let filename = format!("voicewave-diagnostics-{exported_at}.json");
        let file_path = self.export_dir.join(filename);

        let redaction_summary =
            "Export contains no raw audio and no transcript text; only redacted performance metadata."
                .to_string();
        let bundle = DiagnosticsBundle {
            version: 1,
            app_version: app_version.to_string(),
            exported_at_utc_ms: exported_at,
            redaction_summary: redaction_summary.clone(),
            settings_snapshot: DiagnosticsSettingsSnapshot {
                active_model: settings.active_model.clone(),
                decode_mode: settings.decode_mode,
                vad_threshold: settings.vad_threshold,
                max_utterance_ms: settings.max_utterance_ms,
                release_tail_ms: settings.release_tail_ms,
                prefer_clipboard_fallback: settings.prefer_clipboard_fallback,
            },
            aggregate: aggregate_metrics(&self.store.records, watchdog_recovery_count),
            recent_records: self
                .store
                .records
                .iter()
                .rev()
                .take(Self::EXPORT_RECENT_LIMIT)
                .cloned()
                .collect(),
        };
        let encoded = serde_json::to_string_pretty(&bundle).map_err(DiagnosticsError::Parse)?;
        fs::write(&file_path, encoded).map_err(DiagnosticsError::Write)?;

        self.store.last_export_path = Some(file_path.to_string_lossy().to_string());
        self.store.last_exported_at_utc_ms = Some(exported_at);
        self.persist()?;

        Ok(DiagnosticsExportResult {
            file_path: file_path.to_string_lossy().to_string(),
            exported_at_utc_ms: exported_at,
            record_count: self.store.records.len(),
            redaction_summary,
        })
    }

    fn load(&mut self) -> Result<(), DiagnosticsError> {
        if !self.store_path.exists() {
            return Ok(());
        }
        let raw = fs::read_to_string(&self.store_path).map_err(DiagnosticsError::Read)?;
        self.store = serde_json::from_str(&raw).map_err(DiagnosticsError::Parse)?;
        Ok(())
    }

    fn persist(&self) -> Result<(), DiagnosticsError> {
        if let Some(parent) = self.store_path.parent() {
            fs::create_dir_all(parent).map_err(DiagnosticsError::Write)?;
        }
        let encoded = serde_json::to_string_pretty(&self.store).map_err(DiagnosticsError::Parse)?;
        fs::write(&self.store_path, encoded).map_err(DiagnosticsError::Write)?;
        Ok(())
    }
}

fn aggregate_metrics(records: &[LatencyMetricRecord], watchdog_recovery_count: u64) -> DiagnosticsAggregate {
    let mut total_values = records.iter().map(|row| row.total_ms).collect::<Vec<_>>();
    total_values.sort_unstable();
    let mut release_values = records
        .iter()
        .map(|row| row.release_to_transcribing_ms)
        .collect::<Vec<_>>();
    release_values.sort_unstable();

    let successful_sessions = records.iter().filter(|row| row.success).count();
    let success_rate_percent = if records.is_empty() {
        0.0
    } else {
        (successful_sessions as f32 / records.len() as f32) * 100.0
    };
    let p50_total_ms = percentile_u64(&total_values, 0.50);
    let p95_total_ms = percentile_u64(&total_values, 0.95);
    let p50_release_to_transcribing_ms = percentile_u64(&release_values, 0.50);
    let p95_release_to_transcribing_ms = percentile_u64(&release_values, 0.95);

    DiagnosticsAggregate {
        total_sessions: records.len(),
        successful_sessions,
        success_rate_percent,
        watchdog_recovery_count,
        p50_total_ms,
        p95_total_ms,
        p50_release_to_transcribing_ms,
        p95_release_to_transcribing_ms,
    }
}

fn percentile_u64(values: &[u64], percentile: f32) -> u64 {
    if values.is_empty() {
        return 0;
    }
    let clamped = percentile.clamp(0.0, 1.0);
    let idx = ((values.len() - 1) as f32 * clamped).round() as usize;
    values[idx]
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
    use crate::settings::VoiceWaveSettings;

    #[test]
    fn aggregate_handles_empty_input() {
        let aggregate = aggregate_metrics(&[], 0);
        assert_eq!(aggregate.total_sessions, 0);
        assert_eq!(aggregate.p95_total_ms, 0);
    }

    #[test]
    fn aggregate_reports_non_zero_percentiles() {
        let rows = vec![
            LatencyMetricRecord {
                session_id: 1,
                timestamp_utc_ms: 1,
                capture_ms: 10,
                release_to_transcribing_ms: 20,
                decode_ms: 30,
                post_ms: 10,
                insert_ms: 5,
                total_ms: 55,
                audio_duration_ms: 400,
                model_id: "tiny.en".to_string(),
                decode_mode: DecodeMode::Balanced,
                watchdog_recovered: false,
                segments_captured: 2,
                release_stop_detected_at_utc_ms: 1,
                model_init_ms: 18,
                audio_condition_ms: 7,
                decode_compute_ms: 24,
                runtime_cache_hit: false,
                success: true,
            },
            LatencyMetricRecord {
                session_id: 2,
                timestamp_utc_ms: 2,
                capture_ms: 15,
                release_to_transcribing_ms: 40,
                decode_ms: 50,
                post_ms: 12,
                insert_ms: 6,
                total_ms: 83,
                audio_duration_ms: 620,
                model_id: "small.en".to_string(),
                decode_mode: DecodeMode::Fast,
                watchdog_recovered: true,
                segments_captured: 3,
                release_stop_detected_at_utc_ms: 2,
                model_init_ms: 0,
                audio_condition_ms: 5,
                decode_compute_ms: 38,
                runtime_cache_hit: true,
                success: true,
            },
        ];

        let aggregate = aggregate_metrics(&rows, 1);
        assert_eq!(aggregate.total_sessions, 2);
        assert!(aggregate.p95_total_ms >= aggregate.p50_total_ms);
        assert!(aggregate.p95_release_to_transcribing_ms >= aggregate.p50_release_to_transcribing_ms);
    }

    #[test]
    fn export_requires_opt_in() {
        let mut manager = DiagnosticsManager {
            store_path: std::env::temp_dir().join("voicewave-diagnostics-test.json"),
            export_dir: std::env::temp_dir().join("voicewave-diagnostics-exports-test"),
            store: DiagnosticsStore::default(),
        };

        let err = manager
            .export_bundle(false, "0.1.0", &VoiceWaveSettings::default(), 0)
            .expect_err("export should require opt in");
        assert!(matches!(err, DiagnosticsError::OptInRequired));
    }
}

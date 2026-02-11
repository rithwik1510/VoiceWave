use crate::{
    audio::{
        analyze_captured_segments, AudioCaptureService, AudioError, AudioQualityBand,
        AudioQualityReport, CaptureOptions, VadConfig,
    },
    benchmark::{
        self, BenchmarkRequest, BenchmarkRun, ModelRecommendation, RecommendationConstraints,
    },
    diagnostics::{
        DiagnosticsError, DiagnosticsExportResult, DiagnosticsManager, DiagnosticsStatus,
        LatencyMetricRecord,
    },
    dictionary::{DictionaryError, DictionaryManager, DictionaryQueueItem, DictionaryTerm},
    history::{
        HistoryError, HistoryManager, RetentionPolicy, SessionHistoryQuery, SessionHistoryRecord,
    },
    hotkey::{HotkeyAction, HotkeyConfig, HotkeyError, HotkeyManager, HotkeyPhase, HotkeySnapshot},
    inference::{
        prewarm_runtime, cpu_runtime_pool_enabled, InferenceError, InferenceWorker,
        RuntimeDecodePolicy,
    },
    insertion::{
        InsertResult, InsertTextRequest, InsertionEngine, InsertionError, RecentInsertion,
        UndoResult,
    },
    model_manager::{
        InstalledModel, ModelCatalogItem, ModelDownloadRequest, ModelError, ModelEvent,
        ModelStatus, ModelStatusState,
    },
    permissions::{MicrophonePermission, PermissionManager, PermissionSnapshot},
    phase1,
    settings::{DecodeMode, SettingsError, SettingsStore, VoiceWaveSettings},
    transcript::sanitize_user_transcript,
};
use serde::{Deserialize, Serialize};
use std::{
    collections::HashMap,
    path::PathBuf,
    sync::{
        atomic::{AtomicBool, AtomicU64, Ordering},
        Arc,
    },
    sync::mpsc::RecvTimeoutError,
    time::{Duration, Instant, SystemTime, UNIX_EPOCH},
};
use tauri::{AppHandle, Emitter};
use tokio::sync::Mutex;
use tokio::time::sleep;
use tokio_util::sync::CancellationToken;

#[derive(Debug, Clone, Serialize, Deserialize, PartialEq, Eq)]
#[serde(rename_all = "camelCase")]
pub enum VoiceWaveHudState {
    Idle,
    Listening,
    Transcribing,
    Inserted,
    Error,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct VoiceWaveSnapshot {
    pub state: VoiceWaveHudState,
    pub last_partial: Option<String>,
    pub last_final: Option<String>,
    pub active_model: String,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
struct VoiceWaveStateEvent {
    state: VoiceWaveHudState,
    message: Option<String>,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
struct TranscriptEvent {
    text: String,
    is_final: bool,
    elapsed_ms: u64,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
struct LatencyBreakdownEvent {
    session_id: u64,
    capture_ms: u64,
    release_to_transcribing_ms: u64,
    watchdog_recovered: bool,
    segments_captured: u32,
    release_stop_detected_at_utc_ms: u64,
    model_init_ms: u64,
    audio_condition_ms: u64,
    decode_compute_ms: u64,
    runtime_cache_hit: bool,
    decode_ms: u64,
    post_ms: u64,
    insert_ms: u64,
    total_ms: u64,
    audio_duration_ms: u64,
    model_id: String,
    decode_mode: DecodeMode,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
struct MicLevelEvent {
    level: f32,
    error: Option<String>,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
struct HotkeyEvent {
    action: HotkeyAction,
    phase: HotkeyPhase,
}

#[derive(Debug, Clone, Copy, Serialize, Deserialize, PartialEq, Eq, Default)]
#[serde(rename_all = "camelCase")]
pub enum DictationMode {
    #[default]
    Microphone,
    Fixture,
}

#[derive(Debug, thiserror::Error)]
pub enum ControllerError {
    #[error("dictation is already active")]
    AlreadyRunning,
    #[error("settings error: {0}")]
    Settings(#[from] SettingsError),
    #[error("hotkey config error: {0}")]
    Hotkey(#[from] HotkeyError),
    #[error("audio error: {0}")]
    Audio(#[from] AudioError),
    #[error("insertion error: {0}")]
    Insertion(#[from] InsertionError),
    #[error("model error: {0}")]
    Model(#[from] ModelError),
    #[error("history error: {0}")]
    History(#[from] HistoryError),
    #[error("dictionary error: {0}")]
    Dictionary(#[from] DictionaryError),
    #[error("diagnostics error: {0}")]
    Diagnostics(#[from] DiagnosticsError),
    #[error("model not found: {0}")]
    MissingModel(String),
    #[error("benchmark results unavailable")]
    MissingBenchmark,
    #[error("{0}")]
    Runtime(String),
}

const RECOMMENDED_VAD_THRESHOLD: f32 = 0.014;
const MIN_VAD_THRESHOLD: f32 = 0.005;
const MAX_VAD_THRESHOLD: f32 = 0.04;

fn clamp_vad_threshold(value: f32) -> f32 {
    if !value.is_finite() {
        return RECOMMENDED_VAD_THRESHOLD;
    }
    value.clamp(MIN_VAD_THRESHOLD, MAX_VAD_THRESHOLD)
}

const MIN_MAX_UTTERANCE_MS: u64 = 5_000;
const MAX_MAX_UTTERANCE_MS: u64 = 30_000;
const MIN_RELEASE_TAIL_MS: u64 = 120;
const MAX_RELEASE_TAIL_MS: u64 = 1_500;
const RELEASE_WATCHDOG_MS: u64 = 300;
const SHORT_UTTERANCE_MAX_MS: u64 = 8_000;
const MEDIUM_UTTERANCE_MAX_MS: u64 = 16_000;

pub fn release_watchdog_threshold_ms() -> u64 {
    RELEASE_WATCHDOG_MS
}

pub fn release_watchdog_recovered(release_to_transcribing_ms: u64) -> bool {
    release_to_transcribing_ms > RELEASE_WATCHDOG_MS
}

fn clamp_max_utterance_ms(value: u64) -> u64 {
    value.clamp(MIN_MAX_UTTERANCE_MS, MAX_MAX_UTTERANCE_MS)
}

fn clamp_release_tail_ms(value: u64) -> u64 {
    value.clamp(MIN_RELEASE_TAIL_MS, MAX_RELEASE_TAIL_MS)
}

fn effective_release_tail_ms(configured_tail_ms: u64, max_utterance_ms: u64) -> u64 {
    if max_utterance_ms <= SHORT_UTTERANCE_MAX_MS {
        configured_tail_ms.min(220)
    } else if max_utterance_ms <= MEDIUM_UTTERANCE_MAX_MS {
        configured_tail_ms.min(300)
    } else {
        configured_tail_ms
    }
}

#[derive(Debug, Clone, Copy, PartialEq, Eq)]
enum DictationLifecycleState {
    Idle,
    Listening,
    ReleasePending,
    Transcribing,
    Inserted,
    Error,
}

#[derive(Debug, Clone)]
struct DictationSession {
    session_id: u64,
    state: DictationLifecycleState,
    release_requested_at: Option<Instant>,
    release_requested_at_utc_ms: Option<u64>,
}

pub struct VoiceWaveController {
    audio: AudioCaptureService,
    settings_store: SettingsStore,
    settings: Mutex<VoiceWaveSettings>,
    snapshot: Mutex<VoiceWaveSnapshot>,
    hotkey_manager: Mutex<HotkeyManager>,
    permission_manager: Mutex<PermissionManager>,
    insertion_engine: Mutex<InsertionEngine>,
    history_manager: Mutex<HistoryManager>,
    model_manager: Mutex<crate::model_manager::ModelManager>,
    dictionary_manager: Mutex<DictionaryManager>,
    benchmark_results: Mutex<Option<BenchmarkRun>>,
    model_statuses: Mutex<HashMap<String, ModelStatus>>,
    model_download_cancels: Mutex<HashMap<String, CancellationToken>>,
    model_download_pauses: Mutex<HashMap<String, Arc<AtomicBool>>>,
    diagnostics_manager: Mutex<DiagnosticsManager>,
    cancel_token: Mutex<Option<CancellationToken>>,
    stop_flag: Mutex<Option<Arc<AtomicBool>>>,
    active_session: Mutex<Option<DictationSession>>,
    session_counter: AtomicU64,
    watchdog_recovery_count: AtomicU64,
    hotkey_runtime_monitor: Mutex<Option<Arc<AtomicBool>>>,
    mic_level_monitor: Mutex<Option<Arc<AtomicBool>>>,
    decode_policy: Mutex<RuntimeDecodePolicy>,
}

impl VoiceWaveController {
    pub fn new() -> Result<Self, ControllerError> {
        let audio = AudioCaptureService::default();
        let settings_store = SettingsStore::new()?;
        let mut settings = settings_store.load()?;
        let clamped_vad = clamp_vad_threshold(settings.vad_threshold);
        let clamped_max_utterance = clamp_max_utterance_ms(settings.max_utterance_ms);
        let clamped_release_tail = clamp_release_tail_ms(settings.release_tail_ms);
        let decode_mode = settings.decode_mode;
        let mut settings_changed = false;
        if (clamped_vad - settings.vad_threshold).abs() > f32::EPSILON {
            settings.vad_threshold = clamped_vad;
            settings_changed = true;
        }
        if settings.max_utterance_ms != clamped_max_utterance {
            settings.max_utterance_ms = clamped_max_utterance;
            settings_changed = true;
        }
        if settings.release_tail_ms != clamped_release_tail {
            settings.release_tail_ms = clamped_release_tail;
            settings_changed = true;
        }
        settings.decode_mode = decode_mode;
        if settings_changed {
            settings_store.save(&settings)?;
        }
        let hotkey_config = HotkeyConfig {
            toggle: settings.toggle_hotkey.clone(),
            push_to_talk: settings.push_to_talk_hotkey.clone(),
        };
        let hotkey_manager = match HotkeyManager::new(hotkey_config.clone()) {
            Ok(manager) => manager,
            Err(_) => {
                let fallback = HotkeyConfig::default();
                settings.toggle_hotkey = fallback.toggle.clone();
                settings.push_to_talk_hotkey = fallback.push_to_talk.clone();
                settings_store.save(&settings)?;
                HotkeyManager::new(fallback)?
            }
        };
        let permission_manager = PermissionManager::new(&audio);
        let history_manager = HistoryManager::new()?;
        let model_manager = crate::model_manager::ModelManager::new()?;
        let dictionary_manager = DictionaryManager::new()?;
        let diagnostics_manager = DiagnosticsManager::new()?;
        if cpu_runtime_pool_enabled() {
            if let Some(installed_model) = model_manager.get_installed(&settings.active_model) {
                prewarm_runtime(
                    settings.active_model.clone(),
                    installed_model.file_path.clone(),
                    DecodeMode::Balanced,
                );
            }
        }

        Ok(Self {
            audio,
            settings_store,
            snapshot: Mutex::new(VoiceWaveSnapshot {
                state: VoiceWaveHudState::Idle,
                last_partial: None,
                last_final: None,
                active_model: settings.active_model.clone(),
            }),
            settings: Mutex::new(settings),
            hotkey_manager: Mutex::new(hotkey_manager),
            permission_manager: Mutex::new(permission_manager),
            insertion_engine: Mutex::new(InsertionEngine::default()),
            history_manager: Mutex::new(history_manager),
            model_manager: Mutex::new(model_manager),
            dictionary_manager: Mutex::new(dictionary_manager),
            benchmark_results: Mutex::new(None),
            model_statuses: Mutex::new(HashMap::new()),
            model_download_cancels: Mutex::new(HashMap::new()),
            model_download_pauses: Mutex::new(HashMap::new()),
            diagnostics_manager: Mutex::new(diagnostics_manager),
            cancel_token: Mutex::new(None),
            stop_flag: Mutex::new(None),
            active_session: Mutex::new(None),
            session_counter: AtomicU64::new(0),
            watchdog_recovery_count: AtomicU64::new(0),
            hotkey_runtime_monitor: Mutex::new(None),
            mic_level_monitor: Mutex::new(None),
            decode_policy: Mutex::new(RuntimeDecodePolicy::default()),
        })
    }

    pub async fn snapshot(&self) -> VoiceWaveSnapshot {
        self.snapshot.lock().await.clone()
    }

    pub async fn load_settings(&self) -> VoiceWaveSettings {
        self.settings.lock().await.clone()
    }

    pub async fn update_settings(
        &self,
        mut settings: VoiceWaveSettings,
    ) -> Result<VoiceWaveSettings, ControllerError> {
        settings.vad_threshold = clamp_vad_threshold(settings.vad_threshold);
        settings.max_utterance_ms = clamp_max_utterance_ms(settings.max_utterance_ms);
        settings.release_tail_ms = clamp_release_tail_ms(settings.release_tail_ms);
        self.settings_store.save(&settings)?;
        {
            let mut current = self.settings.lock().await;
            *current = settings.clone();
        }
        {
            let mut snapshot = self.snapshot.lock().await;
            snapshot.active_model = settings.active_model.clone();
        }

        let mut hotkey_manager = self.hotkey_manager.lock().await;
        hotkey_manager.update_config(HotkeyConfig {
            toggle: settings.toggle_hotkey.clone(),
            push_to_talk: settings.push_to_talk_hotkey.clone(),
        })?;

        if cpu_runtime_pool_enabled() {
            let model_path = {
                let manager = self.model_manager.lock().await;
                manager
                    .get_installed(&settings.active_model)
                    .map(|row| row.file_path.clone())
            };
            if let Some(path) = model_path {
                prewarm_runtime(settings.active_model.clone(), path, DecodeMode::Balanced);
            }
        }

        Ok(settings)
    }

    pub async fn start_dictation(
        &self,
        app: AppHandle,
        mode: DictationMode,
    ) -> Result<(), ControllerError> {
        let session_id = self.session_counter.fetch_add(1, Ordering::Relaxed) + 1;
        {
            let mut active = self.active_session.lock().await;
            *active = Some(DictationSession {
                session_id,
                state: DictationLifecycleState::Listening,
                release_requested_at: None,
                release_requested_at_utc_ms: None,
            });
        }

        let cancel_token = {
            let mut token_slot = self.cancel_token.lock().await;
            if token_slot
                .as_ref()
                .is_some_and(|token| !token.is_cancelled())
            {
                return Err(ControllerError::AlreadyRunning);
            }
            let token = CancellationToken::new();
            *token_slot = Some(token.clone());
            token
        };

        let stop_flag = {
            let flag = Arc::new(AtomicBool::new(false));
            let mut slot = self.stop_flag.lock().await;
            *slot = Some(flag.clone());
            flag
        };

        let run_result = self
            .run_dictation_flow(app.clone(), mode, session_id, cancel_token, stop_flag)
            .await;
        {
            let mut token_slot = self.cancel_token.lock().await;
            *token_slot = None;
        }
        {
            let mut stop_slot = self.stop_flag.lock().await;
            *stop_slot = None;
        }
        {
            let mut active = self.active_session.lock().await;
            if active
                .as_ref()
                .is_some_and(|session| session.session_id == session_id)
            {
                *active = None;
            }
        }

        if let Err(err) = run_result {
            self.set_session_state(
                session_id,
                DictationLifecycleState::Error,
                None,
                None,
            )
            .await;
            self.update_state(
                &app,
                VoiceWaveHudState::Error,
                Some(format!("Dictation failed: {err}")),
            )
            .await;
            return Err(err);
        }
        Ok(())
    }

    pub async fn cancel_dictation(&self, app: AppHandle) {
        if let Some(token) = self.cancel_token.lock().await.clone() {
            token.cancel();
        }
        if let Some(stop_flag) = self.stop_flag.lock().await.clone() {
            stop_flag.store(true, Ordering::Relaxed);
        }
        self.set_any_active_session_state(DictationLifecycleState::Idle, None, None)
            .await;
        self.update_state(
            &app,
            VoiceWaveHudState::Idle,
            Some("Dictation cancelled.".to_string()),
        )
        .await;
    }

    pub async fn stop_dictation(&self, app: AppHandle) {
        if let Some(stop_flag) = self.stop_flag.lock().await.clone() {
            stop_flag.store(true, Ordering::Relaxed);
        }

        let release_now = Instant::now();
        let release_now_utc_ms = now_utc_ms();
        self.set_any_active_session_state(
            DictationLifecycleState::ReleasePending,
            Some(release_now),
            Some(release_now_utc_ms),
        )
        .await;
        let should_transition = {
            let current_state = self.snapshot.lock().await.state.clone();
            matches!(current_state, VoiceWaveHudState::Listening)
        };
        if should_transition {
            self.update_state(
                &app,
                VoiceWaveHudState::Transcribing,
                Some("Finishing dictation...".to_string()),
            )
            .await;
        }
    }

    pub async fn hotkey_snapshot(&self) -> HotkeySnapshot {
        self.hotkey_manager.lock().await.snapshot()
    }

    pub async fn ensure_hotkey_runtime_monitor(
        self: Arc<Self>,
        app: AppHandle,
    ) {
        let mut slot = self.hotkey_runtime_monitor.lock().await;
        if slot.is_some() {
            return;
        }

        let stop_flag = Arc::new(AtomicBool::new(false));
        *slot = Some(stop_flag.clone());
        drop(slot);

        let controller = self.clone();
        tauri::async_runtime::spawn(async move {
            eprintln!("voicewave: global hotkey runtime monitor started (Windows key-state polling)");
            let mut toggle_was_down = false;
            let mut push_was_down = false;
            loop {
                if stop_flag.load(Ordering::Relaxed) {
                    break;
                }

                let (toggle_down, push_down) = {
                    let manager = controller.hotkey_manager.lock().await;
                    (
                        manager.is_action_pressed(HotkeyAction::ToggleDictation),
                        manager.is_action_pressed(HotkeyAction::PushToTalk),
                    )
                };

                if toggle_down && !toggle_was_down {
                    let controller_for_action = controller.clone();
                    let app_for_action = app.clone();
                    tauri::async_runtime::spawn(async move {
                        let _ = controller_for_action
                            .trigger_hotkey_action(
                                app_for_action,
                                HotkeyAction::ToggleDictation,
                                HotkeyPhase::Triggered,
                            )
                            .await;
                    });
                }

                if push_down && !push_was_down {
                    let controller_for_action = controller.clone();
                    let app_for_action = app.clone();
                    tauri::async_runtime::spawn(async move {
                        let _ = controller_for_action
                            .trigger_hotkey_action(
                                app_for_action,
                                HotkeyAction::PushToTalk,
                                HotkeyPhase::Pressed,
                            )
                            .await;
                    });
                } else if !push_down && push_was_down {
                    let controller_for_action = controller.clone();
                    let app_for_action = app.clone();
                    tauri::async_runtime::spawn(async move {
                        let _ = controller_for_action
                            .trigger_hotkey_action(
                                app_for_action,
                                HotkeyAction::PushToTalk,
                                HotkeyPhase::Released,
                            )
                            .await;
                    });
                }

                toggle_was_down = toggle_down;
                push_was_down = push_down;
                sleep(Duration::from_millis(20)).await;
            }
        });
    }

    pub async fn update_hotkey_config(
        &self,
        config: HotkeyConfig,
    ) -> Result<HotkeySnapshot, ControllerError> {
        let snapshot = {
            let mut manager = self.hotkey_manager.lock().await;
            manager.update_config(config.clone())?
        };

        let mut settings = self.settings.lock().await.clone();
        settings.toggle_hotkey = config.toggle;
        settings.push_to_talk_hotkey = config.push_to_talk;
        self.settings_store.save(&settings)?;
        *self.settings.lock().await = settings;

        Ok(snapshot)
    }

    pub async fn permission_snapshot(&self) -> PermissionSnapshot {
        self.permission_manager.lock().await.snapshot()
    }

    pub async fn list_input_devices(&self) -> Vec<String> {
        self.audio.list_input_devices()
    }

    pub async fn get_diagnostics_status(&self) -> DiagnosticsStatus {
        let settings = self.settings.lock().await.clone();
        let watchdog_recovery_count = self.watchdog_recovery_count.load(Ordering::Relaxed);
        self.diagnostics_manager
            .lock()
            .await
            .status(settings.diagnostics_opt_in, watchdog_recovery_count)
    }

    pub async fn set_diagnostics_opt_in(
        &self,
        enabled: bool,
    ) -> Result<DiagnosticsStatus, ControllerError> {
        let mut settings = self.settings.lock().await.clone();
        settings.diagnostics_opt_in = enabled;
        self.settings_store.save(&settings)?;
        {
            let mut current = self.settings.lock().await;
            *current = settings.clone();
        }
        let watchdog_recovery_count = self.watchdog_recovery_count.load(Ordering::Relaxed);
        Ok(self
            .diagnostics_manager
            .lock()
            .await
            .status(settings.diagnostics_opt_in, watchdog_recovery_count))
    }

    pub async fn export_diagnostics_bundle(
        &self,
    ) -> Result<DiagnosticsExportResult, ControllerError> {
        let settings = self.settings.lock().await.clone();
        let watchdog_recovery_count = self.watchdog_recovery_count.load(Ordering::Relaxed);
        let result = self
            .diagnostics_manager
            .lock()
            .await
            .export_bundle(
                settings.diagnostics_opt_in,
                env!("CARGO_PKG_VERSION"),
                &settings,
                watchdog_recovery_count,
            )?;
        Ok(result)
    }

    pub async fn request_microphone_access(&self, app: AppHandle) -> PermissionSnapshot {
        let snapshot = self
            .permission_manager
            .lock()
            .await
            .request_microphone_access(&self.audio);
        let _ = app.emit("voicewave://permission", snapshot.clone());
        snapshot
    }

    pub async fn start_mic_level_monitor(&self, app: AppHandle) -> Result<(), ControllerError> {
        let mut slot = self.mic_level_monitor.lock().await;
        if slot.is_some() {
            return Ok(());
        }

        let settings = self.settings.lock().await.clone();
        let audio = self.audio.clone();
        let input_device = settings.input_device.clone();

        let stop_flag = Arc::new(AtomicBool::new(false));
        let stop_for_thread = stop_flag.clone();
        let app_for_thread = app.clone();

        std::thread::spawn(move || {
            let monitor = audio.start_level_monitor(input_device.as_deref());
            let (stream, level_rx, error_rx) = match monitor {
                Ok(row) => (row.stream, row.level_rx, row.error_rx),
                Err(err) => {
                    let _ = app_for_thread.emit(
                        "voicewave://mic-level",
                        MicLevelEvent {
                            level: 0.0,
                            error: Some(err.to_string()),
                        },
                    );
                    return;
                }
            };

            let _stream = stream;
            let mut latest_level = 0.0f32;
            let mut last_emit = Instant::now();
            loop {
                if stop_for_thread.load(Ordering::Relaxed) {
                    break;
                }
                if let Ok(err) = error_rx.try_recv() {
                    let _ = app_for_thread.emit(
                        "voicewave://mic-level",
                        MicLevelEvent {
                            level: 0.0,
                            error: Some(err),
                        },
                    );
                    break;
                }
                match level_rx.recv_timeout(Duration::from_millis(40)) {
                    Ok(level) => {
                        latest_level = level.min(1.0).max(0.0);
                    }
                    Err(RecvTimeoutError::Timeout) => {}
                    Err(RecvTimeoutError::Disconnected) => break,
                }

                if last_emit.elapsed() >= Duration::from_millis(80) {
                    let _ = app_for_thread.emit(
                        "voicewave://mic-level",
                        MicLevelEvent {
                            level: latest_level,
                            error: None,
                        },
                    );
                    last_emit = Instant::now();
                }
            }
        });

        *slot = Some(stop_flag);
        Ok(())
    }

    pub async fn stop_mic_level_monitor(&self) {
        if let Some(stop_flag) = self.mic_level_monitor.lock().await.take() {
            stop_flag.store(true, Ordering::Relaxed);
        }
    }

    pub async fn run_audio_quality_diagnostic(
        &self,
        app: AppHandle,
        duration_ms: Option<u64>,
    ) -> Result<AudioQualityReport, ControllerError> {
        if self.is_dictation_active().await {
            return Err(ControllerError::AlreadyRunning);
        }

        let permission_snapshot = self
            .permission_manager
            .lock()
            .await
            .request_microphone_access(&self.audio);
        let _ = app.emit("voicewave://permission", permission_snapshot.clone());
        if permission_snapshot.microphone != MicrophonePermission::Granted {
            return Err(ControllerError::Runtime(
                permission_snapshot
                    .message
                    .unwrap_or_else(|| "Microphone access is not ready.".to_string()),
            ));
        }

        let settings = self.settings.lock().await.clone();
        let threshold = clamp_vad_threshold(settings.vad_threshold);
        let max_capture_ms = duration_ms.unwrap_or(10_000).clamp(4_000, 20_000);
        let silence_timeout_ms = ((max_capture_ms as f32) * 0.22).round() as u64;
        let silence_timeout_ms = silence_timeout_ms.clamp(700, 2_000);

        self.update_state(
            &app,
            VoiceWaveHudState::Listening,
            Some("Running audio quality check. Hold push-to-talk and speak naturally.".to_string()),
        )
        .await;

        let audio = self.audio.clone();
        let input_device = settings.input_device.clone();
        let capture_options = CaptureOptions {
            vad_config: VadConfig {
                threshold,
                ..VadConfig::default()
            },
            max_capture_duration: Duration::from_millis(max_capture_ms),
            silence_timeout: Duration::from_millis(silence_timeout_ms),
            release_tail: Duration::from_millis(0),
        };

        let captured = tokio::task::spawn_blocking(move || {
            audio.capture_segments_from_microphone(input_device.as_deref(), capture_options)
        })
        .await
        .map_err(|err| ControllerError::Runtime(format!("audio diagnostic join failure: {err}")))?;

        let segments = match captured {
            Ok(rows) => rows,
            Err(AudioError::NoSpeechDetected) => {
                self.update_state(
                    &app,
                    VoiceWaveHudState::Idle,
                    Some("No speech detected during quality check. Hold to talk and speak closer to the mic.".to_string()),
                )
                .await;
                return Err(ControllerError::Runtime(
                    "Audio quality check captured no speech.".to_string(),
                ));
            }
            Err(err) => {
                self.update_state(
                    &app,
                    VoiceWaveHudState::Idle,
                    Some(format!("Audio quality check failed: {err}")),
                )
                .await;
                return Err(ControllerError::Audio(err));
            }
        };

        let report =
            analyze_captured_segments(&segments, self.audio.target_sample_rate, threshold);
        let _ = app.emit("voicewave://audio-quality", report.clone());

        let quality = match report.quality {
            AudioQualityBand::Good => "good",
            AudioQualityBand::Fair => "fair",
            AudioQualityBand::Poor => "poor",
        };
        self.update_state(
            &app,
            VoiceWaveHudState::Idle,
            Some(format!(
                "Audio quality check complete: {quality} (RMS {:.3}, SNR {:.1} dB).",
                report.rms, report.estimated_snr_db
            )),
        )
        .await;

        Ok(report)
    }

    pub async fn insert_text(
        &self,
        app: AppHandle,
        mut payload: InsertTextRequest,
    ) -> Result<InsertResult, ControllerError> {
        if !payload.prefer_clipboard {
            let settings = self.settings.lock().await.clone();
            payload.prefer_clipboard = settings.prefer_clipboard_fallback;
        }

        let result = self
            .insertion_engine
            .lock()
            .await
            .insert_text(payload.clone())?;
        self.history_manager
            .lock()
            .await
            .record_insertion(&result, &payload.text)?;

        if result.success {
            self.update_state(&app, VoiceWaveHudState::Inserted, result.message.clone())
                .await;
        } else {
            self.update_state(
                &app,
                VoiceWaveHudState::Inserted,
                result.message
                    .clone()
                    .or(Some("Insertion fallback used. Transcript preserved.".to_string())),
            )
                .await;
        }
        let _ = app.emit("voicewave://insertion", result.clone());

        Ok(result)
    }

    pub async fn undo_last_insertion(&self, app: AppHandle) -> UndoResult {
        let result = self.insertion_engine.lock().await.undo_last();
        if result.success {
            self.update_state(&app, VoiceWaveHudState::Inserted, result.message.clone())
                .await;
        } else {
            self.update_state(&app, VoiceWaveHudState::Error, result.message.clone())
                .await;
        }
        result
    }

    pub async fn recent_insertions(&self, limit: Option<usize>) -> Vec<RecentInsertion> {
        self.insertion_engine.lock().await.recent_insertions(limit)
    }

    pub async fn trigger_hotkey_action(
        &self,
        app: AppHandle,
        action: HotkeyAction,
        phase: HotkeyPhase,
    ) -> Result<(), ControllerError> {
        let _ = app.emit(
            "voicewave://hotkey",
            HotkeyEvent {
                action: action.clone(),
                phase: phase.clone(),
            },
        );

        match (action, phase) {
            (HotkeyAction::ToggleDictation, HotkeyPhase::Triggered) => {
                if self.is_dictation_active().await {
                    self.stop_dictation(app).await;
                    Ok(())
                } else {
                    self.start_dictation(app, DictationMode::Microphone).await
                }
            }
            (HotkeyAction::PushToTalk, HotkeyPhase::Pressed) => {
                let still_pressed = {
                    let manager = self.hotkey_manager.lock().await;
                    manager.is_action_pressed(HotkeyAction::PushToTalk)
                };
                if !still_pressed {
                    return Ok(());
                }
                if self.is_dictation_active().await {
                    Ok(())
                } else {
                    self.start_dictation(app, DictationMode::Microphone).await
                }
            }
            (HotkeyAction::PushToTalk, HotkeyPhase::Released) => {
                self.stop_dictation(app).await;
                Ok(())
            }
            _ => Ok(()),
        }
    }

    pub async fn list_model_catalog(&self) -> Vec<ModelCatalogItem> {
        self.model_manager.lock().await.list_catalog()
    }

    pub async fn list_installed_models(&self) -> Vec<InstalledModel> {
        self.model_manager.lock().await.list_installed()
    }

    pub async fn get_model_status(&self, model_id: String) -> Result<ModelStatus, ControllerError> {
        if let Some(status) = self.model_statuses.lock().await.get(&model_id).cloned() {
            return Ok(status);
        }

        let active_model = self.settings.lock().await.active_model.clone();
        let manager = self.model_manager.lock().await;
        manager
            .get_download_status(&model_id, Some(active_model.as_str()))
            .ok_or(ControllerError::MissingModel(model_id))
    }

    pub async fn download_model(
        &self,
        app: AppHandle,
        request: ModelDownloadRequest,
    ) -> Result<ModelStatus, ControllerError> {
        let model_id = request.model_id.clone();
        let active_model = self.settings.lock().await.active_model.clone();
        let app_for_emit = app.clone();

        let cancel_token = CancellationToken::new();
        self.model_download_cancels
            .lock()
            .await
            .insert(model_id.clone(), cancel_token.clone());

        let pause_flag = {
            let mut pauses = self.model_download_pauses.lock().await;
            let entry = pauses
                .entry(model_id.clone())
                .or_insert_with(|| Arc::new(AtomicBool::new(false)))
                .clone();
            entry.store(false, Ordering::Relaxed);
            entry
        };

        let mut latest_progress = None::<ModelStatus>;
        let model_id_for_events = model_id.clone();
        let result = self.model_manager.lock().await.install_model_resumable(
            &model_id,
            || cancel_token.is_cancelled(),
            || pause_flag.load(Ordering::Relaxed),
            |status| {
                latest_progress = Some(status.clone());
                if let Ok(mut statuses) = self.model_statuses.try_lock() {
                    statuses.insert(model_id_for_events.clone(), status.clone());
                }
                self.emit_model_status(&app_for_emit, &status);
            },
        );

        self.model_download_cancels.lock().await.remove(&model_id);

        let mut final_status = match result {
            Ok(status) => status,
            Err(err) => self
                .model_manager
                .lock()
                .await
                .get_download_status(&model_id, Some(active_model.as_str()))
                .unwrap_or(ModelStatus {
                    model_id: model_id.clone(),
                    state: ModelStatusState::Failed,
                    progress: latest_progress.as_ref().map(|row| row.progress).unwrap_or(0),
                    active: active_model == model_id,
                    installed: false,
                    message: Some(err.to_string()),
                    installed_model: None,
                    downloaded_bytes: latest_progress
                        .as_ref()
                        .and_then(|row| row.downloaded_bytes),
                    total_bytes: latest_progress.as_ref().and_then(|row| row.total_bytes),
                    resumable: true,
                }),
        };

        final_status.active = active_model == model_id;
        if matches!(final_status.state, ModelStatusState::Installed) {
            let current_active = self.settings.lock().await.active_model.clone();
            let has_active = self
                .model_manager
                .lock()
                .await
                .get_installed(&current_active)
                .is_some();
            if !has_active {
                let _ = self.set_active_model(app.clone(), model_id.clone()).await;
                final_status.active = true;
            }
        }
        self.model_statuses
            .lock()
            .await
            .insert(model_id.clone(), final_status.clone());
        self.emit_model_status(&app, &final_status);
        Ok(final_status)
    }

    pub async fn cancel_model_download(
        &self,
        app: AppHandle,
        model_id: String,
    ) -> Result<ModelStatus, ControllerError> {
        if let Some(token) = self
            .model_download_cancels
            .lock()
            .await
            .get(&model_id)
            .cloned()
        {
            token.cancel();
        }
        if let Some(pause_flag) = self
            .model_download_pauses
            .lock()
            .await
            .get(&model_id)
            .cloned()
        {
            pause_flag.store(false, Ordering::Relaxed);
        }

        let active_model = self.settings.lock().await.active_model.clone();
        let mut status = self
            .model_manager
            .lock()
            .await
            .get_download_status(&model_id, Some(active_model.as_str()))
            .unwrap_or(ModelStatus {
                model_id: model_id.clone(),
                state: ModelStatusState::Idle,
                progress: 0,
                active: false,
                installed: false,
                message: Some("No active download to cancel.".to_string()),
                installed_model: None,
                downloaded_bytes: Some(0),
                total_bytes: None,
                resumable: false,
            });
        status.state = ModelStatusState::Cancelled;
        status.message = Some("Cancellation requested. Resume will continue from checkpoint.".to_string());
        status.resumable = true;
        self.model_statuses
            .lock()
            .await
            .insert(model_id, status.clone());
        self.emit_model_status(&app, &status);
        Ok(status)
    }

    pub async fn pause_model_download(
        &self,
        app: AppHandle,
        model_id: String,
    ) -> Result<ModelStatus, ControllerError> {
        if let Some(pause_flag) = self
            .model_download_pauses
            .lock()
            .await
            .get(&model_id)
            .cloned()
        {
            pause_flag.store(true, Ordering::Relaxed);
        }

        let active_model = self.settings.lock().await.active_model.clone();
        let mut status = self
            .model_manager
            .lock()
            .await
            .get_download_status(&model_id, Some(active_model.as_str()))
            .unwrap_or(ModelStatus {
                model_id: model_id.clone(),
                state: ModelStatusState::Paused,
                progress: 0,
                active: false,
                installed: false,
                message: Some("Pause requested.".to_string()),
                installed_model: None,
                downloaded_bytes: Some(0),
                total_bytes: None,
                resumable: true,
            });
        status.state = ModelStatusState::Paused;
        status.message = Some("Pause requested. Resume continues from saved bytes.".to_string());
        status.resumable = true;
        self.model_statuses
            .lock()
            .await
            .insert(model_id, status.clone());
        self.emit_model_status(&app, &status);
        Ok(status)
    }

    pub async fn resume_model_download(
        &self,
        app: AppHandle,
        model_id: String,
    ) -> Result<ModelStatus, ControllerError> {
        if let Some(pause_flag) = self
            .model_download_pauses
            .lock()
            .await
            .get(&model_id)
            .cloned()
        {
            pause_flag.store(false, Ordering::Relaxed);
        }
        self.download_model(app, ModelDownloadRequest { model_id }).await
    }

    pub async fn set_active_model(
        &self,
        app: AppHandle,
        model_id: String,
    ) -> Result<VoiceWaveSettings, ControllerError> {
        let has_model = {
            let manager = self.model_manager.lock().await;
            manager.get_catalog_item(&model_id).is_some()
        };
        if !has_model {
            return Err(ControllerError::MissingModel(model_id));
        }

        let mut settings = self.settings.lock().await.clone();
        settings.active_model = model_id.clone();
        self.settings_store.save(&settings)?;
        *self.settings.lock().await = settings.clone();
        self.snapshot.lock().await.active_model = model_id.clone();

        let state = self.snapshot.lock().await.state.clone();
        self.emit_state(&app, state, Some("Active model updated.".to_string()));

        if cpu_runtime_pool_enabled() {
            let model_path = {
                let manager = self.model_manager.lock().await;
                manager.get_installed(&model_id).map(|row| row.file_path.clone())
            };
            if let Some(path) = model_path {
                prewarm_runtime(model_id.clone(), path, DecodeMode::Balanced);
            }
        }

        Ok(settings)
    }

    pub async fn run_model_benchmark(
        &self,
        _app: AppHandle,
        request: BenchmarkRequest,
    ) -> Result<BenchmarkRun, ControllerError> {
        let model_ids = if let Some(ids) = request.model_ids.clone() {
            ids
        } else {
            self.model_manager
                .lock()
                .await
                .list_catalog()
                .into_iter()
                .map(|item| item.model_id)
                .collect::<Vec<_>>()
        };

        if model_ids.is_empty() {
            return Err(ControllerError::Runtime(
                "Benchmark cannot run without model IDs.".to_string(),
            ));
        }

        let runs = request.runs_per_model.unwrap_or(3).clamp(1, 12);
        let started_at_utc_ms = benchmark::now_utc_ms();
        let mut rows = Vec::new();
        let sample_rate = self.audio.target_sample_rate as usize;
        let fixture_segments = phase1::build_fixture_segments(0.014);
        if fixture_segments.is_empty() {
            return Err(ControllerError::Runtime(
                "Benchmark fixture segments are unavailable.".to_string(),
            ));
        }
        let inter_segment_gap = (sample_rate / 20).max(1); // 50ms
        let mut merged_samples = Vec::new();
        for (idx, segment) in fixture_segments.iter().enumerate() {
            if idx > 0 {
                merged_samples.extend(vec![0.0_f32; inter_segment_gap]);
            }
            merged_samples.extend_from_slice(segment);
        }
        if merged_samples.is_empty() {
            return Err(ControllerError::Runtime(
                "Benchmark merged fixture samples are empty.".to_string(),
            ));
        }

        for model_id in model_ids {
            let model_path = self.resolve_active_model_path(&model_id).await?;
            let worker =
                InferenceWorker::new_runtime_with_mode(model_id.clone(), model_path, DecodeMode::Balanced);
            let mut latencies = Vec::with_capacity(runs);
            let mut rtfs = Vec::with_capacity(runs);

            for _ in 0..runs {
                let token = CancellationToken::new();
                let started = Instant::now();
                let _ = worker
                    .transcribe_segment(&merged_samples, &token, |_, _, _| {})
                    .await;
                let elapsed = started.elapsed().as_millis() as u64;
                latencies.push(elapsed);
                rtfs.push(crate::inference::estimate_rtf(elapsed, merged_samples.len()));
            }

            latencies.sort_unstable();
            let p50_index = percentile_index(latencies.len(), 0.50);
            let p95_index = percentile_index(latencies.len(), 0.95);
            let average_rtf = if rtfs.is_empty() {
                0.0
            } else {
                rtfs.iter().sum::<f32>() / rtfs.len() as f32
            };

            rows.push(benchmark::BenchmarkRow {
                model_id,
                runs,
                p50_latency_ms: latencies[p50_index],
                p95_latency_ms: latencies[p95_index],
                average_rtf,
            });
        }

        let run = BenchmarkRun {
            started_at_utc_ms,
            completed_at_utc_ms: benchmark::now_utc_ms(),
            rows,
        };
        *self.benchmark_results.lock().await = Some(run.clone());
        Ok(run)
    }

    pub async fn get_benchmark_results(&self) -> Option<BenchmarkRun> {
        self.benchmark_results.lock().await.clone()
    }

    pub async fn recommend_model(
        &self,
        constraints: RecommendationConstraints,
    ) -> Result<ModelRecommendation, ControllerError> {
        let run = self
            .benchmark_results
            .lock()
            .await
            .clone()
            .ok_or(ControllerError::MissingBenchmark)?;
        benchmark::recommend_model(&run.rows, constraints).ok_or(ControllerError::MissingBenchmark)
    }

    pub async fn get_session_history(
        &self,
        query: SessionHistoryQuery,
    ) -> Vec<SessionHistoryRecord> {
        self.history_manager.lock().await.get_records(query)
    }

    pub async fn set_history_retention(
        &self,
        _app: AppHandle,
        policy: RetentionPolicy,
    ) -> Result<RetentionPolicy, ControllerError> {
        self.history_manager
            .lock()
            .await
            .set_retention_policy(policy)
            .map_err(ControllerError::from)
    }

    pub async fn prune_history_now(&self, _app: AppHandle) -> Result<usize, ControllerError> {
        self.history_manager
            .lock()
            .await
            .prune_now()
            .map_err(ControllerError::from)
    }

    pub async fn clear_history(&self, _app: AppHandle) -> Result<usize, ControllerError> {
        self.history_manager
            .lock()
            .await
            .clear()
            .map_err(ControllerError::from)
    }

    pub async fn get_dictionary_queue(&self, limit: Option<usize>) -> Vec<DictionaryQueueItem> {
        self.dictionary_manager.lock().await.get_queue(limit)
    }

    pub async fn approve_dictionary_entry(
        &self,
        _app: AppHandle,
        entry_id: String,
        normalized_text: Option<String>,
    ) -> Result<DictionaryTerm, ControllerError> {
        self.dictionary_manager
            .lock()
            .await
            .approve_entry(&entry_id, normalized_text)
            .map_err(ControllerError::from)
    }

    pub async fn reject_dictionary_entry(
        &self,
        _app: AppHandle,
        entry_id: String,
        reason: Option<String>,
    ) -> Result<(), ControllerError> {
        self.dictionary_manager
            .lock()
            .await
            .reject_entry(&entry_id, reason)
            .map_err(ControllerError::from)
    }

    pub async fn get_dictionary_terms(&self, query: Option<String>) -> Vec<DictionaryTerm> {
        self.dictionary_manager.lock().await.get_terms(query)
    }

    pub async fn remove_dictionary_term(
        &self,
        _app: AppHandle,
        term_id: String,
    ) -> Result<(), ControllerError> {
        self.dictionary_manager
            .lock()
            .await
            .remove_term(&term_id)
            .map_err(ControllerError::from)
    }

    async fn run_dictation_flow(
        &self,
        app: AppHandle,
        mode: DictationMode,
        session_id: u64,
        cancel_token: CancellationToken,
        stop_flag: Arc<AtomicBool>,
    ) -> Result<(), ControllerError> {
        let flow_started = Instant::now();
        self.update_state(
            &app,
            VoiceWaveHudState::Listening,
            Some("Listening for speech...".to_string()),
        )
        .await;
        self.set_session_state(session_id, DictationLifecycleState::Listening, None, None)
            .await;

        let settings = self.settings.lock().await.clone();
        let max_capture_ms = clamp_max_utterance_ms(settings.max_utterance_ms);
        let release_tail_ms = effective_release_tail_ms(
            clamp_release_tail_ms(settings.release_tail_ms),
            max_capture_ms,
        );
        let silence_timeout_ms = ((max_capture_ms as f32) * 0.22).round() as u64;
        let silence_timeout_ms = silence_timeout_ms.clamp(700, 2_000);

        let capture_started = Instant::now();
        let segments = match mode {
            DictationMode::Fixture => phase1::build_fixture_segments(settings.vad_threshold),
            DictationMode::Microphone => {
                let audio = self.audio.clone();
                let input_device = settings.input_device.clone();
                let threshold = clamp_vad_threshold(settings.vad_threshold);
                let cancel_for_capture = cancel_token.clone();
                let stop_for_capture = stop_flag.clone();
                let capture_options = CaptureOptions {
                    vad_config: VadConfig {
                        threshold,
                        ..VadConfig::default()
                    },
                    max_capture_duration: Duration::from_millis(max_capture_ms),
                    silence_timeout: Duration::from_millis(silence_timeout_ms),
                    release_tail: Duration::from_millis(release_tail_ms),
                };

                let captured = tokio::task::spawn_blocking(move || {
                    audio.capture_segments_from_microphone_with_signals(
                        input_device.as_deref(),
                        capture_options,
                        || cancel_for_capture.is_cancelled(),
                        || stop_for_capture.load(Ordering::Relaxed),
                    )
                })
                .await
                .map_err(|err| {
                    ControllerError::Runtime(format!("audio task join failure: {err}"))
                })?;

                match captured {
                    Ok(rows) => rows,
                    Err(AudioError::Cancelled) => {
                        self.set_session_state(session_id, DictationLifecycleState::Idle, None, None)
                            .await;
                        self.update_state(
                            &app,
                            VoiceWaveHudState::Idle,
                            Some("Dictation cancelled.".to_string()),
                        )
                        .await;
                        return Ok(());
                    }
                    Err(AudioError::NoSpeechDetected) => {
                        self.set_session_state(session_id, DictationLifecycleState::Idle, None, None)
                            .await;
                        self.update_state(
                            &app,
                            VoiceWaveHudState::Idle,
                            Some(
                                "No speech detected. Hold push-to-talk and speak, then release to transcribe."
                                    .to_string(),
                            ),
                        )
                        .await;
                        return Ok(());
                    }
                    Err(err) => return Err(ControllerError::Audio(err)),
                }
            }
        };
        let capture_ms = capture_started.elapsed().as_millis() as u64;

        if cancel_token.is_cancelled() {
            self.set_session_state(session_id, DictationLifecycleState::Idle, None, None)
                .await;
            self.update_state(
                &app,
                VoiceWaveHudState::Idle,
                Some("Dictation cancelled.".to_string()),
            )
            .await;
            return Ok(());
        }
        if segments.is_empty() {
            self.set_session_state(session_id, DictationLifecycleState::Idle, None, None)
                .await;
            self.update_state(
                &app,
                VoiceWaveHudState::Idle,
                Some(
                    "No speech captured yet. Hold push-to-talk while speaking, then release."
                        .to_string(),
                ),
            )
            .await;
            return Ok(());
        }

        let audio_quality = analyze_captured_segments(
            &segments,
            self.audio.target_sample_rate,
            clamp_vad_threshold(settings.vad_threshold),
        );
        let _ = app.emit("voicewave://audio-quality", audio_quality);

        let total_captured_samples = segments.iter().map(|segment| segment.len()).sum::<usize>();
        let captured_audio_ms =
            ((total_captured_samples as f64 / self.audio.target_sample_rate as f64) * 1000.0)
                .round() as u64;
        let cap_hit = mode == DictationMode::Microphone
            && !stop_flag.load(Ordering::Relaxed)
            && captured_audio_ms.saturating_add(150) >= max_capture_ms;
        let transcribing_message = if cap_hit {
            format!(
                "Transcribing locally (max utterance {}s reached)...",
                max_capture_ms / 1000
            )
        } else {
            "Transcribing locally...".to_string()
        };

        let transcribing_started = Instant::now();
        let release_to_transcribing_ms = self
            .session_release_elapsed_ms(session_id, transcribing_started)
            .await
            .unwrap_or(0);
        let watchdog_recovered = release_watchdog_recovered(release_to_transcribing_ms);
        if watchdog_recovered {
            self.watchdog_recovery_count.fetch_add(1, Ordering::Relaxed);
        }
        let watchdog_note = if watchdog_recovered {
            " (release watchdog recovered delayed transition)"
        } else {
            ""
        };
        self.set_session_state(session_id, DictationLifecycleState::Transcribing, None, None)
            .await;
        self.update_state(
            &app,
            VoiceWaveHudState::Transcribing,
            Some(format!("{transcribing_message}{watchdog_note}")),
        )
        .await;

        let effective_decode_mode = match mode {
            DictationMode::Fixture => settings.decode_mode,
            DictationMode::Microphone => self
                .decode_policy
                .lock()
                .await
                .select_mode(captured_audio_ms),
        };

        let worker = match mode {
            DictationMode::Fixture => InferenceWorker::new_fixture(settings.active_model.clone()),
            DictationMode::Microphone => {
                let model_path = self.resolve_active_model_path(&settings.active_model).await?;
                InferenceWorker::new_runtime_with_mode(
                    settings.active_model.clone(),
                    model_path,
                    effective_decode_mode,
                )
            }
        };
        let mut merged_samples = Vec::new();
        let inter_segment_gap = (self.audio.target_sample_rate as usize / 20).max(1); // 50 ms gap
        for (idx, segment) in segments.iter().enumerate() {
            if idx > 0 {
                merged_samples.extend(vec![0.0_f32; inter_segment_gap]);
            }
            merged_samples.extend_from_slice(segment);
        }

        let app_for_events = app.clone();
        let decode_started = Instant::now();
        let decode_output = match worker
            .transcribe_segment(&merged_samples, &cancel_token, |text, _is_final, elapsed_ms| {
                let sanitized = sanitize_user_transcript(text);
                if sanitized.is_empty() {
                    return;
                }
                let _ = app_for_events.emit(
                    "voicewave://transcript",
                    TranscriptEvent {
                        text: sanitized,
                        is_final: false,
                        elapsed_ms,
                    },
                );
            })
            .await
        {
            Ok(text) => text,
            Err(InferenceError::Cancelled) => {
                self.set_session_state(session_id, DictationLifecycleState::Idle, None, None)
                    .await;
                self.update_state(
                    &app,
                    VoiceWaveHudState::Idle,
                    Some("Dictation cancelled.".to_string()),
                )
                .await;
                return Ok(());
            }
            Err(err) => {
                if mode == DictationMode::Microphone {
                    self.decode_policy
                        .lock()
                        .await
                        .record_failure(decode_started.elapsed().as_millis() as u64);
                }
                return Err(ControllerError::Runtime(format!(
                    "Inference failed for model '{}': {err}",
                    worker.active_model()
                )))
            }
        };
        let decode_ms = decode_started.elapsed().as_millis() as u64;
        let post_started = Instant::now();
        let decode_telemetry = decode_output.telemetry;

        let final_transcript = decode_output
            .transcript
            .map(|text| sanitize_user_transcript(&text))
            .unwrap_or_default();

        if final_transcript.trim().is_empty() {
            if cancel_token.is_cancelled() {
                self.set_session_state(session_id, DictationLifecycleState::Idle, None, None)
                    .await;
                self.update_state(
                    &app,
                    VoiceWaveHudState::Idle,
                    Some("Dictation cancelled.".to_string()),
                )
                .await;
                return Ok(());
            }
            if mode == DictationMode::Microphone {
                self.decode_policy
                    .lock()
                    .await
                    .record_failure(decode_ms);
            }
            return Err(ControllerError::Runtime(
                "Inference finished without final transcript.".to_string(),
            ));
        }

        let _ = app.emit(
            "voicewave://transcript",
            TranscriptEvent {
                text: final_transcript.clone(),
                is_final: true,
                elapsed_ms: 0,
            },
        );

        {
            let mut snapshot = self.snapshot.lock().await;
            snapshot.last_partial = None;
            snapshot.last_final = Some(final_transcript.clone());
            snapshot.active_model = settings.active_model;
        }

        let insert_payload = InsertTextRequest {
            text: final_transcript.clone(),
            target_app: None,
            prefer_clipboard: settings.prefer_clipboard_fallback,
        };
        let insert_started = Instant::now();
        let mut insertion_success = true;
        if let Err(err) = self.insert_text(app.clone(), insert_payload).await {
            insertion_success = false;
            self.update_state(
                &app,
                VoiceWaveHudState::Error,
                Some(format!("Insertion failed: {err}")),
            )
            .await;
            self.set_session_state(session_id, DictationLifecycleState::Error, None, None)
                .await;
        }
        let insert_ms = insert_started.elapsed().as_millis() as u64;

        if let Err(err) = self
            .history_manager
            .lock()
            .await
            .record_transcript(&final_transcript)
        {
            eprintln!("history record failed: {err}");
        }
        if let Err(err) = self
            .dictionary_manager
            .lock()
            .await
            .ingest_transcript(&final_transcript)
        {
            eprintln!("dictionary ingest failed: {err}");
        }
        self.set_session_state(session_id, DictationLifecycleState::Inserted, None, None)
            .await;

        let post_ms = post_started.elapsed().as_millis() as u64;
        let total_ms = flow_started.elapsed().as_millis() as u64;
        if mode == DictationMode::Microphone {
            self.decode_policy.lock().await.record_success(total_ms);
        }
        let audio_duration_ms =
            ((merged_samples.len() as f64 / self.audio.target_sample_rate as f64) * 1000.0)
                .round() as u64;
        let segments_captured = segments.len() as u32;
        let release_stop_detected_at_utc_ms = self
            .session_release_stop_detected_at_utc_ms(session_id)
            .await
            .unwrap_or(0);
        let _ = app.emit(
            "voicewave://latency",
            LatencyBreakdownEvent {
                session_id,
                capture_ms,
                release_to_transcribing_ms,
                watchdog_recovered,
                segments_captured,
                release_stop_detected_at_utc_ms,
                model_init_ms: decode_telemetry.model_init_ms,
                audio_condition_ms: decode_telemetry.audio_condition_ms,
                decode_compute_ms: decode_telemetry.decode_compute_ms,
                runtime_cache_hit: decode_telemetry.runtime_cache_hit,
                decode_ms,
                post_ms,
                insert_ms,
                total_ms,
                audio_duration_ms,
                model_id: worker.active_model().to_string(),
                decode_mode: worker.decode_mode(),
            },
        );
        if settings.diagnostics_opt_in {
            let _ = self.diagnostics_manager.lock().await.record_latency(LatencyMetricRecord {
                session_id,
                timestamp_utc_ms: now_utc_ms(),
                capture_ms,
                release_to_transcribing_ms,
                watchdog_recovered,
                segments_captured,
                release_stop_detected_at_utc_ms,
                model_init_ms: decode_telemetry.model_init_ms,
                audio_condition_ms: decode_telemetry.audio_condition_ms,
                decode_compute_ms: decode_telemetry.decode_compute_ms,
                runtime_cache_hit: decode_telemetry.runtime_cache_hit,
                decode_ms,
                post_ms,
                insert_ms,
                total_ms,
                audio_duration_ms,
                model_id: worker.active_model().to_string(),
                decode_mode: worker.decode_mode(),
                success: insertion_success,
            });
        }

        Ok(())
    }

    async fn is_dictation_active(&self) -> bool {
        matches!(
            self.snapshot.lock().await.state,
            VoiceWaveHudState::Listening | VoiceWaveHudState::Transcribing
        )
    }

    async fn set_session_state(
        &self,
        session_id: u64,
        state: DictationLifecycleState,
        release_requested_at: Option<Instant>,
        release_requested_at_utc_ms: Option<u64>,
    ) {
        let mut active = self.active_session.lock().await;
        if let Some(session) = active.as_mut() {
            if session.session_id != session_id {
                return;
            }
            session.state = state;
            if let Some(released_at) = release_requested_at {
                session.release_requested_at = Some(released_at);
            }
            if let Some(released_at_utc_ms) = release_requested_at_utc_ms {
                session.release_requested_at_utc_ms = Some(released_at_utc_ms);
            }
        }
    }

    async fn set_any_active_session_state(
        &self,
        state: DictationLifecycleState,
        release_requested_at: Option<Instant>,
        release_requested_at_utc_ms: Option<u64>,
    ) {
        let mut active = self.active_session.lock().await;
        if let Some(session) = active.as_mut() {
            session.state = state;
            if let Some(released_at) = release_requested_at {
                session.release_requested_at = Some(released_at);
            }
            if let Some(released_at_utc_ms) = release_requested_at_utc_ms {
                session.release_requested_at_utc_ms = Some(released_at_utc_ms);
            }
        }
    }

    async fn session_release_elapsed_ms(
        &self,
        session_id: u64,
        transcribing_started: Instant,
    ) -> Option<u64> {
        let active = self.active_session.lock().await;
        active.as_ref().and_then(|session| {
            if session.session_id != session_id {
                return None;
            }
            session.release_requested_at.map(|released_at| {
                transcribing_started
                    .saturating_duration_since(released_at)
                    .as_millis() as u64
            })
        })
    }

    async fn session_release_stop_detected_at_utc_ms(&self, session_id: u64) -> Option<u64> {
        let active = self.active_session.lock().await;
        active.as_ref().and_then(|session| {
            if session.session_id != session_id {
                return None;
            }
            session.release_requested_at_utc_ms
        })
    }

    async fn update_state(
        &self,
        app: &AppHandle,
        state: VoiceWaveHudState,
        message: Option<String>,
    ) {
        {
            let mut snapshot = self.snapshot.lock().await;
            snapshot.state = state.clone();
            if matches!(
                state,
                VoiceWaveHudState::Idle | VoiceWaveHudState::Inserted | VoiceWaveHudState::Error
            ) {
                snapshot.last_partial = None;
            }
        }
        self.emit_state(app, state, message);
    }

    fn emit_state(&self, app: &AppHandle, state: VoiceWaveHudState, message: Option<String>) {
        let _ = app.emit("voicewave://state", VoiceWaveStateEvent { state, message });
    }

    fn emit_model_status(&self, app: &AppHandle, status: &ModelStatus) {
        let _ = app.emit("voicewave://model", ModelEvent::from_status(status));
    }

    async fn resolve_active_model_path(&self, model_id: &str) -> Result<PathBuf, ControllerError> {
        {
            let mut manager = self.model_manager.lock().await;
            if let Some(model) = manager.get_installed(model_id) {
                let path = PathBuf::from(&model.file_path);
                if path.exists() {
                    return Ok(path);
                }
                let _ = manager.remove_installed(model_id);
            }
        }

        if let Ok(path) = std::env::var("VOICEWAVE_WHISPER_MODEL_PATH") {
            let trimmed = path.trim();
            if !trimmed.is_empty() {
                return Ok(PathBuf::from(trimmed));
            }
        }

        Err(ControllerError::Runtime(format!(
            "Active model '{model_id}' is not installed as a local model artifact. Install it from Models first or set VOICEWAVE_WHISPER_MODEL_PATH."
        )))
    }
}

fn now_utc_ms() -> u64 {
    SystemTime::now()
        .duration_since(UNIX_EPOCH)
        .map(|d| d.as_millis() as u64)
        .unwrap_or_default()
}

fn percentile_index(len: usize, percentile: f32) -> usize {
    if len <= 1 {
        return 0;
    }
    let idx = ((len as f32 - 1.0) * percentile.clamp(0.0, 1.0)).round() as usize;
    idx.min(len - 1)
}

#[cfg(test)]
mod tests {
    use super::{
        clamp_vad_threshold, now_utc_ms, MAX_VAD_THRESHOLD, MIN_VAD_THRESHOLD,
        RECOMMENDED_VAD_THRESHOLD,
    };

    #[test]
    fn vad_threshold_is_clamped_to_safe_range() {
        assert_eq!(clamp_vad_threshold(0.0), MIN_VAD_THRESHOLD);
        assert_eq!(clamp_vad_threshold(0.5), MAX_VAD_THRESHOLD);
        assert_eq!(
            clamp_vad_threshold(f32::NAN),
            RECOMMENDED_VAD_THRESHOLD
        );
    }

    #[test]
    fn utc_clock_helper_is_monotonic_enough_for_metrics() {
        let a = now_utc_ms();
        let b = now_utc_ms();
        assert!(b >= a);
    }
}

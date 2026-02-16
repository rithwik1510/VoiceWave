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
        cpu_runtime_pool_enabled, ensure_faster_whisper_ready, is_faster_whisper_model,
        prefetch_faster_whisper_model, prewarm_runtime, InferenceError, InferenceWorker,
        RuntimeDecodePolicy,
    },
    insertion::{
        InsertResult, InsertTextRequest, InsertionEngine, InsertionError, InsertionMethod,
        RecentInsertion, UndoResult,
    },
    model_manager::{
        InstalledModel, ModelCatalogItem, ModelDownloadRequest, ModelError, ModelEvent,
        ModelStatus, ModelStatusState,
    },
    permissions::{MicrophonePermission, PermissionManager, PermissionSnapshot},
    phase1,
    settings::{
        normalize_hotkey_bindings, DecodeMode, SettingsError, SettingsStore, VoiceWaveSettings,
        LOCKED_PUSH_TO_TALK_HOTKEY, LOCKED_TOGGLE_HOTKEY,
    },
    transcript::{merge_incremental_transcript, sanitize_user_transcript},
};
use serde::{Deserialize, Serialize};
use std::{
    collections::{HashMap, HashSet},
    path::PathBuf,
    sync::{
        atomic::{AtomicBool, AtomicU64, Ordering},
        Arc, Mutex as StdMutex,
    },
    sync::mpsc::RecvTimeoutError,
    time::{Duration, Instant, SystemTime, UNIX_EPOCH},
};
use tauri::{AppHandle, Emitter};
use tokio::sync::Mutex;
use tokio::sync::mpsc::{unbounded_channel, UnboundedReceiver, UnboundedSender};
use tokio::task::JoinHandle;
use tokio::time::{sleep, timeout};
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
    backend_requested: String,
    backend_used: String,
    backend_fallback: bool,
    hold_to_first_draft_ms: u64,
    incremental_decode_ms: u64,
    release_finalize_ms: u64,
    incremental_windows_decoded: u32,
    finalize_tail_audio_ms: u64,
    asr_integrity_percent: f32,
    asr_raw_word_count: u32,
    asr_final_word_count: u32,
    decode_ms: u64,
    post_ms: u64,
    insert_ms: u64,
    total_ms: u64,
    release_to_inserted_ms: u64,
    audio_duration_ms: u64,
    model_id: String,
    decode_mode: DecodeMode,
    decode_policy_mode_selected: DecodeMode,
    decode_policy_reason: String,
    fw_low_coherence: bool,
    fw_retry_used: bool,
    fw_literal_retry_used: bool,
    insertion_method: String,
    insertion_target_class: String,
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
const INCREMENTAL_DECODE_CADENCE_MS: u64 = 220;
const INCREMENTAL_MIN_VOICED_MS: u64 = 400;
const INCREMENTAL_WINDOW_MS: u64 = 1_400;
const INCREMENTAL_WINDOW_OVERLAP_MS: u64 = 280;
const FINALIZE_LOOKBACK_MS: u64 = 1_200;
const FW_MIN_DECODE_AUDIO_MS_DEFAULT: u64 = 280;
const TRANSCRIPT_OVERLAP_TOKENS: usize = 8;
const BENCHMARK_RELIABILITY_WINDOW: usize = 40;
#[cfg(target_os = "windows")]
const HOTKEY_CUE_PRESS_WAV: &[u8] = include_bytes!("../assets/audio/cue_press.wav");
#[cfg(target_os = "windows")]
const HOTKEY_CUE_RELEASE_WAV: &[u8] = include_bytes!("../assets/audio/cue_release.wav");

fn decode_mode_rank(mode: DecodeMode) -> u8 {
    match mode {
        DecodeMode::Fast => 0,
        DecodeMode::Balanced => 1,
        DecodeMode::Quality => 2,
    }
}

fn floor_decode_mode(mode: DecodeMode, floor: DecodeMode) -> DecodeMode {
    if decode_mode_rank(mode) >= decode_mode_rank(floor) {
        mode
    } else {
        floor
    }
}

fn is_likely_low_quality_input_name(device_name: &str) -> bool {
    let normalized = device_name.to_ascii_lowercase();
    normalized.contains("hands-free")
        || normalized.contains("hand free")
        || normalized.contains("bluetooth headset")
        || normalized.contains("headset")
        || normalized.contains("hfp")
        || normalized.contains("ag audio")
        || normalized.contains("sco")
}

fn tokenize_transcript_words(text: &str) -> Vec<String> {
    text.split_whitespace()
        .map(|token| {
            token
                .chars()
                .filter(|ch| ch.is_ascii_alphanumeric() || *ch == '\'')
                .collect::<String>()
                .to_ascii_lowercase()
        })
        .filter(|token| !token.is_empty())
        .collect()
}

fn asr_integrity_metrics(raw_transcript: &str, final_transcript: &str) -> (f32, u32, u32) {
    let raw_tokens = tokenize_transcript_words(raw_transcript);
    let final_tokens = tokenize_transcript_words(final_transcript);
    let raw_count = raw_tokens.len() as u32;
    let final_count = final_tokens.len() as u32;
    if raw_count == 0 && final_count == 0 {
        return (100.0, 0, 0);
    }
    if raw_count == 0 || final_count == 0 {
        return (0.0, raw_count, final_count);
    }

    let mut raw_counts = HashMap::<String, u32>::new();
    for token in raw_tokens {
        *raw_counts.entry(token).or_default() += 1;
    }
    let mut overlap = 0u32;
    for token in final_tokens {
        if let Some(remaining) = raw_counts.get_mut(&token) {
            if *remaining > 0 {
                *remaining -= 1;
                overlap += 1;
            }
        }
    }
    let denominator = raw_count + final_count;
    let integrity = if denominator == 0 {
        0.0
    } else {
        ((2.0 * overlap as f32) / denominator as f32) * 100.0
    };
    (integrity.clamp(0.0, 100.0), raw_count, final_count)
}

fn build_terminology_hint_from_texts(terms: &[String], limit: usize) -> Option<String> {
    if terms.is_empty() || limit == 0 {
        return None;
    }
    let mut seen = HashSet::new();
    let mut chosen = Vec::new();
    for term in terms.iter().rev() {
        let normalized = term.trim();
        if normalized.len() < 3 || normalized.len() > 40 {
            continue;
        }
        let lowered = normalized.to_ascii_lowercase();
        if !seen.insert(lowered) {
            continue;
        }
        chosen.push(normalized.to_string());
        if chosen.len() >= limit {
            break;
        }
    }
    if chosen.is_empty() {
        None
    } else {
        Some(chosen.join(", "))
    }
}

fn env_technical_terms() -> Vec<String> {
    std::env::var("VOICEWAVE_TECH_TERMS")
        .ok()
        .map(|value| {
            value
                .split(',')
                .map(str::trim)
                .filter(|term| !term.is_empty())
                .map(ToString::to_string)
                .collect::<Vec<_>>()
        })
        .unwrap_or_default()
}

fn decode_mode_key(mode: DecodeMode) -> &'static str {
    match mode {
        DecodeMode::Fast => "fast",
        DecodeMode::Balanced => "balanced",
        DecodeMode::Quality => "quality",
    }
}

fn insertion_method_key(method: &InsertionMethod) -> &'static str {
    match method {
        InsertionMethod::Direct => "direct",
        InsertionMethod::ClipboardPaste => "clipboardPaste",
        InsertionMethod::ClipboardOnly => "clipboardOnly",
        InsertionMethod::HistoryFallback => "historyFallback",
    }
}

fn classify_insertion_target(target_app: Option<&str>) -> &'static str {
    let Some(app) = target_app else {
        return "unknown";
    };
    let normalized = app.to_ascii_lowercase();
    if normalized.contains("chrome")
        || normalized.contains("edge")
        || normalized.contains("firefox")
        || normalized.contains("safari")
        || normalized.contains("google ai studio")
        || normalized.contains("aistudio.google")
        || normalized.contains("gemini")
    {
        return "browser";
    }
    if normalized.contains("visual studio code")
        || normalized.contains("vscode")
        || normalized.contains("cursor")
        || normalized.contains("notepad")
        || normalized.contains("notes")
    {
        return "editor";
    }
    if normalized.contains("slack") || normalized.contains("notion") {
        return "collab";
    }
    "desktop"
}

fn push_release_allowed(trigger: DictationStartTrigger, _session_age: Duration) -> bool {
    trigger == DictationStartTrigger::PushToTalk
}

fn fw_min_decode_audio_ms() -> u64 {
    std::env::var("VOICEWAVE_FW_MIN_DECODE_AUDIO_MS")
        .ok()
        .and_then(|value| value.trim().parse::<u64>().ok())
        .filter(|value| *value >= 120 && *value <= 1_000)
        .unwrap_or(FW_MIN_DECODE_AUDIO_MS_DEFAULT)
}

fn play_hotkey_phase_cue(action: &HotkeyAction, phase: &HotkeyPhase) {
    let _ = (action, phase);
    #[cfg(target_os = "windows")]
    {
        let cue = match (action, phase) {
            (HotkeyAction::PushToTalk, HotkeyPhase::Pressed) => Some(HOTKEY_CUE_PRESS_WAV),
            (HotkeyAction::PushToTalk, HotkeyPhase::Released) => Some(HOTKEY_CUE_RELEASE_WAV),
            (HotkeyAction::ToggleDictation, HotkeyPhase::Triggered) => Some(HOTKEY_CUE_RELEASE_WAV),
            _ => None,
        };
        if let Some(sound_bytes) = cue {
            tauri::async_runtime::spawn(async move {
                let _ = tokio::task::spawn_blocking(move || unsafe {
                    use windows_sys::Win32::Media::Audio::{
                        PlaySoundA, SND_ASYNC, SND_MEMORY, SND_NODEFAULT,
                    };

                    // SAFETY: `sound_bytes` points to static WAV data for the process lifetime.
                    PlaySoundA(
                        sound_bytes.as_ptr(),
                        std::ptr::null_mut(),
                        SND_MEMORY | SND_ASYNC | SND_NODEFAULT,
                    )
                })
                .await;
            });
        }
    }
}

#[derive(Debug, Clone)]
struct IncrementalAudioChunk {
    samples: Vec<f32>,
    voiced: bool,
}

#[derive(Debug, Clone)]
struct DecodeWindow {
    end_sample: usize,
    samples: Vec<f32>,
}

#[derive(Debug)]
struct DecodeJobResult {
    window: DecodeWindow,
    transcript: Option<String>,
    elapsed_ms: u64,
}

#[derive(Debug, Default, Clone)]
struct IncrementalPreviewResult {
    committed_draft: String,
    last_committed_sample: usize,
    hold_to_first_draft_ms: u64,
    incremental_decode_ms: u64,
    incremental_windows_decoded: u32,
}

pub fn release_watchdog_threshold_ms() -> u64 {
    RELEASE_WATCHDOG_MS
}

pub fn release_watchdog_recovered(release_to_transcribing_ms: u64) -> bool {
    release_to_transcribing_ms > RELEASE_WATCHDOG_MS
}

fn incremental_pre_release_decode_enabled() -> bool {
    std::env::var("VOICEWAVE_INCREMENTAL_PRE_RELEASE_DECODE_ENABLED")
        .map(|value| {
            let normalized = value.trim().to_ascii_lowercase();
            !(normalized == "0" || normalized == "false" || normalized == "off")
        })
        .unwrap_or(true)
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

#[derive(Debug, Clone, Copy, PartialEq, Eq)]
enum DictationStartTrigger {
    Manual,
    ToggleHotkey,
    PushToTalk,
}

#[derive(Debug, Clone)]
struct DictationSession {
    session_id: u64,
    trigger: DictationStartTrigger,
    started_at: Instant,
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
    history_manager: Arc<Mutex<HistoryManager>>,
    model_manager: Mutex<crate::model_manager::ModelManager>,
    dictionary_manager: Arc<Mutex<DictionaryManager>>,
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
        let previous_toggle_hotkey = settings.toggle_hotkey.clone();
        let previous_push_to_talk_hotkey = settings.push_to_talk_hotkey.clone();
        normalize_hotkey_bindings(&mut settings);
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
        if settings.toggle_hotkey != previous_toggle_hotkey
            || settings.push_to_talk_hotkey != previous_push_to_talk_hotkey
        {
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
        if cpu_runtime_pool_enabled() && !is_faster_whisper_model(&settings.active_model) {
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
            history_manager: Arc::new(Mutex::new(history_manager)),
            model_manager: Mutex::new(model_manager),
            dictionary_manager: Arc::new(Mutex::new(dictionary_manager)),
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
        normalize_hotkey_bindings(&mut settings);
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

        if cpu_runtime_pool_enabled() && !is_faster_whisper_model(&settings.active_model) {
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
        self.start_dictation_with_trigger(app, mode, DictationStartTrigger::Manual)
            .await
    }

    async fn start_dictation_with_trigger(
        &self,
        app: AppHandle,
        mode: DictationMode,
        trigger: DictationStartTrigger,
    ) -> Result<(), ControllerError> {
        eprintln!(
            "voicewave: start_dictation requested (trigger={:?}, mode={:?})",
            trigger, mode
        );
        let cancel_token = {
            let mut token_slot = self.cancel_token.lock().await;
            if token_slot
                .as_ref()
                .is_some_and(|token| !token.is_cancelled())
            {
                eprintln!("voicewave: start_dictation rejected (already running)");
                return Err(ControllerError::AlreadyRunning);
            }
            let token = CancellationToken::new();
            *token_slot = Some(token.clone());
            token
        };

        let session_id = self.session_counter.fetch_add(1, Ordering::Relaxed) + 1;
        {
            let mut active = self.active_session.lock().await;
            *active = Some(DictationSession {
                session_id,
                trigger,
                started_at: Instant::now(),
                state: DictationLifecycleState::Listening,
                release_requested_at: None,
                release_requested_at_utc_ms: None,
            });
        }

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
        self.stop_mic_level_monitor().await;
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
        self.stop_mic_level_monitor().await;
        if let Some(session) = self.active_session.lock().await.clone() {
            eprintln!(
                "voicewave: stop_dictation requested (session={}, trigger={:?}, state={:?})",
                session.session_id, session.trigger, session.state
            );
        } else {
            eprintln!("voicewave: stop_dictation requested with no active session");
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
            const PUSH_PRESS_CONFIRM_SAMPLES: u8 = 2;
            const PUSH_RELEASE_CONFIRM_SAMPLES: u8 = 3;
            let mut toggle_was_down = false;
            let mut push_was_down = false;
            let mut push_down_streak: u8 = 0;
            let mut push_up_streak: u8 = 0;
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

                if push_down {
                    if !push_was_down {
                        push_down_streak = push_down_streak.saturating_add(1);
                    }
                } else if !push_was_down {
                    push_down_streak = 0;
                }

                // Debounce modifier-only hotkey polling edges (Ctrl+Windows) to avoid
                // transient press/release oscillation on Windows key state sampling.
                if !push_was_down && push_down_streak >= PUSH_PRESS_CONFIRM_SAMPLES {
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
                    push_was_down = true;
                    push_down_streak = 0;
                    push_up_streak = 0;
                } else if push_was_down {
                    if push_down {
                        push_up_streak = 0;
                    } else {
                        push_up_streak = push_up_streak.saturating_add(1);
                    }
                }

                if push_was_down && push_up_streak >= PUSH_RELEASE_CONFIRM_SAMPLES {
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
                    push_was_down = false;
                    push_down_streak = 0;
                    push_up_streak = 0;
                }

                toggle_was_down = toggle_down;
                sleep(Duration::from_millis(15)).await;
            }
        });
    }

    pub async fn update_hotkey_config(
        &self,
        _config: HotkeyConfig,
    ) -> Result<HotkeySnapshot, ControllerError> {
        let config = HotkeyConfig {
            toggle: LOCKED_TOGGLE_HOTKEY.to_string(),
            push_to_talk: LOCKED_PUSH_TO_TALK_HOTKEY.to_string(),
        };
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
            preserve_full_capture: false,
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
        play_hotkey_phase_cue(&action, &phase);
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
                    self.start_dictation_with_trigger(
                        app,
                        DictationMode::Microphone,
                        DictationStartTrigger::ToggleHotkey,
                    )
                    .await
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
                    self.start_dictation_with_trigger(
                        app,
                        DictationMode::Microphone,
                        DictationStartTrigger::PushToTalk,
                    )
                    .await
                }
            }
            (HotkeyAction::PushToTalk, HotkeyPhase::Released) => {
                let still_pressed = {
                    let manager = self.hotkey_manager.lock().await;
                    manager.is_action_pressed(HotkeyAction::PushToTalk)
                };
                if still_pressed {
                    eprintln!(
                        "voicewave: ignored push-to-talk release (key still down)"
                    );
                    return Ok(());
                }
                if self.active_push_session_ready_for_release().await {
                    self.stop_dictation(app).await;
                } else {
                    eprintln!("voicewave: ignored push-to-talk release (no eligible push session)");
                }
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
        if is_faster_whisper_model(&model_id) {
            let preparing = ModelStatus {
                model_id: model_id.clone(),
                state: ModelStatusState::Downloading,
                progress: 15,
                active: active_model == model_id,
                installed: false,
                message: Some(
                    "Preparing Faster-Whisper runtime (Python + CTranslate2)...".to_string(),
                ),
                installed_model: None,
                downloaded_bytes: Some(0),
                total_bytes: Some(100),
                resumable: false,
            };
            self.model_statuses
                .lock()
                .await
                .insert(model_id.clone(), preparing.clone());
            self.emit_model_status(&app, &preparing);

            ensure_faster_whisper_ready().await.map_err(|err| {
                ControllerError::Runtime(format!(
                    "Faster-Whisper runtime is not ready: {err}. Run scripts/faster_whisper/setup-faster-whisper-cpu.ps1 first."
                ))
            })?;
            let prefetching = ModelStatus {
                model_id: model_id.clone(),
                state: ModelStatusState::Downloading,
                progress: 65,
                active: active_model == model_id,
                installed: false,
                message: Some("Downloading Faster-Whisper model weights to local cache...".to_string()),
                installed_model: None,
                downloaded_bytes: Some(0),
                total_bytes: Some(100),
                resumable: false,
            };
            self.model_statuses
                .lock()
                .await
                .insert(model_id.clone(), prefetching.clone());
            self.emit_model_status(&app, &prefetching);
            let prefetch = prefetch_faster_whisper_model(&model_id).await.map_err(|err| {
                ControllerError::Runtime(format!(
                    "Faster-Whisper model prefetch failed: {err}. Check internet access and retry."
                ))
            })?;
            let installed = {
                let mut manager = self.model_manager.lock().await;
                manager.install_faster_whisper_model(&model_id, &prefetch.cache_hint_path)?
            };
            let final_status = ModelStatus {
                model_id: model_id.clone(),
                state: ModelStatusState::Installed,
                progress: 100,
                active: active_model == model_id,
                installed: true,
                message: Some(
                    format!(
                        "Faster-Whisper model ready (cache hit: {}, init {} ms).",
                        prefetch.runtime_cache_hit, prefetch.model_init_ms
                    )
                        .to_string(),
                ),
                installed_model: Some(installed),
                downloaded_bytes: Some(100),
                total_bytes: Some(100),
                resumable: false,
            };
            self.model_statuses
                .lock()
                .await
                .insert(model_id.clone(), final_status.clone());
            self.emit_model_status(&app, &final_status);
            return Ok(final_status);
        }
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
        if is_faster_whisper_model(&model_id) {
            let active_model = self.settings.lock().await.active_model.clone();
            let status = self
                .model_manager
                .lock()
                .await
                .get_download_status(&model_id, Some(active_model.as_str()))
                .ok_or(ControllerError::MissingModel(model_id.clone()))?;
            self.model_statuses
                .lock()
                .await
                .insert(model_id, status.clone());
            self.emit_model_status(&app, &status);
            return Ok(status);
        }
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
        if is_faster_whisper_model(&model_id) {
            let active_model = self.settings.lock().await.active_model.clone();
            let status = self
                .model_manager
                .lock()
                .await
                .get_download_status(&model_id, Some(active_model.as_str()))
                .ok_or(ControllerError::MissingModel(model_id.clone()))?;
            self.model_statuses
                .lock()
                .await
                .insert(model_id, status.clone());
            self.emit_model_status(&app, &status);
            return Ok(status);
        }
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
        if is_faster_whisper_model(&model_id) {
            return self.download_model(app, ModelDownloadRequest { model_id }).await;
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

        if cpu_runtime_pool_enabled() && !is_faster_whisper_model(&model_id) {
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
        let installed_model_ids = self
            .model_manager
            .lock()
            .await
            .list_installed()
            .into_iter()
            .map(|item| item.model_id)
            .collect::<Vec<_>>();
        let installed_lookup = installed_model_ids.iter().cloned().collect::<HashSet<_>>();

        let requested_model_ids = request
            .model_ids
            .clone()
            .unwrap_or_else(|| installed_model_ids.clone());
        let mut seen = HashSet::new();
        let model_ids = requested_model_ids
            .into_iter()
            .filter(|model_id| seen.insert(model_id.clone()))
            .collect::<Vec<_>>();

        if model_ids.is_empty() {
            return Err(ControllerError::Runtime(
                "Benchmark requires at least one installed model.".to_string(),
            ));
        }
        let missing_models = model_ids
            .iter()
            .filter(|model_id| !installed_lookup.contains(*model_id))
            .cloned()
            .collect::<Vec<_>>();
        if !missing_models.is_empty() {
            return Err(ControllerError::Runtime(format!(
                "Benchmark requested models that are not installed: {}. Install them first or rerun benchmark without explicit model IDs.",
                missing_models.join(", ")
            )));
        }

        let runs = request.runs_per_model.unwrap_or(3).clamp(1, 12);
        let started_at_utc_ms = benchmark::now_utc_ms();
        let mut rows = Vec::new();
        let reliability_by_model = {
            let diagnostics = self.diagnostics_manager.lock().await;
            model_ids
                .iter()
                .map(|model_id| {
                    (
                        model_id.clone(),
                        diagnostics
                            .summarize_model_reliability(
                                model_id,
                                BENCHMARK_RELIABILITY_WINDOW,
                            ),
                    )
                })
                .collect::<HashMap<_, _>>()
        };
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
            let worker = self
                .build_inference_worker(&model_id, DictationMode::Microphone, DecodeMode::Balanced)
                .await?;
            // Warm once so benchmark reflects realistic repeated dictation behavior.
            let warmup_token = CancellationToken::new();
            let _ = worker
                .transcribe_segment(&merged_samples, &warmup_token, |_, _, _| {})
                .await;
            let mut latencies = Vec::with_capacity(runs);
            let mut rtfs = Vec::with_capacity(runs);
            let mut successful_runs = 0usize;

            for _ in 0..runs {
                let token = CancellationToken::new();
                let started = Instant::now();
                let result = worker
                    .transcribe_segment(&merged_samples, &token, |_, _, _| {})
                    .await;
                let elapsed = started.elapsed().as_millis() as u64;
                latencies.push(elapsed);
                rtfs.push(crate::inference::estimate_rtf(elapsed, merged_samples.len()));
                if let Ok(output) = result {
                    let is_usable = output
                        .transcript
                        .as_ref()
                        .map(|text| !sanitize_user_transcript(text).is_empty())
                        .unwrap_or(false);
                    if is_usable {
                        successful_runs = successful_runs.saturating_add(1);
                    }
                }
            }

            latencies.sort_unstable();
            let p50_index = percentile_index(latencies.len(), 0.50);
            let p95_index = percentile_index(latencies.len(), 0.95);
            let average_rtf = if rtfs.is_empty() {
                0.0
            } else {
                rtfs.iter().sum::<f32>() / rtfs.len() as f32
            };
            let benchmark_success_rate_percent = if runs == 0 {
                0.0
            } else {
                (successful_runs as f32 / runs as f32) * 100.0
            };
            let observed = reliability_by_model.get(&model_id).and_then(|row| row.as_ref());

            rows.push(benchmark::BenchmarkRow {
                model_id,
                runs,
                p50_latency_ms: latencies[p50_index],
                p95_latency_ms: latencies[p95_index],
                average_rtf,
                observed_sample_count: observed.map(|row| row.sample_count).unwrap_or(runs),
                observed_success_rate_percent: observed
                    .map(|row| row.success_rate_percent)
                    .unwrap_or(benchmark_success_rate_percent),
                observed_p95_release_to_final_ms: observed
                    .map(|row| row.p95_release_to_final_ms)
                    .unwrap_or(latencies[p95_index]),
                observed_p95_release_to_transcribing_ms: observed
                    .map(|row| row.p95_release_to_transcribing_ms)
                    .unwrap_or(0),
                observed_watchdog_recovery_rate_percent: observed
                    .map(|row| row.watchdog_recovery_rate_percent)
                    .unwrap_or(0.0),
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
        let mut release_tail_ms = effective_release_tail_ms(
            clamp_release_tail_ms(settings.release_tail_ms),
            max_capture_ms,
        );
        let silence_timeout_ms = ((max_capture_ms as f32) * 0.22).round() as u64;
        let silence_timeout_ms = silence_timeout_ms.clamp(700, 2_000);
        let use_faster_whisper = is_faster_whisper_model(&settings.active_model);
        let incremental_enabled = mode == DictationMode::Microphone
            && incremental_pre_release_decode_enabled()
            && !use_faster_whisper;

        let draft_worker = if incremental_enabled {
            Some(
                self.build_inference_worker(&settings.active_model, mode, DecodeMode::Fast)
                    .await?,
            )
        } else {
            None
        };

        let mut incremental_tx: Option<UnboundedSender<IncrementalAudioChunk>> = None;
        let mut incremental_task: Option<JoinHandle<IncrementalPreviewResult>> = None;
        let preview_shared = Arc::new(StdMutex::new(IncrementalPreviewResult::default()));
        if incremental_enabled {
            let (tx, rx) = unbounded_channel::<IncrementalAudioChunk>();
            incremental_tx = Some(tx);
            let preview_shared_for_task = Arc::clone(&preview_shared);
            let preview_worker = draft_worker
                .as_ref()
                .expect("incremental decode should have worker")
                .clone();
            incremental_task = Some(tokio::spawn(run_incremental_preview_decode(
                rx,
                preview_worker,
                cancel_token.clone(),
                app.clone(),
                flow_started,
                self.audio.target_sample_rate,
                preview_shared_for_task,
            )));
        }

        let capture_started = Instant::now();
        let segments = match mode {
            DictationMode::Fixture => phase1::build_fixture_segments(settings.vad_threshold),
            DictationMode::Microphone => {
                let audio = self.audio.clone();
                let input_device = settings.input_device.clone();
                let mut threshold = clamp_vad_threshold(settings.vad_threshold);
                if input_device
                    .as_deref()
                    .is_some_and(is_likely_low_quality_input_name)
                {
                    // Bluetooth/headset mics often lose weak consonants; lower VAD and keep a longer release tail.
                    threshold = clamp_vad_threshold(threshold * 0.82);
                    release_tail_ms = release_tail_ms.saturating_add(90).min(MAX_RELEASE_TAIL_MS);
                }
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
                    preserve_full_capture: use_faster_whisper,
                };
                let tx_for_capture = incremental_tx.clone();
                let app_for_capture = app.clone();
                let mut last_level_emit = Instant::now();

                let captured = tokio::task::spawn_blocking(move || {
                    audio.capture_segments_from_microphone_with_signals_and_observer(
                        input_device.as_deref(),
                        capture_options,
                        || cancel_for_capture.is_cancelled(),
                        || stop_for_capture.load(Ordering::Relaxed),
                        move |normalized_chunk, voiced_chunk| {
                            if let Some(sender) = tx_for_capture.as_ref() {
                                let _ = sender.send(IncrementalAudioChunk {
                                    samples: normalized_chunk.to_vec(),
                                    voiced: voiced_chunk,
                                });
                            }
                            if last_level_emit.elapsed() >= Duration::from_millis(70) {
                                let mut peak = 0.0_f32;
                                for sample in normalized_chunk {
                                    peak = peak.max(sample.abs());
                                }
                                let _ = app_for_capture.emit(
                                    "voicewave://mic-level",
                                    MicLevelEvent {
                                        level: peak.clamp(0.0, 1.0),
                                        error: None,
                                    },
                                );
                                last_level_emit = Instant::now();
                            }
                        },
                    )
                })
                .await
                .map_err(|err| {
                    ControllerError::Runtime(format!("audio task join failure: {err}"))
                })?;

                match captured {
                    Ok(rows) => rows,
                    Err(AudioError::Cancelled) => {
                        eprintln!("voicewave: capture cancelled (session={session_id})");
                        if let Some(task) = incremental_task.take() {
                            task.abort();
                        }
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
                        eprintln!("voicewave: capture ended with no speech (session={session_id})");
                        if let Some(task) = incremental_task.take() {
                            task.abort();
                        }
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
                    Err(err) => {
                        eprintln!("voicewave: capture failed (session={session_id}): {err}");
                        if let Some(task) = incremental_task.take() {
                            task.abort();
                        }
                        return Err(ControllerError::Audio(err));
                    }
                }
            }
        };
        drop(incremental_tx);
        let capture_ms = capture_started.elapsed().as_millis() as u64;

        if cancel_token.is_cancelled() {
            if let Some(task) = incremental_task.take() {
                task.abort();
            }
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
            if let Some(task) = incremental_task.take() {
                task.abort();
            }
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

        if let Some(task) = incremental_task.take() {
            let mut task = task;
            if task.is_finished() {
                let _ = task.await;
            } else {
                let _ = timeout(Duration::from_millis(80), &mut task).await;
                if !task.is_finished() {
                    task.abort();
                }
            }
        }
        let preview = preview_shared
            .lock()
            .map(|state| state.clone())
            .unwrap_or_default();

        let audio_quality = analyze_captured_segments(
            &segments,
            self.audio.target_sample_rate,
            clamp_vad_threshold(settings.vad_threshold),
        );
        let _ = app.emit("voicewave://audio-quality", audio_quality.clone());

        let total_captured_samples = segments.iter().map(|segment| segment.len()).sum::<usize>();
        let captured_audio_ms =
            ((total_captured_samples as f64 / self.audio.target_sample_rate as f64) * 1000.0)
                .round() as u64;
        let policy_selected_mode = match mode {
            DictationMode::Fixture => settings.decode_mode,
            DictationMode::Microphone => self
                .decode_policy
                .lock()
                .await
                .select_mode(captured_audio_ms),
        };
        let mut effective_decode_mode = policy_selected_mode;
        let mut decode_policy_reasons = vec![match mode {
            DictationMode::Fixture => "fixture-settings".to_string(),
            DictationMode::Microphone => format!(
                "runtime-policy:{}",
                decode_mode_key(policy_selected_mode)
            ),
        }];
        if mode == DictationMode::Microphone && !use_faster_whisper {
            // Keep legacy whisper.cpp path conservative: never go below Balanced.
            let pre_floor = effective_decode_mode;
            effective_decode_mode = floor_decode_mode(effective_decode_mode, DecodeMode::Balanced);
            if effective_decode_mode != pre_floor {
                decode_policy_reasons.push("legacy-whisper-floor:balanced".to_string());
            }
        }
        if use_faster_whisper && mode == DictationMode::Microphone {
            let mut decode_floor = match audio_quality.quality {
                AudioQualityBand::Good => DecodeMode::Fast,
                AudioQualityBand::Fair => DecodeMode::Balanced,
                AudioQualityBand::Poor => DecodeMode::Quality,
            };
            if settings
                .input_device
                .as_deref()
                .is_some_and(is_likely_low_quality_input_name)
            {
                decode_floor = floor_decode_mode(decode_floor, DecodeMode::Balanced);
            }
            let pre_floor = effective_decode_mode;
            effective_decode_mode = floor_decode_mode(effective_decode_mode, decode_floor);
            if effective_decode_mode != pre_floor {
                decode_policy_reasons.push(format!(
                    "fw-audio-floor:{}",
                    decode_mode_key(decode_floor)
                ));
            }
            let short_utterance_fast_lane =
                captured_audio_ms <= 3_200 && audio_quality.quality != AudioQualityBand::Poor;
            if decode_floor == DecodeMode::Fast
                && effective_decode_mode == DecodeMode::Balanced
            {
                // Fast-first for clean audio; inference layer will auto-retry with stronger mode
                // when confidence is weak so quality is protected.
                effective_decode_mode = DecodeMode::Fast;
                decode_policy_reasons.push("fw-fast-lane:clean-audio-floor".to_string());
            } else if short_utterance_fast_lane && effective_decode_mode == DecodeMode::Balanced {
                // Short utterances benefit most from fast-first; retry safeguards still protect quality.
                effective_decode_mode = DecodeMode::Fast;
                decode_policy_reasons.push("fw-fast-lane:short-utterance".to_string());
            }
        }
        let decode_policy_reason = decode_policy_reasons.join("|");
        let final_worker = self
            .build_inference_worker(&settings.active_model, mode, effective_decode_mode)
            .await?;
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

        let mut merged_samples = Vec::new();
        let inter_segment_gap = (self.audio.target_sample_rate as usize / 20).max(1); // 50 ms gap
        for (idx, segment) in segments.iter().enumerate() {
            if idx > 0 {
                merged_samples.extend(vec![0.0_f32; inter_segment_gap]);
            }
            merged_samples.extend_from_slice(segment);
        }

        let decode_started = Instant::now();
        let source_samples = merged_samples.clone();
        let lookback_samples = ms_to_sample_count(FINALIZE_LOOKBACK_MS, self.audio.target_sample_rate);
        let has_committed_draft = !use_faster_whisper && !preview.committed_draft.trim().is_empty();
        let mut tail_start = 0usize;
        if has_committed_draft && preview.last_committed_sample > 0 {
            tail_start = preview
                .last_committed_sample
                .saturating_sub(lookback_samples)
                .min(source_samples.len());
        }
        let mut finalize_samples = if use_faster_whisper {
            source_samples.clone()
        } else if tail_start < source_samples.len() {
            source_samples[tail_start..].to_vec()
        } else {
            Vec::new()
        };
        if finalize_samples.is_empty() {
            finalize_samples = source_samples.clone();
            tail_start = 0;
        }
        if finalize_samples.is_empty() {
            finalize_samples = merged_samples.clone();
            tail_start = 0;
        }
        if mode == DictationMode::Microphone && use_faster_whisper {
            let finalize_audio_ms =
                sample_count_to_ms(finalize_samples.len(), self.audio.target_sample_rate);
            if finalize_audio_ms < fw_min_decode_audio_ms() {
                self.set_session_state(session_id, DictationLifecycleState::Idle, None, None)
                    .await;
                self.update_state(
                    &app,
                    VoiceWaveHudState::Idle,
                    Some(
                        "Capture was too short to transcribe reliably. Hold push-to-talk slightly longer and speak, then release."
                            .to_string(),
                    ),
                )
                .await;
                return Ok(());
            }
        }
        let finalize_tail_audio_ms =
            sample_count_to_ms(source_samples.len().saturating_sub(tail_start), self.audio.target_sample_rate);
        let finalize_started = Instant::now();
        let finalize_output = match final_worker
            .transcribe_segment(&finalize_samples, &cancel_token, |_text, _is_final, _elapsed_ms| {})
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
                        .record_failure(finalize_started.elapsed().as_millis() as u64);
                }
                return Err(ControllerError::Runtime(format!(
                    "Inference failed for model '{}': {err}",
                    final_worker.active_model()
                )))
            }
        };
        let release_finalize_ms = finalize_started.elapsed().as_millis() as u64;
        let decode_ms = decode_started.elapsed().as_millis() as u64;
        let decode_telemetry = finalize_output.telemetry;
        let raw_decode_transcript = finalize_output.transcript.unwrap_or_default();
        let finalize_text = sanitize_user_transcript(&raw_decode_transcript);
        let merged_transcript = if has_committed_draft {
            let merged = merge_incremental_transcript(
                &preview.committed_draft,
                &finalize_text,
                TRANSCRIPT_OVERLAP_TOKENS,
            );
            if merged.trim().is_empty() {
                preview.committed_draft.clone()
            } else {
                merged
            }
        } else {
            finalize_text.clone()
        };
        let final_transcript = sanitize_user_transcript(&merged_transcript);
        let (asr_integrity_percent, asr_raw_word_count, asr_final_word_count) =
            asr_integrity_metrics(&finalize_text, &final_transcript);

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

        let post_started = Instant::now();
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
            snapshot.active_model = settings.active_model.clone();
        }
        let post_before_insert_ms = post_started.elapsed().as_millis() as u64;

        let insert_payload = InsertTextRequest {
            text: final_transcript.clone(),
            target_app: None,
            prefer_clipboard: settings.prefer_clipboard_fallback,
        };
        let insert_started = Instant::now();
        let (insertion_success, insertion_method, insertion_target_class) =
            match self.insert_text(app.clone(), insert_payload).await {
                Ok(result) => (
                    result.success,
                    insertion_method_key(&result.method).to_string(),
                    classify_insertion_target(result.target_app.as_deref()).to_string(),
                ),
                Err(err) => {
                    self.update_state(
                        &app,
                        VoiceWaveHudState::Error,
                        Some(format!("Insertion failed: {err}")),
                    )
                    .await;
                    self.set_session_state(session_id, DictationLifecycleState::Error, None, None)
                        .await;
                    (false, "error".to_string(), "unknown".to_string())
                }
            };
        let insert_ms = insert_started.elapsed().as_millis() as u64;

        self.set_session_state(session_id, DictationLifecycleState::Inserted, None, None)
            .await;

        let post_after_insert_ms = post_started.elapsed().as_millis() as u64;
        let post_after_only_ms = post_after_insert_ms
            .saturating_sub(post_before_insert_ms)
            .saturating_sub(insert_ms);
        let post_ms = post_before_insert_ms.saturating_add(post_after_only_ms);
        let total_ms = flow_started.elapsed().as_millis() as u64;
        let release_to_final_ms = release_to_transcribing_ms
            .saturating_add(decode_ms)
            .saturating_add(post_ms);
        let release_to_inserted_ms = release_to_final_ms.saturating_add(insert_ms);
        if mode == DictationMode::Microphone {
            self.decode_policy
                .lock()
                .await
                .record_success(release_to_final_ms);
        }
        let audio_duration_ms =
            sample_count_to_ms(source_samples.len(), self.audio.target_sample_rate);
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
                backend_requested: decode_telemetry.backend_requested.clone(),
                backend_used: decode_telemetry.backend_used.clone(),
                backend_fallback: decode_telemetry.backend_fallback,
                hold_to_first_draft_ms: preview.hold_to_first_draft_ms,
                incremental_decode_ms: preview.incremental_decode_ms,
                release_finalize_ms,
                incremental_windows_decoded: preview.incremental_windows_decoded,
                finalize_tail_audio_ms,
                asr_integrity_percent,
                asr_raw_word_count,
                asr_final_word_count,
                decode_ms,
                post_ms,
                insert_ms,
                total_ms,
                release_to_inserted_ms,
                audio_duration_ms,
                model_id: final_worker.active_model().to_string(),
                decode_mode: final_worker.decode_mode(),
                decode_policy_mode_selected: policy_selected_mode,
                decode_policy_reason: decode_policy_reason.clone(),
                fw_low_coherence: decode_telemetry.fw_low_coherence,
                fw_retry_used: decode_telemetry.fw_retry_used,
                fw_literal_retry_used: decode_telemetry.fw_literal_retry_used,
                insertion_method: insertion_method.clone(),
                insertion_target_class: insertion_target_class.clone(),
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
                backend_requested: decode_telemetry.backend_requested,
                backend_used: decode_telemetry.backend_used,
                backend_fallback: decode_telemetry.backend_fallback,
                hold_to_first_draft_ms: preview.hold_to_first_draft_ms,
                incremental_decode_ms: preview.incremental_decode_ms,
                release_finalize_ms,
                incremental_windows_decoded: preview.incremental_windows_decoded,
                finalize_tail_audio_ms,
                asr_integrity_percent,
                asr_raw_word_count,
                asr_final_word_count,
                decode_ms,
                post_ms,
                insert_ms,
                total_ms,
                release_to_inserted_ms,
                audio_duration_ms,
                model_id: final_worker.active_model().to_string(),
                decode_mode: final_worker.decode_mode(),
                decode_policy_mode_selected: Some(policy_selected_mode),
                decode_policy_reason: Some(decode_policy_reason),
                fw_low_coherence: decode_telemetry.fw_low_coherence,
                fw_retry_used: decode_telemetry.fw_retry_used,
                fw_literal_retry_used: decode_telemetry.fw_literal_retry_used,
                insertion_method: Some(insertion_method),
                insertion_target_class: Some(insertion_target_class),
                success: insertion_success,
            });
        }

        // Keep non-critical persistence off the hot path so release->final latency stays low.
        let history_manager = Arc::clone(&self.history_manager);
        let dictionary_manager = Arc::clone(&self.dictionary_manager);
        let transcript_for_history = final_transcript.clone();
        let transcript_for_dictionary = final_transcript;
        tauri::async_runtime::spawn(async move {
            if let Err(err) = history_manager
                .lock()
                .await
                .record_transcript(&transcript_for_history)
            {
                eprintln!("history record failed: {err}");
            }
            if let Err(err) = dictionary_manager
                .lock()
                .await
                .ingest_transcript(&transcript_for_dictionary)
            {
                eprintln!("dictionary ingest failed: {err}");
            }
        });

        Ok(())
    }

    async fn is_dictation_active(&self) -> bool {
        matches!(
            self.snapshot.lock().await.state,
            VoiceWaveHudState::Listening | VoiceWaveHudState::Transcribing
        )
    }

    async fn active_push_session_ready_for_release(&self) -> bool {
        let active = self.active_session.lock().await;
        active.as_ref().is_some_and(|session| {
            push_release_allowed(session.trigger, session.started_at.elapsed())
        })
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

    async fn build_inference_worker(
        &self,
        model_id: &str,
        mode: DictationMode,
        decode_mode: DecodeMode,
    ) -> Result<InferenceWorker, ControllerError> {
        match mode {
            DictationMode::Fixture => Ok(InferenceWorker::new_fixture(model_id.to_string())),
            DictationMode::Microphone => {
                if is_faster_whisper_model(model_id) {
                    ensure_faster_whisper_ready().await.map_err(|err| {
                        ControllerError::Runtime(format!(
                            "Faster-Whisper runtime is not ready: {err}. Run scripts/faster_whisper/setup-faster-whisper-cpu.ps1."
                        ))
                    })?;
                    let hint = {
                        let manager = self.dictionary_manager.lock().await;
                        let mut terms = manager
                            .get_terms(None)
                            .into_iter()
                            .map(|row| row.term)
                            .collect::<Vec<_>>();
                        terms.extend(manager.get_queue(Some(12)).into_iter().map(|row| row.term));
                        terms.extend(env_technical_terms());
                        build_terminology_hint_from_texts(&terms, 10)
                    };
                    Ok(InferenceWorker::new_faster_whisper_with_mode_and_hint(
                        model_id.to_string(),
                        decode_mode,
                        hint,
                    ))
                } else {
                    let model_path = self.resolve_active_model_path(model_id).await?;
                    Ok(InferenceWorker::new_runtime_with_mode(
                        model_id.to_string(),
                        model_path,
                        decode_mode,
                    ))
                }
            }
        }
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

fn spawn_incremental_decode_job(
    worker: InferenceWorker,
    cancel_token: CancellationToken,
    window: DecodeWindow,
) -> JoinHandle<DecodeJobResult> {
    tokio::spawn(async move {
        let started = Instant::now();
        let transcript = match worker
            .transcribe_segment(&window.samples, &cancel_token, |_text, _is_final, _elapsed_ms| {})
            .await
        {
            Ok(output) => output.transcript,
            Err(InferenceError::Cancelled) => None,
            Err(err) => {
                eprintln!("voicewave: incremental draft decode failed: {err}");
                None
            }
        };
        DecodeJobResult {
            window,
            transcript,
            elapsed_ms: started.elapsed().as_millis() as u64,
        }
    })
}

async fn run_incremental_preview_decode(
    mut rx: UnboundedReceiver<IncrementalAudioChunk>,
    worker: InferenceWorker,
    cancel_token: CancellationToken,
    app: AppHandle,
    flow_started: Instant,
    sample_rate: u32,
    preview_shared: Arc<StdMutex<IncrementalPreviewResult>>,
) -> IncrementalPreviewResult {
    let cadence = Duration::from_millis(INCREMENTAL_DECODE_CADENCE_MS);
    let min_voiced_samples = ms_to_sample_count(INCREMENTAL_MIN_VOICED_MS, sample_rate);
    let window_samples = ms_to_sample_count(INCREMENTAL_WINDOW_MS, sample_rate).max(1);
    let overlap_samples = ms_to_sample_count(INCREMENTAL_WINDOW_OVERLAP_MS, sample_rate)
        .min(window_samples.saturating_sub(1));
    let step_samples = window_samples.saturating_sub(overlap_samples).max(1);

    let mut captured_audio = Vec::<f32>::new();
    let mut voiced_samples = 0usize;
    let mut committed_draft = String::new();
    let mut last_committed_sample = 0usize;
    let mut hold_to_first_draft_ms = 0u64;
    let mut incremental_decode_ms = 0u64;
    let mut incremental_windows_decoded = 0u32;
    let mut next_window_target = min_voiced_samples;
    let mut last_schedule_at: Option<Instant> = None;
    let mut pending_window: Option<DecodeWindow> = None;
    let mut inflight: Option<JoinHandle<DecodeJobResult>> = None;
    let mut channel_closed = false;

    loop {
        if cancel_token.is_cancelled() {
            break;
        }

        if !channel_closed {
            match timeout(Duration::from_millis(15), rx.recv()).await {
                Ok(Some(chunk)) => {
                    if chunk.voiced {
                        voiced_samples = voiced_samples.saturating_add(chunk.samples.len());
                    }
                    captured_audio.extend_from_slice(&chunk.samples);
                }
                Ok(None) => {
                    channel_closed = true;
                }
                Err(_) => {}
            }
        }

        let can_schedule_now = voiced_samples >= min_voiced_samples
            && captured_audio.len() >= next_window_target
            && last_schedule_at
                .map(|scheduled_at| scheduled_at.elapsed() >= cadence)
                .unwrap_or(true);
        if can_schedule_now {
            let end = captured_audio.len();
            let start = end.saturating_sub(window_samples);
            let window = DecodeWindow {
                end_sample: end,
                samples: captured_audio[start..end].to_vec(),
            };
            next_window_target = end.saturating_add(step_samples);
            last_schedule_at = Some(Instant::now());
            if inflight.is_none() {
                inflight = Some(spawn_incremental_decode_job(
                    worker.clone(),
                    cancel_token.clone(),
                    window,
                ));
            } else {
                pending_window = Some(window);
            }
        }

        if inflight.as_ref().is_some_and(|handle| handle.is_finished()) {
            let handle = inflight.take().expect("inflight decode handle should exist");
            match handle.await {
                Ok(result) => {
                    incremental_windows_decoded = incremental_windows_decoded.saturating_add(1);
                    incremental_decode_ms = incremental_decode_ms.saturating_add(result.elapsed_ms);
                    if let Some(text) = result.transcript {
                        let sanitized = sanitize_user_transcript(&text);
                        if !sanitized.is_empty() {
                            committed_draft = merge_incremental_transcript(
                                &committed_draft,
                                &sanitized,
                                TRANSCRIPT_OVERLAP_TOKENS,
                            );
                            last_committed_sample = result.window.end_sample;
                            if hold_to_first_draft_ms == 0 {
                                hold_to_first_draft_ms =
                                    flow_started.elapsed().as_millis() as u64;
                            }
                            let _ = app.emit(
                                "voicewave://transcript",
                                TranscriptEvent {
                                    text: committed_draft.clone(),
                                    is_final: false,
                                    elapsed_ms: flow_started.elapsed().as_millis() as u64,
                                },
                            );
                            if let Ok(mut shared) = preview_shared.lock() {
                                shared.committed_draft = committed_draft.clone();
                                shared.last_committed_sample = last_committed_sample;
                                shared.hold_to_first_draft_ms = hold_to_first_draft_ms;
                                shared.incremental_decode_ms = incremental_decode_ms;
                                shared.incremental_windows_decoded = incremental_windows_decoded;
                            }
                        }
                    }
                }
                Err(err) => {
                    eprintln!("voicewave: incremental decode task join failed: {err}");
                }
            }

            if let Some(window) = pending_window.take() {
                inflight = Some(spawn_incremental_decode_job(
                    worker.clone(),
                    cancel_token.clone(),
                    window,
                ));
            }
        }

        if channel_closed && inflight.is_none() && pending_window.is_none() {
            break;
        }

        if channel_closed {
            sleep(Duration::from_millis(6)).await;
        }
    }

    let result = IncrementalPreviewResult {
        committed_draft,
        last_committed_sample,
        hold_to_first_draft_ms,
        incremental_decode_ms,
        incremental_windows_decoded,
    };
    if let Ok(mut shared) = preview_shared.lock() {
        *shared = result.clone();
    }
    result
}

fn ms_to_sample_count(ms: u64, sample_rate: u32) -> usize {
    (((ms as f64 / 1000.0) * sample_rate as f64).round() as usize).max(1)
}

fn sample_count_to_ms(sample_count: usize, sample_rate: u32) -> u64 {
    if sample_rate == 0 {
        return 0;
    }
    ((sample_count as f64 / sample_rate as f64) * 1000.0).round() as u64
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
        asr_integrity_metrics, build_terminology_hint_from_texts, clamp_vad_threshold,
        floor_decode_mode, is_likely_low_quality_input_name, now_utc_ms, push_release_allowed,
        DictationStartTrigger, MAX_VAD_THRESHOLD, MIN_VAD_THRESHOLD, RECOMMENDED_VAD_THRESHOLD,
    };
    use crate::settings::DecodeMode;
    use std::time::Duration;

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

    #[test]
    fn push_release_requires_push_trigger() {
        assert!(!push_release_allowed(
            DictationStartTrigger::Manual,
            Duration::from_millis(1)
        ));
        assert!(!push_release_allowed(
            DictationStartTrigger::ToggleHotkey,
            Duration::from_millis(1)
        ));
    }

    #[test]
    fn push_release_allows_immediate_push_to_talk_release() {
        assert!(push_release_allowed(
            DictationStartTrigger::PushToTalk,
            Duration::from_millis(0)
        ));
    }

    #[test]
    fn decode_mode_floor_never_drops_below_requested_floor() {
        assert_eq!(floor_decode_mode(DecodeMode::Fast, DecodeMode::Balanced), DecodeMode::Balanced);
        assert_eq!(floor_decode_mode(DecodeMode::Balanced, DecodeMode::Quality), DecodeMode::Quality);
        assert_eq!(floor_decode_mode(DecodeMode::Quality, DecodeMode::Balanced), DecodeMode::Quality);
    }

    #[test]
    fn low_quality_input_detection_flags_hands_free_patterns() {
        assert!(is_likely_low_quality_input_name("Headset (WH-1000XM4)"));
        assert!(is_likely_low_quality_input_name("Bluetooth headset AG Audio"));
        assert!(!is_likely_low_quality_input_name("USB Microphone Array"));
    }

    #[test]
    fn asr_integrity_tracks_raw_to_final_word_overlap() {
        let (integrity, raw_words, final_words) =
            asr_integrity_metrics("hello team alpha bravo", "hello team bravo");
        assert_eq!(raw_words, 4);
        assert_eq!(final_words, 3);
        assert!(integrity > 80.0);
    }

    #[test]
    fn terminology_hint_prefers_recent_unique_terms() {
        let terms = vec![
            "Kubernetes".to_string(),
            "gRPC".to_string(),
            "kubernetes".to_string(),
        ];
        let hint = build_terminology_hint_from_texts(&terms, 4).expect("hint should exist");
        assert!(hint.contains("gRPC"));
        assert!(hint.to_ascii_lowercase().contains("kubernetes"));
    }
}

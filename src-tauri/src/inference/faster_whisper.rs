use super::{backend::gpu_session_cpu_locked, InferenceError};
use crate::settings::DecodeMode;
use base64::{engine::general_purpose::STANDARD as BASE64_STANDARD, Engine as _};
use directories::ProjectDirs;
use serde::{Deserialize, Serialize};
use std::collections::HashSet;
use std::fs;
use std::io::{BufRead, BufReader, Read, Write};
use std::path::{Path, PathBuf};
use std::process::{Child, ChildStdin, ChildStdout, Command, Stdio};
use std::sync::{Mutex, OnceLock};
use std::time::{SystemTime, UNIX_EPOCH};
use tokio_util::sync::CancellationToken;

#[derive(Debug, Clone)]
pub struct FasterWhisperDecodeOutput {
    pub text: String,
    pub model_init_ms: u64,
    pub decode_compute_ms: u64,
    pub runtime_cache_hit: bool,
    pub segment_count: u32,
    pub avg_logprob: f32,
    pub no_speech_prob: f32,
    pub compression_ratio: f32,
    pub backend_requested: String,
    pub backend_used: String,
    pub backend_fallback: bool,
}

#[derive(Debug, Clone)]
pub struct FasterWhisperPrefetchOutput {
    pub model_init_ms: u64,
    pub runtime_cache_hit: bool,
}

#[derive(Debug, Clone, Default)]
pub struct FasterWhisperRequestOverrides {
    pub beam_size: Option<u32>,
    pub best_of: Option<u32>,
    pub vad_filter: Option<bool>,
    pub condition_on_previous_text: Option<bool>,
    pub without_timestamps: Option<bool>,
    pub initial_prompt: Option<String>,
    pub temperature: Option<f32>,
    pub no_speech_threshold: Option<f32>,
    pub log_prob_threshold: Option<f32>,
    pub compression_ratio_threshold: Option<f32>,
}

#[derive(Debug, Serialize)]
#[serde(rename_all = "camelCase")]
struct WorkerRequest {
    id: u64,
    command: String,
    model_id: String,
    compute_type: String,
    backend_preference: String,
    allow_backend_fallback: bool,
    audio_path: String,
    audio_pcm16_b64: Option<String>,
    sample_rate_hz: u32,
    beam_size: u32,
    best_of: u32,
    language: String,
    vad_filter: bool,
    condition_on_previous_text: bool,
    without_timestamps: bool,
    initial_prompt: Option<String>,
    temperature: Option<f32>,
    no_speech_threshold: Option<f32>,
    log_prob_threshold: Option<f32>,
    compression_ratio_threshold: Option<f32>,
}

#[derive(Debug, Deserialize)]
#[serde(rename_all = "camelCase")]
struct WorkerResponse {
    id: Option<u64>,
    ok: bool,
    error: Option<String>,
    text: Option<String>,
    #[serde(default)]
    model_init_ms: u64,
    #[serde(default)]
    decode_compute_ms: u64,
    #[serde(default)]
    runtime_cache_hit: bool,
    #[serde(default)]
    segment_count: u32,
    #[serde(default)]
    avg_log_prob: f32,
    #[serde(default)]
    no_speech_prob: f32,
    #[serde(default)]
    compression_ratio: f32,
    #[serde(default)]
    backend_requested: String,
    #[serde(default)]
    backend_used: String,
    #[serde(default)]
    backend_fallback: bool,
}

struct WorkerProcess {
    child: Child,
    stdin: ChildStdin,
    stdout: BufReader<ChildStdout>,
    next_id: u64,
}

static WORKER: OnceLock<Mutex<Option<WorkerProcess>>> = OnceLock::new();
const FW_GPU_DISABLED_MARKER: &str = "fw-gpu-disabled.marker";

pub async fn ensure_faster_whisper_ready() -> Result<(), InferenceError> {
    tokio::task::spawn_blocking(ensure_worker_ready_blocking)
        .await
        .map_err(|err| {
            InferenceError::RuntimeJoin(format!("faster-whisper readiness join failure: {err}"))
        })?
}

pub async fn prefetch_model(model_id: &str) -> Result<FasterWhisperPrefetchOutput, InferenceError> {
    let backend_preference = worker_backend_preference_for_model(model_id);
    let compute_type = worker_compute_type_for_backend(&backend_preference);
    let request = WorkerRequest {
        id: next_request_id(),
        command: "prefetch".to_string(),
        model_id: model_id.to_string(),
        compute_type: compute_type.clone(),
        backend_preference: backend_preference.clone(),
        allow_backend_fallback: true,
        audio_path: String::new(),
        audio_pcm16_b64: None,
        sample_rate_hz: 16_000,
        beam_size: 2,
        best_of: 1,
        language: "en".to_string(),
        vad_filter: false,
        condition_on_previous_text: false,
        without_timestamps: false,
        initial_prompt: None,
        temperature: None,
        no_speech_threshold: None,
        log_prob_threshold: None,
        compression_ratio_threshold: None,
    };
    let response = tokio::task::spawn_blocking(move || send_worker_request_blocking(request))
        .await
        .map_err(|err| {
            InferenceError::RuntimeJoin(format!("faster-whisper prefetch join failure: {err}"))
        })??;

    Ok(FasterWhisperPrefetchOutput {
        model_init_ms: response.model_init_ms,
        runtime_cache_hit: response.runtime_cache_hit,
    })
}

pub async fn transcribe_samples_with_overrides(
    samples: &[f32],
    model_id: &str,
    decode_mode: DecodeMode,
    overrides: FasterWhisperRequestOverrides,
    cancel_token: &CancellationToken,
) -> Result<FasterWhisperDecodeOutput, InferenceError> {
    if cancel_token.is_cancelled() {
        return Err(InferenceError::Cancelled);
    }

    let audio_pcm16_b64 = encode_pcm16_base64(samples);
    let request = worker_request_for(model_id, decode_mode, overrides, audio_pcm16_b64);
    let result = tokio::task::spawn_blocking(move || send_worker_request_blocking(request))
        .await
        .map_err(|err| {
            InferenceError::RuntimeJoin(format!("faster-whisper worker join failure: {err}"))
        })?;

    if cancel_token.is_cancelled() {
        return Err(InferenceError::Cancelled);
    }
    let response = result?;
    if response.backend_fallback
        && response.backend_requested.eq_ignore_ascii_case("cuda")
        && response.backend_used.eq_ignore_ascii_case("cpu")
    {
        set_fw_gpu_persistently_disabled(true);
    } else if response.backend_used.eq_ignore_ascii_case("cuda") {
        set_fw_gpu_persistently_disabled(false);
    }
    Ok(FasterWhisperDecodeOutput {
        text: response.text.unwrap_or_default(),
        model_init_ms: response.model_init_ms,
        decode_compute_ms: response.decode_compute_ms,
        runtime_cache_hit: response.runtime_cache_hit,
        segment_count: response.segment_count,
        avg_logprob: response.avg_log_prob,
        no_speech_prob: response.no_speech_prob,
        compression_ratio: response.compression_ratio,
        backend_requested: response.backend_requested,
        backend_used: response.backend_used,
        backend_fallback: response.backend_fallback,
    })
}

pub fn cache_hint_for_model(model_id: &str) -> PathBuf {
    let repo = format!("models--Systran--faster-whisper-{model_id}");
    hf_home_dir().join("hub").join(repo)
}

fn ensure_worker_ready_blocking() -> Result<(), InferenceError> {
    let slot = WORKER.get_or_init(|| Mutex::new(None));
    let mut guard = slot.lock().map_err(|_| {
        InferenceError::RuntimeJoin("faster-whisper worker lock poisoned".to_string())
    })?;
    if guard
        .as_mut()
        .is_some_and(|worker| worker.child.try_wait().ok().flatten().is_none())
    {
        return Ok(());
    }
    *guard = Some(spawn_worker()?);
    Ok(())
}

fn send_worker_request_blocking(request: WorkerRequest) -> Result<WorkerResponse, InferenceError> {
    let slot = WORKER.get_or_init(|| Mutex::new(None));
    let mut guard = slot.lock().map_err(|_| {
        InferenceError::RuntimeJoin("faster-whisper worker lock poisoned".to_string())
    })?;

    let worker = ensure_worker(&mut guard)?;
    let payload = serde_json::to_string(&request).map_err(|err| {
        InferenceError::RuntimeJoin(format!("encode worker request failed: {err}"))
    })?;
    worker
        .stdin
        .write_all(payload.as_bytes())
        .map_err(|err| InferenceError::RuntimeJoin(format!("worker stdin write failed: {err}")))?;
    worker
        .stdin
        .write_all(b"\n")
        .map_err(|err| {
            InferenceError::RuntimeJoin(format!("worker stdin newline write failed: {err}"))
        })?;
    worker
        .stdin
        .flush()
        .map_err(|err| InferenceError::RuntimeJoin(format!("worker stdin flush failed: {err}")))?;

    let mut line = String::new();
    let bytes = worker.stdout.read_line(&mut line).map_err(|err| {
        InferenceError::RuntimeJoin(format!("worker stdout read failed: {err}"))
    })?;
    if bytes == 0 {
        *guard = None;
        return Err(InferenceError::RuntimeJoin(
            "faster-whisper worker exited unexpectedly".to_string(),
        ));
    }

    let response: WorkerResponse = serde_json::from_str(line.trim()).map_err(|err| {
        InferenceError::RuntimeJoin(format!("parse worker response failed: {err}"))
    })?;
    if !response.ok {
        return Err(InferenceError::DecodeFailed {
            model_id: request.model_id,
            reason: response
                .error
                .unwrap_or_else(|| "faster-whisper request failed".to_string()),
        });
    }
    if response.id != Some(request.id) {
        return Err(InferenceError::RuntimeJoin(format!(
            "worker response id mismatch (expected {}, got {:?})",
            request.id, response.id
        )));
    }
    Ok(response)
}

fn ensure_worker<'a>(
    guard: &'a mut Option<WorkerProcess>,
) -> Result<&'a mut WorkerProcess, InferenceError> {
    let needs_spawn = match guard.as_mut() {
        Some(worker) => worker.child.try_wait().ok().flatten().is_some(),
        None => true,
    };
    if needs_spawn {
        *guard = Some(spawn_worker()?);
    }
    guard.as_mut().ok_or_else(|| {
        InferenceError::RuntimeJoin("failed to start faster-whisper worker".to_string())
    })
}

fn spawn_worker() -> Result<WorkerProcess, InferenceError> {
    let worker_path = resolve_worker_path()?;
    let python = resolve_python_path();
    let hf_home = hf_home_dir();
    let hub_cache = hf_home.join("hub");
    fs::create_dir_all(&hub_cache).map_err(|err| {
        InferenceError::RuntimeJoin(format!("failed to create faster-whisper cache directories: {err}"))
    })?;

    let thread_cap = preferred_worker_thread_cap()
        .to_string();

    let mut command = Command::new(&python);
    command
        .arg(worker_path.as_os_str())
        .env("HF_HOME", &hf_home)
        .env("HUGGINGFACE_HUB_CACHE", &hub_cache)
        .env("TRANSFORMERS_CACHE", &hub_cache)
        .env("OMP_NUM_THREADS", &thread_cap)
        .env("CT2_NUM_THREADS", &thread_cap)
        .stdin(Stdio::piped())
        .stdout(Stdio::piped())
        .stderr(Stdio::piped());
    let cuda_bins = resolve_cuda_bin_paths(&python);
    if !cuda_bins.is_empty() {
        let prepend = cuda_bins
            .iter()
            .map(|path| path.to_string_lossy().to_string())
            .collect::<Vec<_>>()
            .join(";");
        if let Ok(existing_path) = std::env::var("PATH") {
            let combined = format!("{prepend};{existing_path}");
            command.env("PATH", combined);
        } else {
            command.env("PATH", prepend);
        }
    }
    let mut child = command.spawn().map_err(|err| {
        InferenceError::RuntimeJoin(format!(
            "failed to spawn faster-whisper worker using '{python}': {err}. Run scripts/faster_whisper/setup-faster-whisper-cpu.ps1 first."
        ))
    })?;

    let stdin = child
        .stdin
        .take()
        .ok_or_else(|| InferenceError::RuntimeJoin("worker stdin unavailable".to_string()))?;
    let stdout = child
        .stdout
        .take()
        .ok_or_else(|| InferenceError::RuntimeJoin("worker stdout unavailable".to_string()))?;
    let mut stdout_reader = BufReader::new(stdout);

    let mut ready_line = String::new();
    let ready_bytes = stdout_reader.read_line(&mut ready_line).map_err(|err| {
        InferenceError::RuntimeJoin(format!("worker ready read failed: {err}"))
    })?;
    if ready_bytes == 0 {
        let stderr = child
            .stderr
            .take()
            .map(|mut row| {
                let mut out = String::new();
                let _ = row.read_to_string(&mut out);
                out
            })
            .unwrap_or_default();
        return Err(InferenceError::RuntimeJoin(format!(
            "faster-whisper worker exited before ready. stderr: {}",
            stderr.trim()
        )));
    }

    Ok(WorkerProcess {
        child,
        stdin,
        stdout: stdout_reader,
        next_id: 1,
    })
}

fn resolve_worker_path() -> Result<PathBuf, InferenceError> {
    if let Ok(path) = std::env::var("VOICEWAVE_FASTER_WHISPER_WORKER") {
        let value = PathBuf::from(path.trim());
        if value.exists() {
            return Ok(value);
        }
    }

    let candidates = [
        PathBuf::from("scripts").join("faster_whisper").join("worker.py"),
        Path::new(env!("CARGO_MANIFEST_DIR"))
            .join("..")
            .join("scripts")
            .join("faster_whisper")
            .join("worker.py"),
    ];
    for candidate in candidates {
        if candidate.exists() {
            return Ok(candidate);
        }
    }

    Err(InferenceError::RuntimeJoin(
        "faster-whisper worker.py not found. Expected scripts/faster_whisper/worker.py"
            .to_string(),
    ))
}

fn resolve_python_path() -> String {
    if let Ok(path) = std::env::var("VOICEWAVE_FASTER_WHISPER_PYTHON") {
        let trimmed = path.trim();
        if !trimmed.is_empty() {
            return trimmed.to_string();
        }
    }

    let venv_python = Path::new(env!("CARGO_MANIFEST_DIR"))
        .join("..")
        .join(".venv-faster-whisper")
        .join("Scripts")
        .join("python.exe");
    if venv_python.exists() {
        return venv_python.to_string_lossy().to_string();
    }

    "python".to_string()
}

fn resolve_cuda_bin_path() -> Option<PathBuf> {
    if let Ok(cuda_root) = std::env::var("CUDA_PATH") {
        let root = PathBuf::from(cuda_root.trim());
        let bin = root.join("bin");
        if bin.exists() {
            return Some(bin);
        }
    }

    let default_root = Path::new("C:\\Program Files\\NVIDIA GPU Computing Toolkit\\CUDA");
    if !default_root.exists() {
        return None;
    }
    let mut versions = fs::read_dir(default_root)
        .ok()?
        .filter_map(Result::ok)
        .filter_map(|entry| {
            entry.file_type().ok().and_then(|ft| {
                if ft.is_dir() {
                    Some(entry.path())
                } else {
                    None
                }
            })
        })
        .collect::<Vec<_>>();
    versions.sort_by(|a, b| b.cmp(a));
    versions
        .into_iter()
        .map(|path| path.join("bin"))
        .find(|bin| bin.exists())
}

fn resolve_cuda_bin_paths(python_path: &str) -> Vec<PathBuf> {
    let mut paths = resolve_python_cuda_bin_paths(python_path);
    if let Some(cuda_bin) = resolve_cuda_bin_path() {
        paths.push(cuda_bin);
    }

    let mut dedup = HashSet::new();
    paths
        .into_iter()
        .filter(|path| path.exists())
        .filter(|path| dedup.insert(path.clone()))
        .collect()
}

fn resolve_python_cuda_bin_paths(python_path: &str) -> Vec<PathBuf> {
    let python = PathBuf::from(python_path.trim());
    let scripts_dir = match python.parent() {
        Some(value) => value,
        None => return Vec::new(),
    };
    let venv_root = match scripts_dir.parent() {
        Some(value) => value,
        None => return Vec::new(),
    };

    let nvidia_root = venv_root.join("Lib").join("site-packages").join("nvidia");
    if !nvidia_root.exists() {
        return Vec::new();
    }

    fs::read_dir(&nvidia_root)
        .ok()
        .into_iter()
        .flatten()
        .filter_map(Result::ok)
        .filter_map(|entry| {
            entry.file_type().ok().and_then(|ft| {
                if ft.is_dir() {
                    let bin = entry.path().join("bin");
                    if bin.exists() {
                        Some(bin)
                    } else {
                        None
                    }
                } else {
                    None
                }
            })
        })
        .collect()
}

fn worker_request_for(
    model_id: &str,
    decode_mode: DecodeMode,
    overrides: FasterWhisperRequestOverrides,
    audio_pcm16_b64: String,
) -> WorkerRequest {
    let backend_preference = worker_backend_preference_for_model(model_id);
    let compute_type = worker_compute_type_for_backend(&backend_preference);
    let (beam_size, best_of) = decode_hyperparams_for(model_id, decode_mode);
    let initial_prompt = overrides
        .initial_prompt
        .as_deref()
        .map(str::trim)
        .filter(|value| !value.is_empty())
        .map(ToString::to_string);
    WorkerRequest {
        id: next_request_id(),
        command: "transcribe".to_string(),
        model_id: model_id.to_string(),
        compute_type,
        backend_preference,
        allow_backend_fallback: true,
        audio_path: String::new(),
        audio_pcm16_b64: Some(audio_pcm16_b64),
        sample_rate_hz: 16_000,
        beam_size: overrides.beam_size.unwrap_or(beam_size),
        best_of: overrides.best_of.unwrap_or(best_of),
        language: "en".to_string(),
        // Push-to-talk path already endpoints speech; avoid double-VAD trimming.
        vad_filter: overrides.vad_filter.unwrap_or(false),
        condition_on_previous_text: overrides.condition_on_previous_text.unwrap_or(false),
        without_timestamps: overrides
            .without_timestamps
            .unwrap_or_else(fw_without_timestamps_enabled),
        initial_prompt,
        temperature: overrides.temperature,
        no_speech_threshold: overrides.no_speech_threshold,
        log_prob_threshold: overrides.log_prob_threshold,
        compression_ratio_threshold: overrides.compression_ratio_threshold,
    }
}

fn worker_backend_preference_for_model(model_id: &str) -> String {
    select_worker_backend_preference(
        model_id,
        env_flag("VOICEWAVE_FORCE_CPU", false),
        env_flag("VOICEWAVE_FORCE_GPU", false),
        gpu_session_cpu_locked(),
        fw_gpu_persistently_disabled(),
        env_flag("VOICEWAVE_AUTO_GPU", true),
    )
    .to_string()
}

fn select_worker_backend_preference(
    model_id: &str,
    force_cpu: bool,
    force_gpu: bool,
    session_cpu_locked: bool,
    persistently_disabled: bool,
    auto_gpu_enabled: bool,
) -> &'static str {
    if force_cpu {
        return "cpu";
    }
    if force_gpu {
        return "cuda";
    }
    if session_cpu_locked || persistently_disabled || !auto_gpu_enabled {
        return "cpu";
    }
    if is_gpu_preferred_model(model_id) {
        return "auto";
    }
    "cpu"
}

fn worker_compute_type_for_backend(backend_preference: &str) -> String {
    if backend_preference.eq_ignore_ascii_case("cpu") {
        std::env::var("VOICEWAVE_FW_CPU_COMPUTE_TYPE")
            .map(|value| value.trim().to_string())
            .ok()
            .filter(|value| !value.is_empty())
            .unwrap_or_else(|| "int8".to_string())
    } else {
        std::env::var("VOICEWAVE_FW_GPU_COMPUTE_TYPE")
            .map(|value| value.trim().to_string())
            .ok()
            .filter(|value| !value.is_empty())
            // Prefer stability-first default on mixed Windows CUDA setups.
            .unwrap_or_else(|| "int8".to_string())
    }
}

fn is_gpu_preferred_model(model_id: &str) -> bool {
    let normalized = model_id.trim().to_ascii_lowercase();
    !(normalized.starts_with("tiny") || normalized.starts_with("base"))
}

fn env_flag(key: &str, default_value: bool) -> bool {
    match std::env::var(key) {
        Ok(value) => match value.trim().to_ascii_lowercase().as_str() {
            "1" | "true" | "yes" | "on" => true,
            "0" | "false" | "no" | "off" => false,
            _ => default_value,
        },
        Err(_) => default_value,
    }
}

fn fw_gpu_persistently_disabled() -> bool {
    fw_gpu_disable_marker_path()
        .as_ref()
        .is_some_and(|path| path.exists())
}

fn set_fw_gpu_persistently_disabled(disabled: bool) {
    let Some(path) = fw_gpu_disable_marker_path() else {
        return;
    };
    if disabled {
        if let Some(parent) = path.parent() {
            let _ = fs::create_dir_all(parent);
        }
        let _ = fs::write(path, now_utc_ms().to_string());
    } else if path.exists() {
        let _ = fs::remove_file(path);
    }
}

fn fw_gpu_disable_marker_path() -> Option<PathBuf> {
    ProjectDirs::from("com", "voicewave", "localcore")
        .map(|dirs| dirs.config_dir().join(FW_GPU_DISABLED_MARKER))
}

fn preferred_worker_thread_cap() -> usize {
    if let Ok(value) = std::env::var("VOICEWAVE_FW_THREADS") {
        if let Ok(parsed) = value.trim().parse::<usize>() {
            if parsed > 0 {
                return parsed.clamp(2, 16);
            }
        }
    }

    let available = std::thread::available_parallelism()
        .map(|value| value.get())
        .unwrap_or(4);
    if available >= 14 {
        12
    } else if available >= 10 {
        10
    } else if available >= 8 {
        8
    } else {
        available.clamp(2, 6)
    }
}

fn fw_without_timestamps_enabled() -> bool {
    std::env::var("VOICEWAVE_FW_WITHOUT_TIMESTAMPS")
        .map(|value| {
            let normalized = value.trim().to_ascii_lowercase();
            !(normalized == "0" || normalized == "false" || normalized == "off")
        })
        .unwrap_or(true)
}

fn encode_pcm16_base64(samples: &[f32]) -> String {
    let mut bytes = Vec::with_capacity(samples.len().saturating_mul(2));
    for sample in samples {
        let clamped = sample.clamp(-1.0, 1.0);
        let pcm = (clamped * i16::MAX as f32) as i16;
        bytes.extend_from_slice(&pcm.to_le_bytes());
    }
    BASE64_STANDARD.encode(bytes)
}

fn decode_hyperparams_for(model_id: &str, decode_mode: DecodeMode) -> (u32, u32) {
    match (model_id, decode_mode) {
        ("small.en", DecodeMode::Fast) => (1, 1),
        ("small.en", DecodeMode::Balanced) => (3, 2),
        ("small.en", DecodeMode::Quality) => (5, 3),
        ("large-v3", DecodeMode::Fast) => (1, 1),
        ("large-v3", DecodeMode::Balanced) => (4, 2),
        ("large-v3", DecodeMode::Quality) => (5, 3),
        (_, DecodeMode::Fast) => (1, 1),
        (_, DecodeMode::Balanced) => (3, 2),
        (_, DecodeMode::Quality) => (5, 3),
    }
}

#[cfg(test)]
mod tests {
    use super::{
        decode_hyperparams_for, encode_pcm16_base64, select_worker_backend_preference, worker_request_for,
        FasterWhisperRequestOverrides,
    };
    use crate::settings::DecodeMode;

    #[test]
    fn fw_balanced_profile_has_quality_floor_for_small() {
        let (beam, best_of) = decode_hyperparams_for("small.en", DecodeMode::Balanced);
        assert!(beam >= 2);
        assert!(best_of >= 2);
    }

    #[test]
    fn fw_fast_profile_remains_latency_first() {
        let (beam, best_of) = decode_hyperparams_for("small.en", DecodeMode::Fast);
        assert_eq!(beam, 1);
        assert_eq!(best_of, 1);
    }

    #[test]
    fn fw_balanced_request_uses_plain_decode_without_prompt_or_context() {
        let request = worker_request_for(
            "small.en",
            DecodeMode::Balanced,
            FasterWhisperRequestOverrides::default(),
            "AQID".to_string(),
        );
        assert!(!request.condition_on_previous_text);
        assert!(request.initial_prompt.is_none());
        assert!(request.audio_pcm16_b64.is_some());
        assert_eq!(request.sample_rate_hz, 16_000);
        assert!(request.allow_backend_fallback);
        assert!(!request.backend_preference.is_empty());
        assert_eq!(
            request.without_timestamps,
            super::fw_without_timestamps_enabled()
        );
    }

    #[test]
    fn fw_fast_request_disables_prompt_for_speed() {
        let request = worker_request_for(
            "small.en",
            DecodeMode::Fast,
            FasterWhisperRequestOverrides::default(),
            "AQID".to_string(),
        );
        assert!(!request.condition_on_previous_text);
        assert!(request.initial_prompt.is_none());
        assert!(request.allow_backend_fallback);
        assert!(!request.backend_preference.is_empty());
        assert_eq!(
            request.without_timestamps,
            super::fw_without_timestamps_enabled()
        );
    }

    #[test]
    fn fw_overrides_replace_request_defaults() {
        let request = worker_request_for(
            "small.en",
            DecodeMode::Balanced,
            FasterWhisperRequestOverrides {
                beam_size: Some(5),
                best_of: Some(3),
                initial_prompt: Some(" spell uncommon words literally ".to_string()),
                condition_on_previous_text: Some(true),
                vad_filter: Some(true),
                without_timestamps: Some(false),
                temperature: Some(0.0),
                no_speech_threshold: Some(0.5),
                log_prob_threshold: Some(-1.2),
                compression_ratio_threshold: Some(2.1),
            },
            "AQID".to_string(),
        );
        assert_eq!(request.beam_size, 5);
        assert_eq!(request.best_of, 3);
        assert_eq!(
            request.initial_prompt.as_deref(),
            Some("spell uncommon words literally")
        );
        assert!(request.condition_on_previous_text);
        assert!(request.vad_filter);
        assert!(!request.without_timestamps);
        assert_eq!(request.temperature, Some(0.0));
        assert_eq!(request.no_speech_threshold, Some(0.5));
        assert_eq!(request.log_prob_threshold, Some(-1.2));
        assert_eq!(request.compression_ratio_threshold, Some(2.1));
    }

    #[test]
    fn pcm_encoding_produces_non_empty_base64_payload() {
        let encoded = encode_pcm16_base64(&[0.0_f32, 0.25_f32, -0.25_f32]);
        assert!(!encoded.is_empty());
    }

    #[test]
    fn backend_policy_prefers_auto_for_small_model_when_gpu_is_allowed() {
        let backend = select_worker_backend_preference("small.en", false, false, false, false, true);
        assert_eq!(backend, "auto");
    }

    #[test]
    fn backend_policy_keeps_tiny_and_base_on_cpu_by_default() {
        let tiny = select_worker_backend_preference("tiny.en", false, false, false, false, true);
        let base = select_worker_backend_preference("base.en", false, false, false, false, true);
        assert_eq!(tiny, "cpu");
        assert_eq!(base, "cpu");
    }

    #[test]
    fn backend_policy_honors_force_flags_in_safe_order() {
        let force_gpu = select_worker_backend_preference("small.en", false, true, true, true, false);
        assert_eq!(force_gpu, "cuda");

        let force_cpu = select_worker_backend_preference("small.en", true, true, false, false, true);
        assert_eq!(force_cpu, "cpu");
    }

    #[test]
    fn backend_policy_falls_back_to_cpu_when_gpu_session_is_blocked() {
        let session_locked =
            select_worker_backend_preference("small.en", false, false, true, false, true);
        let persistent_lock =
            select_worker_backend_preference("small.en", false, false, false, true, true);
        let auto_disabled =
            select_worker_backend_preference("small.en", false, false, false, false, false);
        assert_eq!(session_locked, "cpu");
        assert_eq!(persistent_lock, "cpu");
        assert_eq!(auto_disabled, "cpu");
    }
}

fn next_request_id() -> u64 {
    let slot = WORKER.get_or_init(|| Mutex::new(None));
    if let Ok(mut guard) = slot.lock() {
        if let Some(worker) = guard.as_mut() {
            let id = worker.next_id;
            worker.next_id = worker.next_id.saturating_add(1);
            return id;
        }
    }
    now_utc_ms()
}

fn hf_home_dir() -> PathBuf {
    if let Ok(path) = std::env::var("VOICEWAVE_FASTER_WHISPER_CACHE_DIR") {
        let trimmed = path.trim();
        if !trimmed.is_empty() {
            return PathBuf::from(trimmed);
        }
    }
    if let Some(proj_dirs) = ProjectDirs::from("com", "voicewave", "localcore") {
        return proj_dirs.data_dir().join("faster-whisper-cache");
    }
    std::env::temp_dir().join("voicewave-faster-whisper-cache")
}

fn now_utc_ms() -> u64 {
    SystemTime::now()
        .duration_since(UNIX_EPOCH)
        .map(|d| d.as_millis() as u64)
        .unwrap_or_default()
}

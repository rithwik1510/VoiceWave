use super::InferenceError;
use crate::settings::DecodeMode;
use directories::ProjectDirs;
use serde::{Deserialize, Serialize};
use std::fs::{self, File};
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
    audio_path: String,
    beam_size: u32,
    best_of: u32,
    language: String,
    vad_filter: bool,
    condition_on_previous_text: bool,
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
}

struct WorkerProcess {
    child: Child,
    stdin: ChildStdin,
    stdout: BufReader<ChildStdout>,
    next_id: u64,
}

static WORKER: OnceLock<Mutex<Option<WorkerProcess>>> = OnceLock::new();

pub async fn ensure_faster_whisper_ready() -> Result<(), InferenceError> {
    tokio::task::spawn_blocking(ensure_worker_ready_blocking)
        .await
        .map_err(|err| {
            InferenceError::RuntimeJoin(format!("faster-whisper readiness join failure: {err}"))
        })?
}

pub async fn prefetch_model(model_id: &str) -> Result<FasterWhisperPrefetchOutput, InferenceError> {
    let request = WorkerRequest {
        id: next_request_id(),
        command: "prefetch".to_string(),
        model_id: model_id.to_string(),
        compute_type: "int8".to_string(),
        audio_path: String::new(),
        beam_size: 2,
        best_of: 1,
        language: "en".to_string(),
        vad_filter: false,
        condition_on_previous_text: false,
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

    let audio_path = write_temp_wav(samples)?;
    let request = worker_request_for(&audio_path, model_id, decode_mode, overrides);
    let result = tokio::task::spawn_blocking(move || send_worker_request_blocking(request))
        .await
        .map_err(|err| {
            InferenceError::RuntimeJoin(format!("faster-whisper worker join failure: {err}"))
        })?;

    let _ = fs::remove_file(&audio_path);
    if cancel_token.is_cancelled() {
        return Err(InferenceError::Cancelled);
    }
    let response = result?;
    Ok(FasterWhisperDecodeOutput {
        text: response.text.unwrap_or_default(),
        model_init_ms: response.model_init_ms,
        decode_compute_ms: response.decode_compute_ms,
        runtime_cache_hit: response.runtime_cache_hit,
        segment_count: response.segment_count,
        avg_logprob: response.avg_log_prob,
        no_speech_prob: response.no_speech_prob,
        compression_ratio: response.compression_ratio,
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

    let thread_cap = std::thread::available_parallelism()
        .map(|value| value.get())
        .unwrap_or(4)
        .clamp(2, 8)
        .to_string();

    let mut child = Command::new(&python)
        .arg(worker_path.as_os_str())
        .env("HF_HOME", &hf_home)
        .env("HUGGINGFACE_HUB_CACHE", &hub_cache)
        .env("TRANSFORMERS_CACHE", &hub_cache)
        .env("OMP_NUM_THREADS", &thread_cap)
        .env("CT2_NUM_THREADS", &thread_cap)
        .stdin(Stdio::piped())
        .stdout(Stdio::piped())
        .stderr(Stdio::piped())
        .spawn()
        .map_err(|err| {
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

fn worker_request_for(
    audio_path: &Path,
    model_id: &str,
    decode_mode: DecodeMode,
    overrides: FasterWhisperRequestOverrides,
) -> WorkerRequest {
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
        compute_type: "int8".to_string(),
        audio_path: audio_path.to_string_lossy().to_string(),
        beam_size: overrides.beam_size.unwrap_or(beam_size),
        best_of: overrides.best_of.unwrap_or(best_of),
        language: "en".to_string(),
        // Push-to-talk path already endpoints speech; avoid double-VAD trimming.
        vad_filter: overrides.vad_filter.unwrap_or(false),
        condition_on_previous_text: overrides.condition_on_previous_text.unwrap_or(false),
        initial_prompt,
        temperature: overrides.temperature,
        no_speech_threshold: overrides.no_speech_threshold,
        log_prob_threshold: overrides.log_prob_threshold,
        compression_ratio_threshold: overrides.compression_ratio_threshold,
    }
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
    use super::{decode_hyperparams_for, worker_request_for, FasterWhisperRequestOverrides};
    use crate::settings::DecodeMode;
    use std::path::Path;

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
            Path::new("C:\\tmp\\sample.wav"),
            "small.en",
            DecodeMode::Balanced,
            FasterWhisperRequestOverrides::default(),
        );
        assert!(!request.condition_on_previous_text);
        assert!(request.initial_prompt.is_none());
    }

    #[test]
    fn fw_fast_request_disables_prompt_for_speed() {
        let request = worker_request_for(
            Path::new("C:\\tmp\\sample.wav"),
            "small.en",
            DecodeMode::Fast,
            FasterWhisperRequestOverrides::default(),
        );
        assert!(!request.condition_on_previous_text);
        assert!(request.initial_prompt.is_none());
    }

    #[test]
    fn fw_overrides_replace_request_defaults() {
        let request = worker_request_for(
            Path::new("C:\\tmp\\sample.wav"),
            "small.en",
            DecodeMode::Balanced,
            FasterWhisperRequestOverrides {
                beam_size: Some(5),
                best_of: Some(3),
                initial_prompt: Some(" spell uncommon words literally ".to_string()),
                condition_on_previous_text: Some(true),
                vad_filter: Some(true),
                temperature: Some(0.0),
                no_speech_threshold: Some(0.5),
                log_prob_threshold: Some(-1.2),
                compression_ratio_threshold: Some(2.1),
            },
        );
        assert_eq!(request.beam_size, 5);
        assert_eq!(request.best_of, 3);
        assert_eq!(
            request.initial_prompt.as_deref(),
            Some("spell uncommon words literally")
        );
        assert!(request.condition_on_previous_text);
        assert!(request.vad_filter);
        assert_eq!(request.temperature, Some(0.0));
        assert_eq!(request.no_speech_threshold, Some(0.5));
        assert_eq!(request.log_prob_threshold, Some(-1.2));
        assert_eq!(request.compression_ratio_threshold, Some(2.1));
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

fn write_temp_wav(samples: &[f32]) -> Result<PathBuf, InferenceError> {
    let base = std::env::temp_dir();
    let path = base.join(format!("voicewave-fw-{}.wav", now_utc_ms()));
    let mut file = File::create(&path).map_err(|err| {
        InferenceError::RuntimeJoin(format!("failed creating temp wav for faster-whisper: {err}"))
    })?;

    let sample_rate = 16_000u32;
    let channels = 1u16;
    let bits_per_sample = 16u16;
    let block_align = channels * (bits_per_sample / 8);
    let byte_rate = sample_rate * block_align as u32;
    let data_len = (samples.len() * 2) as u32;
    let riff_len = 36u32.saturating_add(data_len);

    file.write_all(b"RIFF")
        .and_then(|_| file.write_all(&riff_len.to_le_bytes()))
        .and_then(|_| file.write_all(b"WAVE"))
        .and_then(|_| file.write_all(b"fmt "))
        .and_then(|_| file.write_all(&16u32.to_le_bytes()))
        .and_then(|_| file.write_all(&1u16.to_le_bytes()))
        .and_then(|_| file.write_all(&channels.to_le_bytes()))
        .and_then(|_| file.write_all(&sample_rate.to_le_bytes()))
        .and_then(|_| file.write_all(&byte_rate.to_le_bytes()))
        .and_then(|_| file.write_all(&block_align.to_le_bytes()))
        .and_then(|_| file.write_all(&bits_per_sample.to_le_bytes()))
        .and_then(|_| file.write_all(b"data"))
        .and_then(|_| file.write_all(&data_len.to_le_bytes()))
        .map_err(|err| {
            InferenceError::RuntimeJoin(format!("failed writing wav header: {err}"))
        })?;

    for sample in samples {
        let clamped = sample.clamp(-1.0, 1.0);
        let pcm = (clamped * i16::MAX as f32) as i16;
        file.write_all(&pcm.to_le_bytes()).map_err(|err| {
            InferenceError::RuntimeJoin(format!("failed writing wav sample data: {err}"))
        })?;
    }
    file.flush()
        .map_err(|err| InferenceError::RuntimeJoin(format!("failed flushing wav file: {err}")))?;

    Ok(path)
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

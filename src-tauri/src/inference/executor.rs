use super::{
    cold_decode_whisper_blocking, decode_profile_version, decode_with_context,
    model_artifact_fingerprint, validate_model_artifact, InferenceError, WhisperDecodeOutput,
};
use crate::settings::DecodeMode;
use std::{
    collections::{HashMap, VecDeque},
    hash::{Hash, Hasher},
    path::PathBuf,
    sync::{mpsc, OnceLock},
    thread,
    time::Instant,
};
use tokio::sync::oneshot;
use tokio_util::sync::CancellationToken;
use whisper_rs::{WhisperContext, WhisperContextParameters};

const MAX_WARMED_RUNTIMES: usize = 2;

#[derive(Debug, Clone, Eq)]
struct RuntimeKey {
    model_id: String,
    model_path: String,
    model_fingerprint: String,
    profile_version: String,
}

impl PartialEq for RuntimeKey {
    fn eq(&self, other: &Self) -> bool {
        self.model_id == other.model_id
            && self.model_path == other.model_path
            && self.model_fingerprint == other.model_fingerprint
            && self.profile_version == other.profile_version
    }
}

impl Hash for RuntimeKey {
    fn hash<H: Hasher>(&self, state: &mut H) {
        self.model_id.hash(state);
        self.model_path.hash(state);
        self.model_fingerprint.hash(state);
        self.profile_version.hash(state);
    }
}

#[derive(Debug)]
enum RuntimeCommand {
    Decode {
        samples: Vec<f32>,
        model_id: String,
        model_path: PathBuf,
        decode_mode: DecodeMode,
        cancel_token: CancellationToken,
        response: oneshot::Sender<Result<WhisperDecodeOutput, InferenceError>>,
    },
    Prewarm {
        model_id: String,
        model_path: PathBuf,
        decode_mode: DecodeMode,
    },
}

#[derive(Default)]
struct RuntimeCache {
    runtimes: HashMap<RuntimeKey, WhisperContext>,
    lru: VecDeque<RuntimeKey>,
}

impl RuntimeCache {
    fn touch(&mut self, key: &RuntimeKey) {
        self.lru.retain(|entry| entry != key);
        self.lru.push_back(key.clone());
    }

    fn insert(&mut self, key: RuntimeKey, ctx: WhisperContext) {
        self.runtimes.insert(key.clone(), ctx);
        self.touch(&key);
        while self.runtimes.len() > MAX_WARMED_RUNTIMES {
            if let Some(oldest) = self.lru.pop_front() {
                self.runtimes.remove(&oldest);
            }
        }
    }

    fn get(&self, key: &RuntimeKey) -> Option<&WhisperContext> {
        self.runtimes.get(key)
    }
}

#[derive(Clone)]
struct ExecutorHandle {
    sender: mpsc::Sender<RuntimeCommand>,
}

static EXECUTOR_HANDLE: OnceLock<ExecutorHandle> = OnceLock::new();
static CPU_RUNTIME_POOL_ENABLED: OnceLock<bool> = OnceLock::new();

pub fn cpu_runtime_pool_enabled() -> bool {
    *CPU_RUNTIME_POOL_ENABLED.get_or_init(|| {
        std::env::var("VOICEWAVE_CPU_RUNTIME_POOL_ENABLED")
            .map(|value| {
                let normalized = value.trim().to_ascii_lowercase();
                !(normalized == "0" || normalized == "false" || normalized == "off")
            })
            .unwrap_or(true)
    })
}

pub fn prewarm_runtime(model_id: impl Into<String>, model_path: impl Into<PathBuf>, decode_mode: DecodeMode) {
    if !cpu_runtime_pool_enabled() {
        return;
    }
    let handle = ensure_executor();
    let _ = handle.sender.send(RuntimeCommand::Prewarm {
        model_id: model_id.into(),
        model_path: model_path.into(),
        decode_mode,
    });
}

pub async fn decode_with_runtime_pool(
    samples: Vec<f32>,
    model_id: String,
    model_path: PathBuf,
    decode_mode: DecodeMode,
    cancel_token: CancellationToken,
) -> Result<WhisperDecodeOutput, InferenceError> {
    let handle = ensure_executor();
    let (tx, rx) = oneshot::channel();
    handle
        .sender
        .send(RuntimeCommand::Decode {
            samples,
            model_id,
            model_path,
            decode_mode,
            cancel_token,
            response: tx,
        })
        .map_err(|err| InferenceError::RuntimeJoin(format!("executor queue send failed: {err}")))?;

    rx.await
        .map_err(|err| InferenceError::RuntimeJoin(format!("executor response dropped: {err}")))?
}

fn ensure_executor() -> &'static ExecutorHandle {
    EXECUTOR_HANDLE.get_or_init(|| {
        let (tx, rx) = mpsc::channel::<RuntimeCommand>();
        thread::Builder::new()
            .name("voicewave-inference-executor".to_string())
            .spawn(move || runtime_worker_loop(rx))
            .expect("voicewave inference executor thread should start");
        ExecutorHandle { sender: tx }
    })
}

fn runtime_worker_loop(receiver: mpsc::Receiver<RuntimeCommand>) {
    let mut cache = RuntimeCache::default();

    for command in receiver {
        match command {
            RuntimeCommand::Prewarm {
                model_id,
                model_path,
                decode_mode,
            } => {
                let _ = try_prewarm(&mut cache, &model_id, &model_path, decode_mode);
            }
            RuntimeCommand::Decode {
                samples,
                model_id,
                model_path,
                decode_mode,
                cancel_token,
                response,
            } => {
                let result =
                    decode_with_cache(&mut cache, &samples, &model_id, &model_path, decode_mode, &cancel_token);
                let _ = response.send(result);
            }
        }
    }
}

fn try_prewarm(
    cache: &mut RuntimeCache,
    model_id: &str,
    model_path: &PathBuf,
    decode_mode: DecodeMode,
) -> Result<(), InferenceError> {
    validate_model_artifact(model_path)?;
    let key = build_runtime_key(model_id, model_path, decode_mode)?;
    if cache.get(&key).is_some() {
        cache.touch(&key);
        return Ok(());
    }

    let model_path_str = model_path.to_string_lossy().to_string();
    let ctx = WhisperContext::new_with_params(&model_path_str, WhisperContextParameters::default())
        .map_err(|err| InferenceError::ModelLoadFailed {
            model_id: model_id.to_string(),
            path: model_path_str,
            reason: err.to_string(),
        })?;
    cache.insert(key, ctx);
    Ok(())
}

fn decode_with_cache(
    cache: &mut RuntimeCache,
    samples: &[f32],
    model_id: &str,
    model_path: &PathBuf,
    decode_mode: DecodeMode,
    cancel_token: &CancellationToken,
) -> Result<WhisperDecodeOutput, InferenceError> {
    validate_model_artifact(model_path)?;
    let key = build_runtime_key(model_id, model_path, decode_mode)?;

    let mut runtime_cache_hit = true;
    let mut model_init_ms = 0u64;
    if cache.get(&key).is_none() {
        runtime_cache_hit = false;
        let model_path_str = model_path.to_string_lossy().to_string();
        let init_started = Instant::now();
        let ctx = WhisperContext::new_with_params(&model_path_str, WhisperContextParameters::default())
            .map_err(|err| InferenceError::ModelLoadFailed {
                model_id: model_id.to_string(),
                path: model_path_str.clone(),
                reason: err.to_string(),
            });

        match ctx {
            Ok(ctx) => {
                model_init_ms = init_started.elapsed().as_millis() as u64;
                cache.insert(key.clone(), ctx);
            }
            Err(_) => {
                // Fallback: attempt a cold decode for this utterance instead of hard-failing pool path.
                return cold_decode_whisper_blocking(
                    samples,
                    model_id,
                    model_path.as_path(),
                    decode_mode,
                    cancel_token,
                );
            }
        }
    }

    cache.touch(&key);
    let Some(ctx) = cache.get(&key) else {
        return Err(InferenceError::RuntimeJoin(
            "runtime cache lost warmed context entry".to_string(),
        ));
    };

    decode_with_context(
        ctx,
        samples,
        model_id,
        decode_mode,
        cancel_token,
        model_init_ms,
        runtime_cache_hit,
    )
}

fn build_runtime_key(
    model_id: &str,
    model_path: &PathBuf,
    decode_mode: DecodeMode,
) -> Result<RuntimeKey, InferenceError> {
    let model_fingerprint = model_artifact_fingerprint(model_path.as_path())?;
    Ok(RuntimeKey {
        model_id: model_id.to_string(),
        model_path: model_path.to_string_lossy().to_string(),
        model_fingerprint,
        profile_version: decode_profile_version(model_id, decode_mode),
    })
}

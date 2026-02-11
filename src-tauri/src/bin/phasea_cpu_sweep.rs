use serde::Serialize;
use std::{
    fs,
    path::{Path, PathBuf},
    time::{Instant, SystemTime, UNIX_EPOCH},
};
use tokio_util::sync::CancellationToken;
use voicewave_core_lib::{
    audio::{mock_audio_fixture_frames, VadConfig, VadSegmenter},
    inference::InferenceWorker,
    model_manager::ModelManager,
    settings::DecodeMode,
};

const SAMPLE_RATE: usize = 16_000;

#[derive(Debug, Clone, Serialize)]
#[serde(rename_all = "camelCase")]
struct ModelLatencyRow {
    model_id: String,
    p50_release_to_final_ms: u64,
    p95_release_to_final_ms: u64,
    p50_model_init_ms: u64,
    p95_model_init_ms: u64,
    p50_decode_compute_ms: u64,
    p95_decode_compute_ms: u64,
    cache_hit_ratio: f32,
    decode_failure_rate: f32,
    empty_decode_rate: f32,
    runs: usize,
}

#[derive(Debug, Clone, Serialize)]
#[serde(rename_all = "camelCase")]
struct SmallEnSummary {
    p50_release_to_final_ms: u64,
    p95_release_to_final_ms: u64,
}

#[derive(Debug, Clone, Serialize)]
#[serde(rename_all = "camelCase")]
struct PhaseAArtifact {
    generated_at_utc: String,
    source: String,
    runs_per_model: usize,
    release_to_transcribing_p95_ms: u64,
    cache_hit_ratio: f32,
    decode_failure_rate: f32,
    empty_decode_rate: f32,
    long_utterance_tail_loss_count: u64,
    small_en: SmallEnSummary,
    models: Vec<ModelLatencyRow>,
}

#[tokio::main]
async fn main() {
    if let Err(err) = run().await {
        eprintln!("phaseA CPU sweep failed: {err}");
        std::process::exit(1);
    }
}

async fn run() -> Result<(), String> {
    let args: Vec<String> = std::env::args().collect();
    let out_path = parse_arg_value(&args, "--out")
        .map(PathBuf::from)
        .unwrap_or_else(default_output_path);
    let runs = parse_arg_value(&args, "--runs")
        .and_then(|value| value.parse::<usize>().ok())
        .unwrap_or(10)
        .clamp(4, 30);
    let warmup_runs = parse_arg_value(&args, "--warmup-runs")
        .and_then(|value| value.parse::<usize>().ok())
        .unwrap_or(2)
        .clamp(1, 5);
    let release_to_transcribing_p95_ms = parse_arg_value(&args, "--release-to-transcribing-p95-ms")
        .and_then(|value| value.parse::<u64>().ok())
        .unwrap_or(244);
    let long_utterance_tail_loss_count = parse_arg_value(&args, "--tail-loss-count")
        .and_then(|value| value.parse::<u64>().ok())
        .unwrap_or(0);

    let merged_samples = build_fixture_samples();
    if merged_samples.is_empty() {
        return Err("fixture sample generation returned no audio".to_string());
    }

    let manager = ModelManager::new().map_err(|err| format!("model manager init failed: {err}"))?;
    let installed = manager.list_installed();
    let mut model_rows = Vec::new();
    for model_id in ["tiny.en", "small.en"] {
        let Some(installed_model) = installed.iter().find(|row| row.model_id == model_id) else {
            return Err(format!(
                "required model '{model_id}' is not installed; install it from Models before running sweep"
            ));
        };
        let row = run_model_sweep(
            model_id,
            Path::new(&installed_model.file_path),
            &merged_samples,
            warmup_runs,
            runs,
        )
        .await?;
        model_rows.push(row);
    }

    let small = model_rows
        .iter()
        .find(|row| row.model_id == "small.en")
        .ok_or_else(|| "small.en sweep row missing".to_string())?;

    let (total_runs, total_cache_hits, total_failures, total_empty) = model_rows.iter().fold(
        (0usize, 0usize, 0usize, 0usize),
        |(runs_acc, cache_hits_acc, failures_acc, empty_acc), row| {
            let runs_for_row = row.runs;
            let cache_hits_for_row = (row.cache_hit_ratio * runs_for_row as f32).round() as usize;
            let failures_for_row = (row.decode_failure_rate * runs_for_row as f32).round() as usize;
            let empty_for_row = (row.empty_decode_rate * runs_for_row as f32).round() as usize;
            (
                runs_acc + runs_for_row,
                cache_hits_acc + cache_hits_for_row,
                failures_acc + failures_for_row,
                empty_acc + empty_for_row,
            )
        },
    );
    let cache_hit_ratio = if total_runs == 0 {
        0.0
    } else {
        total_cache_hits as f32 / total_runs as f32
    };
    let decode_failure_rate = if total_runs == 0 {
        0.0
    } else {
        total_failures as f32 / total_runs as f32
    };
    let empty_decode_rate = if total_runs == 0 {
        0.0
    } else {
        total_empty as f32 / total_runs as f32
    };

    let artifact = PhaseAArtifact {
        generated_at_utc: now_utc_iso(),
        source: "phaseA runtime sweep (real whisper runtime, fixture audio)".to_string(),
        runs_per_model: runs,
        release_to_transcribing_p95_ms,
        cache_hit_ratio,
        decode_failure_rate,
        empty_decode_rate,
        long_utterance_tail_loss_count,
        small_en: SmallEnSummary {
            p50_release_to_final_ms: small.p50_release_to_final_ms,
            p95_release_to_final_ms: small.p95_release_to_final_ms,
        },
        models: model_rows,
    };

    write_json_report(&out_path, &artifact)?;
    println!("phaseA CPU sweep written to {}", out_path.display());
    Ok(())
}

async fn run_model_sweep(
    model_id: &str,
    model_path: &Path,
    samples: &[f32],
    warmup_runs: usize,
    measured_runs: usize,
) -> Result<ModelLatencyRow, String> {
    let worker = InferenceWorker::new_runtime_with_mode(
        model_id.to_string(),
        model_path.to_path_buf(),
        DecodeMode::Balanced,
    );
    let mut total_runs = 0usize;
    let mut cache_hits = 0usize;
    let mut failures = 0usize;
    let mut empties = 0usize;
    let mut total_ms = Vec::new();
    let mut init_ms = Vec::new();
    let mut compute_ms = Vec::new();

    for idx in 0..(warmup_runs + measured_runs) {
        let cancel = CancellationToken::new();
        let started = Instant::now();
        let result = worker
            .transcribe_segment(samples, &cancel, |_, _, _| {})
            .await
            .map_err(|err| format!("decode failed for {model_id}: {err}"))?;

        if idx < warmup_runs {
            continue;
        }

        total_runs += 1;
        let elapsed_ms = started.elapsed().as_millis() as u64;
        total_ms.push(elapsed_ms);
        init_ms.push(result.telemetry.model_init_ms);
        compute_ms.push(result.telemetry.decode_compute_ms);
        if result.telemetry.runtime_cache_hit {
            cache_hits += 1;
        }
        match result.transcript {
            Some(text) if text.trim().is_empty() => {
                empties += 1;
            }
            Some(_) => {}
            None => {
                failures += 1;
            }
        }
    }

    total_ms.sort_unstable();
    init_ms.sort_unstable();
    compute_ms.sort_unstable();
    let p50_idx = percentile_index(total_ms.len(), 0.50);
    let p95_idx = percentile_index(total_ms.len(), 0.95);

    Ok(ModelLatencyRow {
        model_id: model_id.to_string(),
        p50_release_to_final_ms: total_ms[p50_idx],
        p95_release_to_final_ms: total_ms[p95_idx],
        p50_model_init_ms: init_ms[p50_idx],
        p95_model_init_ms: init_ms[p95_idx],
        p50_decode_compute_ms: compute_ms[p50_idx],
        p95_decode_compute_ms: compute_ms[p95_idx],
        cache_hit_ratio: if total_runs == 0 {
            0.0
        } else {
            cache_hits as f32 / total_runs as f32
        },
        decode_failure_rate: if total_runs == 0 {
            0.0
        } else {
            failures as f32 / total_runs as f32
        },
        empty_decode_rate: if total_runs == 0 {
            0.0
        } else {
            empties as f32 / total_runs as f32
        },
        runs: total_runs,
    })
}

fn build_fixture_samples() -> Vec<f32> {
    let mut vad = VadSegmenter::new(VadConfig::default());
    let mut segments = Vec::new();
    for frame in mock_audio_fixture_frames() {
        if let Some(segment) = vad.push_frame(&frame) {
            segments.push(segment);
        }
    }
    if let Some(segment) = vad.flush() {
        segments.push(segment);
    }

    let mut merged = Vec::new();
    let inter_segment_gap = (SAMPLE_RATE / 20).max(1);
    for (idx, segment) in segments.iter().enumerate() {
        if idx > 0 {
            merged.extend(vec![0.0_f32; inter_segment_gap]);
        }
        merged.extend_from_slice(segment);
    }
    merged
}

fn percentile_index(len: usize, percentile: f32) -> usize {
    if len <= 1 {
        return 0;
    }
    let idx = ((len as f32 - 1.0) * percentile.clamp(0.0, 1.0)).round() as usize;
    idx.min(len - 1)
}

fn parse_arg_value<'a>(args: &'a [String], key: &str) -> Option<&'a str> {
    args.iter()
        .position(|arg| arg == key)
        .and_then(|idx| args.get(idx + 1))
        .map(String::as_str)
}

fn default_output_path() -> PathBuf {
    let stamp = now_utc_date();
    PathBuf::from("../docs/phaseA/artifacts").join(format!("cpu-latency-{stamp}.json"))
}

fn write_json_report<T: serde::Serialize>(path: &Path, report: &T) -> Result<(), String> {
    if let Some(parent) = path.parent() {
        fs::create_dir_all(parent).map_err(|err| format!("failed creating output dir: {err}"))?;
    }
    let data = serde_json::to_string_pretty(report)
        .map_err(|err| format!("failed serializing report: {err}"))?;
    fs::write(path, data).map_err(|err| format!("failed writing report: {err}"))?;
    Ok(())
}

fn now_utc_iso() -> String {
    let epoch_ms = SystemTime::now()
        .duration_since(UNIX_EPOCH)
        .map(|d| d.as_millis())
        .unwrap_or_default();
    format!("epoch-ms-{epoch_ms}")
}

fn now_utc_date() -> String {
    let now = chrono_like_date(SystemTime::now());
    format!("{:04}-{:02}-{:02}", now.0, now.1, now.2)
}

fn chrono_like_date(now: SystemTime) -> (u32, u32, u32) {
    let secs = now
        .duration_since(UNIX_EPOCH)
        .map(|d| d.as_secs())
        .unwrap_or_default();
    let days = secs / 86_400;
    civil_from_days(days as i64)
}

fn civil_from_days(days: i64) -> (u32, u32, u32) {
    let z = days + 719_468;
    let era = if z >= 0 { z } else { z - 146_096 } / 146_097;
    let doe = z - era * 146_097;
    let yoe = (doe - doe / 1_460 + doe / 36_524 - doe / 146_096) / 365;
    let y = yoe + era * 400;
    let doy = doe - (365 * yoe + yoe / 4 - yoe / 100);
    let mp = (5 * doy + 2) / 153;
    let d = doy - (153 * mp + 2) / 5 + 1;
    let m = mp + if mp < 10 { 3 } else { -9 };
    let year = y + if m <= 2 { 1 } else { 0 };
    (year as u32, m as u32, d as u32)
}

use serde::Serialize;
use std::{
    fs,
    path::{Path, PathBuf},
    time::{Instant, SystemTime, UNIX_EPOCH},
};
use tokio_util::sync::CancellationToken;
use voicewave_core_lib::{
    audio::{mock_audio_fixture_frames, VadConfig, VadSegmenter},
    inference::{prefetch_faster_whisper_model, InferenceWorker},
    model_manager::ModelManager,
    settings::DecodeMode,
};

const SAMPLE_RATE: usize = 16_000;

#[derive(Debug, Clone, Serialize)]
#[serde(rename_all = "camelCase")]
struct SweepModelRow {
    model_id: String,
    runs: usize,
    p50_release_to_final_ms: u64,
    p95_release_to_final_ms: u64,
    p50_decode_compute_ms: u64,
    p95_decode_compute_ms: u64,
    cache_hit_ratio: f32,
    success_rate: f32,
}

#[derive(Debug, Clone, Serialize)]
#[serde(rename_all = "camelCase")]
struct SweepArtifact {
    generated_at_utc: String,
    source: String,
    runs_per_model: usize,
    models: Vec<SweepModelRow>,
}

#[tokio::main]
async fn main() {
    if let Err(err) = run().await {
        eprintln!("phaseB fw sweep failed: {err}");
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
        .unwrap_or(20)
        .clamp(8, 40);
    let warmup_runs = parse_arg_value(&args, "--warmup-runs")
        .and_then(|value| value.parse::<usize>().ok())
        .unwrap_or(3)
        .clamp(1, 8);

    let merged_samples = build_fixture_samples();
    if merged_samples.is_empty() {
        return Err("fixture sample generation returned no audio".to_string());
    }

    let manager = ModelManager::new().map_err(|err| format!("model manager init failed: {err}"))?;
    let installed = manager.list_installed();
    let small_model = installed
        .iter()
        .find(|row| row.model_id == "small.en")
        .ok_or_else(|| {
            "required model 'small.en' is not installed; install it before running sweep".to_string()
        })?;

    let small_worker = InferenceWorker::new_runtime_with_mode(
        "small.en".to_string(),
        Path::new(&small_model.file_path).to_path_buf(),
        DecodeMode::Balanced,
    );

    let _ = prefetch_faster_whisper_model("fw-small.en")
        .await
        .map_err(|err| format!("fw-small prefetch failed: {err}"))?;
    let fw_worker =
        InferenceWorker::new_faster_whisper_with_mode("fw-small.en".to_string(), DecodeMode::Balanced);

    let small_row = run_worker_sweep("small.en", &small_worker, &merged_samples, warmup_runs, runs).await?;
    let fw_row = run_worker_sweep("fw-small.en", &fw_worker, &merged_samples, warmup_runs, runs).await?;

    let artifact = SweepArtifact {
        generated_at_utc: now_utc_iso(),
        source: "phaseB runtime sweep (fixture audio, whispercpp small vs faster-whisper small)"
            .to_string(),
        runs_per_model: runs,
        models: vec![small_row, fw_row],
    };

    write_json_report(&out_path, &artifact)?;
    println!("phaseB fw sweep written to {}", out_path.display());
    Ok(())
}

async fn run_worker_sweep(
    model_id: &str,
    worker: &InferenceWorker,
    samples: &[f32],
    warmup_runs: usize,
    measured_runs: usize,
) -> Result<SweepModelRow, String> {
    let mut total_runs = 0usize;
    let mut cache_hits = 0usize;
    let mut successes = 0usize;
    let mut total_ms = Vec::new();
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
        total_ms.push(started.elapsed().as_millis() as u64);
        compute_ms.push(result.telemetry.decode_compute_ms);
        if result.telemetry.runtime_cache_hit {
            cache_hits += 1;
        }
        if result
            .transcript
            .as_ref()
            .is_some_and(|text| !text.trim().is_empty())
        {
            successes += 1;
        }
    }

    total_ms.sort_unstable();
    compute_ms.sort_unstable();
    let p50_idx = percentile_index(total_ms.len(), 0.50);
    let p95_idx = percentile_index(total_ms.len(), 0.95);

    Ok(SweepModelRow {
        model_id: model_id.to_string(),
        runs: total_runs,
        p50_release_to_final_ms: total_ms[p50_idx],
        p95_release_to_final_ms: total_ms[p95_idx],
        p50_decode_compute_ms: compute_ms[p50_idx],
        p95_decode_compute_ms: compute_ms[p95_idx],
        cache_hit_ratio: if total_runs == 0 {
            0.0
        } else {
            cache_hits as f32 / total_runs as f32
        },
        success_rate: if total_runs == 0 {
            0.0
        } else {
            successes as f32 / total_runs as f32
        },
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
    PathBuf::from("../docs/phaseB/artifacts").join(format!("fw-latency-{stamp}.json"))
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

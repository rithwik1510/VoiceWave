use crate::{
    audio::{mock_audio_fixture_frames, AudioCaptureService, AudioFrame, VadConfig, VadSegmenter},
    inference::{estimate_rtf, InferenceWorker},
};
use serde::Serialize;
use tokio_util::sync::CancellationToken;

#[derive(Debug, Clone, Serialize)]
pub struct SessionMetrics {
    pub model_id: String,
    pub latency_ms: u64,
    pub rtf: f32,
    pub transcript: String,
}

#[derive(Debug, Clone, Serialize)]
pub struct ModelBenchmarkResult {
    pub model_id: String,
    pub runs: usize,
    pub p50_latency_ms: u64,
    pub p95_latency_ms: u64,
    pub average_rtf: f32,
}

#[derive(Debug, Clone, Serialize)]
pub struct StabilitySummary {
    pub sessions: usize,
    pub failed_sessions: usize,
    pub crash_free_rate: f32,
    pub p95_latency_ms: u64,
}

pub async fn run_fixture_session(
    model_id: &str,
    partial_delay_override_ms: Option<u64>,
) -> Result<SessionMetrics, String> {
    let segments = build_fixture_segments(0.014);
    if segments.is_empty() {
        return Err("fixture segment generation returned no segments".to_string());
    }

    let mut total_audio_samples = 0usize;
    let mut total_elapsed_ms = 0u64;
    let mut last_transcript = String::new();

    for segment in segments {
        total_audio_samples += segment.len();
        let token = CancellationToken::new();
        let mut worker = InferenceWorker::new_fixture(model_id);
        if let Some(delay_ms) = partial_delay_override_ms {
            worker = worker.with_partial_delay_ms(delay_ms);
        }

        let mut final_elapsed = 0u64;
        let maybe_transcript = worker
            .transcribe_segment(&segment, &token, |_, is_final, elapsed_ms| {
                if is_final {
                    final_elapsed = elapsed_ms;
                }
            })
            .await
            .map_err(|err| format!("inference failed for model '{model_id}': {err}"))?;

        let transcript = maybe_transcript.transcript.ok_or_else(|| {
            format!("inference failed to complete for model '{model_id}' during fixture run")
        })?;
        last_transcript = transcript;
        total_elapsed_ms += final_elapsed;
    }

    Ok(SessionMetrics {
        model_id: model_id.to_string(),
        latency_ms: total_elapsed_ms,
        rtf: estimate_rtf(total_elapsed_ms, total_audio_samples),
        transcript: last_transcript,
    })
}

pub async fn benchmark_models(
    model_ids: &[&str],
    runs_per_model: usize,
    partial_delay_override_ms: Option<u64>,
) -> Result<Vec<ModelBenchmarkResult>, String> {
    let mut results = Vec::new();

    for model_id in model_ids {
        let mut latencies = Vec::new();
        let mut rtfs = Vec::new();

        for _ in 0..runs_per_model {
            let metrics = run_fixture_session(model_id, partial_delay_override_ms).await?;
            latencies.push(metrics.latency_ms);
            rtfs.push(metrics.rtf);
        }

        latencies.sort_unstable();
        let p50_index = percentile_index(latencies.len(), 0.50);
        let p95_index = percentile_index(latencies.len(), 0.95);
        let average_rtf = rtfs.iter().sum::<f32>() / rtfs.len() as f32;

        results.push(ModelBenchmarkResult {
            model_id: (*model_id).to_string(),
            runs: runs_per_model,
            p50_latency_ms: latencies[p50_index],
            p95_latency_ms: latencies[p95_index],
            average_rtf,
        });
    }

    Ok(results)
}

pub async fn run_stability_sessions(
    model_id: &str,
    sessions: usize,
    partial_delay_override_ms: Option<u64>,
) -> StabilitySummary {
    let mut latencies = Vec::new();
    let mut failures = 0usize;

    for _ in 0..sessions {
        match run_fixture_session(model_id, partial_delay_override_ms).await {
            Ok(metrics) => latencies.push(metrics.latency_ms),
            Err(_) => failures += 1,
        }
    }

    latencies.sort_unstable();
    let success_count = sessions.saturating_sub(failures);
    let crash_free_rate = if sessions == 0 {
        1.0
    } else {
        success_count as f32 / sessions as f32
    };
    let p95_latency_ms = if latencies.is_empty() {
        0
    } else {
        latencies[percentile_index(latencies.len(), 0.95)]
    };

    StabilitySummary {
        sessions,
        failed_sessions: failures,
        crash_free_rate,
        p95_latency_ms,
    }
}

pub fn build_fixture_segments(vad_threshold: f32) -> Vec<Vec<f32>> {
    let capture = AudioCaptureService::default();
    let mut vad = VadSegmenter::new(VadConfig {
        threshold: vad_threshold,
        ..VadConfig::default()
    });
    let mut segments = Vec::new();

    for frame in mock_audio_fixture_frames() {
        let normalized = capture.normalize_frame(AudioFrame {
            sample_rate: 16_000,
            channels: 1,
            samples: frame,
        });
        if let Some(seg) = vad.push_frame(&normalized) {
            segments.push(seg);
        }
    }
    if let Some(flushed) = vad.flush() {
        segments.push(flushed);
    }

    segments
}

fn percentile_index(len: usize, percentile: f32) -> usize {
    if len <= 1 {
        return 0;
    }
    let raw = ((len as f32 - 1.0) * percentile).round() as usize;
    raw.min(len - 1)
}

#[cfg(test)]
mod tests {
    use super::*;

    #[tokio::test]
    async fn fixture_session_returns_latency_and_transcript() {
        let metrics = run_fixture_session("small.en", Some(1))
            .await
            .expect("fixture run should complete");
        assert!(metrics.latency_ms > 0);
        assert!(!metrics.transcript.is_empty());
        assert!(metrics.rtf > 0.0);
    }

    #[tokio::test]
    async fn benchmark_produces_rows_for_each_model() {
        let rows = benchmark_models(&["tiny.en", "small.en"], 3, Some(1))
            .await
            .expect("benchmark should run");
        assert_eq!(rows.len(), 2);
        assert!(rows
            .iter()
            .all(|row| row.p95_latency_ms >= row.p50_latency_ms));
    }

    #[tokio::test]
    async fn stability_summary_counts_failures() {
        let summary = run_stability_sessions("small.en", 5, Some(1)).await;
        assert_eq!(summary.sessions, 5);
        assert!(summary.crash_free_rate > 0.0);
    }
}

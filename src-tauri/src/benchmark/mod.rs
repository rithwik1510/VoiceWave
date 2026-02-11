use crate::phase1::ModelBenchmarkResult;
use serde::{Deserialize, Serialize};
use std::cmp::Ordering;
use std::time::{SystemTime, UNIX_EPOCH};

#[derive(Debug, Clone, Serialize, Deserialize, PartialEq, Eq)]
#[serde(rename_all = "camelCase")]
pub struct BenchmarkRequest {
    pub model_ids: Option<Vec<String>>,
    pub runs_per_model: Option<usize>,
    pub partial_delay_ms: Option<u64>,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct BenchmarkRow {
    pub model_id: String,
    pub runs: usize,
    pub p50_latency_ms: u64,
    pub p95_latency_ms: u64,
    pub average_rtf: f32,
    #[serde(default)]
    pub observed_sample_count: usize,
    #[serde(default)]
    pub observed_success_rate_percent: f32,
    #[serde(default)]
    pub observed_p95_release_to_final_ms: u64,
    #[serde(default)]
    pub observed_p95_release_to_transcribing_ms: u64,
    #[serde(default)]
    pub observed_watchdog_recovery_rate_percent: f32,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct BenchmarkRun {
    pub started_at_utc_ms: u64,
    pub completed_at_utc_ms: u64,
    pub rows: Vec<BenchmarkRow>,
}

#[derive(Debug, Clone, Serialize, Deserialize, PartialEq)]
#[serde(rename_all = "camelCase")]
pub struct RecommendationConstraints {
    pub max_p95_latency_ms: Option<u64>,
    pub max_rtf: Option<f32>,
}

impl Default for RecommendationConstraints {
    fn default() -> Self {
        Self {
            max_p95_latency_ms: Some(5_000),
            max_rtf: Some(1.2),
        }
    }
}

#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct ModelRecommendation {
    pub model_id: String,
    pub reason: String,
    pub p95_latency_ms: u64,
    pub average_rtf: f32,
    pub meets_latency_gate: bool,
    pub meets_rtf_gate: bool,
    pub observed_sample_count: usize,
    pub observed_success_rate_percent: f32,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct BenchmarkEvent {
    pub phase: String,
    pub model_id: Option<String>,
    pub progress: u8,
    pub message: Option<String>,
}

impl From<ModelBenchmarkResult> for BenchmarkRow {
    fn from(value: ModelBenchmarkResult) -> Self {
        Self {
            model_id: value.model_id,
            runs: value.runs,
            p50_latency_ms: value.p50_latency_ms,
            p95_latency_ms: value.p95_latency_ms,
            average_rtf: value.average_rtf,
            observed_sample_count: 0,
            observed_success_rate_percent: 0.0,
            observed_p95_release_to_final_ms: 0,
            observed_p95_release_to_transcribing_ms: 0,
            observed_watchdog_recovery_rate_percent: 0.0,
        }
    }
}

pub fn now_utc_ms() -> u64 {
    SystemTime::now()
        .duration_since(UNIX_EPOCH)
        .map(|d| d.as_millis() as u64)
        .unwrap_or_default()
}

pub fn recommend_model(
    rows: &[BenchmarkRow],
    constraints: RecommendationConstraints,
) -> Option<ModelRecommendation> {
    if rows.is_empty() {
        return None;
    }

    let latency_gate = constraints.max_p95_latency_ms.unwrap_or(5_000);
    let rtf_gate = constraints.max_rtf.unwrap_or(1.2);

    let mut ranked = rows.to_vec();
    ranked.sort_by(|a, b| rank_rows(a, b, latency_gate, rtf_gate));

    let best = &ranked[0];
    let meets_latency_gate = best.p95_latency_ms <= latency_gate;
    let meets_rtf_gate = best.average_rtf <= rtf_gate;
    let has_observed_reliability = best.observed_sample_count >= 3;

    Some(ModelRecommendation {
        model_id: best.model_id.clone(),
        reason: if meets_latency_gate && meets_rtf_gate && has_observed_reliability {
            "Best reliability/speed fit on this machine from benchmark plus observed runtime sessions."
                .to_string()
        } else if meets_latency_gate && meets_rtf_gate {
            "Best model under configured latency and RTF gates.".to_string()
        } else {
            "No model satisfied all gates; selected fastest available fallback.".to_string()
        },
        p95_latency_ms: best.p95_latency_ms,
        average_rtf: best.average_rtf,
        meets_latency_gate,
        meets_rtf_gate,
        observed_sample_count: best.observed_sample_count,
        observed_success_rate_percent: best.observed_success_rate_percent,
    })
}

fn rank_rows(
    a: &BenchmarkRow,
    b: &BenchmarkRow,
    latency_gate: u64,
    rtf_gate: f32,
) -> Ordering {
    let a_gate_pass = a.p95_latency_ms <= latency_gate && a.average_rtf <= rtf_gate;
    let b_gate_pass = b.p95_latency_ms <= latency_gate && b.average_rtf <= rtf_gate;
    if a_gate_pass != b_gate_pass {
        return if a_gate_pass {
            Ordering::Less
        } else {
            Ordering::Greater
        };
    }

    let a_band = reliability_band(a);
    let b_band = reliability_band(b);
    if a_band != b_band {
        return b_band.cmp(&a_band);
    }

    if a.observed_sample_count >= 3 && b.observed_sample_count >= 3 {
        if (a.observed_success_rate_percent - b.observed_success_rate_percent).abs() > f32::EPSILON {
            return b
                .observed_success_rate_percent
                .total_cmp(&a.observed_success_rate_percent);
        }
        if (a.observed_watchdog_recovery_rate_percent - b.observed_watchdog_recovery_rate_percent).abs()
            > f32::EPSILON
        {
            return a
                .observed_watchdog_recovery_rate_percent
                .total_cmp(&b.observed_watchdog_recovery_rate_percent);
        }
        if a.observed_p95_release_to_final_ms != b.observed_p95_release_to_final_ms {
            return a
                .observed_p95_release_to_final_ms
                .cmp(&b.observed_p95_release_to_final_ms);
        }
    }

    a.p95_latency_ms
        .cmp(&b.p95_latency_ms)
        .then_with(|| a.average_rtf.total_cmp(&b.average_rtf))
}

fn reliability_band(row: &BenchmarkRow) -> u8 {
    if row.observed_sample_count < 3 {
        return 2; // Neutral: insufficient live reliability observations.
    }

    if row.observed_success_rate_percent >= 97.0
        && row.observed_watchdog_recovery_rate_percent <= 5.0
    {
        return 4;
    }
    if row.observed_success_rate_percent >= 94.0
        && row.observed_watchdog_recovery_rate_percent <= 10.0
    {
        return 3;
    }
    if row.observed_success_rate_percent >= 90.0 {
        return 2;
    }
    1
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn recommendation_prefers_gate_passing_model() {
        let rows = vec![
            BenchmarkRow {
                model_id: "medium.en".to_string(),
                runs: 5,
                p50_latency_ms: 700,
                p95_latency_ms: 1200,
                average_rtf: 0.9,
                observed_sample_count: 0,
                observed_success_rate_percent: 0.0,
                observed_p95_release_to_final_ms: 0,
                observed_p95_release_to_transcribing_ms: 0,
                observed_watchdog_recovery_rate_percent: 0.0,
            },
            BenchmarkRow {
                model_id: "small.en".to_string(),
                runs: 5,
                p50_latency_ms: 300,
                p95_latency_ms: 600,
                average_rtf: 0.4,
                observed_sample_count: 0,
                observed_success_rate_percent: 0.0,
                observed_p95_release_to_final_ms: 0,
                observed_p95_release_to_transcribing_ms: 0,
                observed_watchdog_recovery_rate_percent: 0.0,
            },
        ];

        let recommendation =
            recommend_model(&rows, RecommendationConstraints::default()).expect("should recommend");
        assert_eq!(recommendation.model_id, "small.en");
        assert!(recommendation.meets_latency_gate);
    }

    #[test]
    fn recommendation_prefers_reliable_model_when_both_meet_gates() {
        let rows = vec![
            BenchmarkRow {
                model_id: "tiny.en".to_string(),
                runs: 5,
                p50_latency_ms: 1700,
                p95_latency_ms: 2500,
                average_rtf: 0.6,
                observed_sample_count: 12,
                observed_success_rate_percent: 86.0,
                observed_p95_release_to_final_ms: 3400,
                observed_p95_release_to_transcribing_ms: 140,
                observed_watchdog_recovery_rate_percent: 18.0,
            },
            BenchmarkRow {
                model_id: "small.en".to_string(),
                runs: 5,
                p50_latency_ms: 3100,
                p95_latency_ms: 4700,
                average_rtf: 1.0,
                observed_sample_count: 15,
                observed_success_rate_percent: 96.0,
                observed_p95_release_to_final_ms: 4900,
                observed_p95_release_to_transcribing_ms: 150,
                observed_watchdog_recovery_rate_percent: 4.0,
            },
        ];

        let recommendation =
            recommend_model(&rows, RecommendationConstraints::default()).expect("should recommend");
        assert_eq!(recommendation.model_id, "small.en");
        assert!(recommendation.observed_sample_count >= 3);
    }

    #[test]
    fn recommendation_falls_back_to_fastest_when_no_observed_data_exists() {
        let rows = vec![
            BenchmarkRow {
                model_id: "small.en".to_string(),
                runs: 3,
                p50_latency_ms: 3300,
                p95_latency_ms: 5100,
                average_rtf: 1.1,
                observed_sample_count: 0,
                observed_success_rate_percent: 0.0,
                observed_p95_release_to_final_ms: 0,
                observed_p95_release_to_transcribing_ms: 0,
                observed_watchdog_recovery_rate_percent: 0.0,
            },
            BenchmarkRow {
                model_id: "base.en".to_string(),
                runs: 3,
                p50_latency_ms: 2100,
                p95_latency_ms: 3500,
                average_rtf: 0.8,
                observed_sample_count: 0,
                observed_success_rate_percent: 0.0,
                observed_p95_release_to_final_ms: 0,
                observed_p95_release_to_transcribing_ms: 0,
                observed_watchdog_recovery_rate_percent: 0.0,
            },
        ];

        let recommendation =
            recommend_model(&rows, RecommendationConstraints::default()).expect("should recommend");
        assert_eq!(recommendation.model_id, "base.en");
    }
}

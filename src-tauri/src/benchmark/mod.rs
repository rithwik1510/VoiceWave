use crate::phase1::ModelBenchmarkResult;
use serde::{Deserialize, Serialize};
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
            max_p95_latency_ms: Some(900),
            max_rtf: Some(0.7),
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

    let latency_gate = constraints.max_p95_latency_ms.unwrap_or(900);
    let rtf_gate = constraints.max_rtf.unwrap_or(0.7);

    let mut ranked = rows.to_vec();
    ranked.sort_by(|a, b| {
        a.p95_latency_ms
            .cmp(&b.p95_latency_ms)
            .then_with(|| a.average_rtf.total_cmp(&b.average_rtf))
    });

    let best = ranked
        .iter()
        .find(|row| row.p95_latency_ms <= latency_gate && row.average_rtf <= rtf_gate)
        .unwrap_or(&ranked[0]);

    Some(ModelRecommendation {
        model_id: best.model_id.clone(),
        reason: if best.p95_latency_ms <= latency_gate && best.average_rtf <= rtf_gate {
            "Best model under configured latency and RTF gates.".to_string()
        } else {
            "No model satisfied all gates; selected fastest available fallback.".to_string()
        },
        p95_latency_ms: best.p95_latency_ms,
        average_rtf: best.average_rtf,
        meets_latency_gate: best.p95_latency_ms <= latency_gate,
        meets_rtf_gate: best.average_rtf <= rtf_gate,
    })
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
            },
            BenchmarkRow {
                model_id: "small.en".to_string(),
                runs: 5,
                p50_latency_ms: 300,
                p95_latency_ms: 600,
                average_rtf: 0.4,
            },
        ];

        let recommendation =
            recommend_model(&rows, RecommendationConstraints::default()).expect("should recommend");
        assert_eq!(recommendation.model_id, "small.en");
        assert!(recommendation.meets_latency_gate);
    }
}

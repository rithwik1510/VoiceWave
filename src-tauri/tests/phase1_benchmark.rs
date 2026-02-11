use voicewave_core_lib::phase1::benchmark_models;

#[tokio::test]
async fn benchmark_produces_latency_and_rtf_for_phase1_models() {
    let rows = benchmark_models(&["tiny.en", "base.en", "small.en", "medium.en"], 2, Some(1))
        .await
        .expect("benchmark should complete");

    assert_eq!(rows.len(), 4);
    assert!(rows
        .iter()
        .all(|row| row.p95_latency_ms >= row.p50_latency_ms));
    assert!(rows.iter().all(|row| row.average_rtf > 0.0));
}

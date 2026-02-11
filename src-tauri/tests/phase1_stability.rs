use voicewave_core_lib::phase1::run_stability_sessions;

#[tokio::test]
async fn stability_loop_reaches_200_sessions_without_failures() {
    let summary = run_stability_sessions("small.en", 200, Some(1)).await;

    assert_eq!(summary.sessions, 200);
    assert_eq!(summary.failed_sessions, 0);
    assert!(summary.crash_free_rate >= 0.995);
}

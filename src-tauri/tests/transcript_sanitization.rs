use voicewave_core_lib::transcript::sanitize_user_transcript;

#[test]
fn sanitization_removes_non_user_artifacts_from_pipeline_text() {
    let raw = "Have you [BLANK_AUDIO] ready";
    let sanitized = sanitize_user_transcript(raw);
    assert_eq!(sanitized, "Have you ready");
}

#[test]
fn sanitization_keeps_user_content_intact() {
    let raw = "note [v1] still stands";
    let sanitized = sanitize_user_transcript(raw);
    assert_eq!(sanitized, "note [v1] still stands");
}

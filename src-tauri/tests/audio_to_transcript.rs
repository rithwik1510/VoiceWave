use std::fs;

use tokio_util::sync::CancellationToken;
use voicewave_core_lib::{
    audio::{mock_audio_fixture_frames, VadConfig, VadSegmenter},
    inference::InferenceWorker,
};

#[tokio::test]
async fn fixture_audio_yields_final_transcript() {
    let expected = fs::read_to_string("tests/fixtures/mock_utterance.txt")
        .expect("fixture file should exist")
        .trim()
        .to_string();

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
    assert!(!segments.is_empty());

    let worker =
        InferenceWorker::with_script("small.en", expected.clone()).with_partial_delay_ms(1);
    let cancel = CancellationToken::new();
    let mut saw_partial = false;
    let final_text = worker
        .transcribe_segment(&segments[0], &cancel, |_, is_final, _| {
            if !is_final {
                saw_partial = true;
            }
        })
        .await
        .expect("scripted decode should not fail")
        .transcript
        .expect("decode should complete");

    assert!(saw_partial);
    assert_eq!(final_text, expected);
}

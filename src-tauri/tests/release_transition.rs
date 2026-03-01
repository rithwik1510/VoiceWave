#![cfg(feature = "desktop")]

use voicewave_core_lib::state::{release_watchdog_recovered, release_watchdog_threshold_ms};

#[test]
fn release_transition_within_gate_is_not_watchdog_recovered() {
    let threshold = release_watchdog_threshold_ms();
    assert!(!release_watchdog_recovered(threshold, threshold));
    assert!(!release_watchdog_recovered(
        threshold.saturating_sub(25),
        threshold
    ));
}

#[test]
fn release_transition_above_gate_is_watchdog_recovered() {
    let threshold = release_watchdog_threshold_ms();
    assert!(release_watchdog_recovered(threshold + 1, threshold));
    assert!(release_watchdog_recovered(threshold + 250, threshold));
}

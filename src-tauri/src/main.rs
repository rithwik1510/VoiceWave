#![cfg_attr(not(debug_assertions), windows_subsystem = "windows")]

#[cfg(feature = "desktop")]
fn main() {
    voicewave_core_lib::run();
}

#[cfg(not(feature = "desktop"))]
fn main() {
    eprintln!("VoiceWave desktop runtime disabled (built without 'desktop' feature).");
}

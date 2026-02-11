use crate::audio::{AudioCaptureService, AudioError};
use serde::{Deserialize, Serialize};

#[derive(Debug, Clone, Serialize, Deserialize, PartialEq, Eq)]
#[serde(rename_all = "camelCase")]
pub enum MicrophonePermission {
    Granted,
    Denied,
    Unknown,
}

#[derive(Debug, Clone, Serialize, Deserialize, PartialEq, Eq)]
#[serde(rename_all = "camelCase")]
pub enum InsertionCapability {
    Available,
    Restricted,
}

#[derive(Debug, Clone, Serialize, Deserialize, PartialEq, Eq)]
#[serde(rename_all = "camelCase")]
pub struct PermissionSnapshot {
    pub microphone: MicrophonePermission,
    pub insertion_capability: InsertionCapability,
    pub message: Option<String>,
}

#[derive(Debug, Clone)]
pub struct PermissionManager {
    snapshot: PermissionSnapshot,
}

impl PermissionManager {
    pub fn new(audio: &AudioCaptureService) -> Self {
        let (microphone, mic_message) = infer_microphone_permission(audio);
        let insertion = infer_insertion_capability();
        let insertion_message = match insertion {
            InsertionCapability::Available => None,
            InsertionCapability::Restricted => Some(
                "Clipboard bridge is restricted in this environment. VoiceWave will preserve quick history fallback."
                    .to_string(),
            ),
        };

        Self {
            snapshot: PermissionSnapshot {
                microphone,
                insertion_capability: insertion,
                message: mic_message.or(insertion_message),
            },
        }
    }

    pub fn snapshot(&self) -> PermissionSnapshot {
        self.snapshot.clone()
    }

    pub fn request_microphone_access(&mut self, audio: &AudioCaptureService) -> PermissionSnapshot {
        let (microphone, mic_message) = infer_microphone_permission(audio);
        self.snapshot.microphone = microphone;
        self.snapshot.insertion_capability = infer_insertion_capability();
        self.snapshot.message = mic_message.or_else(|| {
            if self.snapshot.insertion_capability == InsertionCapability::Restricted {
                Some(
                    "Insertion is partially restricted. Clipboard-only mode remains available."
                        .to_string(),
                )
            } else {
                Some("Runtime permissions are healthy.".to_string())
            }
        });
        self.snapshot()
    }
}

fn infer_microphone_permission(
    audio: &AudioCaptureService,
) -> (MicrophonePermission, Option<String>) {
    match audio.probe_input_device(None) {
        Ok(_) => (MicrophonePermission::Granted, Some("Microphone input is ready.".to_string())),
        Err(AudioError::MissingInputDevice) | Err(AudioError::DeviceNotFound(_)) => (
            MicrophonePermission::Denied,
            Some("No microphone input device detected. Open Windows sound settings and retry.".to_string()),
        ),
        Err(AudioError::DefaultInputConfig(_)) => (
            MicrophonePermission::Denied,
            Some(
                "Microphone exists but could not be initialized. Check exclusive-mode settings, then retry."
                    .to_string(),
            ),
        ),
        Err(err) => (
            MicrophonePermission::Unknown,
            Some(format!("Microphone probe returned: {err}")),
        ),
    }
}

fn infer_insertion_capability() -> InsertionCapability {
    if arboard::Clipboard::new().is_ok() {
        InsertionCapability::Available
    } else {
        InsertionCapability::Restricted
    }
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn request_updates_snapshot_message() {
        let audio = AudioCaptureService::default();
        let mut manager = PermissionManager::new(&audio);
        let snapshot = manager.request_microphone_access(&audio);
        assert!(snapshot.message.is_some());
    }
}

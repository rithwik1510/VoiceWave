use serde::{Deserialize, Serialize};
use std::{
    collections::{HashMap, VecDeque},
    time::{SystemTime, UNIX_EPOCH},
};

#[derive(Debug, Clone, Serialize, Deserialize, PartialEq, Eq, Hash)]
#[serde(rename_all = "camelCase")]
pub enum InsertionMethod {
    Direct,
    ClipboardPaste,
    ClipboardOnly,
    HistoryFallback,
}

#[derive(Debug, Clone, Serialize, Deserialize, PartialEq, Eq)]
#[serde(rename_all = "camelCase")]
pub struct InsertTextRequest {
    pub text: String,
    pub target_app: Option<String>,
    pub prefer_clipboard: bool,
}

#[derive(Debug, Clone, Serialize, Deserialize, PartialEq, Eq)]
#[serde(rename_all = "camelCase")]
pub struct InsertResult {
    pub success: bool,
    pub method: InsertionMethod,
    pub message: Option<String>,
    pub target_app: Option<String>,
    pub transaction_id: String,
    pub undo_available: bool,
}

#[derive(Debug, Clone, Serialize, Deserialize, PartialEq, Eq)]
#[serde(rename_all = "camelCase")]
pub struct UndoResult {
    pub success: bool,
    pub message: Option<String>,
    pub transaction_id: Option<String>,
}

#[derive(Debug, Clone, Serialize, Deserialize, PartialEq, Eq)]
#[serde(rename_all = "camelCase")]
pub struct RecentInsertion {
    pub transaction_id: String,
    pub target_app: Option<String>,
    pub preview: String,
    pub method: InsertionMethod,
    pub success: bool,
    pub timestamp_utc_ms: u64,
    pub message: Option<String>,
}

#[derive(Debug, thiserror::Error)]
pub enum InsertionError {
    #[error("cannot insert empty transcript")]
    EmptyText,
}

#[derive(Debug, Clone)]
pub enum UndoToken {
    KeyboardUndo,
}

#[derive(Debug, Clone)]
pub struct BackendInsertSuccess {
    pub message: Option<String>,
    pub undo_token: Option<UndoToken>,
}

pub trait InsertionBackend: Send {
    fn detect_target_app(&mut self) -> Option<String>;

    fn direct_insert(
        &mut self,
        text: &str,
        target_app: Option<&str>,
    ) -> Result<BackendInsertSuccess, String>;

    fn clipboard_paste(
        &mut self,
        text: &str,
        target_app: Option<&str>,
    ) -> Result<BackendInsertSuccess, String>;

    fn clipboard_only(
        &mut self,
        text: &str,
        target_app: Option<&str>,
    ) -> Result<BackendInsertSuccess, String>;

    fn undo(&mut self, token: &UndoToken) -> Result<Option<String>, String>;
}

#[derive(Debug, Clone)]
struct UndoRecord {
    transaction_id: String,
    token: UndoToken,
}

pub struct InsertionEngine {
    backend: Box<dyn InsertionBackend>,
    history: VecDeque<RecentInsertion>,
    last_successful: Option<UndoRecord>,
    next_id: u64,
    history_limit: usize,
}

impl Default for InsertionEngine {
    fn default() -> Self {
        Self::new(Box::new(PlatformInsertionBackend::default()))
    }
}

impl InsertionEngine {
    pub fn new(backend: Box<dyn InsertionBackend>) -> Self {
        Self {
            backend,
            history: VecDeque::with_capacity(32),
            last_successful: None,
            next_id: 1,
            history_limit: 50,
        }
    }

    pub fn insert_text(
        &mut self,
        request: InsertTextRequest,
    ) -> Result<InsertResult, InsertionError> {
        if request.text.trim().is_empty() {
            return Err(InsertionError::EmptyText);
        }

        let transaction_id = self.next_transaction_id();
        let resolved_target = request
            .target_app
            .clone()
            .or_else(|| self.backend.detect_target_app());
        let target_ref = resolved_target.as_deref();

        let prefer_clipboard = request.prefer_clipboard
            || should_auto_prefer_clipboard(&request.text, target_ref);

        let method_order = if prefer_clipboard {
            vec![
                InsertionMethod::ClipboardPaste,
                InsertionMethod::ClipboardOnly,
            ]
        } else {
            vec![
                InsertionMethod::Direct,
                InsertionMethod::ClipboardPaste,
                InsertionMethod::ClipboardOnly,
            ]
        };

        let mut last_failure_message = None::<String>;
        let mut success_result = None::<InsertResult>;
        let mut success_undo = None::<UndoToken>;

        for method in method_order {
            let attempt = match method {
                InsertionMethod::Direct => self.backend.direct_insert(&request.text, target_ref),
                InsertionMethod::ClipboardPaste => {
                    self.backend.clipboard_paste(&request.text, target_ref)
                }
                InsertionMethod::ClipboardOnly => {
                    self.backend.clipboard_only(&request.text, target_ref)
                }
                InsertionMethod::HistoryFallback => unreachable!("history fallback is synthetic"),
            };

            match attempt {
                Ok(result) => {
                    let undo_available = result.undo_token.is_some();
                    success_undo = result.undo_token;
                    success_result = Some(InsertResult {
                        success: true,
                        method,
                        message: result.message,
                        target_app: resolved_target.clone(),
                        transaction_id: transaction_id.clone(),
                        undo_available,
                    });
                    break;
                }
                Err(err) => {
                    last_failure_message = Some(err);
                }
            }
        }

        let mut result = success_result.unwrap_or_else(|| InsertResult {
            success: false,
            method: InsertionMethod::HistoryFallback,
            message: Some(last_failure_message.unwrap_or_else(|| {
                "Insertion blocked. Transcript saved to quick history.".to_string()
            })),
            target_app: resolved_target.clone(),
            transaction_id: transaction_id.clone(),
            undo_available: false,
        });

        if !result.success && result.message.is_none() {
            result.message =
                Some("Insertion blocked. Transcript saved to quick history.".to_string());
        }

        self.record_history(&result, &request.text);
        if let Some(token) = success_undo {
            self.last_successful = Some(UndoRecord {
                transaction_id: transaction_id.clone(),
                token,
            });
        }

        Ok(result)
    }

    pub fn undo_last(&mut self) -> UndoResult {
        let Some(last) = self.last_successful.clone() else {
            return UndoResult {
                success: false,
                message: Some("No insertion is available to undo.".to_string()),
                transaction_id: None,
            };
        };

        match self.backend.undo(&last.token) {
            Ok(message) => {
                self.last_successful = None;
                UndoResult {
                    success: true,
                    message: message.or(Some("Last insertion undone.".to_string())),
                    transaction_id: Some(last.transaction_id),
                }
            }
            Err(err) => UndoResult {
                success: false,
                message: Some(format!("Undo failed: {err}")),
                transaction_id: None,
            },
        }
    }

    pub fn recent_insertions(&self, limit: Option<usize>) -> Vec<RecentInsertion> {
        let take = limit.unwrap_or(10).min(self.history.len());
        self.history.iter().rev().take(take).cloned().collect()
    }

    fn next_transaction_id(&mut self) -> String {
        let id = format!("ins-{}", self.next_id);
        self.next_id += 1;
        id
    }

    fn record_history(&mut self, result: &InsertResult, text: &str) {
        let preview = text.chars().take(120).collect::<String>();
        let timestamp_utc_ms = SystemTime::now()
            .duration_since(UNIX_EPOCH)
            .map(|d| d.as_millis() as u64)
            .unwrap_or_default();
        self.history.push_back(RecentInsertion {
            transaction_id: result.transaction_id.clone(),
            target_app: result.target_app.clone(),
            preview,
            method: result.method.clone(),
            success: result.success,
            timestamp_utc_ms,
            message: result.message.clone(),
        });

        while self.history.len() > self.history_limit {
            let _ = self.history.pop_front();
        }
    }
}

fn should_auto_prefer_clipboard(text: &str, target_app: Option<&str>) -> bool {
    const LONG_TEXT_THRESHOLD: usize = 48;
    if text.chars().count() >= LONG_TEXT_THRESHOLD {
        return true;
    }

    let Some(app) = target_app else {
        return false;
    };
    let normalized = app.to_ascii_lowercase();
    normalized.contains("visual studio code")
        || normalized.contains("vscode")
        || normalized.contains("cursor")
        || normalized.contains("chrome")
        || normalized.contains("edge")
        || normalized.contains("firefox")
        || normalized.contains("slack")
        || normalized.contains("notion")
}

#[derive(Default)]
pub struct PlatformInsertionBackend;

impl InsertionBackend for PlatformInsertionBackend {
    fn detect_target_app(&mut self) -> Option<String> {
        #[cfg(target_os = "windows")]
        {
            use windows_sys::Win32::UI::WindowsAndMessaging::{
                GetForegroundWindow, GetWindowTextLengthW, GetWindowTextW,
            };

            let hwnd = unsafe { GetForegroundWindow() };
            if hwnd.is_null() {
                return None;
            }

            let len = unsafe { GetWindowTextLengthW(hwnd) };
            if len <= 0 {
                return None;
            }

            let mut buffer = vec![0u16; len as usize + 1];
            let copied = unsafe { GetWindowTextW(hwnd, buffer.as_mut_ptr(), buffer.len() as i32) };
            if copied <= 0 {
                return None;
            }

            let title = String::from_utf16_lossy(&buffer[..copied as usize]);
            let trimmed = title.trim();
            if trimmed.is_empty() {
                None
            } else {
                Some(trimmed.to_string())
            }
        }

        #[cfg(not(target_os = "windows"))]
        {
            None
        }
    }

    fn direct_insert(
        &mut self,
        text: &str,
        _target_app: Option<&str>,
    ) -> Result<BackendInsertSuccess, String> {
        #[cfg(target_os = "windows")]
        {
            send_unicode_text(text)?;
            return Ok(BackendInsertSuccess {
                message: None,
                undo_token: Some(UndoToken::KeyboardUndo),
            });
        }

        #[cfg(not(target_os = "windows"))]
        {
            let _ = text;
            Err("Direct insertion is currently available only on Windows runtime.".to_string())
        }
    }

    fn clipboard_paste(
        &mut self,
        text: &str,
        _target_app: Option<&str>,
    ) -> Result<BackendInsertSuccess, String> {
        #[cfg(target_os = "windows")]
        {
            let mut clipboard =
                arboard::Clipboard::new().map_err(|err| format!("clipboard unavailable: {err}"))?;
            let previous_text = clipboard.get_text().ok();
            clipboard
                .set_text(text.to_string())
                .map_err(|err| format!("failed to write clipboard text: {err}"))?;
            send_ctrl_chord(b'V' as u16)?;
            std::thread::sleep(std::time::Duration::from_millis(35));
            if let Some(previous) = previous_text {
                let _ = clipboard.set_text(previous);
            }
            return Ok(BackendInsertSuccess {
                message: Some("Inserted via clipboard fallback.".to_string()),
                undo_token: Some(UndoToken::KeyboardUndo),
            });
        }

        #[cfg(not(target_os = "windows"))]
        {
            let _ = text;
            Err(
                "Clipboard paste fallback is currently available only on Windows runtime."
                    .to_string(),
            )
        }
    }

    fn clipboard_only(
        &mut self,
        text: &str,
        _target_app: Option<&str>,
    ) -> Result<BackendInsertSuccess, String> {
        let mut clipboard =
            arboard::Clipboard::new().map_err(|err| format!("clipboard unavailable: {err}"))?;
        clipboard
            .set_text(text.to_string())
            .map_err(|err| format!("failed to copy transcript to clipboard: {err}"))?;
        Ok(BackendInsertSuccess {
            message: Some("Transcript copied. Paste manually with Ctrl+V.".to_string()),
            undo_token: None,
        })
    }

    fn undo(&mut self, token: &UndoToken) -> Result<Option<String>, String> {
        #[cfg(target_os = "windows")]
        {
            match token {
                UndoToken::KeyboardUndo => {
                    send_ctrl_chord(b'Z' as u16)?;
                    Ok(Some("Undo sent to active application.".to_string()))
                }
            }
        }

        #[cfg(not(target_os = "windows"))]
        {
            let _ = token;
            Err("Undo is currently available only on Windows runtime.".to_string())
        }
    }
}

#[cfg(target_os = "windows")]
fn send_unicode_text(text: &str) -> Result<(), String> {
    use windows_sys::Win32::UI::Input::KeyboardAndMouse::{
        SendInput, INPUT, INPUT_0, INPUT_KEYBOARD, KEYBDINPUT, KEYEVENTF_KEYUP, KEYEVENTF_UNICODE,
    };

    for code_unit in text.encode_utf16() {
        let mut inputs = [
            INPUT {
                r#type: INPUT_KEYBOARD,
                Anonymous: INPUT_0 {
                    ki: KEYBDINPUT {
                        wVk: 0,
                        wScan: code_unit,
                        dwFlags: KEYEVENTF_UNICODE,
                        time: 0,
                        dwExtraInfo: 0,
                    },
                },
            },
            INPUT {
                r#type: INPUT_KEYBOARD,
                Anonymous: INPUT_0 {
                    ki: KEYBDINPUT {
                        wVk: 0,
                        wScan: code_unit,
                        dwFlags: KEYEVENTF_UNICODE | KEYEVENTF_KEYUP,
                        time: 0,
                        dwExtraInfo: 0,
                    },
                },
            },
        ];

        // SAFETY: INPUT payload is fully initialized and SendInput is called with a valid pointer.
        let sent = unsafe {
            SendInput(
                inputs.len() as u32,
                inputs.as_mut_ptr(),
                std::mem::size_of::<INPUT>() as i32,
            )
        };
        if sent != inputs.len() as u32 {
            return Err(format!(
                "SendInput failed while typing text: {}",
                std::io::Error::last_os_error()
            ));
        }
    }
    Ok(())
}

#[cfg(target_os = "windows")]
fn send_ctrl_chord(key_vk: u16) -> Result<(), String> {
    use windows_sys::Win32::UI::Input::KeyboardAndMouse::{
        SendInput, INPUT, INPUT_0, INPUT_KEYBOARD, KEYBDINPUT, KEYEVENTF_KEYUP, VK_CONTROL,
    };

    let mut inputs = [
        INPUT {
            r#type: INPUT_KEYBOARD,
            Anonymous: INPUT_0 {
                ki: KEYBDINPUT {
                    wVk: VK_CONTROL as u16,
                    wScan: 0,
                    dwFlags: 0,
                    time: 0,
                    dwExtraInfo: 0,
                },
            },
        },
        INPUT {
            r#type: INPUT_KEYBOARD,
            Anonymous: INPUT_0 {
                ki: KEYBDINPUT {
                    wVk: key_vk,
                    wScan: 0,
                    dwFlags: 0,
                    time: 0,
                    dwExtraInfo: 0,
                },
            },
        },
        INPUT {
            r#type: INPUT_KEYBOARD,
            Anonymous: INPUT_0 {
                ki: KEYBDINPUT {
                    wVk: key_vk,
                    wScan: 0,
                    dwFlags: KEYEVENTF_KEYUP,
                    time: 0,
                    dwExtraInfo: 0,
                },
            },
        },
        INPUT {
            r#type: INPUT_KEYBOARD,
            Anonymous: INPUT_0 {
                ki: KEYBDINPUT {
                    wVk: VK_CONTROL as u16,
                    wScan: 0,
                    dwFlags: KEYEVENTF_KEYUP,
                    time: 0,
                    dwExtraInfo: 0,
                },
            },
        },
    ];

    // SAFETY: INPUT payload is fully initialized and SendInput is called with a valid pointer.
    let sent = unsafe {
        SendInput(
            inputs.len() as u32,
            inputs.as_mut_ptr(),
            std::mem::size_of::<INPUT>() as i32,
        )
    };
    if sent != inputs.len() as u32 {
        return Err(format!(
            "SendInput failed while sending Ctrl chord: {}",
            std::io::Error::last_os_error()
        ));
    }
    Ok(())
}

#[derive(Debug, Clone)]
pub struct DeterministicMatrixBackend {
    active_app: Option<String>,
    failure_budget: HashMap<(String, InsertionMethod), usize>,
    undo_fails: bool,
}

impl DeterministicMatrixBackend {
    pub fn new() -> Self {
        Self {
            active_app: None,
            failure_budget: HashMap::new(),
            undo_fails: false,
        }
    }

    pub fn with_active_app(mut self, app: Option<&str>) -> Self {
        self.active_app = app.map(ToString::to_string);
        self
    }

    pub fn with_failure_budget(
        mut self,
        app: &str,
        method: InsertionMethod,
        failures: usize,
    ) -> Self {
        self.failure_budget
            .insert((app.to_string(), method), failures);
        self
    }

    pub fn with_undo_failure(mut self, fails: bool) -> Self {
        self.undo_fails = fails;
        self
    }

    fn should_fail(&mut self, app: Option<&str>, method: InsertionMethod) -> bool {
        let key = (app.unwrap_or("unknown").to_string(), method);
        if let Some(remaining) = self.failure_budget.get_mut(&key) {
            if *remaining > 0 {
                *remaining -= 1;
                return true;
            }
        }
        false
    }
}

impl Default for DeterministicMatrixBackend {
    fn default() -> Self {
        Self::new()
    }
}

impl InsertionBackend for DeterministicMatrixBackend {
    fn detect_target_app(&mut self) -> Option<String> {
        self.active_app.clone()
    }

    fn direct_insert(
        &mut self,
        _text: &str,
        target_app: Option<&str>,
    ) -> Result<BackendInsertSuccess, String> {
        if self.should_fail(target_app, InsertionMethod::Direct) {
            return Err("Direct insertion unavailable for focused app.".to_string());
        }
        Ok(BackendInsertSuccess {
            message: None,
            undo_token: Some(UndoToken::KeyboardUndo),
        })
    }

    fn clipboard_paste(
        &mut self,
        _text: &str,
        target_app: Option<&str>,
    ) -> Result<BackendInsertSuccess, String> {
        if self.should_fail(target_app, InsertionMethod::ClipboardPaste) {
            return Err("Clipboard paste failed for focused app.".to_string());
        }
        Ok(BackendInsertSuccess {
            message: Some("Inserted via clipboard fallback.".to_string()),
            undo_token: Some(UndoToken::KeyboardUndo),
        })
    }

    fn clipboard_only(
        &mut self,
        _text: &str,
        target_app: Option<&str>,
    ) -> Result<BackendInsertSuccess, String> {
        if self.should_fail(target_app, InsertionMethod::ClipboardOnly) {
            return Err("Clipboard-only fallback blocked.".to_string());
        }
        Ok(BackendInsertSuccess {
            message: Some("Transcript copied. Paste manually with Ctrl+V.".to_string()),
            undo_token: None,
        })
    }

    fn undo(&mut self, _token: &UndoToken) -> Result<Option<String>, String> {
        if self.undo_fails {
            return Err("active app rejected Ctrl+Z".to_string());
        }
        Ok(Some("Undo sent to active application.".to_string()))
    }
}

#[cfg(test)]
mod tests {
    use super::*;

    fn matrix_backend() -> DeterministicMatrixBackend {
        DeterministicMatrixBackend::new()
            .with_failure_budget("Slack", InsertionMethod::Direct, 10)
            .with_failure_budget("Google Docs", InsertionMethod::Direct, 10)
            .with_failure_budget("Safari", InsertionMethod::Direct, 10)
            .with_failure_budget("Safari", InsertionMethod::ClipboardPaste, 2)
            .with_failure_budget("Safari", InsertionMethod::ClipboardOnly, 2)
    }

    #[test]
    fn direct_insert_succeeds_for_plain_text() {
        let backend = DeterministicMatrixBackend::new();
        let mut engine = InsertionEngine::new(Box::new(backend));
        let result = engine
            .insert_text(InsertTextRequest {
                text: "hello voicewave".to_string(),
                target_app: Some("Notepad".to_string()),
                prefer_clipboard: false,
            })
            .expect("insert should work");
        assert!(result.success);
        assert_eq!(result.method, InsertionMethod::Direct);
        assert!(result.undo_available);
    }

    #[test]
    fn clipboard_fallback_runs_when_direct_fails() {
        let backend = DeterministicMatrixBackend::new().with_failure_budget(
            "VS Code",
            InsertionMethod::Direct,
            1,
        );
        let mut engine = InsertionEngine::new(Box::new(backend));
        let result = engine
            .insert_text(InsertTextRequest {
                text: "test".to_string(),
                target_app: Some("VS Code".to_string()),
                prefer_clipboard: false,
            })
            .expect("fallback should work");
        assert!(result.success);
        assert_eq!(result.method, InsertionMethod::ClipboardPaste);
    }

    #[test]
    fn auto_prefers_clipboard_for_vscode_targets() {
        let backend = DeterministicMatrixBackend::new();
        let mut engine = InsertionEngine::new(Box::new(backend));
        let result = engine
            .insert_text(InsertTextRequest {
                text: "short text".to_string(),
                target_app: Some("Visual Studio Code".to_string()),
                prefer_clipboard: false,
            })
            .expect("insert should work");
        assert!(result.success);
        assert_eq!(result.method, InsertionMethod::ClipboardPaste);
    }

    #[test]
    fn auto_prefers_clipboard_for_long_text() {
        let backend = DeterministicMatrixBackend::new();
        let mut engine = InsertionEngine::new(Box::new(backend));
        let long_text = "this is a longer transcript that should use clipboard for speed";
        let result = engine
            .insert_text(InsertTextRequest {
                text: long_text.to_string(),
                target_app: Some("Notepad".to_string()),
                prefer_clipboard: false,
            })
            .expect("insert should work");
        assert!(result.success);
        assert_eq!(result.method, InsertionMethod::ClipboardPaste);
    }

    #[test]
    fn history_fallback_runs_when_all_methods_fail() {
        let backend = DeterministicMatrixBackend::new()
            .with_failure_budget("Cursor", InsertionMethod::Direct, 1)
            .with_failure_budget("Cursor", InsertionMethod::ClipboardPaste, 1)
            .with_failure_budget("Cursor", InsertionMethod::ClipboardOnly, 1);
        let mut engine = InsertionEngine::new(Box::new(backend));
        let result = engine
            .insert_text(InsertTextRequest {
                text: "test".to_string(),
                target_app: Some("Cursor".to_string()),
                prefer_clipboard: false,
            })
            .expect("history fallback should still return result");
        assert!(!result.success);
        assert_eq!(result.method, InsertionMethod::HistoryFallback);
    }

    #[test]
    fn undo_uses_backend_path() {
        let backend = DeterministicMatrixBackend::new();
        let mut engine = InsertionEngine::new(Box::new(backend));
        let _ = engine.insert_text(InsertTextRequest {
            text: "hello".to_string(),
            target_app: Some("Notepad".to_string()),
            prefer_clipboard: false,
        });

        let first = engine.undo_last();
        assert!(first.success);
        let second = engine.undo_last();
        assert!(!second.success);
    }

    #[test]
    fn app_matrix_success_rate_stays_above_phase_two_gate() {
        let backend = matrix_backend();
        let mut engine = InsertionEngine::new(Box::new(backend));

        let apps = [
            "Chrome",
            "Edge",
            "Safari",
            "Google Docs",
            "Slack",
            "Notion",
            "VS Code",
            "Cursor",
            "Notepad",
            "Notes",
        ];

        let mut total = 0usize;
        let mut successes = 0usize;
        for app in apps {
            for idx in 0..10usize {
                total += 1;
                let result = engine
                    .insert_text(InsertTextRequest {
                        text: format!("matrix run {idx} for {app}"),
                        target_app: Some(app.to_string()),
                        prefer_clipboard: false,
                    })
                    .expect("insertion should return a deterministic result");
                if result.success {
                    successes += 1;
                }
            }
        }

        let success_rate = successes as f32 / total as f32;
        assert!(
            success_rate >= 0.95,
            "success rate {success_rate:.3} fell below gate"
        );
    }

    #[test]
    fn chaos_focus_loss_and_layout_shift_are_captured_in_history() {
        let backend = DeterministicMatrixBackend::new()
            .with_failure_budget("Chrome", InsertionMethod::Direct, 1)
            .with_failure_budget("Chrome", InsertionMethod::ClipboardPaste, 1)
            .with_failure_budget("Chrome", InsertionMethod::ClipboardOnly, 1);
        let mut engine = InsertionEngine::new(Box::new(backend));

        let failed = engine
            .insert_text(InsertTextRequest {
                text: "chaos run focus changed".to_string(),
                target_app: Some("Chrome".to_string()),
                prefer_clipboard: false,
            })
            .expect("failure should be represented as history fallback");
        assert!(!failed.success);
        assert_eq!(failed.method, InsertionMethod::HistoryFallback);

        let history = engine.recent_insertions(Some(1));
        assert_eq!(history.len(), 1);
        assert_eq!(history[0].method, InsertionMethod::HistoryFallback);
        assert!(history[0].preview.contains("chaos run"));
    }
}

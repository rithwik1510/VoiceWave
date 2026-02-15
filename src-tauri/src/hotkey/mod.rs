use serde::{Deserialize, Serialize};
use std::collections::HashSet;

#[derive(Debug, Clone, Serialize, Deserialize, PartialEq, Eq)]
#[serde(rename_all = "camelCase")]
pub struct HotkeyConfig {
    pub toggle: String,
    pub push_to_talk: String,
}

impl Default for HotkeyConfig {
    fn default() -> Self {
        Self {
            toggle: "Ctrl+Alt+X".to_string(),
            push_to_talk: "Ctrl+Windows".to_string(),
        }
    }
}

#[derive(Debug, Clone, Serialize, Deserialize, PartialEq, Eq)]
#[serde(rename_all = "camelCase")]
pub struct HotkeySnapshot {
    pub config: HotkeyConfig,
    pub conflicts: Vec<String>,
    pub registration_supported: bool,
    pub registration_error: Option<String>,
}

#[derive(Debug, Clone, Serialize, Deserialize, PartialEq, Eq)]
#[serde(rename_all = "camelCase")]
pub enum HotkeyAction {
    ToggleDictation,
    PushToTalk,
}

#[derive(Debug, Clone, Serialize, Deserialize, PartialEq, Eq)]
#[serde(rename_all = "camelCase")]
pub enum HotkeyPhase {
    Pressed,
    Released,
    Triggered,
}

#[derive(Debug, thiserror::Error)]
pub enum HotkeyError {
    #[error("hotkey '{field}' cannot be empty")]
    EmptyBinding { field: &'static str },
    #[error("hotkey '{field}' has invalid token '{token}'")]
    InvalidToken { field: &'static str, token: String },
    #[error("hotkey '{field}' must include one non-modifier key")]
    MissingMainKey { field: &'static str },
    #[error("toggle and push-to-talk hotkeys conflict")]
    Conflict,
}

#[derive(Debug, Clone)]
struct ParsedHotkey {
    ctrl: bool,
    shift: bool,
    alt: bool,
    super_key: bool,
    modifier_only: bool,
    main_vk: u16,
}

#[derive(Debug, Clone)]
pub struct HotkeyManager {
    config: HotkeyConfig,
    parsed_toggle: ParsedHotkey,
    parsed_push_to_talk: ParsedHotkey,
    registration_supported: bool,
    registration_error: Option<String>,
}

impl HotkeyManager {
    pub fn new(config: HotkeyConfig) -> Result<Self, HotkeyError> {
        validate_config(&config)?;
        let parsed_toggle = parse_combo("toggle", &config.toggle)?;
        let parsed_push_to_talk = parse_combo("pushToTalk", &config.push_to_talk)?;
        let (registration_supported, registration_error) = platform_registration_status();
        Ok(Self {
            config,
            parsed_toggle,
            parsed_push_to_talk,
            registration_supported,
            registration_error,
        })
    }

    pub fn config(&self) -> HotkeyConfig {
        self.config.clone()
    }

    pub fn snapshot(&self) -> HotkeySnapshot {
        HotkeySnapshot {
            config: self.config(),
            conflicts: detect_conflicts(&self.config),
            registration_supported: self.registration_supported,
            registration_error: self.registration_error.clone(),
        }
    }

    pub fn update_config(&mut self, config: HotkeyConfig) -> Result<HotkeySnapshot, HotkeyError> {
        validate_config(&config)?;
        self.parsed_toggle = parse_combo("toggle", &config.toggle)?;
        self.parsed_push_to_talk = parse_combo("pushToTalk", &config.push_to_talk)?;
        self.config = config;
        Ok(self.snapshot())
    }

    pub fn is_action_pressed(&self, action: HotkeyAction) -> bool {
        if !self.registration_supported {
            return false;
        }
        match action {
            HotkeyAction::ToggleDictation => is_parsed_pressed(&self.parsed_toggle),
            HotkeyAction::PushToTalk => is_parsed_pressed(&self.parsed_push_to_talk),
        }
    }
}

fn validate_config(config: &HotkeyConfig) -> Result<(), HotkeyError> {
    normalize_combo("toggle", &config.toggle)?;
    normalize_combo("pushToTalk", &config.push_to_talk)?;
    if detect_conflicts(config)
        .iter()
        .any(|c| c == "duplicateBinding")
    {
        return Err(HotkeyError::Conflict);
    }
    Ok(())
}

fn detect_conflicts(config: &HotkeyConfig) -> Vec<String> {
    let toggle = normalize_combo("toggle", &config.toggle).ok();
    let push = normalize_combo("pushToTalk", &config.push_to_talk).ok();

    let mut conflicts = Vec::new();
    if toggle.is_some() && toggle == push {
        conflicts.push("duplicateBinding".to_string());
    }
    conflicts
}

fn normalize_combo(field: &'static str, combo: &str) -> Result<String, HotkeyError> {
    if combo.trim().is_empty() {
        return Err(HotkeyError::EmptyBinding { field });
    }

    let modifier_aliases = [
        ("CTRL", "CTRL"),
        ("CONTROL", "CTRL"),
        ("SHIFT", "SHIFT"),
        ("ALT", "ALT"),
        ("OPTION", "ALT"),
        ("WIN", "SUPER"),
        ("WINDOWS", "SUPER"),
        ("META", "SUPER"),
        ("CMD", "SUPER"),
        ("SUPER", "SUPER"),
    ];

    let mut modifiers = HashSet::new();
    let mut main_keys = Vec::new();

    for raw in combo.split('+') {
        let token = raw.trim().to_uppercase();
        if token.is_empty() {
            return Err(HotkeyError::InvalidToken {
                field,
                token: raw.to_string(),
            });
        }

        if let Some((_, normalized)) = modifier_aliases.iter().find(|(alias, _)| *alias == token) {
            modifiers.insert(*normalized);
            continue;
        }

        if token == "SPACE"
            || token
                .strip_prefix('F')
                .and_then(|suffix| suffix.parse::<u8>().ok())
                .is_some_and(|n| (1..=24).contains(&n))
            || (token.len() == 1 && token.chars().all(|c| c.is_ascii_alphanumeric()))
        {
            main_keys.push(token);
            continue;
        }

        return Err(HotkeyError::InvalidToken { field, token });
    }

    if main_keys.is_empty() {
        if field == "pushToTalk"
            && modifiers.contains("CTRL")
            && modifiers.contains("SUPER")
            && modifiers.len() == 2
        {
            let mut ordered_modifiers = modifiers.into_iter().collect::<Vec<_>>();
            ordered_modifiers.sort_unstable();
            return Ok(ordered_modifiers.join("+"));
        }
        return Err(HotkeyError::MissingMainKey { field });
    }
    if main_keys.len() != 1 {
        return Err(HotkeyError::MissingMainKey { field });
    }

    let mut ordered_modifiers = modifiers.into_iter().collect::<Vec<_>>();
    ordered_modifiers.sort_unstable();
    ordered_modifiers.push(main_keys[0].as_str());
    Ok(ordered_modifiers.join("+"))
}

fn parse_combo(field: &'static str, combo: &str) -> Result<ParsedHotkey, HotkeyError> {
    let normalized = normalize_combo(field, combo)?;
    let mut ctrl = false;
    let mut shift = false;
    let mut alt = false;
    let mut super_key = false;
    let mut main_vk: Option<u16> = None;

    for token in normalized.split('+') {
        match token {
            "CTRL" => ctrl = true,
            "SHIFT" => shift = true,
            "ALT" => alt = true,
            "SUPER" => super_key = true,
            "SPACE" => main_vk = Some(vk_space()),
            _ if token.starts_with('F') => {
                let number = token.trim_start_matches('F').parse::<u8>().map_err(|_| {
                    HotkeyError::InvalidToken {
                        field,
                        token: token.to_string(),
                    }
                })?;
                if !(1..=24).contains(&number) {
                    return Err(HotkeyError::InvalidToken {
                        field,
                        token: token.to_string(),
                    });
                }
                main_vk = Some(vk_f(number));
            }
            _ if token.len() == 1 => {
                let byte = token.as_bytes()[0];
                main_vk = Some(byte as u16);
            }
            _ => {
                return Err(HotkeyError::InvalidToken {
                    field,
                    token: token.to_string(),
                })
            }
        }
    }

    let modifier_only = main_vk.is_none();
    let main_vk = if modifier_only {
        0
    } else {
        main_vk.ok_or(HotkeyError::MissingMainKey { field })?
    };
    Ok(ParsedHotkey {
        ctrl,
        shift,
        alt,
        super_key,
        modifier_only,
        main_vk,
    })
}

fn platform_registration_status() -> (bool, Option<String>) {
    #[cfg(target_os = "windows")]
    {
        return (true, None);
    }

    #[cfg(not(target_os = "windows"))]
    {
        (
            false,
            Some("Global hotkeys are currently implemented for Windows runtime.".to_string()),
        )
    }
}

fn is_parsed_pressed(parsed: &ParsedHotkey) -> bool {
    #[cfg(target_os = "windows")]
    {
        use windows_sys::Win32::UI::Input::KeyboardAndMouse::{
            GetAsyncKeyState, VK_CONTROL, VK_LCONTROL, VK_LMENU, VK_LSHIFT, VK_LWIN, VK_MENU,
            VK_RCONTROL, VK_RMENU, VK_RSHIFT, VK_RWIN, VK_SHIFT,
        };

        let ctrl_down = key_down_any(&[
            VK_CONTROL as u16,
            VK_LCONTROL as u16,
            VK_RCONTROL as u16,
        ]);
        let shift_down = key_down_any(&[
            VK_SHIFT as u16,
            VK_LSHIFT as u16,
            VK_RSHIFT as u16,
        ]);
        let alt_down = key_down_any(&[
            VK_MENU as u16,
            VK_LMENU as u16,
            VK_RMENU as u16,
        ]);
        let super_down = key_down(VK_LWIN as u16) || key_down(VK_RWIN as u16);

        if parsed.ctrl != ctrl_down
            || parsed.shift != shift_down
            || parsed.alt != alt_down
            || parsed.super_key != super_down
        {
            return false;
        }
        if parsed.modifier_only {
            return true;
        }

        // SAFETY: GetAsyncKeyState is thread-safe for querying current key state.
        let state = unsafe { GetAsyncKeyState(parsed.main_vk as i32) };
        (state as u16 & 0x8000) != 0
    }

    #[cfg(not(target_os = "windows"))]
    {
        let _ = parsed;
        false
    }
}

#[cfg(target_os = "windows")]
fn key_down(vk: u16) -> bool {
    use windows_sys::Win32::UI::Input::KeyboardAndMouse::GetAsyncKeyState;
    // SAFETY: GetAsyncKeyState is thread-safe for querying current key state.
    let state = unsafe { GetAsyncKeyState(vk as i32) };
    (state as u16 & 0x8000) != 0
}

#[cfg(target_os = "windows")]
fn key_down_any(vks: &[u16]) -> bool {
    vks.iter().copied().any(key_down)
}

fn vk_space() -> u16 {
    #[cfg(target_os = "windows")]
    {
        use windows_sys::Win32::UI::Input::KeyboardAndMouse::VK_SPACE;
        return VK_SPACE as u16;
    }

    #[cfg(not(target_os = "windows"))]
    {
        0x20
    }
}

fn vk_f(number: u8) -> u16 {
    #[cfg(target_os = "windows")]
    {
        use windows_sys::Win32::UI::Input::KeyboardAndMouse::VK_F1;
        return (VK_F1 as u16) + (number as u16 - 1);
    }

    #[cfg(not(target_os = "windows"))]
    {
        0x70 + (number as u16 - 1)
    }
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn default_hotkeys_are_valid() {
        let manager =
            HotkeyManager::new(HotkeyConfig::default()).expect("default config should be valid");
        let snapshot = manager.snapshot();
        assert!(snapshot.conflicts.is_empty());
        #[cfg(target_os = "windows")]
        assert!(snapshot.registration_supported);
    }

    #[test]
    fn duplicate_hotkeys_are_rejected() {
        let result = HotkeyManager::new(HotkeyConfig {
            toggle: "Ctrl+Alt+X".to_string(),
            push_to_talk: "Ctrl+Alt+X".to_string(),
        });
        assert!(matches!(result, Err(HotkeyError::Conflict)));
    }

    #[test]
    fn invalid_token_is_rejected() {
        let result = HotkeyManager::new(HotkeyConfig {
            toggle: "Ctrl+Banana".to_string(),
            push_to_talk: "Ctrl+Windows".to_string(),
        });
        assert!(matches!(result, Err(HotkeyError::InvalidToken { .. })));
    }

    #[test]
    fn push_to_talk_supports_modifier_only_ctrl_windows_combo() {
        let parsed = parse_combo("pushToTalk", "Ctrl+Windows").expect("combo should parse");
        assert!(parsed.ctrl);
        assert!(parsed.super_key);
        assert!(parsed.modifier_only);
    }

    #[test]
    fn parse_function_key_combo() {
        let parsed = parse_combo("toggle", "Ctrl+F13").expect("combo should parse");
        assert!(parsed.ctrl);
        assert_eq!(parsed.main_vk, vk_f(13));
    }
}

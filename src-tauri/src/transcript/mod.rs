pub fn sanitize_user_transcript(input: &str) -> String {
    let without_artifacts = strip_bracket_artifacts(input);
    normalize_whitespace(&without_artifacts)
}

fn strip_bracket_artifacts(input: &str) -> String {
    let chars = input.chars().collect::<Vec<_>>();
    let mut output = String::with_capacity(input.len());
    let mut idx = 0usize;

    while idx < chars.len() {
        if chars[idx] == '[' {
            let mut end = idx + 1;
            while end < chars.len() && chars[end] != ']' {
                end += 1;
            }

            if end < chars.len() {
                let token = chars[idx + 1..end].iter().collect::<String>();
                if is_artifact_token(&token) {
                    idx = end + 1;
                    continue;
                }
            }
        }

        output.push(chars[idx]);
        idx += 1;
    }

    output
}

fn is_artifact_token(value: &str) -> bool {
    let trimmed = value.trim();
    if trimmed.is_empty() || trimmed.len() > 48 {
        return false;
    }

    let mut saw_ascii_alpha = false;
    for ch in trimmed.chars() {
        if ch.is_ascii_alphabetic() {
            if ch.is_ascii_lowercase() {
                return false;
            }
            saw_ascii_alpha = true;
            continue;
        }

        if ch.is_ascii_digit() || ch == '_' || ch == '-' || ch == ' ' {
            continue;
        }

        return false;
    }

    saw_ascii_alpha
}

fn normalize_whitespace(input: &str) -> String {
    input.split_whitespace().collect::<Vec<_>>().join(" ")
}

#[cfg(test)]
mod tests {
    use super::sanitize_user_transcript;

    #[test]
    fn strips_blank_audio_marker() {
        assert_eq!(
            sanitize_user_transcript("Have you [BLANK_AUDIO] there"),
            "Have you there"
        );
    }

    #[test]
    fn keeps_normal_bracket_text() {
        assert_eq!(
            sanitize_user_transcript("version [v1] works"),
            "version [v1] works"
        );
    }

    #[test]
    fn collapses_whitespace_after_sanitization() {
        assert_eq!(
            sanitize_user_transcript("  hello   [MUSIC]   world  "),
            "hello world"
        );
    }
}

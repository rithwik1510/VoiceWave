pub fn sanitize_user_transcript(input: &str) -> String {
    let without_artifacts = strip_bracket_artifacts(input);
    normalize_whitespace(&without_artifacts)
}

pub fn merge_incremental_transcript(
    committed: &str,
    incoming: &str,
    overlap_token_limit: usize,
) -> String {
    let committed_norm = normalize_whitespace(committed);
    let incoming_norm = normalize_whitespace(incoming);
    if committed_norm.is_empty() {
        return incoming_norm;
    }
    if incoming_norm.is_empty() {
        return committed_norm;
    }

    let committed_tokens = committed_norm.split_whitespace().collect::<Vec<_>>();
    let incoming_tokens = incoming_norm.split_whitespace().collect::<Vec<_>>();
    let overlap_cap = overlap_token_limit
        .max(1)
        .min(committed_tokens.len())
        .min(incoming_tokens.len());

    for overlap_len in (1..=overlap_cap).rev() {
        let committed_tail = &committed_tokens[committed_tokens.len() - overlap_len..];
        let incoming_head = &incoming_tokens[..overlap_len];
        if tokens_match_case_insensitive(committed_tail, incoming_head) {
            let mut merged = committed_tokens
                .iter()
                .map(|token| (*token).to_string())
                .collect::<Vec<_>>();
            merged.extend(
                incoming_tokens[overlap_len..]
                    .iter()
                    .map(|token| (*token).to_string()),
            );
            return merged.join(" ");
        }
    }

    format!("{committed_norm} {incoming_norm}")
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

fn tokens_match_case_insensitive(left: &[&str], right: &[&str]) -> bool {
    if left.len() != right.len() {
        return false;
    }
    left.iter()
        .zip(right.iter())
        .all(|(lhs, rhs)| lhs.eq_ignore_ascii_case(rhs))
}

#[cfg(test)]
mod tests {
    use super::{merge_incremental_transcript, sanitize_user_transcript};

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

    #[test]
    fn merge_uses_overlap_to_replace_tail() {
        let merged = merge_incremental_transcript(
            "how is it going",
            "it going to work now",
            8,
        );
        assert_eq!(merged, "how is it going to work now");
    }

    #[test]
    fn merge_appends_when_no_overlap_exists() {
        let merged = merge_incremental_transcript("hello world", "fresh segment", 8);
        assert_eq!(merged, "hello world fresh segment");
    }

    #[test]
    fn merge_is_case_insensitive_for_overlap_matching() {
        let merged = merge_incremental_transcript("VoiceWave Works", "works great", 8);
        assert_eq!(merged, "VoiceWave Works great");
    }
}

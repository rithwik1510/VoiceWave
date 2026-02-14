pub fn sanitize_user_transcript(input: &str) -> String {
    let without_artifacts = strip_bracket_artifacts(input);
    normalize_whitespace(&without_artifacts)
}

pub fn finalize_user_transcript(input: &str) -> String {
    let sanitized = sanitize_user_transcript(input);
    if sanitized.is_empty() {
        return sanitized;
    }

    if let Some(list_text) = format_spoken_numbered_list(&sanitized) {
        return list_text;
    }

    format_sentence_fragment(&sanitized)
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

fn format_spoken_numbered_list(input: &str) -> Option<String> {
    let tokens = input.split_whitespace().collect::<Vec<_>>();
    if tokens.len() < 6 {
        return None;
    }

    let mut entries = Vec::<(u32, Vec<String>)>::new();
    let mut current_number = None::<u32>;
    let mut current_words = Vec::<String>::new();

    for token in tokens {
        if let Some(number) = parse_number_marker(token) {
            if let Some(existing) = current_number {
                if !current_words.is_empty() {
                    entries.push((existing, std::mem::take(&mut current_words)));
                }
            }
            current_number = Some(number);
            continue;
        }

        if current_number.is_some() {
            current_words.push(token.to_string());
        } else {
            return None;
        }
    }

    let Some(last_number) = current_number else {
        return None;
    };
    if !current_words.is_empty() {
        entries.push((last_number, current_words));
    }

    if entries.len() < 2 {
        return None;
    }

    if entries[0].0 != 1 {
        return None;
    }
    if !entries.windows(2).all(|window| window[1].0 == window[0].0 + 1) {
        return None;
    }
    if entries.iter().any(|(_, words)| words.len() < 2) {
        return None;
    }

    let lines = entries
        .into_iter()
        .map(|(number, words)| {
            let content = words.join(" ");
            format!("{number}. {}", format_sentence_fragment(&content))
        })
        .collect::<Vec<_>>();
    Some(lines.join("\n"))
}

fn parse_number_marker(token: &str) -> Option<u32> {
    let lowered = token
        .trim_matches(|ch: char| !ch.is_ascii_alphanumeric())
        .to_ascii_lowercase();
    match lowered.as_str() {
        "1" | "one" | "first" => Some(1),
        "2" | "two" | "second" => Some(2),
        "3" | "three" | "third" => Some(3),
        "4" | "four" | "fourth" => Some(4),
        "5" | "five" | "fifth" => Some(5),
        "6" | "six" | "sixth" => Some(6),
        "7" | "seven" | "seventh" => Some(7),
        "8" | "eight" | "eighth" => Some(8),
        "9" | "nine" | "ninth" => Some(9),
        "10" | "ten" | "tenth" => Some(10),
        _ => None,
    }
}

fn format_sentence_fragment(input: &str) -> String {
    let mut text = normalize_whitespace(input);
    text = normalize_punctuation_spacing(&text);
    text = normalize_pronoun_i(&text);
    text = capitalize_first_alpha(&text);
    ensure_terminal_punctuation(&text)
}

fn normalize_punctuation_spacing(input: &str) -> String {
    let mut output = input.to_string();
    for pattern in [" ,", " .", " !", " ?", " ;", " :"] {
        let replacement = &pattern[1..];
        output = output.replace(pattern, replacement);
    }
    output
}

fn normalize_pronoun_i(input: &str) -> String {
    input
        .split_whitespace()
        .map(|token| {
            if token.eq_ignore_ascii_case("i") {
                "I".to_string()
            } else if token.to_ascii_lowercase().starts_with("i'") {
                format!("I{}", &token[1..])
            } else {
                token.to_string()
            }
        })
        .collect::<Vec<_>>()
        .join(" ")
}

fn capitalize_first_alpha(input: &str) -> String {
    let mut chars = input.chars().collect::<Vec<_>>();
    for ch in &mut chars {
        if ch.is_ascii_alphabetic() {
            *ch = ch.to_ascii_uppercase();
            break;
        }
    }
    chars.into_iter().collect()
}

fn ensure_terminal_punctuation(input: &str) -> String {
    let trimmed = input.trim();
    if trimmed.is_empty() {
        return String::new();
    }
    if matches!(trimmed.chars().last(), Some('.' | '!' | '?')) {
        return trimmed.to_string();
    }
    format!("{trimmed}.")
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
    use super::{finalize_user_transcript, merge_incremental_transcript, sanitize_user_transcript};

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

    #[test]
    fn finalize_formats_sentence_grammar() {
        assert_eq!(
            finalize_user_transcript("i think this is working now"),
            "I think this is working now."
        );
    }

    #[test]
    fn finalize_formats_spoken_numbered_lists() {
        let output = finalize_user_transcript(
            "one fix microphone settings two check model install three run dictation test",
        );
        assert_eq!(
            output,
            "1. Fix microphone settings.\n2. Check model install.\n3. Run dictation test."
        );
    }

    #[test]
    fn finalize_avoids_false_numbered_list_conversion() {
        assert_eq!(
            finalize_user_transcript("one day two nights in paris"),
            "One day two nights in paris."
        );
    }
}

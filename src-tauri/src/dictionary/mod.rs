use directories::ProjectDirs;
use serde::{Deserialize, Serialize};
use std::{
    fs,
    path::{Path, PathBuf},
    time::{SystemTime, UNIX_EPOCH},
};

#[derive(Debug, Clone, Serialize, Deserialize, PartialEq, Eq)]
#[serde(rename_all = "camelCase")]
pub struct DictionaryQueueItem {
    pub entry_id: String,
    pub term: String,
    pub source_preview: String,
    pub created_at_utc_ms: u64,
}

#[derive(Debug, Clone, Serialize, Deserialize, PartialEq, Eq)]
#[serde(rename_all = "camelCase")]
pub struct DictionaryTerm {
    pub term_id: String,
    pub term: String,
    pub source: String,
    pub created_at_utc_ms: u64,
}

#[derive(Debug, Clone, Serialize, Deserialize, PartialEq, Eq)]
#[serde(rename_all = "camelCase")]
pub struct DictionaryEvent {
    pub action: String,
    pub queue_size: usize,
    pub term_count: usize,
    pub message: Option<String>,
}

#[derive(Debug, thiserror::Error)]
pub enum DictionaryError {
    #[error("failed to read dictionary: {0}")]
    Read(std::io::Error),
    #[error("failed to write dictionary: {0}")]
    Write(std::io::Error),
    #[error("failed to parse dictionary JSON: {0}")]
    Parse(serde_json::Error),
    #[error("cannot resolve app data directory")]
    AppData,
    #[error("dictionary queue entry not found: {0}")]
    QueueEntryNotFound(String),
    #[error("dictionary term not found: {0}")]
    TermNotFound(String),
}

#[derive(Debug, Clone, Serialize, Deserialize, Default)]
#[serde(rename_all = "camelCase")]
struct DictionaryStore {
    next_id: u64,
    queue: Vec<DictionaryQueueItem>,
    terms: Vec<DictionaryTerm>,
}

pub struct DictionaryManager {
    path: PathBuf,
    store: DictionaryStore,
}

impl DictionaryManager {
    pub fn new() -> Result<Self, DictionaryError> {
        let proj_dirs =
            ProjectDirs::from("com", "voicewave", "localcore").ok_or(DictionaryError::AppData)?;
        let path = proj_dirs.config_dir().join("dictionary.json");
        Self::from_path(path)
    }

    pub fn from_path(path: impl AsRef<Path>) -> Result<Self, DictionaryError> {
        let path = path.as_ref().to_path_buf();
        let mut manager = Self {
            path,
            store: DictionaryStore {
                next_id: 1,
                queue: Vec::new(),
                terms: Vec::new(),
            },
        };
        manager.load()?;
        Ok(manager)
    }

    pub fn ingest_transcript(&mut self, transcript: &str) -> Result<usize, DictionaryError> {
        let preview = transcript.chars().take(80).collect::<String>();
        let mut added = 0usize;

        for candidate in candidate_terms(transcript).into_iter().take(5) {
            if self.contains_term(&candidate) || self.in_queue(&candidate) {
                continue;
            }

            let entry_id = self.next_id("dq");
            self.store.queue.push(DictionaryQueueItem {
                entry_id,
                term: candidate,
                source_preview: preview.clone(),
                created_at_utc_ms: now_utc_ms(),
            });
            added += 1;
        }

        if added > 0 {
            self.persist()?;
        }
        Ok(added)
    }

    pub fn get_queue(&self, limit: Option<usize>) -> Vec<DictionaryQueueItem> {
        let take = limit.unwrap_or(50).max(1);
        self.store.queue.iter().rev().take(take).cloned().collect()
    }

    pub fn approve_entry(
        &mut self,
        entry_id: &str,
        normalized_text: Option<String>,
    ) -> Result<DictionaryTerm, DictionaryError> {
        let idx = self
            .store
            .queue
            .iter()
            .position(|entry| entry.entry_id == entry_id)
            .ok_or_else(|| DictionaryError::QueueEntryNotFound(entry_id.to_string()))?;
        let entry = self.store.queue.remove(idx);

        let term = DictionaryTerm {
            term_id: self.next_id("dt"),
            term: normalized_text
                .unwrap_or_else(|| entry.term)
                .trim()
                .to_string(),
            source: "queue-approval".to_string(),
            created_at_utc_ms: now_utc_ms(),
        };
        self.store.terms.push(term.clone());
        self.persist()?;
        Ok(term)
    }

    pub fn reject_entry(
        &mut self,
        entry_id: &str,
        reason: Option<String>,
    ) -> Result<(), DictionaryError> {
        let idx = self
            .store
            .queue
            .iter()
            .position(|entry| entry.entry_id == entry_id)
            .ok_or_else(|| DictionaryError::QueueEntryNotFound(entry_id.to_string()))?;
        self.store.queue.remove(idx);
        if reason.as_deref().is_some() {
            // Reason is currently included for audit compatibility, but not persisted in Phase III.
        }
        self.persist()?;
        Ok(())
    }

    pub fn get_terms(&self, query: Option<String>) -> Vec<DictionaryTerm> {
        let query = query.unwrap_or_default().trim().to_ascii_lowercase();

        let mut rows: Vec<_> = self
            .store
            .terms
            .iter()
            .filter(|term| query.is_empty() || term.term.to_ascii_lowercase().contains(&query))
            .cloned()
            .collect();
        rows.sort_by_key(|row| row.created_at_utc_ms);
        rows
    }

    pub fn remove_term(&mut self, term_id: &str) -> Result<(), DictionaryError> {
        let idx = self
            .store
            .terms
            .iter()
            .position(|term| term.term_id == term_id)
            .ok_or_else(|| DictionaryError::TermNotFound(term_id.to_string()))?;
        self.store.terms.remove(idx);
        self.persist()?;
        Ok(())
    }

    pub fn event(&self, action: &str, message: Option<String>) -> DictionaryEvent {
        DictionaryEvent {
            action: action.to_string(),
            queue_size: self.store.queue.len(),
            term_count: self.store.terms.len(),
            message,
        }
    }

    fn contains_term(&self, candidate: &str) -> bool {
        let candidate = candidate.to_ascii_lowercase();
        self.store
            .terms
            .iter()
            .any(|term| term.term.to_ascii_lowercase() == candidate)
    }

    fn in_queue(&self, candidate: &str) -> bool {
        let candidate = candidate.to_ascii_lowercase();
        self.store
            .queue
            .iter()
            .any(|item| item.term.to_ascii_lowercase() == candidate)
    }

    fn next_id(&mut self, prefix: &str) -> String {
        let id = self.store.next_id;
        self.store.next_id += 1;
        format!("{prefix}-{id}")
    }

    fn load(&mut self) -> Result<(), DictionaryError> {
        if !self.path.exists() {
            return Ok(());
        }
        let raw = fs::read_to_string(&self.path).map_err(DictionaryError::Read)?;
        self.store = serde_json::from_str(&raw).map_err(DictionaryError::Parse)?;
        Ok(())
    }

    fn persist(&self) -> Result<(), DictionaryError> {
        if let Some(parent) = self.path.parent() {
            fs::create_dir_all(parent).map_err(DictionaryError::Write)?;
        }
        let encoded = serde_json::to_string_pretty(&self.store).map_err(DictionaryError::Parse)?;
        fs::write(&self.path, encoded).map_err(DictionaryError::Write)?;
        Ok(())
    }
}

fn candidate_terms(transcript: &str) -> Vec<String> {
    transcript
        .split(|ch: char| !ch.is_alphanumeric() && ch != '-')
        .filter_map(|token| {
            let cleaned = token.trim_matches('-');
            if cleaned.len() < 4 {
                return None;
            }
            let first = cleaned.chars().next()?;
            if !first.is_uppercase() {
                return None;
            }
            Some(cleaned.to_string())
        })
        .collect()
}

fn now_utc_ms() -> u64 {
    SystemTime::now()
        .duration_since(UNIX_EPOCH)
        .map(|d| d.as_millis() as u64)
        .unwrap_or_default()
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn ingest_adds_capitalized_candidates() {
        let mut manager = DictionaryManager {
            path: std::env::temp_dir().join("voicewave-dictionary-test.json"),
            store: DictionaryStore::default(),
        };

        let added = manager
            .ingest_transcript("Reviewed VoiceWave and WhisperEngine roadmap with Alex")
            .expect("ingest should succeed");
        assert!(added > 0);
        assert!(!manager.get_queue(None).is_empty());
    }
}

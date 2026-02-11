export type VoiceWaveHudState =
  | "idle"
  | "listening"
  | "transcribing"
  | "inserted"
  | "error";

export type DictationMode = "microphone" | "fixture";
export type DecodeMode = "balanced" | "fast" | "quality";

export interface VoiceWaveSettings {
  inputDevice: string | null;
  activeModel: string;
  showFloatingHud: boolean;
  vadThreshold: number;
  maxUtteranceMs: number;
  releaseTailMs: number;
  decodeMode: DecodeMode;
  diagnosticsOptIn: boolean;
  toggleHotkey: string;
  pushToTalkHotkey: string;
  preferClipboardFallback: boolean;
}

export interface VoiceWaveSnapshot {
  state: VoiceWaveHudState;
  lastPartial: string | null;
  lastFinal: string | null;
  activeModel: string;
}

export interface TranscriptEvent {
  text: string;
  isFinal: boolean;
  elapsedMs: number;
}

export interface VoiceWaveStateEvent {
  state: VoiceWaveHudState;
  message?: string | null;
}

export interface LatencyBreakdownEvent {
  sessionId: number;
  captureMs: number;
  releaseToTranscribingMs: number;
  watchdogRecovered: boolean;
  segmentsCaptured: number;
  releaseStopDetectedAtUtcMs: number;
  modelInitMs: number;
  audioConditionMs: number;
  decodeComputeMs: number;
  runtimeCacheHit: boolean;
  backendRequested: string;
  backendUsed: string;
  backendFallback: boolean;
  holdToFirstDraftMs: number;
  incrementalDecodeMs: number;
  releaseFinalizeMs: number;
  incrementalWindowsDecoded: number;
  finalizeTailAudioMs: number;
  decodeMs: number;
  postMs: number;
  insertMs: number;
  totalMs: number;
  audioDurationMs: number;
  modelId: string;
  decodeMode: DecodeMode;
}

export interface DiagnosticsStatus {
  optIn: boolean;
  recordCount: number;
  lastExportPath: string | null;
  lastExportedAtUtcMs: number | null;
  watchdogRecoveryCount: number;
}

export interface DiagnosticsExportResult {
  filePath: string;
  exportedAtUtcMs: number;
  recordCount: number;
  redactionSummary: string;
}

export interface HotkeyConfig {
  toggle: string;
  pushToTalk: string;
}

export interface HotkeySnapshot {
  config: HotkeyConfig;
  conflicts: string[];
  registrationSupported: boolean;
  registrationError?: string | null;
}

export type HotkeyAction = "toggleDictation" | "pushToTalk";
export type HotkeyPhase = "pressed" | "released" | "triggered";

export interface HotkeyEvent {
  action: HotkeyAction;
  phase: HotkeyPhase;
}

export type MicrophonePermission = "granted" | "denied" | "unknown";
export type InsertionCapability = "available" | "restricted";

export interface PermissionSnapshot {
  microphone: MicrophonePermission;
  insertionCapability: InsertionCapability;
  message?: string | null;
}

export interface MicLevelEvent {
  level: number;
  error?: string | null;
}

export type AudioQualityBand = "good" | "fair" | "poor";

export interface AudioQualityReport {
  sampleRate: number;
  segmentCount: number;
  totalSamples: number;
  durationMs: number;
  rms: number;
  peak: number;
  clippingRatio: number;
  lowEnergyFrameRatio: number;
  estimatedSnrDb: number;
  quality: AudioQualityBand;
  issues: string[];
  recommendations: string[];
}

export type InsertionMethod = "direct" | "clipboardPaste" | "clipboardOnly" | "historyFallback";

export interface InsertTextRequest {
  text: string;
  targetApp?: string | null;
  preferClipboard?: boolean;
}

export interface InsertResult {
  success: boolean;
  method: InsertionMethod;
  message?: string | null;
  targetApp?: string | null;
  transactionId: string;
  undoAvailable: boolean;
}

export interface UndoResult {
  success: boolean;
  message?: string | null;
  transactionId?: string | null;
}

export interface RecentInsertion {
  transactionId: string;
  targetApp?: string | null;
  preview: string;
  method: InsertionMethod;
  success: boolean;
  timestampUtcMs: number;
  message?: string | null;
}

export interface ModelCatalogItem {
  modelId: string;
  displayName: string;
  version: string;
  format: string;
  sizeBytes: number;
  sha256: string;
  license: string;
  downloadUrl: string;
  signature: string;
}

export interface InstalledModel {
  modelId: string;
  version: string;
  format: string;
  sizeBytes: number;
  filePath: string;
  sha256: string;
  installedAtUtcMs: number;
  checksumVerified: boolean;
}

export type ModelStatusState =
  | "idle"
  | "downloading"
  | "paused"
  | "installed"
  | "failed"
  | "cancelled";

export interface ModelStatus {
  modelId: string;
  state: ModelStatusState;
  progress: number;
  active: boolean;
  installed: boolean;
  message?: string | null;
  installedModel?: InstalledModel | null;
  downloadedBytes?: number | null;
  totalBytes?: number | null;
  resumable: boolean;
}

export interface ModelEvent {
  modelId: string;
  state: ModelStatusState;
  progress: number;
  message?: string | null;
  downloadedBytes?: number | null;
  totalBytes?: number | null;
}

export interface ModelDownloadRequest {
  modelId: string;
}

export interface BenchmarkRequest {
  modelIds?: string[] | null;
  runsPerModel?: number | null;
  partialDelayMs?: number | null;
}

export interface BenchmarkRow {
  modelId: string;
  runs: number;
  p50LatencyMs: number;
  p95LatencyMs: number;
  averageRtf: number;
  observedSampleCount?: number;
  observedSuccessRatePercent?: number;
  observedP95ReleaseToFinalMs?: number;
  observedP95ReleaseToTranscribingMs?: number;
  observedWatchdogRecoveryRatePercent?: number;
}

export interface BenchmarkRun {
  startedAtUtcMs: number;
  completedAtUtcMs: number;
  rows: BenchmarkRow[];
}

export interface RecommendationConstraints {
  maxP95LatencyMs?: number | null;
  maxRtf?: number | null;
}

export interface ModelRecommendation {
  modelId: string;
  reason: string;
  p95LatencyMs: number;
  averageRtf: number;
  meetsLatencyGate: boolean;
  meetsRtfGate: boolean;
  observedSampleCount?: number;
  observedSuccessRatePercent?: number;
}

export type RetentionPolicy = "off" | "days7" | "days30" | "forever";

export interface SessionHistoryQuery {
  limit?: number | null;
  includeFailed?: boolean | null;
}

export interface SessionHistoryRecord {
  recordId: string;
  timestampUtcMs: number;
  preview: string;
  method?: InsertionMethod | null;
  success: boolean;
  source: string;
  message?: string | null;
}

export interface DictionaryQueueItem {
  entryId: string;
  term: string;
  sourcePreview: string;
  createdAtUtcMs: number;
}

export interface DictionaryTerm {
  termId: string;
  term: string;
  source: string;
  createdAtUtcMs: number;
}

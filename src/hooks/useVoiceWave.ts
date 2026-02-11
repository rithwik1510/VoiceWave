import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import {
  approveDictionaryEntry,
  stopDictation as stopDictationCommand,
  cancelModelDownload,
  canUseTauri,
  clearHistory,
  downloadModel,
  getBenchmarkResults,
  getDiagnosticsStatus,
  getDictionaryQueue,
  getDictionaryTerms,
  getPermissionSnapshot,
  getRecentInsertions,
  getSessionHistory,
  insertText,
  listenVoicewaveHotkey,
  listenVoicewaveLatency,
  listenVoicewaveAudioQuality,
  listenVoicewaveInsertion,
  listenVoicewaveMicLevel,
  listenVoicewavePermission,
  listenVoicewaveState,
  listenVoicewaveTranscript,
  listInstalledModels,
  listInputDevices,
  listModelCatalog,
  loadHotkeyConfig,
  loadSettings,
  listenVoicewaveModel,
  loadSnapshot,
  pauseModelDownload,
  pruneHistoryNow,
  recommendModel,
  rejectDictionaryEntry,
  removeDictionaryTerm,
  requestMicrophoneAccess,
  resumeModelDownload,
  setDiagnosticsOptIn as setDiagnosticsOptInCommand,
  runAudioQualityDiagnostic as runAudioQualityDiagnosticCommand,
  runModelBenchmark,
  setActiveModel,
  setHistoryRetention,
  startMicLevelMonitor,
  stopMicLevelMonitor,
  startDictation,
  triggerHotkeyAction,
  undoLastInsertion,
  exportDiagnosticsBundle as exportDiagnosticsBundleCommand,
  updateHotkeyConfig,
  updateSettings
} from "../lib/tauri";
import type {
  AudioQualityReport,
  BenchmarkRun,
  DecodeMode,
  DiagnosticsExportResult,
  DiagnosticsStatus,
  DictationMode,
  DictionaryQueueItem,
  DictionaryTerm,
  HotkeyConfig,
  HotkeyEvent,
  HotkeySnapshot,
  InsertResult,
  InstalledModel,
  ModelCatalogItem,
  ModelRecommendation,
  ModelEvent,
  ModelStatus,
  MicLevelEvent,
  PermissionSnapshot,
  RecentInsertion,
  RetentionPolicy,
  SessionHistoryRecord,
  LatencyBreakdownEvent,
  VoiceWaveHudState,
  VoiceWaveSettings,
  VoiceWaveSnapshot
} from "../types/voicewave";

const DEFAULT_MAX_UTTERANCE_MS = 30_000;
const MIN_MAX_UTTERANCE_MS = 5_000;
const MAX_MAX_UTTERANCE_MS = 30_000;
const DEFAULT_RELEASE_TAIL_MS = 350;
const MIN_RELEASE_TAIL_MS = 120;
const MAX_RELEASE_TAIL_MS = 1_500;
const DEFAULT_DECODE_MODE: DecodeMode = "balanced";

const fallbackSettings: VoiceWaveSettings = {
  inputDevice: null,
  activeModel: "fw-small.en",
  showFloatingHud: true,
  vadThreshold: 0.014,
  maxUtteranceMs: DEFAULT_MAX_UTTERANCE_MS,
  releaseTailMs: DEFAULT_RELEASE_TAIL_MS,
  decodeMode: DEFAULT_DECODE_MODE,
  diagnosticsOptIn: false,
  toggleHotkey: "Ctrl+Shift+Space",
  pushToTalkHotkey: "Ctrl+Alt+Space",
  preferClipboardFallback: false
};

const fallbackSnapshot: VoiceWaveSnapshot = {
  state: "idle",
  lastPartial: null,
  lastFinal: null,
  activeModel: "fw-small.en"
};

const fallbackHotkeys: HotkeySnapshot = {
  config: {
    toggle: "Ctrl+Shift+Space",
    pushToTalk: "Ctrl+Alt+Space"
  },
  conflicts: [],
  registrationSupported: true,
  registrationError: null
};

const fallbackPermissions: PermissionSnapshot = {
  microphone: "unknown",
  insertionCapability: "available",
  message: "Permissions are managed in desktop runtime."
};

const fallbackDiagnosticsStatus: DiagnosticsStatus = {
  optIn: false,
  recordCount: 0,
  lastExportPath: null,
  lastExportedAtUtcMs: null,
  watchdogRecoveryCount: 0
};

const fallbackModelCatalog: ModelCatalogItem[] = [
  {
    modelId: "fw-small.en",
    displayName: "faster-whisper small.en",
    version: "faster-whisper-v1",
    format: "faster-whisper",
    sizeBytes: 487_614_201,
    sha256: "000000000000000000000000000000000000000000000000000000001d10d5f9",
    license: "MIT (faster-whisper + model license)",
    downloadUrl: "faster-whisper://small.en",
    signature: "local"
  },
  {
    modelId: "fw-large-v3",
    displayName: "faster-whisper large-v3",
    version: "faster-whisper-v1",
    format: "faster-whisper",
    sizeBytes: 3_094_000_000,
    sha256: "00000000000000000000000000000000000000000000000000000000b8684430",
    license: "MIT (faster-whisper + model license)",
    downloadUrl: "faster-whisper://large-v3",
    signature: "local"
  },
  {
    modelId: "tiny.en",
    displayName: "tiny.en",
    version: "whispercpp-ggml-main",
    format: "bin",
    sizeBytes: 77_704_715,
    sha256: "921e4cf8686fdd993dcd081a5da5b6c365bfde1162e72b08d75ac75289920b1f",
    license: "MIT (whisper.cpp)",
    downloadUrl: "https://huggingface.co/ggerganov/whisper.cpp/resolve/main/ggml-tiny.en.bin",
    signature: "local"
  },
  {
    modelId: "base.en",
    displayName: "base.en",
    version: "whispercpp-ggml-main",
    format: "bin",
    sizeBytes: 147_964_211,
    sha256: "a03779c86df3323075f5e796cb2ce5029f00ec8869eee3fdfb897afe36c6d002",
    license: "MIT (whisper.cpp)",
    downloadUrl: "https://huggingface.co/ggerganov/whisper.cpp/resolve/main/ggml-base.en.bin",
    signature: "local"
  },
  {
    modelId: "small.en",
    displayName: "small.en",
    version: "whispercpp-ggml-main",
    format: "bin",
    sizeBytes: 487_614_201,
    sha256: "c6138d6d58ecc8322097e0f987c32f1be8bb0a18532a3f88f734d1bbf9c41e5d",
    license: "MIT (whisper.cpp)",
    downloadUrl: "https://huggingface.co/ggerganov/whisper.cpp/resolve/main/ggml-small.en.bin",
    signature: "local"
  },
  {
    modelId: "medium.en",
    displayName: "medium.en",
    version: "whispercpp-ggml-main",
    format: "bin",
    sizeBytes: 1_533_774_781,
    sha256: "cc37e93478338ec7700281a7ac30a10128929eb8f427dda2e865faa8f6da4356",
    license: "MIT (whisper.cpp)",
    downloadUrl: "https://huggingface.co/ggerganov/whisper.cpp/resolve/main/ggml-medium.en.bin",
    signature: "local"
  }
];

const RECOMMENDED_VAD_THRESHOLD = 0.014;
const MIN_VAD_THRESHOLD = 0.005;
const MAX_VAD_THRESHOLD = 0.04;

export interface MicQualityWarning {
  currentDevice: string;
  message: string;
  recommendedDevice: string | null;
}

function splitCombo(combo: string): string[] {
  return combo
    .split("+")
    .map((part) => part.trim().toUpperCase())
    .filter(Boolean);
}

function getComboMainKey(combo: string): string | null {
  const tokens = splitCombo(combo);
  const main = tokens.find(
    (token) => !["CTRL", "CONTROL", "SHIFT", "ALT", "OPTION", "META", "SUPER", "CMD"].includes(token)
  );
  return main ?? null;
}

function eventMatchesMainKey(event: KeyboardEvent, mainKey: string): boolean {
  if (mainKey === "SPACE") {
    return event.code === "Space" || event.key === " ";
  }
  return event.key.toUpperCase() === mainKey;
}

function isEditableTarget(target: EventTarget | null): boolean {
  const element = target as HTMLElement | null;
  if (!element) {
    return false;
  }
  return element.tagName === "INPUT" || element.tagName === "TEXTAREA" || element.isContentEditable;
}

function comboMatchesKeyboardEvent(event: KeyboardEvent, combo: string): boolean {
  const tokens = splitCombo(combo);
  if (tokens.length === 0) {
    return false;
  }

  const expectsCtrl = tokens.includes("CTRL") || tokens.includes("CONTROL");
  const expectsAlt = tokens.includes("ALT") || tokens.includes("OPTION");
  const expectsShift = tokens.includes("SHIFT");
  const expectsMeta = tokens.includes("META") || tokens.includes("SUPER") || tokens.includes("CMD");

  if (event.ctrlKey !== expectsCtrl) {
    return false;
  }
  if (event.altKey !== expectsAlt) {
    return false;
  }
  if (event.shiftKey !== expectsShift) {
    return false;
  }
  if (event.metaKey !== expectsMeta) {
    return false;
  }

  const main = tokens.find(
    (token) => !["CTRL", "CONTROL", "SHIFT", "ALT", "OPTION", "META", "SUPER", "CMD"].includes(token)
  );
  if (!main) {
    return false;
  }

  if (main === "SPACE") {
    return event.code === "Space" || event.key === " ";
  }

  return event.key.toUpperCase() === main;
}

function clampVadThreshold(value: number): number {
  if (!Number.isFinite(value)) {
    return RECOMMENDED_VAD_THRESHOLD;
  }
  return Math.min(MAX_VAD_THRESHOLD, Math.max(MIN_VAD_THRESHOLD, value));
}

function clampMaxUtteranceMs(value: number): number {
  if (!Number.isFinite(value)) {
    return DEFAULT_MAX_UTTERANCE_MS;
  }
  return Math.round(Math.min(MAX_MAX_UTTERANCE_MS, Math.max(MIN_MAX_UTTERANCE_MS, value)));
}

function clampReleaseTailMs(value: number): number {
  if (!Number.isFinite(value)) {
    return DEFAULT_RELEASE_TAIL_MS;
  }
  return Math.round(Math.min(MAX_RELEASE_TAIL_MS, Math.max(MIN_RELEASE_TAIL_MS, value)));
}

function normalizeSettings(settings: VoiceWaveSettings): VoiceWaveSettings {
  return {
    ...settings,
    vadThreshold: clampVadThreshold(settings.vadThreshold),
    maxUtteranceMs: clampMaxUtteranceMs(settings.maxUtteranceMs ?? DEFAULT_MAX_UTTERANCE_MS),
    releaseTailMs: clampReleaseTailMs(settings.releaseTailMs ?? DEFAULT_RELEASE_TAIL_MS),
    decodeMode: settings.decodeMode ?? DEFAULT_DECODE_MODE,
    diagnosticsOptIn: settings.diagnosticsOptIn ?? false
  };
}

function normalizeDeviceLabel(value: string): string {
  return value.trim().toLowerCase();
}

function isLikelyLowQualityMic(deviceName: string): boolean {
  const normalized = normalizeDeviceLabel(deviceName);
  return (
    normalized.includes("hands-free") ||
    normalized.includes("hand free") ||
    normalized.includes("bluetooth headset") ||
    normalized.includes("headset") ||
    normalized.includes("hfp") ||
    normalized.includes("ag audio") ||
    normalized.includes("sco")
  );
}

function findRecommendedInputDevice(
  deviceNames: string[],
  currentDevice: string | null
): string | null {
  const current = currentDevice ? normalizeDeviceLabel(currentDevice) : null;
  const candidates = deviceNames.filter((name) => normalizeDeviceLabel(name) !== current);
  const preferred = candidates.find((name) => !isLikelyLowQualityMic(name));
  return preferred ?? null;
}

function deriveModelStatuses(
  catalog: ModelCatalogItem[],
  installed: InstalledModel[],
  activeModel: string,
  previous: Record<string, ModelStatus>
): Record<string, ModelStatus> {
  const installedMap = new Map(installed.map((row) => [row.modelId, row]));
  const next: Record<string, ModelStatus> = {};
  for (const item of catalog) {
    const prior = previous[item.modelId];
    if (prior && (prior.state === "downloading" || prior.state === "failed" || prior.state === "cancelled")) {
      next[item.modelId] = { ...prior, active: item.modelId === activeModel };
      continue;
    }
    const installedModel = installedMap.get(item.modelId) ?? null;
      next[item.modelId] = {
        modelId: item.modelId,
        state: installedModel ? "installed" : "idle",
        progress: installedModel ? 100 : 0,
        active: item.modelId === activeModel,
        installed: Boolean(installedModel),
        message: installedModel ? "Installed and checksum verified." : "Not installed.",
        installedModel,
        downloadedBytes: installedModel ? installedModel.sizeBytes : 0,
        totalBytes: item.sizeBytes,
        resumable: false
      };
  }
  return next;
}

export function useVoiceWave() {
  const [snapshot, setSnapshot] = useState<VoiceWaveSnapshot>(fallbackSnapshot);
  const [settings, setSettings] = useState<VoiceWaveSettings>(fallbackSettings);
  const [hotkeys, setHotkeys] = useState<HotkeySnapshot>(fallbackHotkeys);
  const [permissions, setPermissions] = useState<PermissionSnapshot>(fallbackPermissions);
  const [inputDevices, setInputDevices] = useState<string[]>([]);
  const [micLevel, setMicLevel] = useState(0);
  const [micLevelError, setMicLevelError] = useState<string | null>(null);
  const [audioQualityReport, setAudioQualityReport] = useState<AudioQualityReport | null>(null);
  const [lastLatency, setLastLatency] = useState<LatencyBreakdownEvent | null>(null);
  const [diagnosticsStatus, setDiagnosticsStatus] =
    useState<DiagnosticsStatus>(fallbackDiagnosticsStatus);
  const [lastDiagnosticsExport, setLastDiagnosticsExport] =
    useState<DiagnosticsExportResult | null>(null);
  const [recentInsertions, setRecentInsertions] = useState<RecentInsertion[]>([]);
  const [lastInsertion, setLastInsertion] = useState<InsertResult | null>(null);
  const [lastHotkeyEvent, setLastHotkeyEvent] = useState<HotkeyEvent | null>(null);

  const [modelCatalog, setModelCatalog] = useState<ModelCatalogItem[]>(fallbackModelCatalog);
  const [installedModels, setInstalledModels] = useState<InstalledModel[]>([]);
  const [modelStatuses, setModelStatuses] = useState<Record<string, ModelStatus>>(
    deriveModelStatuses(
      fallbackModelCatalog,
      [],
      fallbackSettings.activeModel,
      {}
    )
  );
  const [benchmarkResults, setBenchmarkResults] = useState<BenchmarkRun | null>(null);
  const [modelRecommendation, setModelRecommendation] = useState<ModelRecommendation | null>(null);
  const [modelSpeeds, setModelSpeeds] = useState<Record<string, number>>({});
  const speedSamples = useRef<Record<string, { bytes: number; time: number }>>({});

  const [historyPolicy, setHistoryPolicy] = useState<RetentionPolicy>("days30");
  const [sessionHistory, setSessionHistory] = useState<SessionHistoryRecord[]>([]);
  const [dictionaryQueue, setDictionaryQueue] = useState<DictionaryQueueItem[]>([]);
  const [dictionaryTerms, setDictionaryTerms] = useState<DictionaryTerm[]>([]);

  const [tauriAvailable] = useState<boolean>(() => canUseTauri());
  const [isBusy, setIsBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const timeoutHandles = useRef<number[]>([]);
  const pushToTalkLatchedRef = useRef(false);
  const autoModelSelectionTriggeredRef = useRef(false);

  const clearWebTimers = useCallback(() => {
    timeoutHandles.current.forEach((timeoutId) => {
      window.clearTimeout(timeoutId);
    });
    timeoutHandles.current = [];
  }, []);

  const refreshRecentInsertions = useCallback(async () => {
    if (!tauriAvailable) {
      return;
    }
    try {
      setRecentInsertions(await getRecentInsertions(8));
    } catch (refreshErr) {
      setError(refreshErr instanceof Error ? refreshErr.message : "Failed to load recent insertions");
    }
  }, [tauriAvailable]);

  const refreshInputDevices = useCallback(async () => {
    if (!tauriAvailable) {
      return;
    }
    try {
      const devices = await listInputDevices();
      setInputDevices(devices);
    } catch (deviceErr) {
      setError(deviceErr instanceof Error ? deviceErr.message : "Failed to list input devices");
    }
  }, [tauriAvailable]);

  const refreshPhase3Data = useCallback(async (activeModelOverride?: string) => {
    if (!tauriAvailable) {
      return;
    }
    try {
      const [catalogRows, installedRows, historyRows, queueRows, termRows, benchmark] = await Promise.all([
        listModelCatalog(),
        listInstalledModels(),
        getSessionHistory({ includeFailed: true, limit: 50 }),
        getDictionaryQueue(50),
        getDictionaryTerms(),
        getBenchmarkResults()
      ]);
      setModelCatalog(catalogRows);
      setInstalledModels(installedRows);
      setModelStatuses((prev) =>
        deriveModelStatuses(catalogRows, installedRows, activeModelOverride ?? settings.activeModel, prev)
      );
      setSessionHistory(historyRows);
      setDictionaryQueue(queueRows);
      setDictionaryTerms(termRows);
      setBenchmarkResults(benchmark);
      if (benchmark) {
        try {
          setModelRecommendation(await recommendModel());
        } catch {
          setModelRecommendation(null);
        }
      }
    } catch (loadErr) {
      setError(loadErr instanceof Error ? loadErr.message : "Failed to load Phase III data.");
    }
  }, [settings.activeModel, tauriAvailable]);

  const runWebFixtureDemo = useCallback(() => {
    clearWebTimers();
    setError(null);
    setIsBusy(true);
    setSnapshot((prev) => ({ ...prev, state: "listening", lastPartial: null, lastFinal: null }));

    timeoutHandles.current.push(
      window.setTimeout(() => {
        setSnapshot((prev) => ({ ...prev, state: "transcribing", lastPartial: "phase three model manager" }));
      }, 700)
    );

    timeoutHandles.current.push(
      window.setTimeout(() => {
        setSnapshot((prev) => ({
          ...prev,
          state: "inserted",
          lastFinal: "phase three controls are wired and ready",
          lastPartial: null
        }));
      }, 1700)
    );

    timeoutHandles.current.push(
      window.setTimeout(() => {
        setSnapshot((prev) => ({ ...prev, state: "idle" }));
        setIsBusy(false);
      }, 2400)
    );
  }, [clearWebTimers]);

  const ensureDictationModelReady = useCallback(async () => {
    const activeInstalled = installedModels.some((row) => row.modelId === settings.activeModel);
    if (activeInstalled) {
      return settings.activeModel;
    }

    if (settings.activeModel.startsWith("fw-")) {
      const fwStatus = await downloadModel({ modelId: settings.activeModel });
      setModelStatuses((prev) => ({ ...prev, [settings.activeModel]: fwStatus }));
      if (fwStatus.state === "installed") {
        await refreshPhase3Data(settings.activeModel);
        return settings.activeModel;
      }
    }

    const preferredInstalledOrder = [
      "fw-small.en",
      "fw-large-v3",
      "tiny.en",
      "base.en",
      "small.en",
      "medium.en"
    ];
    const installedSet = new Set(installedModels.map((row) => row.modelId));
    const fallbackInstalled =
      preferredInstalledOrder.find((modelId) => installedSet.has(modelId)) ??
      installedModels[0]?.modelId ??
      null;

    if (fallbackInstalled) {
      const nextSettings = normalizeSettings(await setActiveModel(fallbackInstalled));
      setSettings(nextSettings);
      setSnapshot((prev) => ({ ...prev, activeModel: nextSettings.activeModel }));
      await refreshPhase3Data(nextSettings.activeModel);
      return nextSettings.activeModel;
    }

    const bootstrapModelId =
      modelCatalog.find((row) => row.modelId === "fw-small.en")?.modelId ??
      modelCatalog.find((row) => row.modelId === "tiny.en")?.modelId ??
      modelCatalog[0]?.modelId ??
      null;
    if (!bootstrapModelId) {
      throw new Error("No models are available in catalog. Open Models and refresh runtime state.");
    }

    const status = await downloadModel({ modelId: bootstrapModelId });
    setModelStatuses((prev) => ({ ...prev, [bootstrapModelId]: status }));
    if (status.state !== "installed") {
      throw new Error(status.message ?? `Model install did not complete (${status.state}).`);
    }

    const nextSettings = normalizeSettings(await setActiveModel(bootstrapModelId));
    setSettings(nextSettings);
    setSnapshot((prev) => ({ ...prev, activeModel: nextSettings.activeModel }));
    await refreshPhase3Data(nextSettings.activeModel);
    return nextSettings.activeModel;
  }, [installedModels, modelCatalog, refreshPhase3Data, settings.activeModel]);

  const runDictation = useCallback(
    async (mode: DictationMode = "microphone") => {
      if (!tauriAvailable) {
        runWebFixtureDemo();
        return;
      }

      try {
        if (mode === "microphone") {
          const permissionSnapshot = await requestMicrophoneAccess();
          setPermissions(permissionSnapshot);
          if (permissionSnapshot.microphone !== "granted") {
            setError(
              permissionSnapshot.message ??
                "Microphone access is not ready. Check Windows privacy + audio device settings."
            );
            setSnapshot((prev) => ({ ...prev, state: "error" }));
            return;
          }
        }

        await ensureDictationModelReady();
        setError(null);
        setIsBusy(true);
        await startDictation(mode);
      } catch (runErr) {
        const message = runErr instanceof Error ? runErr.message : "Unable to start dictation";
        if (message.includes("not installed as a local model artifact")) {
          try {
            await refreshPhase3Data();
          } catch {
            // ignore refresh failures and keep original error
          }
        }
        setError(message);
        setSnapshot((prev) => ({ ...prev, state: "error" }));
      } finally {
        setTimeout(() => setIsBusy(false), 800);
      }
    },
    [ensureDictationModelReady, refreshPhase3Data, runWebFixtureDemo, tauriAvailable]
  );

  const stopDictation = useCallback(async () => {
    if (!tauriAvailable) {
      clearWebTimers();
      setSnapshot((prev) => ({ ...prev, state: "idle", lastPartial: null }));
      setIsBusy(false);
      return;
    }
    try {
      await stopDictationCommand();
      setIsBusy(false);
    } catch (cancelErr) {
      setError(cancelErr instanceof Error ? cancelErr.message : "Unable to stop dictation");
    }
  }, [clearWebTimers, tauriAvailable]);

  const applyHotkeyAction = useCallback(
    async (action: "toggleDictation" | "pushToTalk", phase: "pressed" | "released" | "triggered") => {
      if (tauriAvailable) {
        try {
          await triggerHotkeyAction(action, phase);
        } catch (hotkeyErr) {
          setError(hotkeyErr instanceof Error ? hotkeyErr.message : "Hotkey action failed");
        }
        return;
      }

      if (action === "toggleDictation" && phase === "triggered") {
        if (snapshot.state === "listening" || snapshot.state === "transcribing") {
          await stopDictation();
        } else {
          await runDictation("fixture");
        }
      }

      if (action === "pushToTalk" && phase === "pressed") {
        await runDictation("fixture");
      }
      if (action === "pushToTalk" && phase === "released") {
        await stopDictation();
      }
    },
    [runDictation, snapshot.state, stopDictation, tauriAvailable]
  );

  const setVadThreshold = useCallback(
    async (value: number) => {
      const clampedThreshold = clampVadThreshold(value);
      const nextSettings = { ...settings, vadThreshold: clampedThreshold };
      setSettings(nextSettings);
      if (!tauriAvailable) {
        return;
      }
      try {
        setSettings(normalizeSettings(await updateSettings(nextSettings)));
      } catch (persistErr) {
        setError(persistErr instanceof Error ? persistErr.message : "Failed to save settings");
      }
    },
    [settings, tauriAvailable]
  );

  const resetVadThreshold = useCallback(async () => {
    await setVadThreshold(RECOMMENDED_VAD_THRESHOLD);
  }, [setVadThreshold]);

  const setMaxUtteranceMs = useCallback(
    async (value: number) => {
      const nextSettings = normalizeSettings({ ...settings, maxUtteranceMs: value });
      setSettings(nextSettings);
      if (!tauriAvailable) {
        return;
      }
      try {
        setSettings(normalizeSettings(await updateSettings(nextSettings)));
      } catch (persistErr) {
        setError(
          persistErr instanceof Error ? persistErr.message : "Failed to save max utterance setting"
        );
      }
    },
    [settings, tauriAvailable]
  );

  const setReleaseTailMs = useCallback(
    async (value: number) => {
      const nextSettings = normalizeSettings({ ...settings, releaseTailMs: value });
      setSettings(nextSettings);
      if (!tauriAvailable) {
        return;
      }
      try {
        setSettings(normalizeSettings(await updateSettings(nextSettings)));
      } catch (persistErr) {
        setError(
          persistErr instanceof Error ? persistErr.message : "Failed to save release tail setting"
        );
      }
    },
    [settings, tauriAvailable]
  );

  const setDecodeMode = useCallback(
    async (mode: DecodeMode) => {
      const nextSettings = normalizeSettings({ ...settings, decodeMode: mode });
      setSettings(nextSettings);
      if (!tauriAvailable) {
        return;
      }
      try {
        setSettings(normalizeSettings(await updateSettings(nextSettings)));
      } catch (persistErr) {
        setError(persistErr instanceof Error ? persistErr.message : "Failed to save decode mode");
      }
    },
    [settings, tauriAvailable]
  );

  const setInputDevice = useCallback(
    async (deviceName: string | null) => {
      const nextSettings = { ...settings, inputDevice: deviceName };
      setSettings(nextSettings);
      if (!tauriAvailable) {
        return;
      }
      try {
        setSettings(normalizeSettings(await updateSettings(nextSettings)));
        await stopMicLevelMonitor();
        await startMicLevelMonitor();
        await refreshInputDevices();
      } catch (persistErr) {
        setError(persistErr instanceof Error ? persistErr.message : "Failed to update input device");
      }
    },
    [refreshInputDevices, settings, tauriAvailable]
  );

  const switchToRecommendedInput = useCallback(async () => {
    const candidate = findRecommendedInputDevice(inputDevices, settings.inputDevice);
    if (!candidate) {
      setError("No higher-quality microphone candidate was detected. Try a wired or built-in mic.");
      return;
    }
    await setInputDevice(candidate);
  }, [inputDevices, setInputDevice, settings.inputDevice]);

  const setPreferClipboardFallback = useCallback(
    async (enabled: boolean) => {
      const nextSettings = { ...settings, preferClipboardFallback: enabled };
      setSettings(nextSettings);
      if (!tauriAvailable) {
        return;
      }
      try {
        setSettings(normalizeSettings(await updateSettings(nextSettings)));
      } catch (persistErr) {
        setError(persistErr instanceof Error ? persistErr.message : "Failed to save insertion preference");
      }
    },
    [settings, tauriAvailable]
  );

  const setDiagnosticsOptIn = useCallback(
    async (enabled: boolean) => {
      setSettings((prev) => ({ ...prev, diagnosticsOptIn: enabled }));
      if (!tauriAvailable) {
        setDiagnosticsStatus((prev) => ({ ...prev, optIn: enabled }));
        return;
      }
      try {
        const status = await setDiagnosticsOptInCommand(enabled);
        setDiagnosticsStatus(status);
        setSettings((prev) => ({ ...prev, diagnosticsOptIn: status.optIn }));
      } catch (persistErr) {
        setError(
          persistErr instanceof Error ? persistErr.message : "Failed to update diagnostics opt-in"
        );
      }
    },
    [tauriAvailable]
  );

  const exportDiagnosticsBundle = useCallback(async () => {
    if (!tauriAvailable) {
      setError("Diagnostics export requires desktop runtime (tauri).");
      return;
    }
    try {
      setError(null);
      const result = await exportDiagnosticsBundleCommand();
      setLastDiagnosticsExport(result);
      setDiagnosticsStatus(await getDiagnosticsStatus());
    } catch (diagnosticErr) {
      setError(
        diagnosticErr instanceof Error ? diagnosticErr.message : "Diagnostics export failed"
      );
    }
  }, [tauriAvailable]);

  const updateHotkeys = useCallback(
    async (config: HotkeyConfig) => {
      setHotkeys((prev) => ({ ...prev, config }));
      setSettings((prev) => ({ ...prev, toggleHotkey: config.toggle, pushToTalkHotkey: config.pushToTalk }));
      if (!tauriAvailable) {
        return;
      }
      try {
        setHotkeys(await updateHotkeyConfig(config));
      } catch (hotkeyErr) {
        setError(hotkeyErr instanceof Error ? hotkeyErr.message : "Failed to update hotkeys");
      }
    },
    [tauriAvailable]
  );

  const requestMicAccess = useCallback(async () => {
    if (!tauriAvailable) {
      setPermissions((prev) => ({ ...prev, microphone: "granted", message: "Web fallback has no OS bridge." }));
      return;
    }
    try {
      setPermissions(await requestMicrophoneAccess());
    } catch (permissionErr) {
      setError(permissionErr instanceof Error ? permissionErr.message : "Failed to request microphone access");
    }
  }, [tauriAvailable]);

  const runAudioQualityDiagnostic = useCallback(async (durationMs = 10_000) => {
    if (!tauriAvailable) {
      setError("Audio quality diagnostics require desktop runtime (tauri).");
      return;
    }
    try {
      setError(null);
      const report = await runAudioQualityDiagnosticCommand(durationMs);
      setAudioQualityReport(report);
    } catch (diagnosticErr) {
      setError(diagnosticErr instanceof Error ? diagnosticErr.message : "Audio quality check failed");
    }
  }, [tauriAvailable]);

  const undoInsertion = useCallback(async () => {
    if (!tauriAvailable) {
      setError("Undo is available in desktop runtime.");
      return;
    }
    try {
      const result = await undoLastInsertion();
      setError(!result.success && result.message ? result.message : null);
      await refreshRecentInsertions();
    } catch (undoErr) {
      setError(undoErr instanceof Error ? undoErr.message : "Undo failed");
    }
  }, [refreshRecentInsertions, tauriAvailable]);

  const insertFinalTranscript = useCallback(async () => {
    if (!snapshot.lastFinal) {
      setError("No final transcript available to insert.");
      return;
    }
    if (!tauriAvailable) {
      setLastInsertion({
        success: true,
        method: "clipboardOnly",
        message: "Web mode insertion is simulated.",
        targetApp: null,
        transactionId: `web-${Date.now()}`,
        undoAvailable: false
      });
      return;
    }
    try {
      const result = await insertText({
        text: snapshot.lastFinal,
        targetApp: null,
        preferClipboard: settings.preferClipboardFallback
      });
      setLastInsertion(result);
      await refreshRecentInsertions();
      await refreshPhase3Data();
    } catch (insertErr) {
      setError(insertErr instanceof Error ? insertErr.message : "Manual insertion failed");
    }
  }, [refreshPhase3Data, refreshRecentInsertions, settings.preferClipboardFallback, snapshot.lastFinal, tauriAvailable]);

  const installModel = useCallback(
    async (modelId: string) => {
      if (!tauriAvailable) {
        setError("Desktop runtime is required to download models. Run npm run tauri:dev.");
        return;
      }
      try {
        setModelStatuses((prev) => ({
          ...prev,
          [modelId]: {
            modelId,
            state: "downloading",
            progress: 5,
            active: false,
            installed: false,
            message: "Preparing signed model download.",
            installedModel: null,
            downloadedBytes: 0,
            totalBytes: modelCatalog.find((item) => item.modelId === modelId)?.sizeBytes ?? null,
            resumable: true
          }
        }));
        const status = await downloadModel({ modelId });
        setModelStatuses((prev) => ({ ...prev, [modelId]: status }));
        await refreshPhase3Data();
      } catch (modelErr) {
        setError(modelErr instanceof Error ? modelErr.message : "Model install failed");
      }
    },
    [modelCatalog, refreshPhase3Data, settings.activeModel, tauriAvailable]
  );

  const cancelModelInstall = useCallback(async (modelId: string) => {
    if (!tauriAvailable) {
      setModelStatuses((prev) => ({
        ...prev,
        [modelId]: {
          ...(prev[modelId] ?? {
            modelId,
            active: false,
            installed: false,
            installedModel: null,
            progress: 0,
            resumable: true
          }),
          state: "cancelled",
          message: "Download cancelled.",
          resumable: true
        }
      }));
      return;
    }
    try {
      const status = await cancelModelDownload(modelId);
      setModelStatuses((prev) => ({ ...prev, [modelId]: status }));
    } catch (modelErr) {
      setError(modelErr instanceof Error ? modelErr.message : "Cancel failed");
    }
  }, [tauriAvailable]);

  const pauseModelInstall = useCallback(async (modelId: string) => {
    if (!tauriAvailable) {
      setModelStatuses((prev) => ({
        ...prev,
        [modelId]: {
          ...(prev[modelId] ?? {
            modelId,
            active: false,
            installed: false,
            installedModel: null,
            progress: 0,
            resumable: true
          }),
          state: "paused",
          message: "Paused in web simulation.",
          resumable: true
        }
      }));
      return;
    }
    try {
      const status = await pauseModelDownload(modelId);
      setModelStatuses((prev) => ({ ...prev, [modelId]: status }));
    } catch (modelErr) {
      setError(modelErr instanceof Error ? modelErr.message : "Pause failed");
    }
  }, [tauriAvailable]);

  const resumeModelInstall = useCallback(async (modelId: string) => {
    if (!tauriAvailable) {
      setModelStatuses((prev) => ({
        ...prev,
        [modelId]: {
          ...(prev[modelId] ?? {
            modelId,
            active: false,
            installed: false,
            installedModel: null,
            progress: 0,
            resumable: true
          }),
          state: "downloading",
          message: "Resumed in web simulation.",
          resumable: true
        }
      }));
      return;
    }
    try {
      const status = await resumeModelDownload(modelId);
      setModelStatuses((prev) => ({ ...prev, [modelId]: status }));
      await refreshPhase3Data();
    } catch (modelErr) {
      setError(modelErr instanceof Error ? modelErr.message : "Resume failed");
    }
  }, [refreshPhase3Data, tauriAvailable]);

  const makeModelActive = useCallback(async (modelId: string) => {
    if (!tauriAvailable) {
      setSettings((prev) => ({ ...prev, activeModel: modelId }));
      setSnapshot((prev) => ({ ...prev, activeModel: modelId }));
      setModelStatuses((prev) => {
        const next = { ...prev };
        for (const key of Object.keys(next)) {
          next[key] = { ...next[key], active: key === modelId };
        }
        return next;
      });
      return;
    }
    try {
      const nextSettings = normalizeSettings(await setActiveModel(modelId));
      setSettings(nextSettings);
      setSnapshot((prev) => ({ ...prev, activeModel: nextSettings.activeModel }));
      await refreshPhase3Data();
    } catch (modelErr) {
      setError(modelErr instanceof Error ? modelErr.message : "Failed to switch active model");
    }
  }, [refreshPhase3Data, tauriAvailable]);

  const runBenchmarkAndRecommend = useCallback(async () => {
    if (!tauriAvailable) {
      const run: BenchmarkRun = {
        startedAtUtcMs: Date.now() - 1200,
        completedAtUtcMs: Date.now(),
        rows: [
          { modelId: "small.en", runs: 3, p50LatencyMs: 260, p95LatencyMs: 420, averageRtf: 0.41 },
          { modelId: "base.en", runs: 3, p50LatencyMs: 200, p95LatencyMs: 330, averageRtf: 0.33 }
        ]
      };
      setBenchmarkResults(run);
      setModelRecommendation({
        modelId: "base.en",
        reason: "Best model under configured latency and RTF gates.",
        p95LatencyMs: 330,
        averageRtf: 0.33,
        meetsLatencyGate: true,
        meetsRtfGate: true
      });
      return;
    }
    try {
      if (installedModels.length === 0) {
        setError("Install at least one model before running benchmark.");
        return;
      }

      const benchmarkRequest = {
        modelIds: installedModels.map((model) => model.modelId)
      };
      const run = await runModelBenchmark(benchmarkRequest);
      setBenchmarkResults(run);

      const recommendation = await recommendModel();
      setModelRecommendation(recommendation);

      const recommendedInstalled = installedModels.some(
        (model) => model.modelId === recommendation.modelId
      );
      if (recommendedInstalled && recommendation.modelId !== settings.activeModel) {
        const nextSettings = normalizeSettings(await setActiveModel(recommendation.modelId));
        setSettings(nextSettings);
        setSnapshot((prev) => ({ ...prev, activeModel: nextSettings.activeModel }));
        await refreshPhase3Data(nextSettings.activeModel);
      }
    } catch (benchmarkErr) {
      setError(benchmarkErr instanceof Error ? benchmarkErr.message : "Benchmark flow failed");
    }
  }, [installedModels, refreshPhase3Data, settings.activeModel, tauriAvailable]);

  const updateRetentionPolicy = useCallback(async (policy: RetentionPolicy) => {
    if (!tauriAvailable) {
      setHistoryPolicy(policy);
      if (policy === "off") {
        setSessionHistory([]);
      }
      return;
    }
    try {
      setHistoryPolicy(await setHistoryRetention(policy));
      await refreshPhase3Data();
    } catch (historyErr) {
      setError(historyErr instanceof Error ? historyErr.message : "Failed to update retention");
    }
  }, [refreshPhase3Data, tauriAvailable]);

  const pruneHistory = useCallback(async () => {
    if (!tauriAvailable) {
      setSessionHistory((prev) => prev.slice(0, 20));
      return;
    }
    try {
      await pruneHistoryNow();
      await refreshPhase3Data();
    } catch (historyErr) {
      setError(historyErr instanceof Error ? historyErr.message : "Failed to prune history");
    }
  }, [refreshPhase3Data, tauriAvailable]);

  const clearSessionHistory = useCallback(async () => {
    if (!tauriAvailable) {
      setSessionHistory([]);
      return;
    }
    try {
      await clearHistory();
      await refreshPhase3Data();
    } catch (historyErr) {
      setError(historyErr instanceof Error ? historyErr.message : "Failed to clear history");
    }
  }, [refreshPhase3Data, tauriAvailable]);

  const approveDictionaryQueueEntry = useCallback(async (entryId: string, normalizedText?: string) => {
    if (!tauriAvailable) {
      const item = dictionaryQueue.find((entry) => entry.entryId === entryId);
      if (!item) {
        return;
      }
      setDictionaryQueue((prev) => prev.filter((entry) => entry.entryId !== entryId));
      setDictionaryTerms((prev) => [...prev, { termId: `dt-${Date.now()}`, term: (normalizedText ?? item.term).trim(), source: "queue-approval", createdAtUtcMs: Date.now() }]);
      return;
    }
    try {
      await approveDictionaryEntry(entryId, normalizedText);
      await refreshPhase3Data();
    } catch (dictionaryErr) {
      setError(dictionaryErr instanceof Error ? dictionaryErr.message : "Failed to approve term");
    }
  }, [dictionaryQueue, refreshPhase3Data, tauriAvailable]);

  const rejectDictionaryQueueEntry = useCallback(async (entryId: string) => {
    if (!tauriAvailable) {
      setDictionaryQueue((prev) => prev.filter((entry) => entry.entryId !== entryId));
      return;
    }
    try {
      await rejectDictionaryEntry(entryId);
      await refreshPhase3Data();
    } catch (dictionaryErr) {
      setError(dictionaryErr instanceof Error ? dictionaryErr.message : "Failed to reject term");
    }
  }, [refreshPhase3Data, tauriAvailable]);

  const deleteDictionaryTerm = useCallback(async (termId: string) => {
    if (!tauriAvailable) {
      setDictionaryTerms((prev) => prev.filter((term) => term.termId !== termId));
      return;
    }
    try {
      await removeDictionaryTerm(termId);
      await refreshPhase3Data();
    } catch (dictionaryErr) {
      setError(dictionaryErr instanceof Error ? dictionaryErr.message : "Failed to remove term");
    }
  }, [refreshPhase3Data, tauriAvailable]);

  useEffect(() => {
    if (!tauriAvailable) {
      setSessionHistory([
        {
          recordId: "hist-web-1",
          timestampUtcMs: Date.now() - 10000,
          preview: "Phase three panel wiring is ready for desktop integration.",
          method: "clipboardOnly",
          success: true,
          source: "insertion",
          message: "Web-mode simulation"
        }
      ]);
      setDictionaryQueue([{ entryId: "dq-web-1", term: "VoiceWave", sourcePreview: "Prototype note", createdAtUtcMs: Date.now() - 5000 }]);
      setDictionaryTerms([{ termId: "dt-web-1", term: "whisper.cpp", source: "seed", createdAtUtcMs: Date.now() - 20000 }]);
      return;
    }

    let stateUnlisten: (() => void) | null = null;
    let transcriptUnlisten: (() => void) | null = null;
    let insertionUnlisten: (() => void) | null = null;
    let permissionUnlisten: (() => void) | null = null;
    let hotkeyUnlisten: (() => void) | null = null;
    let modelUnlisten: (() => void) | null = null;
    let micLevelUnlisten: (() => void) | null = null;
    let audioQualityUnlisten: (() => void) | null = null;
    let latencyUnlisten: (() => void) | null = null;

    void (async () => {
      try {
        const [
          loadedSnapshot,
          loadedSettings,
          loadedHotkeys,
          permissionSnapshot,
          insertionRows,
          devices,
          diagnostics
        ] = await Promise.all([
          loadSnapshot(),
          loadSettings(),
          loadHotkeyConfig(),
          getPermissionSnapshot(),
          getRecentInsertions(8),
          listInputDevices(),
          getDiagnosticsStatus()
        ]);
        const safeLoadedSettings = normalizeSettings({
          ...loadedSettings,
          diagnosticsOptIn: diagnostics.optIn
        });
        setSnapshot(loadedSnapshot);
        setSettings(safeLoadedSettings);
        setDiagnosticsStatus(diagnostics);
        setHotkeys(loadedHotkeys);
        setPermissions(permissionSnapshot);
        setRecentInsertions(insertionRows);
        setInputDevices(devices);
        await refreshPhase3Data(safeLoadedSettings.activeModel);
      } catch (loadErr) {
        setError(loadErr instanceof Error ? loadErr.message : "Failed to initialize VoiceWave runtime.");
      }

      try {
        await startMicLevelMonitor();
      } catch (monitorErr) {
        setMicLevelError(
          monitorErr instanceof Error ? monitorErr.message : "Mic level monitor failed to start."
        );
      }

      stateUnlisten = await listenVoicewaveState(({ message, state }) => {
        setSnapshot((prev) => ({ ...prev, state }));
        if (state === "error" && message) {
          setError(message);
        } else if (state !== "error") {
          setError(null);
        }
      });

      transcriptUnlisten = await listenVoicewaveTranscript((event) => {
        setSnapshot((prev) => ({
          ...prev,
          lastPartial: event.isFinal ? prev.lastPartial : event.text,
          lastFinal: event.isFinal ? event.text : prev.lastFinal
        }));
      });

      insertionUnlisten = await listenVoicewaveInsertion((result) => {
        setLastInsertion(result);
        void refreshRecentInsertions();
        void refreshPhase3Data();
      });

      permissionUnlisten = await listenVoicewavePermission((payload) => {
        setPermissions(payload);
      });

      hotkeyUnlisten = await listenVoicewaveHotkey((payload) => {
        setLastHotkeyEvent(payload);
      });

      modelUnlisten = await listenVoicewaveModel((payload: ModelEvent) => {
        if (typeof payload.downloadedBytes === "number") {
          const now = Date.now();
          const last = speedSamples.current[payload.modelId];
          if (last && now > last.time && payload.downloadedBytes >= last.bytes) {
            const deltaBytes = payload.downloadedBytes - last.bytes;
            const deltaSeconds = (now - last.time) / 1000;
            const speed = deltaSeconds > 0 ? deltaBytes / deltaSeconds : 0;
            setModelSpeeds((prev) => ({ ...prev, [payload.modelId]: speed }));
          }
          speedSamples.current[payload.modelId] = {
            bytes: payload.downloadedBytes,
            time: now
          };
        }
        setModelStatuses((prev) => ({
          ...prev,
          [payload.modelId]: {
            ...(prev[payload.modelId] ?? {
              modelId: payload.modelId,
              active: settings.activeModel === payload.modelId,
              installed: false,
              installedModel: null,
              progress: 0,
              resumable: true
            }),
            state: payload.state,
            progress: payload.progress,
            message: payload.message ?? null,
            downloadedBytes: payload.downloadedBytes ?? null,
            totalBytes: payload.totalBytes ?? null,
            resumable: payload.state !== "installed"
          }
        }));
      });

      micLevelUnlisten = await listenVoicewaveMicLevel((payload: MicLevelEvent) => {
        const level = Math.max(0, Math.min(payload.level ?? 0, 1));
        setMicLevel(level);
        setMicLevelError(payload.error ?? null);
      });

      audioQualityUnlisten = await listenVoicewaveAudioQuality((payload: AudioQualityReport) => {
        setAudioQualityReport(payload);
      });

      latencyUnlisten = await listenVoicewaveLatency((payload: LatencyBreakdownEvent) => {
        setLastLatency(payload);
      });
    })();

    return () => {
      if (stateUnlisten) {
        stateUnlisten();
      }
      if (transcriptUnlisten) {
        transcriptUnlisten();
      }
      if (insertionUnlisten) {
        insertionUnlisten();
      }
      if (permissionUnlisten) {
        permissionUnlisten();
      }
      if (hotkeyUnlisten) {
        hotkeyUnlisten();
      }
      if (modelUnlisten) {
        modelUnlisten();
      }
      if (micLevelUnlisten) {
        micLevelUnlisten();
      }
      if (audioQualityUnlisten) {
        audioQualityUnlisten();
      }
      if (latencyUnlisten) {
        latencyUnlisten();
      }
      if (tauriAvailable) {
        void stopMicLevelMonitor();
      }
    };
  }, [refreshPhase3Data, refreshRecentInsertions, settings.activeModel, tauriAvailable]);

  useEffect(() => {
    return () => {
      clearWebTimers();
    };
  }, [clearWebTimers]);

  useEffect(() => {
    const toggleMainKey = getComboMainKey(hotkeys.config.toggle);
    const pushMainKey = getComboMainKey(hotkeys.config.pushToTalk);

    const shouldSuppress = (event: KeyboardEvent): boolean => {
      if (isEditableTarget(event.target)) {
        return false;
      }
      if (
        comboMatchesKeyboardEvent(event, hotkeys.config.toggle) ||
        comboMatchesKeyboardEvent(event, hotkeys.config.pushToTalk)
      ) {
        return true;
      }
      if (
        event.key === " " &&
        (event.ctrlKey || event.altKey || event.metaKey || event.shiftKey)
      ) {
        return true;
      }
      if (toggleMainKey && eventMatchesMainKey(event, toggleMainKey) && (event.ctrlKey || event.altKey || event.metaKey)) {
        return true;
      }
      if (pushMainKey && eventMatchesMainKey(event, pushMainKey) && (event.ctrlKey || event.altKey || event.metaKey)) {
        return true;
      }
      return false;
    };

    const onKeyDown = (event: KeyboardEvent) => {
      if (!shouldSuppress(event)) {
        return;
      }
      event.preventDefault();
      event.stopPropagation();
    };

    const onKeyUp = (event: KeyboardEvent) => {
      if (!shouldSuppress(event)) {
        return;
      }
      event.preventDefault();
      event.stopPropagation();
    };

    window.addEventListener("keydown", onKeyDown);
    window.addEventListener("keyup", onKeyUp);
    return () => {
      window.removeEventListener("keydown", onKeyDown);
      window.removeEventListener("keyup", onKeyUp);
    };
  }, [hotkeys.config.pushToTalk, hotkeys.config.toggle]);

  useEffect(() => {
    if (tauriAvailable) {
      return () => {
        pushToTalkLatchedRef.current = false;
      };
    }

    const pushMainKey = getComboMainKey(hotkeys.config.pushToTalk);
    const releasePushToTalk = () => {
      if (!pushToTalkLatchedRef.current) {
        return;
      }
      pushToTalkLatchedRef.current = false;
      void applyHotkeyAction("pushToTalk", "released");
    };

    const onKeyDown = (event: KeyboardEvent) => {
      if (isEditableTarget(event.target)) {
        return;
      }
      if (!event.repeat && comboMatchesKeyboardEvent(event, hotkeys.config.toggle)) {
        event.preventDefault();
        void applyHotkeyAction("toggleDictation", "triggered");
        return;
      }
      if (!event.repeat && comboMatchesKeyboardEvent(event, hotkeys.config.pushToTalk)) {
        event.preventDefault();
        if (!pushToTalkLatchedRef.current) {
          pushToTalkLatchedRef.current = true;
          void applyHotkeyAction("pushToTalk", "pressed");
        }
      }
    };

    const onKeyUp = (event: KeyboardEvent) => {
      if (!pushToTalkLatchedRef.current || !pushMainKey) {
        return;
      }
      if (eventMatchesMainKey(event, pushMainKey)) {
        event.preventDefault();
        releasePushToTalk();
      }
    };

    const onWindowBlur = () => {
      releasePushToTalk();
    };

    const onVisibilityChange = () => {
      if (document.hidden) {
        releasePushToTalk();
      }
    };

    window.addEventListener("keydown", onKeyDown);
    window.addEventListener("keyup", onKeyUp);
    window.addEventListener("blur", onWindowBlur);
    document.addEventListener("visibilitychange", onVisibilityChange);
    return () => {
      window.removeEventListener("keydown", onKeyDown);
      window.removeEventListener("keyup", onKeyUp);
      window.removeEventListener("blur", onWindowBlur);
      document.removeEventListener("visibilitychange", onVisibilityChange);
      pushToTalkLatchedRef.current = false;
    };
  }, [applyHotkeyAction, hotkeys.config.pushToTalk, hotkeys.config.toggle, tauriAvailable]);

  useEffect(() => {
    if (!tauriAvailable) {
      return;
    }
    if (autoModelSelectionTriggeredRef.current) {
      return;
    }
    if (benchmarkResults) {
      autoModelSelectionTriggeredRef.current = true;
      return;
    }
    if (installedModels.length < 2) {
      return;
    }
    if (snapshot.state !== "idle") {
      return;
    }

    autoModelSelectionTriggeredRef.current = true;
    void runBenchmarkAndRecommend();
  }, [
    benchmarkResults,
    installedModels.length,
    runBenchmarkAndRecommend,
    snapshot.state,
    tauriAvailable
  ]);

  const activeState: VoiceWaveHudState = useMemo(() => snapshot.state, [snapshot.state]);
  const micQualityWarning = useMemo<MicQualityWarning | null>(() => {
    const selectedInput = settings.inputDevice;
    if (!selectedInput || !isLikelyLowQualityMic(selectedInput)) {
      return null;
    }

    const suggestedInput = findRecommendedInputDevice(inputDevices, selectedInput);
    const thresholdNeedsReset = settings.vadThreshold > RECOMMENDED_VAD_THRESHOLD + 0.004;
    const tuningMessage = thresholdNeedsReset
      ? ` VAD is also set high (${settings.vadThreshold.toFixed(3)}), which can suppress words.`
      : "";

    return {
      currentDevice: selectedInput,
      recommendedDevice: suggestedInput,
      message:
        "Selected microphone appears to be a headset/hands-free profile, which often hurts transcript quality." +
        tuningMessage
    };
  }, [inputDevices, settings.inputDevice, settings.vadThreshold]);

  return {
    snapshot,
    settings,
    hotkeys,
    permissions,
    inputDevices,
    micLevel,
    micLevelError,
    audioQualityReport,
    lastLatency,
    diagnosticsStatus,
    lastDiagnosticsExport,
    recentInsertions,
    lastInsertion,
    lastHotkeyEvent,
    modelCatalog,
    installedModels,
    modelStatuses,
    benchmarkResults,
    modelRecommendation,
    modelSpeeds,
    historyPolicy,
    sessionHistory,
    dictionaryQueue,
    dictionaryTerms,
    tauriAvailable,
    activeState,
    micQualityWarning,
    isBusy,
    error,
    runDictation,
    stopDictation,
    setInputDevice,
    switchToRecommendedInput,
    setVadThreshold,
    resetVadThreshold,
    setMaxUtteranceMs,
    setReleaseTailMs,
    setDecodeMode,
    setDiagnosticsOptIn,
    exportDiagnosticsBundle,
    recommendedVadThreshold: RECOMMENDED_VAD_THRESHOLD,
    setPreferClipboardFallback,
    updateHotkeys,
    requestMicAccess,
    runAudioQualityDiagnostic,
    undoInsertion,
    insertFinalTranscript,
    installModel,
    cancelModelInstall,
    pauseModelInstall,
    resumeModelInstall,
    makeModelActive,
    runBenchmarkAndRecommend,
    updateRetentionPolicy,
    pruneHistory,
    clearSessionHistory,
    approveDictionaryQueueEntry,
    rejectDictionaryQueueEntry,
    deleteDictionaryTerm,
    refreshPhase3Data,
    refreshInputDevices
  };
}

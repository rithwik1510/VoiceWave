import { fireEvent, render, screen, within } from "@testing-library/react";
import { describe, expect, it, vi } from "vitest";
import App from "./App";
import * as hookModule from "./hooks/useVoiceWave";

function buildHookMock(overrides: Record<string, unknown> = {}) {
  return {
    activeState: "idle",
    approveDictionaryQueueEntry: vi.fn(),
    benchmarkResults: null,
    cancelModelInstall: vi.fn(),
    clearSessionHistory: vi.fn(),
    diagnosticsStatus: {
      optIn: false,
      recordCount: 0,
      lastExportPath: null,
      lastExportedAtUtcMs: null,
      watchdogRecoveryCount: 0
    },
    deleteDictionaryTerm: vi.fn(),
    dictionaryQueue: [],
    dictionaryTerms: [],
    error: null,
    exportDiagnosticsBundle: vi.fn(),
    historyPolicy: "days30",
    hotkeys: {
      config: { toggle: "Ctrl+Alt+X", pushToTalk: "Ctrl+Windows" },
      conflicts: [],
      registrationSupported: true,
      registrationError: null
    },
    inputDevices: [],
    insertFinalTranscript: vi.fn(),
    installModel: vi.fn(),
    installedModels: [],
    lastHotkeyEvent: null,
    lastInsertion: null,
    makeModelActive: vi.fn(),
    modelCatalog: [],
    modelRecommendation: null,
    modelSpeeds: {},
    modelStatuses: {},
    lastDiagnosticsExport: null,
    lastLatency: null,
    permissions: { microphone: "granted", insertionCapability: "available", message: null },
    micLevel: 0,
    micLevelError: null,
    audioQualityReport: null,
    micQualityWarning: null,
    pauseModelInstall: vi.fn(),
    pruneHistory: vi.fn(),
    recentInsertions: [],
    refreshPhase3Data: vi.fn(),
    refreshInputDevices: vi.fn(),
    resumeModelInstall: vi.fn(),
    rejectDictionaryQueueEntry: vi.fn(),
    requestMicAccess: vi.fn(),
    runAudioQualityDiagnostic: vi.fn(),
    runBenchmarkAndRecommend: vi.fn(),
    runDictation: vi.fn(),
    sessionHistory: [],
    setDiagnosticsOptIn: vi.fn(),
    setInputDevice: vi.fn(),
    setMaxUtteranceMs: vi.fn(),
    setReleaseTailMs: vi.fn(),
    setDecodeMode: vi.fn(),
    setPreferClipboardFallback: vi.fn(),
    setVadThreshold: vi.fn(),
    resetVadThreshold: vi.fn(),
    settings: {
      inputDevice: null,
      activeModel: "fw-small.en",
      showFloatingHud: false,
      vadThreshold: 0.014,
      maxUtteranceMs: 30000,
      releaseTailMs: 350,
      decodeMode: "balanced",
      diagnosticsOptIn: false,
      toggleHotkey: "Ctrl+Alt+X",
      pushToTalkHotkey: "Ctrl+Windows",
      preferClipboardFallback: false
    },
    switchToRecommendedInput: vi.fn(),
    recommendedVadThreshold: 0.014,
    snapshot: {
      state: "idle",
      lastPartial: null,
      lastFinal: null,
      activeModel: "fw-small.en"
    },
    stopDictation: vi.fn(),
    tauriAvailable: false,
    undoInsertion: vi.fn(),
    updateHotkeys: vi.fn(),
    updateRetentionPolicy: vi.fn(),
    ...overrides
  };
}

describe("App navigation and phase three panels", () => {
  it("switches between home, models, sessions, and dictionary tabs", async () => {
    render(<App />);

    expect(screen.getByText("Good morning, Rishi.")).toBeInTheDocument();
    expect(screen.queryByRole("button", { name: "Run 10s Check" })).not.toBeInTheDocument();

    fireEvent.click(screen.getByRole("button", { name: "Models" }));
    expect(screen.getByText("Model Manager")).toBeInTheDocument();

    fireEvent.click(screen.getByRole("button", { name: "Sessions" }));
    expect(screen.getByText("Session History and Retention")).toBeInTheDocument();

    fireEvent.click(screen.getByRole("button", { name: "Dictionary" }));
    expect(screen.getByText("Personal Dictionary Queue")).toBeInTheDocument();
  });

  it("supports model install action in web fallback mode", async () => {
    render(<App />);

    fireEvent.click(screen.getByRole("button", { name: "Models" }));
    fireEvent.click(screen.getAllByRole("button", { name: "Install" })[0]);

    expect(
      screen.getByText("Desktop runtime is required to download models. Run npm run tauri:dev.")
    ).toBeInTheDocument();
  });

  it("renders long final transcript content without truncating the payload", async () => {
    const longFinalTranscript = Array.from({ length: 120 }, (_, idx) => `token-${idx}`).join(" ");
    const useVoiceWaveSpy = vi
      .spyOn(hookModule, "useVoiceWave")
      .mockReturnValue(
        buildHookMock({
          snapshot: {
            state: "inserted",
            lastPartial: null,
            lastFinal: longFinalTranscript,
            activeModel: "fw-small.en"
          }
        }) as any
      );

    render(<App />);
    expect(screen.getAllByText(longFinalTranscript).length).toBeGreaterThan(0);

    useVoiceWaveSpy.mockRestore();
  });

  it("renders diagnostics controls in settings and triggers opt-in and export actions", async () => {
    const setDiagnosticsOptIn = vi.fn();
    const exportDiagnosticsBundle = vi.fn();
    const useVoiceWaveSpy = vi
      .spyOn(hookModule, "useVoiceWave")
      .mockReturnValue(
        buildHookMock({
          tauriAvailable: true,
          diagnosticsStatus: {
            optIn: false,
            recordCount: 4,
            lastExportPath: null,
            lastExportedAtUtcMs: null,
            watchdogRecoveryCount: 1
          },
          setDiagnosticsOptIn,
          exportDiagnosticsBundle
        }) as any
      );

    render(<App />);
    fireEvent.click(screen.getByRole("button", { name: "Settings" }));

    const settingsDialog = screen.getByRole("dialog", { name: "Settings" });
    expect(within(settingsDialog).getByText("Diagnostics")).toBeInTheDocument();
    fireEvent.click(within(settingsDialog).getByRole("checkbox", { name: "Enable diagnostics" }));
    expect(setDiagnosticsOptIn).toHaveBeenCalledWith(true);

    fireEvent.click(within(settingsDialog).getByRole("button", { name: "Export Diagnostics Bundle" }));
    expect(exportDiagnosticsBundle).toHaveBeenCalledTimes(1);

    useVoiceWaveSpy.mockRestore();
  });

  it("keeps advanced settings collapsed until explicitly expanded", async () => {
    render(<App />);
    fireEvent.click(screen.getByRole("button", { name: "Settings" }));

    const settingsDialog = screen.getByRole("dialog", { name: "Settings" });
    expect(within(settingsDialog).getByText("Advanced")).toBeInTheDocument();
    expect(within(settingsDialog).queryByText("Release Tail (ms)")).not.toBeInTheDocument();

    fireEvent.click(within(settingsDialog).getByRole("button", { name: /advanced/i }));
    expect(within(settingsDialog).getByText("Release Tail (ms)")).toBeInTheDocument();
  });

  it("opens style and help as separate popups", async () => {
    render(<App />);

    fireEvent.click(screen.getByRole("button", { name: "Style" }));
    expect(screen.getByRole("dialog", { name: "Style" })).toBeInTheDocument();

    fireEvent.click(screen.getByRole("button", { name: "Close Style" }));
    fireEvent.click(screen.getByRole("button", { name: "Help" }));
    expect(screen.getByRole("dialog", { name: "Help" })).toBeInTheDocument();
  });

  it("collapses and expands the sidebar shell", async () => {
    render(<App />);

    fireEvent.click(screen.getByRole("button", { name: "Collapse sidebar" }));
    expect(screen.getByRole("button", { name: "Expand sidebar" })).toBeInTheDocument();
  });
});

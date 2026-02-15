import { ChevronDown, CircleHelp, Palette, X } from "lucide-react";
import { type ReactNode, useEffect, useMemo, useRef, useState } from "react";
import { useVoiceWave } from "./hooks/useVoiceWave";
import { THEMES } from "./prototype/constants";
import { Dashboard } from "./prototype/components/Dashboard";
import { Layout } from "./prototype/components/Layout";
import type { DictationState } from "./prototype/types";
import type { RetentionPolicy } from "./types/voicewave";

type OverlayPanel = "style" | "settings" | "help";

function formatDate(ts: number): string {
  return new Date(ts).toLocaleString();
}

function formatBytes(bytes: number): string {
  if (bytes >= 1024 * 1024) {
    return `${(bytes / (1024 * 1024)).toFixed(2)} MB`;
  }
  if (bytes >= 1024) {
    return `${(bytes / 1024).toFixed(1)} KB`;
  }
  return `${bytes} B`;
}

function policyLabel(policy: RetentionPolicy): string {
  if (policy === "off") {
    return "Off";
  }
  if (policy === "days7") {
    return "7 Days";
  }
  if (policy === "days30") {
    return "30 Days";
  }
  return "Forever";
}

interface OverlayModalProps {
  title: string;
  subtitle: string;
  onClose: () => void;
  children: ReactNode;
}

function OverlayModal({ title, subtitle, onClose, children }: OverlayModalProps) {
  return (
    <div
      className="vw-modal-backdrop"
      onMouseDown={(event) => {
        if (event.currentTarget === event.target) {
          onClose();
        }
      }}
    >
      <section className="vw-modal-card max-w-3xl" role="dialog" aria-modal="true" aria-label={title}>
        <header className="vw-modal-header">
          <div>
            <h3 className="text-xl font-semibold text-[#09090B]">{title}</h3>
            <p className="mt-1 text-sm text-[#71717A]">{subtitle}</p>
          </div>
          <button type="button" className="vw-modal-close" onClick={onClose} aria-label={`Close ${title}`}>
            <X size={16} />
          </button>
        </header>
        <div className="vw-modal-body">{children}</div>
      </section>
    </div>
  );
}

function App() {
  const theme = THEMES.A;
  const [activeNav, setActiveNav] = useState("home");
  const [activeOverlay, setActiveOverlay] = useState<OverlayPanel | null>(null);
  const [settingsAdvancedOpen, setSettingsAdvancedOpen] = useState(false);
  const {
    activeState,
    approveDictionaryQueueEntry,
    benchmarkResults,
    cancelModelInstall,
    clearSessionHistory,
    diagnosticsStatus,
    deleteDictionaryTerm,
    dictionaryQueue,
    dictionaryTerms,
    error,
    exportDiagnosticsBundle,
    historyPolicy,
    inputDevices,
    installModel,
    installedModels,
    makeModelActive,
    modelCatalog,
    modelRecommendation,
    modelSpeeds,
    modelStatuses,
    lastDiagnosticsExport,
    lastLatency,
    permissions,
    audioQualityReport,
    micQualityWarning,
    pauseModelInstall,
    pruneHistory,
    refreshPhase3Data,
    refreshInputDevices,
    resumeModelInstall,
    rejectDictionaryQueueEntry,
    requestMicAccess,
    runAudioQualityDiagnostic,
    runBenchmarkAndRecommend,
    runDictation,
    sessionHistory,
    setDiagnosticsOptIn,
    setInputDevice,
    setMaxUtteranceMs,
    setReleaseTailMs,
    setPreferClipboardFallback,
    setVadThreshold,
    resetVadThreshold,
    settings,
    switchToRecommendedInput,
    recommendedVadThreshold,
    snapshot,
    stopDictation,
    tauriAvailable,
    updateRetentionPolicy
  } = useVoiceWave();

  const status = useMemo<DictationState>(() => activeState, [activeState]);
  const isRecording = status === "listening" || status === "transcribing";
  const installedModelSet = useMemo(
    () => new Set(installedModels.map((row) => row.modelId)),
    [installedModels]
  );
  const pressActiveRef = useRef(false);

  const isOverlayNav = (value: string): value is OverlayPanel =>
    value === "style" || value === "settings" || value === "help";

  const closeOverlay = () => {
    setActiveOverlay(null);
    setSettingsAdvancedOpen(false);
  };

  const handlePressStart = () => {
    if (isRecording) {
      return;
    }
    pressActiveRef.current = true;
    void runDictation(tauriAvailable ? "microphone" : "fixture");
  };

  const handlePressEnd = () => {
    if (!pressActiveRef.current) {
      return;
    }
    pressActiveRef.current = false;
    void stopDictation();
  };

  const handleNavChange = (nextNav: string) => {
    if (isOverlayNav(nextNav)) {
      pressActiveRef.current = false;
      setActiveOverlay(nextNav);
      return;
    }

    if (nextNav === activeNav) {
      return;
    }
    // Prevent stale press-and-hold state from surviving page switches.
    pressActiveRef.current = false;
    closeOverlay();
    setActiveNav(nextNav);
  };

  useEffect(() => {
    if (!activeOverlay) {
      return;
    }

    const onKeyDown = (event: KeyboardEvent) => {
      if (event.key === "Escape") {
        closeOverlay();
      }
    };

    const previousOverflow = document.body.style.overflow;
    document.body.style.overflow = "hidden";
    window.addEventListener("keydown", onKeyDown);
    return () => {
      document.body.style.overflow = previousOverflow;
      window.removeEventListener("keydown", onKeyDown);
    };
  }, [activeOverlay]);

  const retentionOptions: RetentionPolicy[] = ["off", "days7", "days30", "forever"];

  return (
    <>
      <Layout
        theme={theme}
        activeNav={activeNav}
        activePopupNav={activeOverlay}
        setActiveNav={handleNavChange}
        isRecording={isRecording}
      >
        <div key={activeNav} className="vw-page-shell">
          {activeNav === "home" && (
            <>
              {!tauriAvailable && (
                <div className="mb-6 rounded-2xl border border-[#f3c2c2] bg-[#fff1f1] px-4 py-3 text-sm text-[#a94444]">
                  Desktop runtime is not connected. Run <span className="font-mono">npm run tauri:dev</span> to
                  enable real microphone dictation and model downloads.
                </div>
              )}
              <Dashboard
                theme={theme}
                status={status}
                onPressStart={handlePressStart}
                onPressEnd={handlePressEnd}
                currentModel={settings.activeModel}
                partialTranscript={snapshot.lastPartial}
                finalTranscript={snapshot.lastFinal}
                pushToTalkHotkey={settings.pushToTalkHotkey}
              />
            </>
          )}

          {activeNav === "models" && (
            <>
              <section className="vw-panel vw-panel-soft">
              <div className="flex flex-wrap items-start justify-between gap-3">
                <div>
                  <p className="vw-kicker">Phase III</p>
                  <h3 className="text-lg font-semibold text-[#09090B]">Model Manager</h3>
                  <p className="mt-1 text-sm text-[#71717A]">
                    Windows-only local model install, checksum verification, benchmark, and activation.
                  </p>
                </div>
                <button type="button" className="vw-btn-secondary" onClick={() => void refreshPhase3Data()}>
                  Refresh
                </button>
              </div>

              <div className="mt-4 grid grid-cols-1 gap-3 md:grid-cols-4">
                <div className="vw-stat-card">
                  <p className="vw-kicker">Catalog Models</p>
                  <p className="mt-1 text-2xl font-semibold text-[#09090B]">{modelCatalog.length}</p>
                </div>
                <div className="vw-stat-card">
                  <p className="vw-kicker">Installed</p>
                  <p className="mt-1 text-2xl font-semibold text-[#09090B]">{installedModels.length}</p>
                </div>
                <div className="vw-stat-card">
                  <p className="vw-kicker">Active Model</p>
                  <p className="mt-1 text-lg font-semibold text-[#09090B]">{settings.activeModel}</p>
                </div>
                <div className="vw-stat-card">
                  <p className="vw-kicker">Recommendation</p>
                  <p className="mt-1 text-lg font-semibold text-[#09090B]">
                    {modelRecommendation?.modelId ?? "Pending"}
                  </p>
                </div>
              </div>

              <div className="vw-list-stagger mt-4 space-y-3">
                {modelCatalog.map((model) => {
                  const statusRow = modelStatuses[model.modelId];
                  const isInstalled = installedModelSet.has(model.modelId);
                  const canInstall =
                    !isInstalled &&
                    statusRow?.state !== "downloading" &&
                    statusRow?.state !== "paused";
                  const installLabel =
                    statusRow?.state === "failed" || statusRow?.state === "cancelled"
                      ? "Retry"
                      : "Install";
                  return (
                    <div
                      key={model.modelId}
                      className="vw-interactive-row rounded-2xl border border-[#E4E4E7] bg-white px-4 py-3 flex flex-wrap items-center justify-between gap-3"
                    >
                      <div>
                        <div className="flex flex-wrap items-center gap-2">
                          <p className="text-sm font-semibold text-[#09090B]">{model.displayName}</p>
                          <span className="vw-chip">
                            {statusRow?.state ?? (isInstalled ? "installed" : "idle")}
                          </span>
                        </div>
                        <p className="text-xs text-[#71717A] mt-1">
                          v{model.version} | {formatBytes(model.sizeBytes)}
                        </p>
                        <p className="text-[11px] text-[#71717A] mt-1">License: {model.license}</p>
                        {typeof statusRow?.downloadedBytes === "number" &&
                          typeof statusRow?.totalBytes === "number" &&
                          statusRow.totalBytes > 0 &&
                          statusRow.state !== "installed" && (
                            <p className="text-[11px] text-[#71717A] mt-1">
                              {formatBytes(statusRow.downloadedBytes)} / {formatBytes(statusRow.totalBytes)}
                              {statusRow.state === "downloading" &&
                                typeof modelSpeeds[model.modelId] === "number" && (
                                  <span className="ml-2">
                                    {formatBytes(Math.round(modelSpeeds[model.modelId]))}/s
                                  </span>
                                )}
                            </p>
                          )}
                        {statusRow?.message && <p className="text-xs text-[#71717A] mt-1">{statusRow.message}</p>}
                      </div>
                      <div className="flex flex-wrap gap-2">
                        {canInstall && (
                          <button
                            type="button"
                            className="vw-btn-primary"
                            onClick={() => void installModel(model.modelId)}
                          >
                            {installLabel}
                          </button>
                        )}
                        {statusRow?.state === "downloading" && (
                          <button
                            type="button"
                            className="vw-btn-secondary"
                            onClick={() => void pauseModelInstall(model.modelId)}
                          >
                            Pause
                          </button>
                        )}
                        {statusRow?.state === "paused" && (
                          <button
                            type="button"
                            className="vw-btn-secondary"
                            onClick={() => void resumeModelInstall(model.modelId)}
                          >
                            Resume
                          </button>
                        )}
                        {(statusRow?.state === "downloading" ||
                          statusRow?.state === "paused" ||
                          statusRow?.state === "failed" ||
                          statusRow?.state === "cancelled") && (
                          <button
                            type="button"
                            className="vw-btn-danger"
                            onClick={() => void cancelModelInstall(model.modelId)}
                          >
                            Cancel
                          </button>
                        )}
                        {isInstalled && (
                          <button
                            type="button"
                            className={settings.activeModel === model.modelId ? "vw-btn-primary" : "vw-btn-secondary"}
                            onClick={() => void makeModelActive(model.modelId)}
                          >
                            {settings.activeModel === model.modelId ? "Active" : "Make Active"}
                          </button>
                        )}
                      </div>
                    </div>
                  );
                })}
              </div>
              </section>

              <section className="vw-panel mt-8">
              <div className="flex flex-wrap items-center justify-between gap-3">
                <div>
                  <h3 className="text-lg font-semibold text-[#09090B]">Benchmark Recommendation</h3>
                  <p className="mt-1 text-sm text-[#71717A]">
                    Runs local benchmark and recommends the best model under default gates.
                  </p>
                </div>
                <button type="button" className="vw-btn-primary" onClick={() => void runBenchmarkAndRecommend()}>
                  Run Benchmark
                </button>
              </div>

              {modelRecommendation && (
                <div className="mt-4 rounded-2xl border border-[#E4E4E7] bg-[#FAFAFA] px-4 py-3">
                  <p className="text-sm font-semibold text-[#09090B]">
                    Recommended: {modelRecommendation.modelId}
                  </p>
                  <p className="text-xs text-[#71717A]">{modelRecommendation.reason}</p>
                </div>
              )}

              {benchmarkResults && (
                <div className="mt-4 overflow-x-auto rounded-2xl border border-[#E4E4E7]">
                  <table className="w-full text-left text-sm">
                    <thead className="bg-[#FAFAFA] text-[#71717A]">
                      <tr>
                        <th className="px-3 py-2">Model</th>
                        <th className="px-3 py-2">P50</th>
                        <th className="px-3 py-2">P95</th>
                        <th className="px-3 py-2">Avg RTF</th>
                      </tr>
                    </thead>
                    <tbody>
                      {benchmarkResults.rows.map((row) => (
                        <tr key={row.modelId} className="border-t border-[#E4E4E7] text-[#09090B]">
                          <td className="px-3 py-2">{row.modelId}</td>
                          <td className="px-3 py-2">{row.p50LatencyMs} ms</td>
                          <td className="px-3 py-2">{row.p95LatencyMs} ms</td>
                          <td className="px-3 py-2">{row.averageRtf.toFixed(2)}</td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              )}
              </section>
            </>
          )}

          {activeNav === "sessions" && (
            <section className="vw-panel vw-panel-soft">
            <h3 className="text-lg font-semibold text-[#09090B]">Session History and Retention</h3>
            <p className="mt-1 text-sm text-[#71717A]">
              Configure retention and review local session history.
            </p>

            <div className="mt-4 grid grid-cols-1 gap-3 md:grid-cols-3">
              <div className="vw-stat-card">
                <p className="vw-kicker">Current Policy</p>
                <p className="mt-1 text-lg font-semibold text-[#09090B]">{policyLabel(historyPolicy)}</p>
              </div>
              <div className="vw-stat-card">
                <p className="vw-kicker">Records</p>
                <p className="mt-1 text-lg font-semibold text-[#09090B]">{sessionHistory.length}</p>
              </div>
              <div className="vw-stat-card">
                <p className="vw-kicker">Success Ratio</p>
                <p className="mt-1 text-lg font-semibold text-[#09090B]">
                  {sessionHistory.length === 0
                    ? "n/a"
                    : `${Math.round(
                        (sessionHistory.filter((record) => record.success).length / sessionHistory.length) * 100
                      )}%`}
                </p>
              </div>
            </div>

            <div className="mt-4 flex flex-wrap gap-2">
              {retentionOptions.map((option) => (
                <button
                  key={option}
                  type="button"
                  className={historyPolicy === option ? "vw-btn-primary" : "vw-btn-secondary"}
                  onClick={() => void updateRetentionPolicy(option)}
                >
                  {policyLabel(option)}
                </button>
              ))}
            </div>

            <div className="mt-4 flex flex-wrap gap-2">
              <button type="button" className="vw-btn-secondary" onClick={() => void pruneHistory()}>
                Prune Now
              </button>
              <button type="button" className="vw-btn-danger" onClick={() => void clearSessionHistory()}>
                Clear All
              </button>
            </div>

            <div className="vw-list-stagger mt-4 space-y-2">
              {sessionHistory.length === 0 && (
                <p className="text-sm text-[#71717A]">No sessions available.</p>
              )}
              {sessionHistory.map((record) => (
                <div
                  key={record.recordId}
                  className="vw-interactive-row rounded-2xl border border-[#E4E4E7] bg-white px-3 py-2"
                >
                  <div className="flex flex-wrap items-center gap-2">
                    <p className="text-sm font-semibold text-[#09090B]">
                      {record.source} / {record.success ? "success" : "failed"}
                    </p>
                    {record.method && <span className="vw-chip">{record.method}</span>}
                  </div>
                  <p className="text-xs text-[#71717A] mt-1">{record.preview}</p>
                  <p className="text-[11px] text-[#A1A1AA] mt-1">{formatDate(record.timestampUtcMs)}</p>
                </div>
              ))}
            </div>
            </section>
          )}

          {activeNav === "dictionary" && (
            <section className="vw-panel">
            <h3 className="text-lg font-semibold text-[#09090B]">Personal Dictionary Queue</h3>
            <p className="mt-1 text-sm text-[#71717A]">
              Approve or reject suggested terms, then manage accepted dictionary entries.
            </p>
            <div className="mt-3 flex flex-wrap gap-2">
              <span className="vw-chip">Queue: {dictionaryQueue.length}</span>
              <span className="vw-chip">Accepted: {dictionaryTerms.length}</span>
            </div>

            <div className="mt-4 grid grid-cols-1 gap-6 lg:grid-cols-2">
              <div className="p-1">
                <h4 className="text-sm font-semibold text-[#09090B]">Queue</h4>
                <div className="vw-list-stagger mt-2 space-y-2">
                  {dictionaryQueue.length === 0 && (
                    <p className="text-sm text-[#71717A]">Queue is empty.</p>
                  )}
                  {dictionaryQueue.map((item) => (
                    <div
                      key={item.entryId}
                      className="vw-interactive-row rounded-xl border border-[#E4E4E7] bg-white px-3 py-2"
                    >
                      <p className="text-sm font-semibold text-[#09090B]">{item.term}</p>
                      <p className="text-xs text-[#71717A] mt-1">{item.sourcePreview}</p>
                      <div className="mt-2 flex gap-2">
                        <button
                          type="button"
                          className="vw-btn-primary text-xs px-3 py-1"
                          onClick={() => void approveDictionaryQueueEntry(item.entryId)}
                        >
                          Approve
                        </button>
                        <button
                          type="button"
                          className="vw-btn-danger text-xs px-3 py-1"
                          onClick={() => void rejectDictionaryQueueEntry(item.entryId)}
                        >
                          Reject
                        </button>
                      </div>
                    </div>
                  ))}
                </div>
              </div>

              <div className="p-1">
                <h4 className="text-sm font-semibold text-[#09090B]">Accepted Terms</h4>
                <div className="vw-list-stagger mt-2 space-y-2">
                  {dictionaryTerms.length === 0 && (
                    <p className="text-sm text-[#71717A]">No accepted terms yet.</p>
                  )}
                  {dictionaryTerms.map((term) => (
                    <div
                      key={term.termId}
                      className="vw-interactive-row rounded-xl border border-[#E4E4E7] bg-white px-3 py-2"
                    >
                      <div className="flex items-center justify-between gap-2">
                        <p className="text-sm font-semibold text-[#09090B]">{term.term}</p>
                        <button
                          type="button"
                          className="vw-btn-danger text-xs px-3 py-1"
                          onClick={() => void deleteDictionaryTerm(term.termId)}
                        >
                          Remove
                        </button>
                      </div>
                      <p className="text-xs text-[#71717A] mt-1">{term.source}</p>
                    </div>
                  ))}
                </div>
              </div>
            </div>
            </section>
          )}

          {activeNav === "snippets" && (
            <section className="vw-panel vw-panel-soft">
              <h3 className="text-lg font-semibold text-[#09090B]">Section Ready</h3>
              <p className="mt-2 text-sm text-[#71717A]">
                This navigation tab is connected and can host additional Phase IV+ features without
                changing the current layout shell.
              </p>
            </section>
          )}
        </div>

        {error && (
          <div className="mt-6 rounded-2xl border border-[#f3c2c2] bg-[#fff1f1] px-4 py-3 text-sm text-[#a94444]">
            {error}
          </div>
        )}
      </Layout>

      {activeOverlay === "settings" && (
        <OverlayModal
          title="Settings"
          subtitle="Essential controls only. Advanced tuning is available on demand."
          onClose={closeOverlay}
        >
          <div className="space-y-5">
            <section className="rounded-2xl border border-[#E4E4E7] bg-white px-4 py-4">
              <div className="flex flex-wrap items-center justify-between gap-3">
                <div>
                  <p className="text-sm font-semibold text-[#09090B]">Microphone Input</p>
                  <p className="text-xs text-[#71717A]">Choose the device used for dictation.</p>
                </div>
                <button type="button" className="vw-btn-secondary" onClick={() => void refreshInputDevices()}>
                  Refresh
                </button>
              </div>
              <div className="mt-3 flex flex-col gap-2">
                <select
                  className="rounded-xl border border-[#E4E4E7] bg-white px-3 py-2 text-sm text-[#09090B]"
                  value={settings.inputDevice ?? ""}
                  onChange={(event) => void setInputDevice(event.target.value ? event.target.value : null)}
                >
                  <option value="">Default system input</option>
                  {inputDevices.map((device) => (
                    <option key={device} value={device}>
                      {device}
                    </option>
                  ))}
                </select>
                {inputDevices.length === 0 && (
                  <p className="text-xs text-[#C45E5E]">No input devices detected.</p>
                )}
              </div>
            </section>

            {micQualityWarning && (
              <section className="rounded-2xl border border-[#E4E4E7] bg-[#FAFAFA] px-4 py-4">
                <p className="text-sm font-semibold text-[#09090B]">Microphone Quality Warning</p>
                <p className="mt-1 text-sm text-[#3F3F46]">{micQualityWarning.message}</p>
                <p className="mt-2 text-xs text-[#71717A]">Current input: {micQualityWarning.currentDevice}</p>
                {micQualityWarning.recommendedDevice && (
                  <p className="mt-1 text-xs text-[#71717A]">
                    Suggested input: {micQualityWarning.recommendedDevice}
                  </p>
                )}
                <div className="mt-3 flex flex-wrap gap-2">
                  {micQualityWarning.recommendedDevice && (
                    <button type="button" className="vw-btn-primary" onClick={() => void switchToRecommendedInput()}>
                      Switch to Suggested Input
                    </button>
                  )}
                  <button type="button" className="vw-btn-secondary" onClick={() => void refreshInputDevices()}>
                    Refresh Devices
                  </button>
                </div>
              </section>
            )}

            <section className="rounded-2xl border border-[#E4E4E7] bg-white px-4 py-4">
              <div className="flex flex-wrap gap-2">
                <span className="vw-chip">Microphone: {permissions.microphone}</span>
                <span className="vw-chip">Insertion: {permissions.insertionCapability}</span>
              </div>
              {permissions.message && <p className="mt-2 text-xs text-[#71717A]">{permissions.message}</p>}
              <div className="mt-4 space-y-3">
                <label className="flex items-center gap-2 text-sm text-[#09090B]">
                  <input
                    type="checkbox"
                    checked={settings.preferClipboardFallback}
                    onChange={(event) => void setPreferClipboardFallback(event.target.checked)}
                  />
                  Prefer clipboard fallback for insertion
                </label>
                <button type="button" className="vw-btn-secondary" onClick={() => void requestMicAccess()}>
                  Check Microphone Permission
                </button>
              </div>
            </section>

            <section className="rounded-2xl border border-[#E4E4E7] bg-white px-4 py-4">
              <p className="text-sm font-semibold text-[#09090B]">Diagnostics</p>
              <div className="mt-3 flex flex-wrap items-center justify-between gap-3">
                <label className="flex items-center gap-2 text-sm text-[#09090B]">
                  <input
                    type="checkbox"
                    checked={settings.diagnosticsOptIn}
                    onChange={(event) => void setDiagnosticsOptIn(event.target.checked)}
                  />
                  Enable diagnostics
                </label>
                <button type="button" className="vw-btn-secondary" onClick={() => void exportDiagnosticsBundle()}>
                  Export Diagnostics Bundle
                </button>
              </div>
              <div className="mt-3 text-xs text-[#71717A]">
                <p>
                  Records: {diagnosticsStatus.recordCount} | Watchdog recoveries:{" "}
                  {diagnosticsStatus.watchdogRecoveryCount}
                </p>
                <p>
                  Last export:{" "}
                  {diagnosticsStatus.lastExportedAtUtcMs
                    ? formatDate(diagnosticsStatus.lastExportedAtUtcMs)
                    : "Never"}
                </p>
              </div>
              {lastDiagnosticsExport && (
                <div className="mt-3 rounded-xl border border-[#E4E4E7] bg-[#FAFAFA] px-3 py-2 text-xs text-[#52525B]">
                  <p>
                    Export complete:{" "}
                    <span className="font-semibold">
                      {formatDate(lastDiagnosticsExport.exportedAtUtcMs)}
                    </span>
                  </p>
                  <p className="mt-1 break-all font-mono">{lastDiagnosticsExport.filePath}</p>
                </div>
              )}
            </section>

            <section className="rounded-2xl border border-[#E4E4E7] bg-white">
              <button
                type="button"
                className="flex w-full items-center justify-between gap-3 px-4 py-4 text-left"
                onClick={() => setSettingsAdvancedOpen((prev) => !prev)}
                aria-expanded={settingsAdvancedOpen}
              >
                <div>
                  <p className="text-sm font-semibold text-[#09090B]">Advanced</p>
                  <p className="text-xs text-[#71717A]">Expert tuning controls for dictation behavior.</p>
                </div>
                <ChevronDown
                  size={16}
                  className={`text-[#71717A] transition-transform ${settingsAdvancedOpen ? "rotate-180" : ""}`}
                />
              </button>
              {settingsAdvancedOpen && (
                <div className="space-y-4 border-t border-[#E4E4E7] px-4 py-4">
                  <div className="grid grid-cols-1 gap-3 md:grid-cols-2">
                    <div className="vw-stat-card">
                      <p className="vw-kicker">VAD Threshold</p>
                      <input
                        className="mt-2 w-full accent-[#18181B]"
                        type="range"
                        min={0.005}
                        max={0.04}
                        step={0.001}
                        value={settings.vadThreshold}
                        onChange={(event) => void setVadThreshold(Number(event.target.value))}
                      />
                      <p className="mt-1 text-base font-semibold text-[#09090B]">
                        {settings.vadThreshold.toFixed(3)}
                      </p>
                      <button
                        type="button"
                        className="vw-btn-secondary mt-2"
                        onClick={() => void resetVadThreshold()}
                      >
                        Reset to {recommendedVadThreshold.toFixed(3)}
                      </button>
                    </div>
                    <div className="vw-stat-card">
                      <p className="vw-kicker">Max Utterance (ms)</p>
                      <input
                        className="mt-2 w-full accent-[#18181B]"
                        type="range"
                        min={5000}
                        max={30000}
                        step={250}
                        value={settings.maxUtteranceMs}
                        onChange={(event) => void setMaxUtteranceMs(Number(event.target.value))}
                      />
                      <p className="mt-1 text-base font-semibold text-[#09090B]">
                        {settings.maxUtteranceMs}
                      </p>
                    </div>
                    <div className="vw-stat-card md:col-span-2">
                      <p className="vw-kicker">Release Tail (ms)</p>
                      <input
                        className="mt-2 w-full accent-[#18181B]"
                        type="range"
                        min={120}
                        max={1500}
                        step={10}
                        value={settings.releaseTailMs}
                        onChange={(event) => void setReleaseTailMs(Number(event.target.value))}
                      />
                      <p className="mt-1 text-base font-semibold text-[#09090B]">{settings.releaseTailMs}</p>
                    </div>
                  </div>
                  <div className="rounded-2xl border border-[#E4E4E7] bg-[#FAFAFA] px-4 py-3">
                    <div className="flex flex-wrap items-center justify-between gap-2">
                      <div>
                        <p className="text-sm font-semibold text-[#09090B]">Audio Chunk Quality</p>
                        <p className="text-xs text-[#71717A]">
                          Run a quick capture quality check with real microphone audio.
                        </p>
                      </div>
                      <button
                        type="button"
                        className="vw-btn-secondary"
                        onClick={() => void runAudioQualityDiagnostic(10_000)}
                      >
                        Run 10s Check
                      </button>
                    </div>
                    {audioQualityReport ? (
                      <div className="mt-3 space-y-1 text-xs text-[#52525B]">
                        <p>
                          Quality: <span className="font-semibold">{audioQualityReport.quality}</span> | Segments:{" "}
                          {audioQualityReport.segmentCount} | Duration:{" "}
                          {(audioQualityReport.durationMs / 1000).toFixed(2)}s
                        </p>
                        <p>
                          RMS: {audioQualityReport.rms.toFixed(3)} | Peak: {audioQualityReport.peak.toFixed(3)} |
                          Clipping: {(audioQualityReport.clippingRatio * 100).toFixed(1)}%
                        </p>
                        <p>
                          Low-energy frames:{" "}
                          {(audioQualityReport.lowEnergyFrameRatio * 100).toFixed(1)}% | SNR proxy:{" "}
                          {audioQualityReport.estimatedSnrDb.toFixed(1)} dB
                        </p>
                      </div>
                    ) : (
                      <p className="mt-3 text-xs text-[#71717A]">No capture diagnostics yet.</p>
                    )}
                    {lastLatency && (
                      <p className="mt-3 text-xs text-[#71717A]">
                        Latest latency: release-to-transcribing {lastLatency.releaseToTranscribingMs} ms, total{" "}
                        {lastLatency.totalMs} ms.
                      </p>
                    )}
                  </div>
                </div>
              )}
            </section>
          </div>
        </OverlayModal>
      )}

      {activeOverlay === "style" && (
        <OverlayModal
          title="Style"
          subtitle="Visual and writing preferences for your workspace."
          onClose={closeOverlay}
        >
          <div className="space-y-4">
            <section className="rounded-2xl border border-[#E4E4E7] bg-white px-4 py-4">
              <div className="flex items-start gap-3">
                <div className="mt-0.5 rounded-full bg-[#F4F4F5] p-2 text-[#18181B]">
                  <Palette size={16} />
                </div>
                <div>
                  <p className="text-sm font-semibold text-[#09090B]">Style Presets</p>
                  <p className="mt-1 text-sm text-[#71717A]">
                    Style customization is queued for a dedicated pass. The current theme is already
                    locked to match the production baseline.
                  </p>
                </div>
              </div>
            </section>
            <section className="rounded-2xl border border-[#E4E4E7] bg-[#FAFAFA] px-4 py-4">
              <p className="text-sm font-semibold text-[#09090B]">Current Theme</p>
              <p className="mt-1 text-xs text-[#71717A]">
                Harmonic v1.0 with high-contrast cards, neutral white surfaces, and focused action styling.
              </p>
            </section>
          </div>
        </OverlayModal>
      )}

      {activeOverlay === "help" && (
        <OverlayModal
          title="Help"
          subtitle="Quick guidance for everyday dictation reliability."
          onClose={closeOverlay}
        >
          <div className="space-y-4">
            <section className="rounded-2xl border border-[#E4E4E7] bg-white px-4 py-4">
              <div className="flex items-start gap-3">
                <div className="mt-0.5 rounded-full bg-[#F4F4F5] p-2 text-[#18181B]">
                  <CircleHelp size={16} />
                </div>
                <div>
                  <p className="text-sm font-semibold text-[#09090B]">Push-to-talk Best Practice</p>
                  <p className="mt-1 text-sm text-[#71717A]">
                    Hold the key first, then speak naturally, then release to transcribe.
                  </p>
                </div>
              </div>
            </section>
            <section className="rounded-2xl border border-[#E4E4E7] bg-white px-4 py-4">
              <p className="text-sm font-semibold text-[#09090B]">Troubleshooting Flow</p>
              <ul className="mt-2 space-y-1 text-sm text-[#71717A]">
                <li>1. Refresh microphone devices.</li>
                <li>2. Switch away from headset hands-free profiles.</li>
                <li>3. Run the 10s audio quality check in Settings Advanced.</li>
              </ul>
            </section>
          </div>
        </OverlayModal>
      )}

    </>
  );
}

export default App;



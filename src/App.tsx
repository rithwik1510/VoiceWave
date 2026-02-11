import { useEffect, useMemo, useRef, useState } from "react";
import { FloatingHud } from "./components/FloatingHud";
import { useVoiceWave } from "./hooks/useVoiceWave";
import { THEMES } from "./prototype/constants";
import { Dashboard } from "./prototype/components/Dashboard";
import { Layout } from "./prototype/components/Layout";
import type { DictationState } from "./prototype/types";
import type { RetentionPolicy } from "./types/voicewave";

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

function App() {
  const theme = THEMES.F;
  const [activeNav, setActiveNav] = useState("home");
  const [toggleHotkeyDraft, setToggleHotkeyDraft] = useState("");
  const [pushToTalkDraft, setPushToTalkDraft] = useState("");
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
    hotkeys,
    inputDevices,
    insertFinalTranscript,
    installModel,
    installedModels,
    lastHotkeyEvent,
    lastInsertion,
    makeModelActive,
    modelCatalog,
    modelRecommendation,
    modelSpeeds,
    modelStatuses,
    lastDiagnosticsExport,
    lastLatency,
    permissions,
    micLevel,
    micLevelError,
    audioQualityReport,
    micQualityWarning,
    pauseModelInstall,
    pruneHistory,
    recentInsertions,
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
    undoInsertion,
    updateHotkeys,
    updateRetentionPolicy
  } = useVoiceWave();

  const status = useMemo<DictationState>(() => activeState, [activeState]);
  const isRecording = status === "listening" || status === "transcribing";
  const installedModelSet = useMemo(
    () => new Set(installedModels.map((row) => row.modelId)),
    [installedModels]
  );
  const pressActiveRef = useRef(false);

  const handlePressStart = () => {
    if (isRecording) {
      return;
    }
    pressActiveRef.current = true;
    void runDictation(tauriAvailable ? "microphone" : "fixture");
  };

  const handlePressEnd = () => {
    if (!pressActiveRef.current && !isRecording) {
      return;
    }
    pressActiveRef.current = false;
    void stopDictation();
  };

  useEffect(() => {
    setToggleHotkeyDraft(settings.toggleHotkey);
    setPushToTalkDraft(settings.pushToTalkHotkey);
  }, [settings.pushToTalkHotkey, settings.toggleHotkey]);

  const retentionOptions: RetentionPolicy[] = ["off", "days7", "days30", "forever"];

  return (
    <>
      <Layout
        theme={theme}
        activeNav={activeNav}
        setActiveNav={setActiveNav}
        isRecording={isRecording}
        status={status}
      >
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
              vadThreshold={settings.vadThreshold}
              partialTranscript={snapshot.lastPartial}
              finalTranscript={snapshot.lastFinal}
              runtimeAvailable={tauriAvailable}
              onVadChange={(value) => void setVadThreshold(value)}
              micLevel={micLevel}
              micLevelError={micLevelError}
              pushToTalkHotkey={settings.pushToTalkHotkey}
            />

            {micQualityWarning && (
              <section className="mt-6 rounded-2xl border border-[#f2d9a8] bg-[#fff8ea] px-4 py-3 text-[#7a5a1d]">
                <p className="text-sm font-semibold">Microphone Quality Warning</p>
                <p className="mt-1 text-sm">{micQualityWarning.message}</p>
                <p className="mt-1 text-xs">Current input: {micQualityWarning.currentDevice}</p>
                {micQualityWarning.recommendedDevice && (
                  <p className="mt-1 text-xs">
                    Suggested input: {micQualityWarning.recommendedDevice}
                  </p>
                )}
                <div className="mt-3 flex flex-wrap gap-2">
                  <button type="button" className="vw-btn-secondary" onClick={() => void refreshInputDevices()}>
                    Refresh Devices
                  </button>
                  {micQualityWarning.recommendedDevice && (
                    <button type="button" className="vw-btn-primary" onClick={() => void switchToRecommendedInput()}>
                      Switch to Suggested Input
                    </button>
                  )}
                  <button type="button" className="vw-btn-secondary" onClick={() => void resetVadThreshold()}>
                    Reset VAD ({recommendedVadThreshold.toFixed(3)})
                  </button>
                </div>
              </section>
            )}

            <section className="mt-6 rounded-2xl border border-[#d8e4df] bg-white px-4 py-3 text-[#1A3832]">
              <div className="flex flex-wrap items-center justify-between gap-2">
                <div>
                  <p className="text-sm font-semibold">Audio Chunk Quality</p>
                  <p className="text-xs text-[#5C7A72]">
                    Uses captured dictation chunks (RMS, clipping, low-energy ratio, SNR proxy).
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
                <div className="mt-3 space-y-1 text-xs text-[#35564f]">
                  <p>
                    Quality: <span className="font-semibold">{audioQualityReport.quality}</span> | Segments:{" "}
                    {audioQualityReport.segmentCount} | Duration:{" "}
                    {(audioQualityReport.durationMs / 1000).toFixed(2)}s
                  </p>
                  <p>
                    RMS: {audioQualityReport.rms.toFixed(3)} | Peak: {audioQualityReport.peak.toFixed(3)} | Clipping:{" "}
                    {(audioQualityReport.clippingRatio * 100).toFixed(1)}%
                  </p>
                  <p>
                    Low-energy frames: {(audioQualityReport.lowEnergyFrameRatio * 100).toFixed(1)}% | SNR proxy:{" "}
                    {audioQualityReport.estimatedSnrDb.toFixed(1)} dB
                  </p>
                  {audioQualityReport.issues.length > 0 && (
                    <p>Issues: {audioQualityReport.issues.join(" | ")}</p>
                  )}
                  {audioQualityReport.recommendations.length > 0 && (
                    <p>Next steps: {audioQualityReport.recommendations.join(" | ")}</p>
                  )}
                </div>
              ) : (
                <p className="mt-3 text-xs text-[#5C7A72]">
                  No capture diagnostics yet. Run the check or perform a dictation.
                </p>
              )}
            </section>

            {lastLatency && (
              <section className="mt-6 rounded-2xl border border-[#d8e4df] bg-white px-4 py-3 text-[#1A3832]">
                <p className="text-sm font-semibold">Last Dictation Latency</p>
                <p className="mt-1 text-xs text-[#5C7A72]">
                  release to transcribing: {lastLatency.releaseToTranscribingMs} ms | decode:{" "}
                  {lastLatency.decodeMs} ms | total: {lastLatency.totalMs} ms ({lastLatency.modelId}/
                  {lastLatency.decodeMode}) | init: {lastLatency.modelInitMs} ms | condition:{" "}
                  {lastLatency.audioConditionMs} ms | compute: {lastLatency.decodeComputeMs} ms |{" "}
                  cache hit: {lastLatency.runtimeCacheHit ? "yes" : "no"}
                </p>
              </section>
            )}

            <section className="mt-8 grid grid-cols-1 gap-6 lg:grid-cols-2">
              <div className="vw-panel">
                <h3 className="text-lg font-semibold text-[#1A3832]">Hotkeys and Input Mode</h3>
                <p className="mt-1 text-sm text-[#5C7A72]">
                  Toggle and push-to-talk bindings power the insertion workflow.
                </p>

                <div className="mt-4 grid gap-3">
                  <label className="vw-kicker">Toggle Dictation</label>
                  <input
                    className="rounded-xl border border-[#d8e4df] px-3 py-2 text-sm text-[#1A3832]"
                    value={toggleHotkeyDraft}
                    onChange={(event) => setToggleHotkeyDraft(event.target.value)}
                  />
                  <label className="vw-kicker">Push To Talk</label>
                  <input
                    className="rounded-xl border border-[#d8e4df] px-3 py-2 text-sm text-[#1A3832]"
                    value={pushToTalkDraft}
                    onChange={(event) => setPushToTalkDraft(event.target.value)}
                  />
                  <button
                    type="button"
                    className="vw-btn-primary mt-2 w-fit"
                    onClick={() =>
                      void updateHotkeys({
                        toggle: toggleHotkeyDraft,
                        pushToTalk: pushToTalkDraft
                      })
                    }
                  >
                    Save Hotkeys
                  </button>
                  {hotkeys.conflicts.length > 0 && (
                    <p className="text-sm text-[#C45E5E]">
                      Conflict detected: {hotkeys.conflicts.join(", ")}
                    </p>
                  )}
                  {lastHotkeyEvent && (
                    <p className="text-xs text-[#5C7A72]">
                      Last hotkey: {lastHotkeyEvent.action} / {lastHotkeyEvent.phase}
                    </p>
                  )}
                </div>
              </div>

              <div className="vw-panel">
                <h3 className="text-lg font-semibold text-[#1A3832]">Insertion Reliability</h3>
                <p className="mt-1 text-sm text-[#5C7A72]">
                  Permission recovery, fallback preference, and undo for latest insertion.
                </p>

                <div className="mt-4 space-y-3">
                  <div className="flex flex-wrap gap-2">
                    <span className="vw-chip">Microphone: {permissions.microphone}</span>
                    <span className="vw-chip">Insertion: {permissions.insertionCapability}</span>
                  </div>
                  {permissions.message && <p className="text-xs text-[#5C7A72]">{permissions.message}</p>}
                  <label className="flex items-center gap-2 text-sm text-[#1A3832]">
                    <input
                      type="checkbox"
                      checked={settings.preferClipboardFallback}
                      onChange={(event) => void setPreferClipboardFallback(event.target.checked)}
                    />
                    Prefer clipboard fallback
                  </label>
                  <div className="flex flex-wrap gap-2">
                    <button type="button" className="vw-btn-secondary" onClick={() => void requestMicAccess()}>
                      Check Mic Permission
                    </button>
                    <button type="button" className="vw-btn-secondary" onClick={() => void insertFinalTranscript()}>
                      Insert Final Transcript
                    </button>
                    <button type="button" className="vw-btn-secondary" onClick={() => void undoInsertion()}>
                      Undo Last Insertion
                    </button>
                  </div>
                  {lastInsertion && (
                    <p className="text-xs text-[#5C7A72]">
                      Last insertion: {lastInsertion.method} /{" "}
                      {lastInsertion.success ? "success" : "needs fallback"}
                      {lastInsertion.message ? ` - ${lastInsertion.message}` : ""}
                    </p>
                  )}
                </div>
              </div>
            </section>

            <section className="vw-panel mt-8">
              <h3 className="text-lg font-semibold text-[#1A3832]">Recent Insertion History</h3>
              <div className="mt-4 space-y-2">
                {recentInsertions.length === 0 && (
                  <p className="text-sm text-[#5C7A72]">No insertion attempts recorded yet.</p>
                )}
                {recentInsertions.map((entry) => (
                  <div key={entry.transactionId} className="rounded-2xl border border-[#e3ece8] px-3 py-2">
                    <p className="text-sm font-semibold text-[#1A3832]">
                      {entry.method} / {entry.success ? "success" : "saved in history"}
                    </p>
                    <p className="text-xs text-[#5C7A72]">{entry.preview}</p>
                  </div>
                ))}
              </div>
            </section>
          </>
        )}

        {activeNav === "models" && (
          <>
            <section className="vw-panel vw-panel-soft">
              <div className="flex flex-wrap items-start justify-between gap-3">
                <div>
                  <p className="vw-kicker">Phase III</p>
                  <h3 className="text-lg font-semibold text-[#1A3832]">Model Manager</h3>
                  <p className="mt-1 text-sm text-[#5C7A72]">
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
                  <p className="mt-1 text-2xl font-semibold text-[#1A3832]">{modelCatalog.length}</p>
                </div>
                <div className="vw-stat-card">
                  <p className="vw-kicker">Installed</p>
                  <p className="mt-1 text-2xl font-semibold text-[#1A3832]">{installedModels.length}</p>
                </div>
                <div className="vw-stat-card">
                  <p className="vw-kicker">Active Model</p>
                  <p className="mt-1 text-lg font-semibold text-[#1A3832]">{settings.activeModel}</p>
                </div>
                <div className="vw-stat-card">
                  <p className="vw-kicker">Recommendation</p>
                  <p className="mt-1 text-lg font-semibold text-[#1A3832]">
                    {modelRecommendation?.modelId ?? "Pending"}
                  </p>
                </div>
              </div>

              <div className="mt-4 space-y-3">
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
                      className="rounded-2xl border border-[#e3ece8] bg-white px-4 py-3 flex flex-wrap items-center justify-between gap-3"
                    >
                      <div>
                        <div className="flex flex-wrap items-center gap-2">
                          <p className="text-sm font-semibold text-[#1A3832]">{model.displayName}</p>
                          <span className="vw-chip">
                            {statusRow?.state ?? (isInstalled ? "installed" : "idle")}
                          </span>
                        </div>
                        <p className="text-xs text-[#5C7A72] mt-1">
                          v{model.version} | {formatBytes(model.sizeBytes)}
                        </p>
                        <p className="text-[11px] text-[#7b9790] mt-1">License: {model.license}</p>
                        {typeof statusRow?.downloadedBytes === "number" &&
                          typeof statusRow?.totalBytes === "number" &&
                          statusRow.totalBytes > 0 &&
                          statusRow.state !== "installed" && (
                            <p className="text-[11px] text-[#7b9790] mt-1">
                              {formatBytes(statusRow.downloadedBytes)} / {formatBytes(statusRow.totalBytes)}
                              {statusRow.state === "downloading" &&
                                typeof modelSpeeds[model.modelId] === "number" && (
                                  <span className="ml-2">
                                    {formatBytes(Math.round(modelSpeeds[model.modelId]))}/s
                                  </span>
                                )}
                            </p>
                          )}
                        {statusRow?.message && <p className="text-xs text-[#5C7A72] mt-1">{statusRow.message}</p>}
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
                  <h3 className="text-lg font-semibold text-[#1A3832]">Benchmark Recommendation</h3>
                  <p className="mt-1 text-sm text-[#5C7A72]">
                    Runs local benchmark and recommends the best model under default gates.
                  </p>
                </div>
                <button type="button" className="vw-btn-primary" onClick={() => void runBenchmarkAndRecommend()}>
                  Run Benchmark
                </button>
              </div>

              {modelRecommendation && (
                <div className="mt-4 rounded-2xl border border-[#d7e7e2] bg-[#f4f9f7] px-4 py-3">
                  <p className="text-sm font-semibold text-[#1A3832]">
                    Recommended: {modelRecommendation.modelId}
                  </p>
                  <p className="text-xs text-[#5C7A72]">{modelRecommendation.reason}</p>
                </div>
              )}

              {benchmarkResults && (
                <div className="mt-4 overflow-x-auto rounded-2xl border border-[#edf4f1]">
                  <table className="w-full text-left text-sm">
                    <thead className="bg-[#f6fbf9] text-[#5C7A72]">
                      <tr>
                        <th className="px-3 py-2">Model</th>
                        <th className="px-3 py-2">P50</th>
                        <th className="px-3 py-2">P95</th>
                        <th className="px-3 py-2">Avg RTF</th>
                      </tr>
                    </thead>
                    <tbody>
                      {benchmarkResults.rows.map((row) => (
                        <tr key={row.modelId} className="border-t border-[#edf4f1] text-[#1A3832]">
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
            <h3 className="text-lg font-semibold text-[#1A3832]">Session History and Retention</h3>
            <p className="mt-1 text-sm text-[#5C7A72]">
              Configure retention and review local session history.
            </p>

            <div className="mt-4 grid grid-cols-1 gap-3 md:grid-cols-3">
              <div className="vw-stat-card">
                <p className="vw-kicker">Current Policy</p>
                <p className="mt-1 text-lg font-semibold text-[#1A3832]">{policyLabel(historyPolicy)}</p>
              </div>
              <div className="vw-stat-card">
                <p className="vw-kicker">Records</p>
                <p className="mt-1 text-lg font-semibold text-[#1A3832]">{sessionHistory.length}</p>
              </div>
              <div className="vw-stat-card">
                <p className="vw-kicker">Success Ratio</p>
                <p className="mt-1 text-lg font-semibold text-[#1A3832]">
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

            <div className="mt-4 space-y-2">
              {sessionHistory.length === 0 && (
                <p className="text-sm text-[#5C7A72]">No sessions available.</p>
              )}
              {sessionHistory.map((record) => (
                <div key={record.recordId} className="rounded-2xl border border-[#e3ece8] bg-white px-3 py-2">
                  <div className="flex flex-wrap items-center gap-2">
                    <p className="text-sm font-semibold text-[#1A3832]">
                      {record.source} / {record.success ? "success" : "failed"}
                    </p>
                    {record.method && <span className="vw-chip">{record.method}</span>}
                  </div>
                  <p className="text-xs text-[#5C7A72] mt-1">{record.preview}</p>
                  <p className="text-[11px] text-[#94ACA6] mt-1">{formatDate(record.timestampUtcMs)}</p>
                </div>
              ))}
            </div>
          </section>
        )}

        {activeNav === "dictionary" && (
          <section className="vw-panel">
            <h3 className="text-lg font-semibold text-[#1A3832]">Personal Dictionary Queue</h3>
            <p className="mt-1 text-sm text-[#5C7A72]">
              Approve or reject suggested terms, then manage accepted dictionary entries.
            </p>
            <div className="mt-3 flex flex-wrap gap-2">
              <span className="vw-chip">Queue: {dictionaryQueue.length}</span>
              <span className="vw-chip">Accepted: {dictionaryTerms.length}</span>
            </div>

            <div className="mt-4 grid grid-cols-1 gap-6 lg:grid-cols-2">
              <div className="rounded-2xl border border-[#e3ece8] bg-[#f8fcfa] p-4">
                <h4 className="text-sm font-semibold text-[#1A3832]">Queue</h4>
                <div className="mt-2 space-y-2">
                  {dictionaryQueue.length === 0 && (
                    <p className="text-sm text-[#5C7A72]">Queue is empty.</p>
                  )}
                  {dictionaryQueue.map((item) => (
                    <div key={item.entryId} className="rounded-xl border border-[#e3ece8] bg-white px-3 py-2">
                      <p className="text-sm font-semibold text-[#1A3832]">{item.term}</p>
                      <p className="text-xs text-[#5C7A72] mt-1">{item.sourcePreview}</p>
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

              <div className="rounded-2xl border border-[#e3ece8] bg-[#f8fcfa] p-4">
                <h4 className="text-sm font-semibold text-[#1A3832]">Accepted Terms</h4>
                <div className="mt-2 space-y-2">
                  {dictionaryTerms.length === 0 && (
                    <p className="text-sm text-[#5C7A72]">No accepted terms yet.</p>
                  )}
                  {dictionaryTerms.map((term) => (
                    <div key={term.termId} className="rounded-xl border border-[#e3ece8] bg-white px-3 py-2">
                      <div className="flex items-center justify-between gap-2">
                        <p className="text-sm font-semibold text-[#1A3832]">{term.term}</p>
                        <button
                          type="button"
                          className="vw-btn-danger text-xs px-3 py-1"
                          onClick={() => void deleteDictionaryTerm(term.termId)}
                        >
                          Remove
                        </button>
                      </div>
                      <p className="text-xs text-[#5C7A72] mt-1">{term.source}</p>
                    </div>
                  ))}
                </div>
              </div>
            </div>
          </section>
        )}

        {activeNav === "settings" && (
          <section className="vw-panel vw-panel-soft">
            <h3 className="text-lg font-semibold text-[#1A3832]">Runtime Settings</h3>
            <p className="mt-1 text-sm text-[#5C7A72]">
              Active model, VAD sensitivity, hotkeys, and insertion fallback behavior.
            </p>
            <div className="mt-4 rounded-2xl border border-[#e3ece8] bg-white px-4 py-3">
              <div className="flex flex-wrap items-center justify-between gap-3">
                <div>
                  <p className="text-sm font-semibold text-[#1A3832]">Microphone Input</p>
                  <p className="text-xs text-[#5C7A72]">Select the device you want VoiceWave to use.</p>
                </div>
                <button
                  type="button"
                  className="vw-btn-secondary"
                  onClick={() => void refreshInputDevices()}
                >
                  Refresh
                </button>
              </div>
              <div className="mt-3 flex flex-col gap-2">
                <select
                  className="rounded-xl border border-[#d8e4df] bg-white px-3 py-2 text-sm text-[#1A3832]"
                  value={settings.inputDevice ?? ""}
                  onChange={(event) =>
                    void setInputDevice(event.target.value ? event.target.value : null)
                  }
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
            </div>
            <div className="mt-4 grid grid-cols-1 gap-3 md:grid-cols-2">
              <div className="vw-stat-card">
                <p className="vw-kicker">Active Model</p>
                <p className="mt-1 text-base font-semibold text-[#1A3832]">{settings.activeModel}</p>
              </div>
              <div className="vw-stat-card">
                <p className="vw-kicker">VAD Threshold</p>
                <p className="mt-1 text-base font-semibold text-[#1A3832]">
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
                <p className="vw-kicker">Performance Mode</p>
                <p className="mt-1 text-base font-semibold text-[#1A3832]">Auto-managed</p>
                <p className="mt-1 text-xs text-[#5C7A72]">
                  Performance mode is managed automatically.
                </p>
              </div>
              <div className="vw-stat-card">
                <p className="vw-kicker">Max Utterance (ms)</p>
                <input
                  className="mt-2 w-full accent-[#2D5B52]"
                  type="range"
                  min={5000}
                  max={30000}
                  step={250}
                  value={settings.maxUtteranceMs}
                  onChange={(event) => void setMaxUtteranceMs(Number(event.target.value))}
                />
                <p className="mt-1 text-base font-semibold text-[#1A3832]">{settings.maxUtteranceMs}</p>
              </div>
              <div className="vw-stat-card">
                <p className="vw-kicker">Release Tail (ms)</p>
                <input
                  className="mt-2 w-full accent-[#2D5B52]"
                  type="range"
                  min={120}
                  max={1500}
                  step={10}
                  value={settings.releaseTailMs}
                  onChange={(event) => void setReleaseTailMs(Number(event.target.value))}
                />
                <p className="mt-1 text-base font-semibold text-[#1A3832]">{settings.releaseTailMs}</p>
              </div>
              <div className="vw-stat-card">
                <p className="vw-kicker">Toggle Hotkey</p>
                <p className="mt-1 text-base font-semibold text-[#1A3832]">{settings.toggleHotkey}</p>
              </div>
              <div className="vw-stat-card">
                <p className="vw-kicker">Push-To-Talk</p>
                <p className="mt-1 text-base font-semibold text-[#1A3832]">{settings.pushToTalkHotkey}</p>
              </div>
              <div className="vw-stat-card md:col-span-2">
                <p className="vw-kicker">Clipboard Fallback</p>
                <p className="mt-1 text-base font-semibold text-[#1A3832]">
                  {settings.preferClipboardFallback ? "Enabled" : "Disabled"}
                </p>
              </div>
              <div className="vw-stat-card md:col-span-2">
                <div className="flex flex-wrap items-center justify-between gap-3">
                  <div>
                    <p className="vw-kicker">Diagnostics Export</p>
                    <p className="mt-1 text-xs text-[#5C7A72]">
                      Opt-in redacted reliability bundle for beta triage. No raw audio or transcript text is exported.
                    </p>
                  </div>
                  <label className="flex items-center gap-2 text-sm text-[#1A3832]">
                    <input
                      type="checkbox"
                      checked={settings.diagnosticsOptIn}
                      onChange={(event) => void setDiagnosticsOptIn(event.target.checked)}
                    />
                    Enable diagnostics
                  </label>
                </div>
                <div className="mt-3 text-xs text-[#5C7A72]">
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
                <div className="mt-3">
                  <button type="button" className="vw-btn-secondary" onClick={() => void exportDiagnosticsBundle()}>
                    Export Diagnostics Bundle
                  </button>
                </div>
                {lastDiagnosticsExport && (
                  <div className="mt-3 rounded-xl border border-[#d8e4df] bg-[#f6fbf9] px-3 py-2 text-xs text-[#35564f]">
                    <p>
                      Export complete:{" "}
                      <span className="font-semibold">{formatDate(lastDiagnosticsExport.exportedAtUtcMs)}</span>
                    </p>
                    <p className="mt-1 break-all font-mono">{lastDiagnosticsExport.filePath}</p>
                  </div>
                )}
              </div>
            </div>
          </section>
        )}

        {(activeNav === "snippets" || activeNav === "style" || activeNav === "help") && (
          <section className="vw-panel vw-panel-soft">
            <h3 className="text-lg font-semibold text-[#1A3832]">Section Ready</h3>
            <p className="mt-2 text-sm text-[#5C7A72]">
              This navigation tab is connected and can host additional Phase IV+ features without
              changing the current layout shell.
            </p>
          </section>
        )}

        {error && (
          <div className="mt-6 rounded-2xl border border-[#f3c2c2] bg-[#fff1f1] px-4 py-3 text-sm text-[#a94444]">
            {error}
          </div>
        )}
      </Layout>

      {settings.showFloatingHud && (
        <FloatingHud state={activeState} partial={snapshot.lastPartial} finalTranscript={snapshot.lastFinal} />
      )}
    </>
  );
}

export default App;

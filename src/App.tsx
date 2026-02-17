import {
  ChevronDown,
  CircleHelp,
  Crown,
  Palette,
  Search,
  Sparkles,
  Star,
  X
} from "lucide-react";
import { type ReactNode, useEffect, useMemo, useRef, useState } from "react";
import { useVoiceWave } from "./hooks/useVoiceWave";
import { THEMES } from "./prototype/constants";
import { Dashboard } from "./prototype/components/Dashboard";
import { Layout } from "./prototype/components/Layout";
import type { DictationState } from "./prototype/types";
import type {
  AppProfileOverrides,
  CodeModeSettings,
  DomainPackId,
  FormatProfile,
  RetentionPolicy,
  VoiceWaveSettings
} from "./types/voicewave";

type OverlayPanel = "style" | "settings" | "help";
type ProToolsMode = "default" | "coding" | "writing" | "study";

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

interface ProToolsPreset {
  formatProfile: FormatProfile;
  domainPacks: DomainPackId[];
  codeMode: CodeModeSettings;
  appProfiles: AppProfileOverrides;
  postProcessingEnabled: boolean;
}

const PRO_TOOLS_MODE_CARDS: Array<{
  id: ProToolsMode;
  title: string;
  description: string;
  highlight: string;
}> = [
  {
    id: "default",
    title: "Default",
    description: "Closest to classic dictation with light cleanup.",
    highlight: "Best for everyday typing without aggressive transforms."
  },
  {
    id: "coding",
    title: "Coding",
    description: "Voice-to-code setup with symbol handling and coding vocabulary.",
    highlight: "Enables Code Mode + coding domain dictionary."
  },
  {
    id: "writing",
    title: "Writing",
    description: "Cleaner prose output for docs, posts, and polished text.",
    highlight: "Uses formal formatting + productivity wording."
  },
  {
    id: "study",
    title: "Study",
    description: "Note-friendly flow for lectures, revision, and summaries.",
    highlight: "Uses concise formatting + student-focused dictionary."
  }
];

function detectProToolsMode(settings: VoiceWaveSettings): ProToolsMode {
  if (
    settings.codeMode.enabled ||
    settings.formatProfile === "code-doc" ||
    settings.activeDomainPacks.includes("coding")
  ) {
    return "coding";
  }

  if (settings.activeDomainPacks.includes("student")) {
    return "study";
  }

  if (
    settings.formatProfile === "academic" ||
    settings.formatProfile === "concise" ||
    settings.activeDomainPacks.includes("productivity")
  ) {
    return "writing";
  }

  return "default";
}

function buildProToolsPreset(mode: ProToolsMode, settings: VoiceWaveSettings): ProToolsPreset {
  switch (mode) {
    case "coding":
      return {
        formatProfile: "code-doc",
        domainPacks: ["coding"],
        codeMode: {
          ...settings.codeMode,
          enabled: true,
          spokenSymbols: true,
          preferredCasing: "camelCase",
          wrapInFencedBlock: false
        },
        appProfiles: {
          ...settings.appProfileOverrides,
          activeTarget: "editor",
          editor: {
            punctuationAggressiveness: 0,
            sentenceCompactness: 0,
            autoListFormatting: false
          }
        },
        postProcessingEnabled: true
      };
    case "writing":
      return {
        formatProfile: "academic",
        domainPacks: ["productivity"],
        codeMode: {
          ...settings.codeMode,
          enabled: false,
          spokenSymbols: true,
          preferredCasing: "preserve",
          wrapInFencedBlock: false
        },
        appProfiles: {
          ...settings.appProfileOverrides,
          activeTarget: "collab",
          collab: {
            punctuationAggressiveness: 2,
            sentenceCompactness: 1,
            autoListFormatting: true
          }
        },
        postProcessingEnabled: true
      };
    case "study":
      return {
        formatProfile: "concise",
        domainPacks: ["student", "productivity"],
        codeMode: {
          ...settings.codeMode,
          enabled: false,
          spokenSymbols: true,
          preferredCasing: "preserve",
          wrapInFencedBlock: false
        },
        appProfiles: {
          ...settings.appProfileOverrides,
          activeTarget: "browser",
          browser: {
            punctuationAggressiveness: 2,
            sentenceCompactness: 2,
            autoListFormatting: true
          }
        },
        postProcessingEnabled: true
      };
    default:
      return {
        formatProfile: "default",
        domainPacks: [],
        codeMode: {
          ...settings.codeMode,
          enabled: false,
          spokenSymbols: true,
          preferredCasing: "preserve",
          wrapInFencedBlock: false
        },
        appProfiles: {
          ...settings.appProfileOverrides,
          activeTarget: "desktop",
          desktop: {
            punctuationAggressiveness: 1,
            sentenceCompactness: 1,
            autoListFormatting: false
          }
        },
        postProcessingEnabled: false
      };
  }
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
  const [historyQuery, setHistoryQuery] = useState("");
  const [historyTag, setHistoryTag] = useState("");
  const [ownerTapCount, setOwnerTapCount] = useState(0);
  const [ownerPassphrase, setOwnerPassphrase] = useState("");
  const [modeApplyPending, setModeApplyPending] = useState<ProToolsMode | null>(null);
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
    entitlement,
    error,
    exportHistoryPreset,
    exportDiagnosticsBundle,
    isOwnerOverride,
    isPro,
    historyPolicy,
    inputDevices,
    installModel,
    installedModels,
    makeModelActive,
    modelCatalog,
    modelRecommendation,
    modelSpeeds,
    modelStatuses,
    lastHistoryExport,
    lastDiagnosticsExport,
    lastLatency,
    openBillingPortal,
    permissions,
    proRequiredFeature,
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
    searchHistory,
    sessionHistory,
    setAppProfiles,
    setCodeModeSettings,
    setDiagnosticsOptIn,
    setDomainPacks,
    setFormatProfile,
    setInputDevice,
    setMaxUtteranceMs,
    setOwnerOverride,
    setReleaseTailMs,
    setPreferClipboardFallback,
    setProPostProcessingEnabled,
    setSessionStarred,
    setVadThreshold,
    addSessionTag,
    resetVadThreshold,
    restorePurchase,
    startProCheckout,
    settings,
    switchToRecommendedInput,
    recommendedVadThreshold,
    snapshot,
    stopDictation,
    tauriAvailable,
    updateRetentionPolicy,
    refreshEntitlement
  } = useVoiceWave();

  const status = useMemo<DictationState>(() => activeState, [activeState]);
  const displayError = useMemo(() => {
    if (!error) {
      return null;
    }
    if (proRequiredFeature) {
      return "This action requires Pro. Free dictation remains fully available.";
    }
    return error;
  }, [error, proRequiredFeature]);
  const isRecording = status === "listening" || status === "transcribing";
  const installedModelSet = useMemo(
    () => new Set(installedModels.map((row) => row.modelId)),
    [installedModels]
  );
  const showOwnerUnlock = ownerTapCount >= 5;
  const pressActiveRef = useRef(false);
  const modeApplyInFlightRef = useRef(false);
  const activeProToolsMode = useMemo(() => detectProToolsMode(settings), [settings]);
  const displayedProToolsMode = modeApplyPending ?? activeProToolsMode;

  useEffect(() => {
    if (proRequiredFeature) {
      setActiveNav("pro");
    }
  }, [proRequiredFeature]);

  useEffect(() => {
    if (!isPro && activeNav === "pro-tools") {
      setActiveNav("pro");
    }
  }, [activeNav, isPro]);

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

    if (nextNav === "pro-tools" && !isPro) {
      setActiveNav("pro");
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

  const applyProToolsMode = async (mode: ProToolsMode) => {
    if (!isPro) {
      setActiveNav("pro");
      return;
    }
    if (modeApplyInFlightRef.current || modeApplyPending) {
      return;
    }
    if (mode === activeProToolsMode) {
      return;
    }

    const preset = buildProToolsPreset(mode, settings);
    modeApplyInFlightRef.current = true;
    setModeApplyPending(mode);
    try {
      await setFormatProfile(preset.formatProfile);
      await setDomainPacks(preset.domainPacks);
      await setCodeModeSettings(preset.codeMode);
      await setAppProfiles(preset.appProfiles);
      await setProPostProcessingEnabled(preset.postProcessingEnabled);
    } catch (err) {
      console.error("Failed to apply Pro Tools mode:", err);
    } finally {
      modeApplyInFlightRef.current = false;
      setModeApplyPending(null);
    }
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

  useEffect(() => {
    if (activeNav === "pro") {
      void refreshEntitlement();
    }
  }, [activeNav, refreshEntitlement]);

  const retentionOptions: RetentionPolicy[] = ["off", "days7", "days30", "forever"];
  const domainPackOptions: DomainPackId[] = ["coding", "student", "productivity"];

  return (
    <>
      <Layout
        theme={theme}
        activeNav={activeNav}
        activePopupNav={activeOverlay}
        setActiveNav={handleNavChange}
        isRecording={isRecording}
        isPro={isPro}
        showProTools={isPro}
        onUpgradeClick={() => setActiveNav("pro")}
      >
        <div key={activeNav} className={`vw-page-shell ${isPro ? "vw-pro-ui" : ""}`}>
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
                isPro={isPro}
              />
            </>
          )}

          {activeNav === "pro" && (
            <>
              <section className="vw-panel vw-panel-soft">
                <div className="flex flex-wrap items-start justify-between gap-3">
                  <div>
                    <p className="vw-kicker">VoiceWave Pro</p>
                    <h3 className="text-lg font-semibold text-[#09090B]">Power Features for Coders + Students</h3>
                    <p className="mt-1 text-sm text-[#71717A]">
                      Keep fast local dictation in Free, unlock advanced formatting, domain packs, code mode, and power history tools in Pro.
                    </p>
                  </div>
                  <span className={`vw-chip ${isPro ? "vw-pro-chip-active" : ""}`}>
                    {isOwnerOverride ? "Owner Pro (Device Override)" : isPro ? "Pro Active" : "Free"}
                  </span>
                </div>

                <div className="mt-4 grid grid-cols-1 gap-3 md:grid-cols-3">
                  <div className="vw-stat-card md:col-span-2">
                    {isPro ? (
                      <>
                        <p className="vw-kicker">Plan Active</p>
                        <p className="mt-2 text-2xl font-semibold text-[#09090B]">VoiceWave Pro</p>
                        <p className="mt-2 text-xs text-[#71717A]">
                          Your account already has Pro access. Pricing offers are hidden while Pro is active.
                        </p>
                      </>
                    ) : (
                      <>
                        <p className="vw-kicker">Launch Pricing</p>
                        <div className="mt-2 flex items-end gap-3">
                          <p className="text-sm text-[#71717A] line-through">~{entitlement.plan.displayBasePrice}~</p>
                          <p className="text-2xl font-semibold text-[#09090B]">{entitlement.plan.displayLaunchPrice}</p>
                        </div>
                        <p className="mt-2 text-xs text-[#71717A]">{entitlement.plan.offerCopy}</p>
                      </>
                    )}
                  </div>
                  <div className="vw-stat-card">
                    <p className="vw-kicker">Status</p>
                    <p className="mt-1 text-base font-semibold text-[#09090B]">{entitlement.status}</p>
                    <p className="mt-1 text-xs text-[#71717A]">
                      Last refresh: {entitlement.lastRefreshedAtUtcMs ? formatDate(entitlement.lastRefreshedAtUtcMs) : "Never"}
                    </p>
                  </div>
                </div>

                <div className="mt-4 flex flex-wrap gap-2">
                  {!isPro && (
                    <button type="button" className="vw-btn-primary" onClick={() => void startProCheckout()}>
                      Upgrade to Pro
                    </button>
                  )}
                  <button type="button" className="vw-btn-secondary" onClick={() => void refreshEntitlement()}>
                    Refresh Entitlement
                  </button>
                  <button type="button" className="vw-btn-secondary" onClick={() => void restorePurchase()}>
                    Restore Purchase
                  </button>
                  {isPro && (
                    <button type="button" className="vw-btn-secondary" onClick={() => void openBillingPortal()}>
                      Open Billing Portal
                    </button>
                  )}
                </div>

                <div className="mt-5 grid grid-cols-1 gap-3 md:grid-cols-2">
                  {[
                    { icon: Sparkles, title: "Advanced Formatting Engine", detail: "Profiles: Default, Academic, Technical, Concise, Code Doc." },
                    { icon: Crown, title: "Domain Dictionaries", detail: "Coding, Student, and Productivity packs with weighted corrections." },
                    { icon: Search, title: "Advanced History Tools", detail: "Search, tags, starring, and export presets." },
                    { icon: Star, title: "Code Mode", detail: "Spoken symbols, casing controls, and optional fenced output." }
                  ].map((item) => {
                    const Icon = item.icon;
                    return (
                      <div key={item.title} className="vw-interactive-row rounded-2xl border border-[#E4E4E7] bg-white px-4 py-3">
                        <div className="flex items-center gap-2">
                          <Icon size={16} className="text-[#18181B]" />
                          <p className="text-sm font-semibold text-[#09090B]">{item.title}</p>
                          <span className="vw-chip">{isPro ? "Unlocked" : "Pro"}</span>
                        </div>
                        <p className="mt-1 text-xs text-[#71717A]">{item.detail}</p>
                      </div>
                    );
                  })}
                </div>

                <div className="mt-5 rounded-2xl border border-dashed border-[#D4D4D8] bg-[#FAFAFA] px-4 py-3">
                  <button
                    type="button"
                    className="text-xs font-semibold text-[#52525B] underline underline-offset-2"
                    onClick={() => setOwnerTapCount((count) => Math.min(count + 1, 5))}
                  >
                    Owner tools
                  </button>
                  {showOwnerUnlock ? (
                    <div className="mt-3 flex flex-wrap items-center gap-2">
                      <input
                        type="password"
                        value={ownerPassphrase}
                        onChange={(event) => setOwnerPassphrase(event.target.value)}
                        placeholder="Owner passphrase"
                        className="rounded-xl border border-[#E4E4E7] bg-white px-3 py-2 text-sm text-[#09090B]"
                      />
                      <button
                        type="button"
                        className="vw-btn-primary"
                        onClick={() => void setOwnerOverride(true, ownerPassphrase)}
                      >
                        Enable Owner Pro
                      </button>
                      <button
                        type="button"
                        className="vw-btn-secondary"
                        onClick={() => void setOwnerOverride(false, ownerPassphrase)}
                      >
                        Disable
                      </button>
                    </div>
                  ) : (
                    <p className="mt-2 text-xs text-[#71717A]">Tap owner tools five times to reveal device override controls.</p>
                  )}
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

            <div className="mt-4 rounded-2xl border border-[#E4E4E7] bg-white px-4 py-3">
              <div className="flex flex-wrap items-center justify-between gap-2">
                <p className="text-sm font-semibold text-[#09090B]">Advanced History Tools</p>
                <span className="vw-chip">{isPro ? "Pro Unlocked" : "Pro"}</span>
              </div>
              <div className="mt-3 grid grid-cols-1 gap-2 md:grid-cols-3">
                <input
                  value={historyQuery}
                  onChange={(event) => setHistoryQuery(event.target.value)}
                  placeholder="Search query"
                  className="rounded-xl border border-[#E4E4E7] bg-white px-3 py-2 text-sm text-[#09090B]"
                />
                <input
                  value={historyTag}
                  onChange={(event) => setHistoryTag(event.target.value)}
                  placeholder="Tag filter (optional)"
                  className="rounded-xl border border-[#E4E4E7] bg-white px-3 py-2 text-sm text-[#09090B]"
                />
                <button
                  type="button"
                  className={isPro ? "vw-btn-secondary" : "vw-btn-primary"}
                  onClick={() => {
                    if (!isPro) {
                      setActiveNav("pro");
                      return;
                    }
                    const tags = historyTag.trim() ? [historyTag.trim()] : null;
                    void searchHistory(historyQuery, tags, null);
                  }}
                >
                  {isPro ? "Run Search" : "Upgrade to Pro"}
                </button>
              </div>
              <div className="mt-3 flex flex-wrap gap-2">
                {(["plain", "markdownNotes", "studySummary"] as const).map((preset) => (
                  <button
                    key={preset}
                    type="button"
                    className={isPro ? "vw-btn-secondary" : "vw-btn-primary"}
                    onClick={() => {
                      if (!isPro) {
                        setActiveNav("pro");
                        return;
                      }
                      void exportHistoryPreset(preset);
                    }}
                  >
                    Export {preset}
                  </button>
                ))}
              </div>
              {!isPro && (
                <p className="mt-2 text-xs text-[#71717A]">
                  Search, tagging, starring, and exports are Pro features. Free retains full timeline and retention controls.
                </p>
              )}
              {lastHistoryExport && (
                <div className="mt-3 rounded-xl border border-[#E4E4E7] bg-[#FAFAFA] px-3 py-2">
                  <p className="text-xs font-semibold text-[#09090B]">
                    Export ready: {lastHistoryExport.preset} ({lastHistoryExport.recordCount} records)
                  </p>
                  <pre className="mt-2 max-h-28 overflow-auto whitespace-pre-wrap text-[11px] text-[#52525B]">
                    {lastHistoryExport.content}
                  </pre>
                </div>
              )}
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
                    {record.starred && <span className="vw-chip">Starred</span>}
                  </div>
                  <p className="text-xs text-[#71717A] mt-1">{record.preview}</p>
                  {record.tags.length > 0 && (
                    <div className="mt-2 flex flex-wrap gap-2">
                      {record.tags.map((tag) => (
                        <span key={`${record.recordId}-${tag}`} className="vw-chip">
                          #{tag}
                        </span>
                      ))}
                    </div>
                  )}
                  <div className="mt-2 flex flex-wrap gap-2">
                    <button
                      type="button"
                      className={isPro ? "vw-btn-secondary text-xs px-3 py-1" : "vw-btn-primary text-xs px-3 py-1"}
                      onClick={() => {
                        if (!isPro) {
                          setActiveNav("pro");
                          return;
                        }
                        void setSessionStarred(record.recordId, !record.starred);
                      }}
                    >
                      {record.starred ? "Unstar" : "Star"}
                    </button>
                    <button
                      type="button"
                      className={isPro ? "vw-btn-secondary text-xs px-3 py-1" : "vw-btn-primary text-xs px-3 py-1"}
                      onClick={() => {
                        if (!isPro) {
                          setActiveNav("pro");
                          return;
                        }
                        if (!historyTag.trim()) {
                          return;
                        }
                        void addSessionTag(record.recordId, historyTag.trim());
                      }}
                    >
                      Tag
                    </button>
                  </div>
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

            <div className="mt-4 rounded-2xl border border-[#E4E4E7] bg-white px-4 py-3">
              <div className="flex flex-wrap items-center justify-between gap-2">
                <p className="text-sm font-semibold text-[#09090B]">Domain Dictionaries (Pro)</p>
                <span className="vw-chip">{isPro ? "Unlocked" : "Pro"}</span>
              </div>
              <div className="mt-3 flex flex-wrap gap-2">
                {domainPackOptions.map((pack) => {
                  const active = settings.activeDomainPacks.includes(pack);
                  return (
                    <button
                      key={pack}
                      type="button"
                      className={active ? "vw-btn-primary" : "vw-btn-secondary"}
                      onClick={() => {
                        if (!isPro) {
                          setActiveNav("pro");
                          return;
                        }
                        const next = active
                          ? settings.activeDomainPacks.filter((value) => value !== pack)
                          : [...settings.activeDomainPacks, pack];
                        void setDomainPacks(next);
                      }}
                    >
                      {pack}
                    </button>
                  );
                })}
              </div>
              {!isPro && (
                <p className="mt-2 text-xs text-[#71717A]">
                  Free keeps baseline dictionary queue and approvals. Pro adds domain packs and weighted correction behavior.
                </p>
              )}
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

          {activeNav === "pro-tools" && (
            <>
              <section className="vw-panel vw-panel-soft">
                <div className="flex flex-wrap items-center justify-between gap-2">
                  <div>
                    <h3 className="text-lg font-semibold text-[#09090B]">Pro Tools Modes</h3>
                    <p className="mt-1 text-sm text-[#71717A]">
                      Pick one mode and VoiceWave reconfigures output behavior for that workflow.
                    </p>
                  </div>
                  <span className="vw-chip">Pro Active</span>
                </div>

                <div className="mt-4 grid grid-cols-1 gap-3 md:grid-cols-2">
                  {PRO_TOOLS_MODE_CARDS.map((mode) => {
                    const isActiveMode = displayedProToolsMode === mode.id;
                    const isApplying = modeApplyPending === mode.id;
                    return (
                      <button
                        key={mode.id}
                        type="button"
                        className={`vw-mode-card rounded-2xl border px-4 py-4 text-left ${
                          isActiveMode ? "vw-pro-mode-card-active" : "vw-pro-mode-card"
                        }`}
                        onClick={() => void applyProToolsMode(mode.id)}
                        aria-disabled={modeApplyPending ? "true" : "false"}
                        aria-busy={isApplying ? "true" : "false"}
                      >
                        <div className="flex items-center justify-between gap-2">
                          <p className="text-base font-semibold text-[#09090B]">{mode.title}</p>
                          <span className={`vw-chip vw-mode-status-chip ${isActiveMode ? "vw-mode-status-chip-active" : ""}`}>
                            {isActiveMode ? "Active" : "Apply"}
                          </span>
                        </div>
                        <p className="mt-2 text-sm text-[#3F3F46]">{mode.description}</p>
                        <p className="mt-2 text-xs text-[#71717A]">{mode.highlight}</p>
                      </button>
                    );
                  })}
                </div>

                {displayedProToolsMode === "coding" && (
                  <div className="mt-4 rounded-2xl border border-[#E4E4E7] bg-white px-4 py-3">
                    <p className="text-sm font-semibold text-[#09090B]">How To Speak In Coding Mode</p>
                    <div className="mt-2 grid grid-cols-1 gap-2 text-xs text-[#52525B] md:grid-cols-2">
                      <p><span className="font-semibold">Symbols:</span> open paren, open parenthesis, close paren, underscore, arrow, equals.</p>
                      <p><span className="font-semibold">Casing:</span> say plain words, then choose camelCase or snake_case in mode settings.</p>
                      <p><span className="font-semibold">Example speech:</span> open paren user id close paren arrow result</p>
                      <p><span className="font-semibold">Expected output:</span> (user id)-&gt;result</p>
                    </div>
                  </div>
                )}

                {displayedProToolsMode === "writing" && (
                  <div className="mt-4 rounded-2xl border border-[#E4E4E7] bg-white px-4 py-3">
                    <p className="text-sm font-semibold text-[#09090B]">Writing Mode Focus</p>
                    <p className="mt-2 text-xs text-[#52525B]">
                      List intent is detected more strongly. Example: "there are two process one hi two real" becomes:
                      <br />
                      1. Hi
                      <br />
                      2. Real
                    </p>
                  </div>
                )}

                {displayedProToolsMode === "study" && (
                  <div className="mt-4 rounded-2xl border border-[#E4E4E7] bg-white px-4 py-3">
                    <p className="text-sm font-semibold text-[#09090B]">Study Mode Focus</p>
                    <p className="mt-2 text-xs text-[#52525B]">
                      Designed for voice notes you can revise later. Speak with markers like:
                      <span className="font-semibold"> topic</span>, <span className="font-semibold">definition</span>, <span className="font-semibold">example</span>, and <span className="font-semibold">summary</span>.
                    </p>
                  </div>
                )}
              </section>
            </>
          )}
        </div>

        {displayError && (
          <div className="mt-6 rounded-2xl border border-[#f3c2c2] bg-[#fff1f1] px-4 py-3 text-sm text-[#a94444]">
            <p>{displayError}</p>
            {proRequiredFeature && (
              <button
                type="button"
                className="vw-btn-primary mt-3"
                onClick={() => setActiveNav("pro")}
              >
                View Pro Plans
              </button>
            )}
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



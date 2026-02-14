import { useEffect, useMemo, useState } from "react";
import {
  canUseTauri,
  loadSnapshot,
  listenVoicewaveHotkey,
  listenVoicewaveMicLevel,
  listenVoicewaveState,
  showMainWindow
} from "../lib/tauri";
import type { VoiceWaveHudState } from "../types/voicewave";

type VisualState = "idle" | "listening" | "transcribing" | "inserted" | "error";

function clamp01(value: number): number {
  return Math.max(0, Math.min(1, value));
}

export function FloatingPill() {
  const [rawState, setRawState] = useState<VoiceWaveHudState>("idle");
  const [displayState, setDisplayState] = useState<VisualState>("idle");
  const [pushHeld, setPushHeld] = useState(false);
  const [micLevel, setMicLevel] = useState(0);
  const [smoothedLevel, setSmoothedLevel] = useState(0);
  const [phaseTime, setPhaseTime] = useState(0);
  const visualState: VisualState = pushHeld && displayState === "idle" ? "listening" : displayState;

  useEffect(() => {
    if (!canUseTauri()) {
      return;
    }

    let stateUnlisten: (() => void) | null = null;
    let micUnlisten: (() => void) | null = null;
    let hotkeyUnlisten: (() => void) | null = null;

    void (async () => {
      stateUnlisten = await listenVoicewaveState((payload) => {
        setRawState(payload.state);
      });
      micUnlisten = await listenVoicewaveMicLevel((payload) => {
        setMicLevel(clamp01(payload.level ?? 0));
      });
      hotkeyUnlisten = await listenVoicewaveHotkey((payload) => {
        if (payload.action !== "pushToTalk") {
          return;
        }
        if (payload.phase === "pressed") {
          setPushHeld(true);
        } else if (payload.phase === "released") {
          setPushHeld(false);
        }
      });
    })();

    const snapshotTimer = window.setInterval(() => {
      void (async () => {
        try {
          const snapshot = await loadSnapshot();
          setRawState(snapshot.state);
        } catch {
          // Ignore transient snapshot poll failures in pill overlay.
        }
      })();
    }, 180);

    return () => {
      window.clearInterval(snapshotTimer);
      stateUnlisten?.();
      micUnlisten?.();
      hotkeyUnlisten?.();
    };
  }, []);

  useEffect(() => {
    if (rawState === "inserted" || rawState === "error") {
      setDisplayState(rawState);
      const timeout = window.setTimeout(() => {
        setDisplayState("idle");
      }, 820);
      return () => {
        window.clearTimeout(timeout);
      };
    }
    setDisplayState(rawState);
    return undefined;
  }, [rawState]);

  useEffect(() => {
    if (rawState !== "listening") {
      setPushHeld(false);
    }
  }, [rawState]);

  useEffect(() => {
    let frame = 0;
    let lastFrame = 0;
    let current = 0;

    const loop = (ts: number) => {
      frame = window.requestAnimationFrame(loop);
      if (ts - lastFrame < 16) {
        return;
      }
      lastFrame = ts;

      const target =
        visualState === "listening"
          ? clamp01(0.24 + micLevel * 0.9)
          : visualState === "transcribing"
            ? 0.18
            : visualState === "inserted"
              ? 0.22
              : 0.03;
      const lerp = visualState === "listening" ? 0.24 : 0.16;
      current += (target - current) * lerp;
      if (visualState === "idle") {
        current *= 0.92;
      }
      setSmoothedLevel(clamp01(current));
      setPhaseTime(ts * 0.0075);
    };

    frame = window.requestAnimationFrame(loop);
    return () => {
      window.cancelAnimationFrame(frame);
    };
  }, [micLevel, visualState]);

  const bars = useMemo(() => {
    const count = 8;
    return Array.from({ length: count }, (_, idx) => {
      const wave =
        0.32 +
        0.74 *
          Math.abs(
            Math.sin(phaseTime + idx * 0.57) * Math.cos(phaseTime * 0.42 + idx * 0.18)
          );
      const floor = visualState === "idle" ? 0.1 : 0.2;
      const level = clamp01(floor + smoothedLevel * wave);
      return {
        id: idx,
        scale: 0.2 + level * 1.2
      };
    });
  }, [phaseTime, smoothedLevel, visualState]);

  return (
    <div className={`vw-pill-shell vw-pill-state-${visualState}`} data-tauri-drag-region>
      <button
        type="button"
        className="vw-pill-surface"
        data-tauri-drag-region
        onDoubleClick={() => {
          void showMainWindow();
        }}
      >
        <div className="vw-pill-glow" />
        <div className="vw-pill-core">
          <div className="vw-pill-wave">
            {bars.map((bar) => (
              <span
                key={bar.id}
                className="vw-pill-bar"
                style={{ transform: `scaleY(${bar.scale.toFixed(3)})` }}
              />
            ))}
          </div>
          <div className="vw-pill-spinner" />
        </div>
      </button>
    </div>
  );
}

import { StatePill } from "./StatePill";
import type { VoiceWaveHudState } from "../types/voicewave";

interface FloatingHudProps {
  state: VoiceWaveHudState;
  partial: string | null;
  finalTranscript: string | null;
}

export function FloatingHud({ state, partial, finalTranscript }: FloatingHudProps) {
  return (
    <aside className="fixed bottom-5 right-5 z-30 w-[320px] rounded-2xl border border-pine-200 bg-white/90 p-4 shadow-card backdrop-blur">
      <div className="mb-3 flex items-center justify-between">
        <p className="text-xs font-medium uppercase tracking-[0.18em] text-pine-700">Floating HUD</p>
        <StatePill state={state} />
      </div>
      <div className="min-h-16 rounded-xl bg-pine-50/70 p-3 text-sm text-pine-900">
        <p className="font-semibold text-pine-700">Live transcript</p>
        <p className="mt-1 leading-relaxed">
          {partial ?? finalTranscript ?? "Waiting for speech..."}
        </p>
      </div>
    </aside>
  );
}

import { stateClassName, stateLabel } from "../lib/stateLabel";
import type { VoiceWaveHudState } from "../types/voicewave";

interface StatePillProps {
  state: VoiceWaveHudState;
}

export function StatePill({ state }: StatePillProps) {
  return (
    <div className={`inline-flex items-center rounded-full px-3 py-1 text-xs font-semibold ${stateClassName(state)}`}>
      {stateLabel(state)}
    </div>
  );
}

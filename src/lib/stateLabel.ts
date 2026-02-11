import type { VoiceWaveHudState } from "../types/voicewave";

export function stateLabel(state: VoiceWaveHudState): string {
  switch (state) {
    case "idle":
      return "Idle";
    case "listening":
      return "Listening";
    case "transcribing":
      return "Transcribing";
    case "inserted":
      return "Inserted";
    case "error":
      return "Error";
    default:
      return "Unknown";
  }
}

export function stateClassName(state: VoiceWaveHudState): string {
  switch (state) {
    case "idle":
      return "bg-white text-pine-700";
    case "listening":
      return "bg-emerald-100 text-emerald-700";
    case "transcribing":
      return "bg-amber-100 text-amber-800";
    case "inserted":
      return "bg-sky-100 text-sky-800";
    case "error":
      return "bg-rose-100 text-rose-700";
    default:
      return "bg-slate-100 text-slate-700";
  }
}

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
      return "bg-white text-[#09090B] border border-[#E4E4E7]";
    case "listening":
      return "bg-[#18181B] text-white";
    case "transcribing":
      return "bg-[#3F3F46] text-white";
    case "inserted":
      return "bg-[#27272A] text-white";
    case "error":
      return "bg-red-100 text-red-700";
    default:
      return "bg-slate-100 text-slate-700";
  }
}

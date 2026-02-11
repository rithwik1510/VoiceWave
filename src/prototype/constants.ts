import type { ThemeConfig } from "./types";
import {
  Activity,
  Book,
  Cpu,
  FileText,
  HelpCircle,
  Home,
  Palette,
  Settings,
  Zap
} from "lucide-react";

export const THEMES: Record<string, ThemeConfig> = {
  D: {
    id: "D",
    name: "Flux OS",
    description: "Cyber-physical. Dark glass, neon accents, HUD aesthetics.",
    colors: {
      bg: "glass-gradient text-white",
      sidebarBg: "bg-slate-900/30 backdrop-blur-md border-r border-white/5",
      surface: "bg-white/5 hover:bg-white/10 border border-white/10 backdrop-blur-sm",
      surfaceHighlight: "bg-white/10 border border-white/20",
      border: "border-white/10",
      textPrimary: "text-white",
      textSecondary: "text-slate-400",
      textTertiary: "text-slate-600",
      accent: "bg-cyan-500 shadow-[0_0_20px_rgba(6,182,212,0.5)]",
      accentFg: "text-black font-bold",
      success: "text-cyan-400",
      warning: "text-yellow-400",
      error: "text-pink-500",
      recording: "bg-rose-500 shadow-[0_0_30px_rgba(244,63,94,0.6)] animate-pulse"
    },
    typography: {
      fontDisplay: 'font-["Space_Grotesk"] tracking-tight',
      fontBody: 'font-["Outfit"]',
      weightHeading: "font-bold"
    },
    shapes: {
      radius: "rounded-2xl",
      borderWidth: "border-[1px]",
      buttonShape: "rounded-xl",
      navItemShape: "rounded-lg"
    },
    effects: {
      shadow: "shadow-2xl shadow-black/50",
      blur: "backdrop-blur-xl"
    }
  },
  E: {
    id: "E",
    name: "Field Recorder",
    description: "Tactile retro-modern engineering inspired by classic Hi-Fi interfaces.",
    colors: {
      bg: "bg-[#EAE8E3]",
      sidebarBg: "bg-[#E3E1DB]",
      surface: "bg-[#DFDDD6] shadow-[inset_1px_1px_3px_rgba(0,0,0,0.05),1px_1px_0px_rgba(255,255,255,0.5)]",
      surfaceHighlight: "bg-[#D6D4CD] shadow-[inset_2px_2px_5px_rgba(0,0,0,0.1)]",
      border: "border-[#CCCAC2]",
      textPrimary: "text-[#282828]",
      textSecondary: "text-[#666666]",
      textTertiary: "text-[#999999]",
      accent: "bg-[#FF4F00]",
      accentFg: "text-white font-medium tracking-widest uppercase",
      success: "text-[#008F39]",
      warning: "text-[#FF8C00]",
      error: "text-[#D93025]",
      recording: "bg-[#FF0000] ring-4 ring-[#FF0000]/20"
    },
    typography: {
      fontDisplay: 'font-["IBM_Plex_Mono"]',
      fontBody: 'font-["IBM_Plex_Mono"]',
      weightHeading: "font-semibold"
    },
    shapes: {
      radius: "rounded-sm",
      borderWidth: "border-[2px]",
      buttonShape: "rounded-[3px]",
      navItemShape: "rounded-sm"
    },
    effects: {
      shadow: "shadow-sm",
      blur: "backdrop-blur-none"
    }
  },
  F: {
    id: "F",
    name: "Botanist",
    description: "Organic and calm with soft earthy tones and fluid shapes.",
    colors: {
      bg: "bg-[#F2F4F3]",
      sidebarBg: "bg-[#EBF0EE]",
      surface: "bg-white",
      surfaceHighlight: "bg-[#DCE6E2]",
      border: "border-transparent",
      textPrimary: "text-[#1A3832]",
      textSecondary: "text-[#5C7A72]",
      textTertiary: "text-[#94ACA6]",
      accent: "bg-[#2D5B52]",
      accentFg: "text-[#F2F4F3]",
      success: "text-[#3E7C68]",
      warning: "text-[#C89B3C]",
      error: "text-[#C45E5E]",
      recording: "bg-[#D66853]"
    },
    typography: {
      fontDisplay: 'font-["Fraunces"]',
      fontBody: 'font-["Manrope"]',
      weightHeading: "font-semibold"
    },
    shapes: {
      radius: "rounded-[2rem]",
      borderWidth: "border-0",
      buttonShape: "rounded-full",
      navItemShape: "rounded-full"
    },
    effects: {
      shadow: "shadow-[0_8px_30px_rgba(45,91,82,0.06)]",
      blur: "backdrop-blur-none"
    }
  }
};

export const NAV_ITEMS = [
  { id: "home", label: "Home", icon: Home },
  { id: "sessions", label: "Sessions", icon: Book },
  { id: "dictionary", label: "Dictionary", icon: FileText },
  { id: "snippets", label: "Snippets", icon: Zap },
  { id: "style", label: "Style", icon: Palette },
  { id: "models", label: "Models", icon: Cpu },
  { id: "settings", label: "Settings", icon: Settings },
  { id: "help", label: "Help", icon: HelpCircle }
];

export const MOCK_SESSIONS = [
  {
    id: "1",
    title: "Q3 Financial Overview",
    preview: "The revenue growth in the third quarter was primarily driven by...",
    date: "Today, 9:41 AM",
    duration: "4m 12s",
    wordCount: 540
  },
  {
    id: "2",
    title: "Client Email Draft",
    preview: "Hi Sarah, regarding the proposal sent last week, I wanted to clarify...",
    date: "Yesterday, 4:20 PM",
    duration: "1m 30s",
    wordCount: 180
  },
  {
    id: "3",
    title: "Project Roadmap Notes",
    preview: "Phase 1 should focus on infrastructure stability before we move to...",
    date: "Oct 24",
    duration: "12m 05s",
    wordCount: 1450
  }
];

export const STATUS_LABEL: Record<string, string> = {
  idle: "Idle",
  listening: "Listening",
  transcribing: "Transcribing",
  inserted: "Inserted",
  error: "Error"
};

export const STATUS_TONE: Record<string, string> = {
  idle: "bg-white/70 text-[#1A3832]",
  listening: "bg-[#D66853] text-white",
  transcribing: "bg-[#C89B3C] text-white",
  inserted: "bg-[#3E7C68] text-white",
  error: "bg-[#C45E5E] text-white"
};

export const DICTATION_STATES: DictationState[] = [
  "idle",
  "listening",
  "transcribing",
  "inserted",
  "error"
];

type DictationState = "idle" | "listening" | "transcribing" | "inserted" | "error";

export const STATUS_META: Record<DictationState, string> = {
  idle: "Ready",
  listening: "Mic open",
  transcribing: "Processing",
  inserted: "Delivered",
  error: "Needs attention"
};

export const MODE_LABELS = {
  auto: "AUTO",
  continuous: "Continuous",
  local: "Offline & Local"
};

export const STATUS_ICON = Activity;

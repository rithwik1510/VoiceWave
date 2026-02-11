export type ThemeId = 'D' | 'E' | 'F';

export interface ThemeConfig {
  id: ThemeId;
  name: string;
  description: string;
  colors: {
    bg: string;
    sidebarBg: string;
    surface: string;
    surfaceHighlight: string;
    border: string;
    textPrimary: string;
    textSecondary: string;
    textTertiary: string;
    accent: string;
    accentFg: string;
    success: string;
    warning: string;
    error: string;
    recording: string;
  };
  typography: {
    fontDisplay: string;
    fontBody: string;
    weightHeading: string;
  };
  shapes: {
    radius: string;
    borderWidth: string;
    buttonShape: string;
    navItemShape: string;
  };
  effects: {
    shadow: string;
    blur: string;
  };
}

export type DictationState = 'idle' | 'listening' | 'transcribing' | 'inserted' | 'error';

export interface SessionData {
  id: string;
  title: string;
  preview: string;
  date: string;
  duration: string;
  wordCount: number;
}
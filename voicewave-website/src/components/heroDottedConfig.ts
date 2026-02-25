export type HeroDottedTheme = 'light' | 'dark'

export type HeroDottedConfig = {
  dotSize: number
  dotGap: number
  maskStrength: number
  simulationScale: number
  targetFps: number
  pointerRadius: number
  pointerStrength: number
  decay: number
  ambientStrength: number
  lowPowerSimulationScale: number
  lowPowerTargetFps: number
}

export const heroDottedDefaultConfig: HeroDottedConfig = {
  dotSize: 9.5,
  dotGap: 4.8,
  maskStrength: 1,
  simulationScale: 0.3,
  targetFps: 58,
  pointerRadius: 165,
  pointerStrength: 1.25,
  decay: 0.975,
  ambientStrength: 0.035,
  lowPowerSimulationScale: 0.22,
  lowPowerTargetFps: 34
}

export const getHeroDottedPalette = (theme: HeroDottedTheme) => {
  if (theme === 'dark') {
    return {
      primary: [0.03, 0.12, 0.4],
      secondary: [0.12, 0.56, 1],
      highlight: [0.62, 0.9, 1]
    } as const
  }

  return {
    primary: [0.02, 0.17, 0.56],
    secondary: [0.15, 0.62, 1],
    highlight: [0.66, 0.93, 1]
  } as const
}

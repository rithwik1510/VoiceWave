const DEFAULT_WINDOWS_DOWNLOAD_URL = 'https://github.com/rithwik1510/VoiceWave/releases/latest'

export const windowsDownloadUrl =
  (import.meta.env.VITE_WINDOWS_DOWNLOAD_URL as string | undefined)?.trim() ||
  DEFAULT_WINDOWS_DOWNLOAD_URL

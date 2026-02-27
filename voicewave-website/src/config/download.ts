const fallbackDownloadUrl =
  "https://github.com/rithwik1510/VoiceWave/releases/latest/download/VoiceWave.Local.Core_0.1.1_x64-setup.exe";

function isHttpUrl(value: string | undefined): value is string {
  if (!value) {
    return false;
  }
  return value.startsWith("https://") || value.startsWith("http://");
}

export const windowsDownloadUrl = isHttpUrl(import.meta.env.VITE_WINDOWS_DOWNLOAD_URL)
  ? import.meta.env.VITE_WINDOWS_DOWNLOAD_URL
  : fallbackDownloadUrl;

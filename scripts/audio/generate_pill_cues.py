"""Generate bassy, pleasant pill cue sounds.

cue_press.wav  - opening sound (ascending warm tone)
cue_release.wav - reverse of cue_press (descending close)

Design goals:
- Warm, bassy, pleasant (no harshness)
- Short enough to feel snappy (~180 ms)
- Two low harmonics with a soft attack + gentle decay
- Sample rate 44100 Hz, 16-bit PCM mono
"""
from __future__ import annotations

import struct
import wave
from pathlib import Path

import numpy as np

SAMPLE_RATE = 44_100
DURATION_SECS = 0.18
BITS_PER_SAMPLE = 16
CHANNELS = 1


def build_press_waveform() -> np.ndarray:
    t = np.linspace(0.0, DURATION_SECS, int(SAMPLE_RATE * DURATION_SECS), endpoint=False)

    # Warm blended tone: a low root + gentle fifth harmonic for body
    root_hz = 220.0            # A3 - bassy but musical
    fifth_hz = 330.0           # E4 - soft warmth, perfect fifth
    sub_hz = 110.0             # A2 - deep thickness

    # Slight pitch glide up for "opening" motion
    glide = 1.0 + 0.03 * (t / DURATION_SECS)

    tone = (
        0.55 * np.sin(2 * np.pi * root_hz * glide * t)
        + 0.28 * np.sin(2 * np.pi * fifth_hz * glide * t)
        + 0.22 * np.sin(2 * np.pi * sub_hz * glide * t)
    )

    # Soft attack + gentle decay envelope (exponential-ish)
    attack = np.minimum(t / 0.015, 1.0)        # 15 ms attack
    decay = np.exp(-3.2 * t / DURATION_SECS)   # smooth exponential fade
    envelope = attack * decay

    waveform = tone * envelope

    # Gentle low-pass by 3-sample moving average to tame highs
    kernel = np.array([0.25, 0.5, 0.25])
    waveform = np.convolve(waveform, kernel, mode="same")

    # Normalize to -3 dB headroom so playback isn't harsh
    peak = np.max(np.abs(waveform))
    if peak > 0:
        waveform = waveform / peak * 0.72

    return waveform.astype(np.float32)


def write_wav(path: Path, samples: np.ndarray) -> None:
    pcm = np.clip(samples, -1.0, 1.0)
    pcm_int = (pcm * 32767.0).astype(np.int16)
    frames = b"".join(struct.pack("<h", int(sample)) for sample in pcm_int)
    with wave.open(str(path), "wb") as wav_file:
        wav_file.setnchannels(CHANNELS)
        wav_file.setsampwidth(BITS_PER_SAMPLE // 8)
        wav_file.setframerate(SAMPLE_RATE)
        wav_file.writeframes(frames)


def main() -> None:
    out_dir = Path(__file__).resolve().parents[2] / "src-tauri" / "assets" / "audio"
    out_dir.mkdir(parents=True, exist_ok=True)

    press = build_press_waveform()
    release = press[::-1].copy()  # exact reverse of press -> graceful close cue

    press_path = out_dir / "cue_press.wav"
    release_path = out_dir / "cue_release.wav"

    write_wav(press_path, press)
    write_wav(release_path, release)

    print(f"wrote {press_path} ({press_path.stat().st_size} bytes)")
    print(f"wrote {release_path} ({release_path.stat().st_size} bytes)")


if __name__ == "__main__":
    main()

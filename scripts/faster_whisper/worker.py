import json
import sys
import time
import traceback
from pathlib import Path

from faster_whisper import WhisperModel


MODEL_CACHE = {}
ALLOWED_MODELS = {"small.en", "large-v3"}


def load_model(model_id: str, compute_type: str):
    key = (model_id, compute_type)
    cached = MODEL_CACHE.get(key)
    if cached is not None:
        return cached, True, 0

    started = time.perf_counter()
    model = WhisperModel(model_id, device="cpu", compute_type=compute_type)
    load_ms = int((time.perf_counter() - started) * 1000)
    MODEL_CACHE[key] = model
    return model, False, load_ms


def transcribe(req: dict) -> dict:
    request_id = req.get("id")
    audio_path = req.get("audioPath")
    model_id = req.get("modelId")
    compute_type = req.get("computeType", "int8")
    beam_size = int(req.get("beamSize", 2))
    language = req.get("language", "en")
    vad_filter = bool(req.get("vadFilter", True))
    condition_on_previous_text = bool(req.get("conditionOnPreviousText", False))

    if not audio_path or not Path(audio_path).exists():
        return {
            "id": request_id,
            "ok": False,
            "error": f"Audio path is missing or not found: {audio_path}",
        }
    if not model_id:
        return {
            "id": request_id,
            "ok": False,
            "error": "Model ID is required.",
        }
    if model_id not in ALLOWED_MODELS:
        return {
            "id": request_id,
            "ok": False,
            "error": f"Unsupported model ID: {model_id}. Allowed: small.en, large-v3",
        }

    model, runtime_cache_hit, model_init_ms = load_model(model_id, compute_type)

    decode_started = time.perf_counter()
    segments, _info = model.transcribe(
        audio_path,
        beam_size=beam_size,
        language=language,
        vad_filter=vad_filter,
        condition_on_previous_text=condition_on_previous_text,
    )
    segments = list(segments)
    decode_ms = int((time.perf_counter() - decode_started) * 1000)

    parts = []
    for segment in segments:
        text = (segment.text or "").strip()
        if text:
            parts.append(text)

    return {
        "id": request_id,
        "ok": True,
        "text": " ".join(parts).strip(),
        "modelInitMs": model_init_ms,
        "decodeComputeMs": decode_ms,
        "runtimeCacheHit": runtime_cache_hit,
    }


def prefetch(req: dict) -> dict:
    request_id = req.get("id")
    model_id = req.get("modelId")
    compute_type = req.get("computeType", "int8")
    if not model_id:
        return {"id": request_id, "ok": False, "error": "Model ID is required."}
    if model_id not in ALLOWED_MODELS:
        return {
            "id": request_id,
            "ok": False,
            "error": f"Unsupported model ID: {model_id}. Allowed: small.en, large-v3",
        }
    _model, runtime_cache_hit, model_init_ms = load_model(model_id, compute_type)
    return {
        "id": request_id,
        "ok": True,
        "modelInitMs": model_init_ms,
        "runtimeCacheHit": runtime_cache_hit,
    }


def main() -> int:
    print(json.dumps({"ready": True}), flush=True)
    for line in sys.stdin:
        raw = line.strip()
        if not raw:
            continue
        try:
            req = json.loads(raw)
            command = req.get("command", "transcribe")
            if command == "shutdown":
                print(json.dumps({"ok": True, "shutdown": True}), flush=True)
                return 0
            if command == "prefetch":
                print(json.dumps(prefetch(req)), flush=True)
                continue
            if command != "transcribe":
                print(
                    json.dumps(
                        {
                            "id": req.get("id"),
                            "ok": False,
                            "error": f"Unsupported command: {command}",
                        }
                    ),
                    flush=True,
                )
                continue

            response = transcribe(req)
            print(json.dumps(response), flush=True)
        except Exception as exc:  # noqa: BLE001
            print(
                json.dumps(
                    {
                        "id": None,
                        "ok": False,
                        "error": f"Worker exception: {exc}",
                        "traceback": traceback.format_exc(),
                    }
                ),
                flush=True,
            )
    return 0


if __name__ == "__main__":
    raise SystemExit(main())

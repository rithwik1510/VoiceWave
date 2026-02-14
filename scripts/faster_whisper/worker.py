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
    best_of = int(req.get("bestOf", 1))
    language = req.get("language", "en")
    vad_filter = bool(req.get("vadFilter", True))
    condition_on_previous_text = bool(req.get("conditionOnPreviousText", False))
    initial_prompt = req.get("initialPrompt")
    temperature = req.get("temperature")
    no_speech_threshold = req.get("noSpeechThreshold")
    log_prob_threshold = req.get("logProbThreshold")
    compression_ratio_threshold = req.get("compressionRatioThreshold")
    if isinstance(initial_prompt, str):
        initial_prompt = initial_prompt.strip() or None
    else:
        initial_prompt = None

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
    transcribe_kwargs = {
        "beam_size": beam_size,
        "best_of": best_of,
        "language": language,
        "vad_filter": vad_filter,
        "condition_on_previous_text": condition_on_previous_text,
        "initial_prompt": initial_prompt,
    }
    if temperature is not None:
        transcribe_kwargs["temperature"] = float(temperature)
    if no_speech_threshold is not None:
        transcribe_kwargs["no_speech_threshold"] = float(no_speech_threshold)
    if log_prob_threshold is not None:
        transcribe_kwargs["log_prob_threshold"] = float(log_prob_threshold)
    if compression_ratio_threshold is not None:
        transcribe_kwargs["compression_ratio_threshold"] = float(
            compression_ratio_threshold
        )

    segments, _info = model.transcribe(audio_path, **transcribe_kwargs)
    segments = list(segments)
    decode_ms = int((time.perf_counter() - decode_started) * 1000)

    parts = []
    avg_logprobs = []
    no_speech_probs = []
    compression_ratios = []
    for segment in segments:
        text = (segment.text or "").strip()
        if text:
            parts.append(text)
        avg_logprobs.append(float(getattr(segment, "avg_logprob", 0.0)))
        no_speech_probs.append(float(getattr(segment, "no_speech_prob", 0.0)))
        compression_ratios.append(float(getattr(segment, "compression_ratio", 0.0)))

    mean_avg_logprob = (
        sum(avg_logprobs) / len(avg_logprobs) if avg_logprobs else 0.0
    )
    mean_no_speech_prob = (
        sum(no_speech_probs) / len(no_speech_probs) if no_speech_probs else 0.0
    )
    mean_compression_ratio = (
        sum(compression_ratios) / len(compression_ratios) if compression_ratios else 0.0
    )

    return {
        "id": request_id,
        "ok": True,
        "text": " ".join(parts).strip(),
        "modelInitMs": model_init_ms,
        "decodeComputeMs": decode_ms,
        "runtimeCacheHit": runtime_cache_hit,
        "segmentCount": len(segments),
        "avgLogProb": mean_avg_logprob,
        "noSpeechProb": mean_no_speech_prob,
        "compressionRatio": mean_compression_ratio,
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

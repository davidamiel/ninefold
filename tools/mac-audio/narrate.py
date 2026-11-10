#!/usr/bin/env python3
"""Local Mac audio generation from Ninefold's exported narration plan."""
import argparse
import json
import math
import os
from pathlib import Path
import time

os.environ.setdefault("PYTORCH_ENABLE_MPS_FALLBACK", "1")
if Path("/opt/homebrew/opt/espeak-ng/lib/libespeak-ng.dylib").exists():
    os.environ.setdefault("PHONEMIZER_ESPEAK_LIBRARY", "/opt/homebrew/opt/espeak-ng/lib/libespeak-ng.dylib")
RATE = 24000


def load_plan(path):
    plan = json.loads(Path(path).read_text(encoding="utf-8"))
    if plan.get("format") != "ninefold-narration-plan" or plan.get("schema") != 1:
        raise ValueError("Use a JSON plan exported from Ninefold's Listen menu.")
    if plan.get("offsetUnits") != "utf16" or not isinstance(plan.get("docId"), str):
        raise ValueError("Missing document identity or source coordinate units.")
    if not isinstance(plan.get("chunks"), list) or not plan["chunks"]:
        raise ValueError("No readable text.")
    for c in plan["chunks"]:
        if not isinstance(c.get("text"), str) or not c["text"].strip():
            raise ValueError("Empty spoken passage.")
        for key in ("page", "sourceStart", "sourceEnd", "highlightStart", "highlightEnd"):
            if type(c.get(key)) is not int or c[key] < 0:
                raise ValueError("Invalid source coordinate.")
        if not c["highlightStart"] <= c["sourceStart"] < c["sourceEnd"] <= c["highlightEnd"]:
            raise ValueError("Invalid source range.")
    return plan


def generate(plan, out, device, limit):
    import numpy as np
    import soundfile as sf
    import torch
    from kokoro import KPipeline
    chosen = ("mps" if torch.backends.mps.is_available() else "cpu") if device == "auto" else device
    out.mkdir(parents=True, exist_ok=False)
    chunks = plan["chunks"][:limit] if limit else plan["chunks"]
    (out / "spoken-text.txt").write_text("\n\n".join(c["text"] for c in chunks), encoding="utf-8")
    started = time.perf_counter()
    print("Loading model/voice on " + chosen + ". First use downloads model files.", flush=True)
    pipeline = KPipeline(lang_code="a", repo_id="hexgrad/Kokoro-82M", device=chosen)
    voice = plan.get("voice", "am_michael")
    pipeline.load_voice(voice)
    initialization = time.perf_counter() - started
    started = time.perf_counter()
    frames = 0
    entries = []
    total = sum(len(c["text"]) for c in chunks)
    done = 0
    with sf.SoundFile(str(out / "document.partial.wav"), mode="w", samplerate=RATE,
                      channels=1, format="WAV", subtype="PCM_16") as wav:
        for i, chunk in enumerate(chunks):
            begin = frames / RATE
            words = []
            cursor = 0
            for result in pipeline(chunk["text"], voice=voice, speed=1, split_pattern=None):
                if result.audio is None:
                    raise ValueError("Model returned no audio.")
                audio = result.audio.detach().cpu().numpy()
                if not len(audio) or not np.isfinite(audio).all():
                    raise ValueError("Model returned invalid audio.")
                text = result.graphemes
                pos = chunk["text"].find(text, cursor)
                if pos < 0 or chunk["text"][cursor:pos].strip():
                    raise ValueError("Generated text does not match the exported passage.")
                cursor = pos + len(text)
                token_cursor = 0
                for token in result.tokens or []:
                    label = token.text
                    p = text.find(label, token_cursor) if label else -1
                    if p < 0:
                        continue
                    token_cursor = p + len(label)
                    a, b = token.start_ts, token.end_ts
                    if a is None or b is None or not (math.isfinite(a) and math.isfinite(b)):
                        continue
                    a, b = max(0, a), min(len(audio) / RATE, b)
                    if b <= a:
                        continue
                    words.append({"text": label, "start": frames / RATE + a, "end": frames / RATE + b,
                                  "spokenStart": len(chunk["text"][:pos+p].encode("utf-16-le")) // 2,
                                  "spokenEnd": len(chunk["text"][:pos+token_cursor].encode("utf-16-le")) // 2})
                wav.write(audio)
                frames += len(audio)
            if cursor == 0 or chunk["text"][cursor:].strip():
                raise ValueError("Model skipped part of a passage.")
            entries.append({**chunk, "start": begin, "end": frames / RATE, "words": words})
            done += len(chunk["text"])
            elapsed = time.perf_counter() - started
            print(f"{done/total:.0%} | {i+1}/{len(chunks)} passages | {elapsed:.0f}s elapsed", flush=True)
    elapsed = time.perf_counter() - started
    estimate = elapsed * sum(len(c["text"]) for c in plan["chunks"]) / total
    report = {"format": "ninefold-narration-audio", "schema": 1, "docId": plan["docId"],
              "offsetUnits": "utf16", "voice": voice, "audio": "document.wav",
              "sampleRate": RATE, "duration": frames / RATE, "chunks": entries,
              "complete": len(chunks) == len(plan["chunks"]),
              "wordOffsets": "spoken text within each chunk, not original document text",
              "benchmark": {"device": chosen, "initializationSeconds": initialization,
                            "generationSeconds": elapsed, "estimatedFullGenerationSeconds": estimate}}
    (out / "document.partial.wav").rename(out / "document.wav")
    (out / "timings.json").write_text(json.dumps(report, ensure_ascii=False, indent=2), encoding="utf-8")
    print(f"Done: {elapsed:.1f}s generation; {initialization:.1f}s initialization.")
    if limit:
        print(f"Estimated full document: {estimate/60:.1f} minutes plus initialization.")
    print(str(out.resolve()))


def main():
    p = argparse.ArgumentParser(description=__doc__)
    p.add_argument("plan")
    p.add_argument("--output", default="audio-output")
    p.add_argument("--device", choices=["auto", "mps", "cpu"], default="auto")
    p.add_argument("--benchmark", type=int)
    p.add_argument("--preview", action="store_true")
    args = p.parse_args()
    if args.benchmark is not None and args.benchmark < 1:
        p.error("--benchmark must be positive")
    try:
        plan = load_plan(args.plan)
        if args.preview:
            print("\n\n".join(c["text"] for c in plan["chunks"]))
        else:
            generate(plan, Path(args.output), args.device, args.benchmark)
    except (ValueError, OSError, RuntimeError) as error:
        p.exit(1, f"Stopped: {error}\nIf MPS failed, retry --device cpu with a new output folder.\n")


if __name__ == "__main__":
    main()

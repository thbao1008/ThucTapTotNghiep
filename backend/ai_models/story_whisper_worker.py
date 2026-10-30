"""Private Story ASR worker using the local Whisper engine, without forced alignment.

Pronunciation assessments still use transcribe_whisperx.py. Story needs a prompt
transcript and replay timings, so faster-whisper's native word timestamps avoid
loading an additional alignment model or classifying every individual word.
"""
import contextlib
import json
import os
import subprocess
import sys


def device_failure(error):
    message = str(error).lower()
    return any(part in message for part in ("cuda", "cublas", "cudnn", "dll", "library"))


def decode_story_audio(audio_path):
    # Use the same installed FFmpeg strategy as WhisperX. Passing float audio
    # directly also avoids PyAV API differences between installed versions.
    import numpy as np
    decoded = subprocess.run(["ffmpeg", "-nostdin", "-threads", "1", "-i", audio_path,
        "-f", "s16le", "-ac", "1", "-acodec", "pcm_s16le", "-ar", "16000", "-"],
        stdout=subprocess.PIPE, stderr=subprocess.PIPE, check=True, timeout=60)
    return np.frombuffer(decoded.stdout, np.int16).astype(np.float32) / 32768.0


class StoryTranscriber:
    def __init__(self, model_factory, gpu_count=0, cpu_threads=4, audio_loader=decode_story_audio):
        self.model_factory = model_factory
        self.audio_loader = audio_loader
        self.cpu_threads = max(1, min(4, cpu_threads))
        self.device = "cuda" if gpu_count else "cpu"
        try:
            self.model = self.load(self.device)
        except Exception:
            if self.device != "cuda":
                raise
            self.device = "cpu"
            self.model = self.load("cpu")

    def load(self, device):
        return self.model_factory("base", device=device,
            compute_type="float16" if device == "cuda" else "int8",
            cpu_threads=self.cpu_threads, num_workers=1, local_files_only=True)

    def segments(self, audio):
        # The segment iterator performs inference lazily: consume it inside the
        # try block so a missing CUDA runtime can fall back exactly once.
        segments, info = self.model.transcribe(audio, language="en",
            beam_size=1, best_of=1, temperature=0, condition_on_previous_text=False,
            word_timestamps=True, vad_filter=True)
        return list(segments), info

    def transcribe(self, audio_path):
        audio = self.audio_loader(audio_path)
        if hasattr(audio, "size") and not audio.size:
            return {"language": "en", "text": "", "segments": [], "words": []}
        try:
            segments, info = self.segments(audio)
        except Exception as error:
            if self.device != "cuda" or not device_failure(error):
                raise
            self.device = "cpu"
            self.model = self.load("cpu")
            segments, info = self.segments(audio)

        output_segments, words = [], []
        for segment in segments:
            segment_words = [{"word": word.word.strip(), "start": word.start,
                "end": word.end, "score": word.probability, "lang": "en"}
                for word in (segment.words or []) if word.word.strip()]
            words.extend(segment_words)
            output_segments.append({"start": segment.start, "end": segment.end,
                "text": segment.text.strip(), "segment_words": segment_words})
        return {"language": info.language, "text": " ".join(
            segment["text"] for segment in output_segments if segment["text"]),
            "segments": output_segments, "words": words}


def create_transcriber():
    import ctranslate2
    from faster_whisper import WhisperModel
    try:
        gpu_count = ctranslate2.get_cuda_device_count()
    except Exception:
        gpu_count = 0
    return StoryTranscriber(WhisperModel, gpu_count=gpu_count,
        cpu_threads=os.cpu_count() or 1)


def serve(input_stream=None, protocol=None, transcriber_factory=create_transcriber):
    protocol = protocol or sys.stdout
    input_stream = input_stream or sys.stdin
    # Third-party imports/inference print progress. Keep stdout JSON-lines only.
    with contextlib.redirect_stdout(sys.stderr):
        transcriber = transcriber_factory()
    # "ready" now means the ASR model has actually loaded, not just imports.
    protocol.write(json.dumps({"ready": True}) + "\n")
    protocol.flush()
    for line in input_stream:
        request = None
        try:
            request = json.loads(line)
            with contextlib.redirect_stdout(sys.stderr):
                result = transcriber.transcribe(request["audioPath"])
                # Production Story keeps this in memory. Explicit smoke-test
                # output paths remain supported for the existing runner API.
                if request.get("outputPath"):
                    output_path = request["outputPath"]
                    os.makedirs(os.path.dirname(output_path) or ".", exist_ok=True)
                    with open(output_path, "w", encoding="utf-8") as output:
                        json.dump(result, output, ensure_ascii=False)
            response = {"id": request["id"], "ok": True, "json": result}
        except Exception:
            # Do not expose paths, transcripts or third-party diagnostics in errors.
            response = {"id": request.get("id") if isinstance(request, dict) else None,
                        "ok": False, "code": "STORY_TRANSCRIPTION_FAILED"}
        protocol.write(json.dumps(response, ensure_ascii=False) + "\n")
        protocol.flush()


if __name__ == "__main__":
    serve()

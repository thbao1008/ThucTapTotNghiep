#!/usr/bin/env python3
import whisperx
import torch
import os
import sys
import json
import argparse
import traceback

# Ensure stdout/stderr use UTF-8 (prevents UnicodeEncodeError on Windows)
try:
    sys.stdout.reconfigure(encoding="utf-8")
    sys.stderr.reconfigure(encoding="utf-8")
except Exception:
    pass

# Optional: lightweight language detection per word
# langdetect đôi khi không chính xác với từ rất ngắn; dùng cho đánh dấu tham khảo
try:
    from langdetect import detect
except Exception:
    detect = None

def detect_language_per_word(words):
    if not isinstance(words, list):
        return []
    for w in words:
        try:
            token = w.get("word") if isinstance(w, dict) else None
            if not token:
                lang = "unknown"
            elif detect:
                lang = detect(token)
            else:
                # Fallback: heuristic theo unicode block (Latin vs non-Latin)
                # rất thô nhưng đủ để đánh dấu non-English cơ bản
                has_non_latin = any(ord(ch) > 0x024F for ch in token)
                lang = "en" if not has_non_latin else "nonlatin"
            w["lang"] = lang
        except Exception:
            w["lang"] = "unknown"
    return words

def run_whisperx(audio_path, output_path="outputs/record.json", model_size="base", language=None, compute_type=None):
    if not os.path.exists(audio_path):
        raise FileNotFoundError(f"Không tìm thấy file audio: {audio_path}")

    out_dir = os.path.dirname(output_path) or "."
    os.makedirs(out_dir, exist_ok=True)

    # Tự động phát hiện và ưu tiên GPU, với fallback về CPU nếu lỗi
    device = "cuda" if torch.cuda.is_available() else "cpu"
    original_device = device
    
    # Tự động chọn compute_type dựa trên device
    # GPU: dùng float16 để nhanh hơn, CPU: dùng float32 để chính xác hơn
    if compute_type is None:
        if device == "cuda":
            compute_type = "float16"  # GPU: ưu tiên tốc độ
        else:
            compute_type = "float32"  # CPU: ưu tiên độ chính xác
    
    # Log thông tin GPU nếu có - ưu tiên GPU laptop
    if device == "cuda":
        try:
            gpu_name = torch.cuda.get_device_name(0)
            gpu_memory = torch.cuda.get_device_properties(0).total_memory / (1024**3)  # GB
            cuda_version = torch.version.cuda
            print(f"[whisperx] 🚀 GPU detected: {gpu_name} ({gpu_memory:.1f} GB) - transcribe_whisperx.py:69", flush=True)
            print(f"[whisperx] CUDA version: {cuda_version} - transcribe_whisperx.py:70", flush=True)
            print(f"[whisperx] PyTorch version: {torch.__version__} - transcribe_whisperx.py:71", flush=True)
            
            # Kiểm tra tương thích CUDA 12.x
            if cuda_version and cuda_version.startswith("12."):
                print(f"[whisperx] ✅ CUDA 12.x detected  compatible with PyTorch {torch.__version__} - transcribe_whisperx.py:75", flush=True)
        except Exception as e:
            print(f"[whisperx] ⚠️  GPU detected but error accessing: {e}, falling back to CPU - transcribe_whisperx.py:77", flush=True)
            device = "cpu"
            compute_type = "float32"
    else:
        print(f"[whisperx] ⚠️  GPU not available, using CPU - transcribe_whisperx.py:81", flush=True)
    
    print(f"[whisperx] Running on: {audio_path} - transcribe_whisperx.py:83", flush=True)
    print(f"[whisperx] Model: {model_size} | Device: {device} | compute_type: {compute_type} - transcribe_whisperx.py:84", flush=True)

    # Set env for ctranslate2 - ưu tiên GPU nếu có
    os.environ.setdefault("CT2_COMPUTE_TYPE", compute_type)
    if device == "cuda":
        # Ưu tiên GPU laptop (GPU 0) cho ctranslate2
        os.environ.setdefault("CUDA_VISIBLE_DEVICES", "0")
        # Đảm bảo sử dụng GPU cho PyTorch
        print(f"[whisperx] ✅ Using GPU 0 (laptop GPU) - transcribe_whisperx.py:92", flush=True)

    # Load model với fallback về CPU nếu GPU lỗi
    model = None
    try:
        if device == "cuda":
            try:
                # Thử load với GPU
                model = whisperx.load_model(model_size, device, compute_type=compute_type)
            except (RuntimeError, OSError) as gpu_err:
                # Nếu lỗi CUDA (như cublas64_12.dll not found), fallback về CPU
                error_str = str(gpu_err).lower()
                if "cublas" in error_str or "cuda" in error_str or "dll" in error_str or "library" in error_str:
                    print(f"[whisperx] ⚠️  GPU error ({gpu_err}), falling back to CPU - transcribe_whisperx.py:105", flush=True)
                    print(f"[whisperx] 💡 Tip: Ensure CUDA 12.1 libraries are installed correctly - transcribe_whisperx.py:106", flush=True)
                    device = "cpu"
                    compute_type = "float32"
                    os.environ["CT2_COMPUTE_TYPE"] = compute_type
                    model = whisperx.load_model(model_size, device, compute_type=compute_type)
                else:
                    raise
        else:
            # CPU mode
            try:
                model = whisperx.load_model(model_size, device, compute_type=compute_type)
            except TypeError:
                # older whisperx API may not accept compute_type param; rely on env var
                model = whisperx.load_model(model_size, device)
    except Exception as e:
        error_str = str(e).lower()
        # Kiểm tra nếu là lỗi torchvision compatibility
        if "torchvision" in error_str or "nms" in error_str or "extension" in error_str:
            print(f"[whisperx] ❌ Torchvision compatibility error detected - transcribe_whisperx.py:124", flush=True)
            print(f"[whisperx] 💡 To fix: Run 'python backend/scripts/fix_torchvision.py' - transcribe_whisperx.py:125", flush=True)
            print(f"[whisperx] 💡 Or manually: pip uninstall torch torchvision y && pip install torch torchvision - transcribe_whisperx.py:126", flush=True)
            raise RuntimeError(
                "Torchvision compatibility error. Please run fix_torchvision.py script or reinstall torch/torchvision. "
                f"Original error: {e}"
            )
        
        # Nếu vẫn lỗi, thử không truyền compute_type
        print(f"[whisperx] ⚠️  Error loading model with compute_type, trying without: {e} - transcribe_whisperx.py:133", flush=True)
        try:
            model = whisperx.load_model(model_size, device)
        except Exception as e2:
            print(f"[whisperx] ❌ Failed to load model: {e2} - transcribe_whisperx.py:137", flush=True)
            raise

    # Transcribe (language optional)
    # For English speaking practice, default to "en" if not specified
    if not language:
        language = "en"
    result = model.transcribe(audio_path, language=language)

    # Align words - handle cases where alignment model doesn't exist for detected language
    # Sử dụng device hiện tại (có thể đã fallback về CPU)
    detected_lang = result.get("language", language)
    aligned_result = None
    word_segments = []
    
    try:
        align_model, metadata = whisperx.load_align_model(language_code=detected_lang, device=device)
        aligned_result = whisperx.align(result["segments"], align_model, metadata, audio_path, device)
        word_segments = aligned_result.get("word_segments") or []
    except (RuntimeError, OSError) as align_gpu_err:
        # Nếu lỗi CUDA khi align, thử fallback về CPU
        if ("cublas" in str(align_gpu_err).lower() or "cuda" in str(align_gpu_err).lower() or "dll" in str(align_gpu_err).lower()) and device == "cuda":
            print(f"[whisperx] ⚠️  GPU error during alignment ({align_gpu_err}), trying CPU - transcribe_whisperx.py:159", flush=True)
            try:
                align_model, metadata = whisperx.load_align_model(language_code=detected_lang, device="cpu")
                aligned_result = whisperx.align(result["segments"], align_model, metadata, audio_path, "cpu")
                word_segments = aligned_result.get("word_segments") or []
            except Exception as cpu_err:
                print(f"[whisperx] ⚠️  CPU alignment also failed: {cpu_err}, continuing without alignment - transcribe_whisperx.py:165", flush=True)
        else:
            raise
    except ValueError as e:
        # If alignment model doesn't exist for detected language, try English as fallback
        if detected_lang != "en":
            print(f"[whisperx] Warning: No alignmodel for language '{detected_lang}', trying English fallback - transcribe_whisperx.py:171", flush=True)
            try:
                align_model, metadata = whisperx.load_align_model(language_code="en", device=device)
                aligned_result = whisperx.align(result["segments"], align_model, metadata, audio_path, device)
                word_segments = aligned_result.get("word_segments") or []
            except Exception as fallback_err:
                print(f"[whisperx] Warning: Could not align with English fallback either: {fallback_err} - transcribe_whisperx.py:177", flush=True)
                # Continue without alignment - still return transcription result
        else:
            print(f"[whisperx] Warning: Could not align words: {e} - transcribe_whisperx.py:180", flush=True)
            # Continue without alignment - still return transcription result
    except Exception as e:
        print(f"[whisperx] Warning: Alignment failed: {e}, continuing without alignment - transcribe_whisperx.py:183", flush=True)
        # Continue without alignment - still return transcription result

    # Attach language per word (use word_segments from alignment if available)
    if not word_segments and aligned_result:
        word_segments = aligned_result.get("word_segments") or []
    words_with_lang = detect_language_per_word(word_segments)

    # Build segments with words grouped per segment for FE "conversation view"
    # WhisperX returns segment-level start/end; words have their own start/end.
    # FE có thể dùng trực tiếp result["segments"]; ở đây thêm "segment_words" để tiện mapping.
    segments = result.get("segments") or []
    if segments and words_with_lang:
        # Gán words vào mỗi segment theo khoảng thời gian
        for seg in segments:
            s = float(seg.get("start", 0.0))
            e = float(seg.get("end", s))
            seg_words = [w for w in words_with_lang if isinstance(w, dict) and float(w.get("start", -1)) >= s and float(w.get("end", -1)) <= e]
            seg["segment_words"] = seg_words

    # Extract full text from segments
    full_text = " ".join([seg.get("text", "") for seg in segments if seg.get("text")])
    
    output = {
        "language": result.get("language"),
        "text": full_text,
        "segments": segments,
        "words": words_with_lang
    }

    with open(output_path, "w", encoding="utf-8") as f:
        json.dump(output, f, ensure_ascii=False, indent=2)

    print(f"[whisperx] Saved result to: {output_path} - transcribe_whisperx.py:216", flush=True)
    return output

def main():
    parser = argparse.ArgumentParser(description="Transcribe audio with WhisperX and produce JSON output.")
    parser.add_argument("input", help="Path to input audio file")
    parser.add_argument("--output", "-o", help="Path to output JSON file (default: outputs/<basename>.json)")
    parser.add_argument("--model", "-m", default="base", help="Whisper model size (tiny, base, small, medium, large)")
    parser.add_argument("--lang", "-l", default=None, help="Language code (e.g., en, vi). If omitted, auto-detect.")
    parser.add_argument("--compute-type", default=None, choices=["float16","float32"], help="Compute type (auto-detect: float16 for GPU, float32 for CPU)")
    args = parser.parse_args()

    input_path = args.input
    output_path = args.output if args.output else os.path.join("outputs", f"{os.path.splitext(os.path.basename(input_path))[0]}.json")

    try:
        run_whisperx(input_path, output_path=output_path, model_size=args.model, language=args.lang, compute_type=args.compute_type)
        sys.exit(0)
    except Exception as e:
        print("[whisperx] Error during transcription: - transcribe_whisperx.py:235", file=sys.stderr)
        traceback.print_exc(file=sys.stderr)
        print(f"[whisperx] Failed: {str(e)} - transcribe_whisperx.py:237", file=sys.stderr)
        sys.exit(2)

if __name__ == "__main__":
    main()

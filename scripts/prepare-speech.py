"""One-time speech model preparation. No recording, provider call or database access."""
import argparse
import shutil
import sys
import os
from pathlib import Path

def main():
    parser = argparse.ArgumentParser()
    parser.add_argument('--download-models', action='store_true')
    args = parser.parse_args()
    if sys.version_info[:2] != (3, 12):
        raise RuntimeError('Use the project Python 3.12 virtual environment.')
    if not shutil.which('ffmpeg'):
        configured = os.environ.get('FFMPEG_BIN')
        if configured:
            os.environ['PATH'] = configured + os.pathsep + os.environ.get('PATH', '')
    if not shutil.which('ffmpeg'):
        root = Path(__file__).resolve().parent.parent
        for executable in sorted(root.glob('ffmpeg-*/bin/ffmpeg.exe')):
            if executable.is_file():
                os.environ['PATH'] = str(executable.parent) + os.pathsep + os.environ.get('PATH', '')
                break
    if not shutil.which('ffmpeg'):
        raise RuntimeError('Install FFmpeg and add its bin folder to PATH, then reopen CMD.')
    import whisperx
    from faster_whisper import WhisperModel
    if args.download_models:
        print('Downloading the public base English speech model and English alignment model.')
        WhisperModel('base', device='cpu', compute_type='int8')
        whisperx.load_align_model(language_code='en', device='cpu')
    else:
        WhisperModel('base', device='cpu', compute_type='int8', local_files_only=True)
    print('Speech runtime ready. No microphone or audio file was used.')

if __name__ == '__main__':
    try:
        main()
    except Exception as exc:
        print(f'Speech preparation failed ({type(exc).__name__}). Check Python, FFmpeg, network and docs/GETTING_STARTED.md.', file=sys.stderr)
        sys.exit(1)

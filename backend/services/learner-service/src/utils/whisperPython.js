import fs from 'node:fs';
import path from 'node:path';
import { execFileSync } from 'node:child_process';

export function selectWhisperPython({ backendDir, env = process.env, platform = process.platform,
  exists = fs.existsSync, probe = execFileSync } = {}) {
  if (env.WHISPERX_PYTHON_EXECUTABLE?.trim()) {
    return { executable: env.WHISPERX_PYTHON_EXECUTABLE.trim(), flags: [], source: 'configured' };
  }
  const local = path.join(backendDir, '.venv-whisperx', ...(platform === 'win32' ? ['Scripts', 'python.exe'] : ['bin', 'python']));
  if (exists(local)) return { executable: local, flags: [], source: 'project-venv' };
  const candidates = platform === 'win32'
    ? [['py', '-3'], ['py'], ['python'], ['python3']] : [['python3'], ['python']];
  for (const [executable, ...flags] of candidates) {
    try {
      // Argument arrays preserve spaces and Python code; never concatenate shell commands.
      probe(executable, [...flags, '-c', 'import whisperx'], { stdio: 'ignore', timeout: 5000, windowsHide: true });
      return { executable, flags, source: 'system' };
    } catch { /* Try another existing interpreter, without installing anything. */ }
  }
  return { executable: platform === 'win32' ? 'python' : 'python3', flags: [], source: 'fallback' };
}

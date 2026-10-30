import fs from "fs";
import {speechEnvironment} from '../../../shared/speechEnvironment.js';
import path from "path";
import { spawn } from "child_process";
import { selectWhisperPython } from "./whisperPython.js";
import { fileURLToPath } from "url";

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

export function findPythonExecutable() {
  const runtime = selectWhisperPython({ backendDir: getProjectRoot() });
  return [runtime.executable, ...runtime.flags].join(' ');
}

/**
 * Tìm project root (đi lên từ learner-service/src/utils đến root)
 */
function getProjectRoot() {
  // __dirname = backend/services/learner-service/src/utils
  // Đi lên 3 cấp: utils -> src -> learner-service -> services -> backend
  return path.resolve(__dirname, "..", "..", "..", "..");
}

/**
 * Chạy WhisperX để transcribe audio file
 * @param {string} audioPath - Đường dẫn đến file audio
 * @param {object} options - Options: {model, computeType, outputPath, timeoutMs}
 * @returns {Promise<{json: object, text: string, outputPath?: string}>}
 */
export async function runWhisperX(audioPath, options = {}) {
  if (!audioPath) throw new Error("audioPath is required");

  const backendDir = getProjectRoot();
  
  // ✅ Sửa đường dẫn đúng tới backend/ai_models/transcribe_whisperx.py
  const scriptPath = path.resolve(backendDir, "ai_models", "transcribe_whisperx.py");
  
  if (!fs.existsSync(scriptPath)) {
    throw new Error(`WhisperX script not found at ${scriptPath}`);
  }
  if (!fs.existsSync(audioPath)) {
    throw new Error(`Input audio not found: ${audioPath}`);
  }

  const outputsDir = path.resolve(backendDir, "outputs");
  if (!fs.existsSync(outputsDir)) fs.mkdirSync(outputsDir, { recursive: true });

  const base = path.basename(audioPath, path.extname(audioPath));
  const outputPath = options.outputPath || path.join(outputsDir, `${base}.json`);
  const model = options.model || "base";
  // Không truyền computeType mặc định - để Python tự động phát hiện GPU và chọn float16
  const computeType = options.computeType || null;
  const lang = options.lang || null;
  const timeoutMs = typeof options.timeoutMs === "number" ? options.timeoutMs : 5 * 60 * 1000;

  return new Promise((resolve, reject) => {
    const env = speechEnvironment(backendDir, {env: {
      ...process.env,
      PYTHONIOENCODING: "utf-8",
      PYTHONUTF8: "1"
    }});

    // Chỉ set CT2_COMPUTE_TYPE nếu có computeType được chỉ định
    if (computeType) {
      env.CT2_COMPUTE_TYPE = computeType;
    }

    const args = ["-u", scriptPath, audioPath, "--output", outputPath, "--model", model];
    // Chỉ thêm --compute-type nếu được chỉ định
    if (computeType) {
      args.push("--compute-type", computeType);
    }
    if (lang) args.push("--lang", lang);

    const runtime = selectWhisperPython({ backendDir });
    const pythonExec = runtime.executable;
    const pythonFlags = runtime.flags;
    console.log('[whisperxRunner] Python source:', runtime.source);
    
    const finalArgs = [...pythonFlags, ...args];
    
    const py = spawn(pythonExec, finalArgs, { 
      cwd: backendDir, 
      env, 
      shell: false,
      windowsHide: true
    });

    let stderr = "";
    let stdout = "";
    let killedByTimeout = false;

    const timer = setTimeout(() => {
      killedByTimeout = true;
      try { py.kill("SIGKILL"); } catch (e) {}
    }, timeoutMs);

    py.stdout.on("data", (d) => { stdout += d.toString(); });
    py.stderr.on("data", (d) => { 
      const stderrStr = d.toString();
      // Ignore pkg_resources deprecation warnings
      if (!stderrStr.includes("pkg_resources is deprecated")) {
        stderr += stderrStr;
      }
    });

    py.on("error", (err) => {
      clearTimeout(timer);
      reject(new Error(`Failed to spawn python: ${err.message}`));
    });

    py.on("close", (code, signal) => {
      clearTimeout(timer);
      if (killedByTimeout) {
        return reject(new Error(`whisperx timed out after ${timeoutMs}ms`));
      }

      if (code === 0) {
        if (fs.existsSync(outputPath)) {
          try {
            const txt = fs.readFileSync(outputPath, "utf8");
            const parsed = JSON.parse(txt);
            const text = parsed.text || (parsed.segments || []).map(s => s.text || "").join(" ");
            return resolve({ json: parsed, text, outputPath });
          } catch (e) {
            try {
              const parsedStdout = stdout ? JSON.parse(stdout) : null;
              if (parsedStdout) {
                const text = parsedStdout.text || (parsedStdout.segments || []).map(s => s.text || "").join(" ");
                return resolve({ json: parsedStdout, text, outputPath: null });
              }
              return reject(new Error(`whisperx finished but cannot parse output: ${e.message}`));
            } catch (e2) {
              return reject(new Error(`whisperx finished but cannot parse output: ${e.message}`));
            }
          }
        } else {
          try {
            const parsedStdout = stdout ? JSON.parse(stdout) : null;
            if (parsedStdout) {
              const text = parsedStdout.text || (parsedStdout.segments || []).map(s => s.text || "").join(" ");
              return resolve({ json: parsedStdout, text, outputPath: null });
            }
            return reject(new Error("whisperx finished but no output file and stdout is not JSON"));
          } catch (e) {
            return reject(new Error("whisperx finished but no output file and stdout is not JSON"));
          }
        }
      } else {
        const msg = stderr || stdout || `Exited with code ${code} (signal ${signal})`;
        
        // Kiểm tra nếu lỗi là ModuleNotFoundError: No module named 'whisperx'
        if (msg.includes("ModuleNotFoundError") && msg.includes("whisperx")) {
          const errorMsg = `whisperx module not found in Python environment.\n` +
            `Python executable used: ${pythonExec}\n` +
            `Configure WHISPERX_PYTHON_EXECUTABLE to an environment with whisperx.\n` +
            `Full error: ${msg}`;
          return reject(new Error(errorMsg));
        }
        
        return reject(new Error(`whisperx exited ${code}. stderr: ${msg}`));
      }
    });
  });
}


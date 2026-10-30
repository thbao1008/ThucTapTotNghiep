import { randomUUID } from "node:crypto";
import { createWriteStream } from "node:fs";
import { mkdir, open, realpath, stat, unlink } from "node:fs/promises";
import path from "node:path";
import { pipeline } from "node:stream/promises";

export const MAX_FILE_SIZE_BYTES = 25 * 1024 * 1024;
export const MAX_JSON_BODY_BYTES = 256 * 1024;
export const MAX_MULTIPART_REQUEST_BYTES = MAX_FILE_SIZE_BYTES + 64 * 1024;

const audioTypes = new Map([
  ["audio/webm", { extension: ".webm", signature: bytes => bytes.length >= 4 && bytes.subarray(0, 4).equals(Buffer.from([0x1a, 0x45, 0xdf, 0xa3])) }],
  ["audio/ogg", { extension: ".ogg", acceptedExtensions: [".ogg", ".oga", ".webm"], signature: bytes => bytes.subarray(0, 4).toString("ascii") === "OggS" }],
  ["audio/wav", { extension: ".wav", acceptedExtensions: [".wav", ".webm"], signature: bytes => bytes.length >= 12 && bytes.toString("ascii", 0, 4) === "RIFF" && bytes.toString("ascii", 8, 12) === "WAVE" }],
  ["audio/x-wav", { extension: ".wav", acceptedExtensions: [".wav", ".webm"], signature: bytes => bytes.length >= 12 && bytes.toString("ascii", 0, 4) === "RIFF" && bytes.toString("ascii", 8, 12) === "WAVE" }],
  ["audio/mpeg", { extension: ".mp3", acceptedExtensions: [".mp3", ".webm"], signature: bytes => bytes.subarray(0, 3).toString("ascii") === "ID3" || (bytes.length >= 2 && bytes[0] === 0xff && (bytes[1] & 0xe0) === 0xe0) }],
  ["audio/mp4", { extension: ".m4a", acceptedExtensions: [".m4a", ".mp4", ".webm"], signature: bytes => bytes.length >= 8 && bytes.toString("ascii", 4, 8) === "ftyp" }]
]);

function safeOriginalName(name) {
  return typeof name === "string" && name.length > 0 && name.length <= 255 &&
    !/[\\/\u0000-\u001f\u007f]/.test(name) && path.basename(name) === name;
}

export function validateUploadMetadata(file, maxBytes = MAX_FILE_SIZE_BYTES) {
  if (!file || typeof file !== "object") return { valid: false, reason: "invalid_file" };
  if (!safeOriginalName(file.originalname)) return { valid: false, reason: "invalid_filename" };
  if (file.size !== undefined && (!Number.isSafeInteger(file.size) || file.size <= 0 || file.size > maxBytes)) {
    return { valid: false, reason: "invalid_size" };
  }

  const mimeType = typeof file.mimetype === "string" ? file.mimetype.toLowerCase().split(";")[0].trim() : "";
  const definition = audioTypes.get(mimeType);
  if (!definition) return { valid: false, reason: "unsupported_mime" };

  const extension = path.extname(file.originalname).toLowerCase();
  const acceptedExtensions = definition.acceptedExtensions || [definition.extension];
  if (!acceptedExtensions.includes(extension)) return { valid: false, reason: "mime_extension_mismatch" };
  return { valid: true, mimeType, extension: definition.extension };
}

export function getStoredFilename(extension) {
  if (![...audioTypes.values()].some(type => type.extension === extension)) {
    throw new Error("Unsupported stored file extension");
  }
  return `file-${randomUUID()}${extension}`;
}

export function resolveContainedPath(rootDirectory, filename) {
  if (typeof filename !== "string" || filename.length === 0 || filename.length > 255 ||
      filename === "." || filename === ".." || /[\\/\u0000-\u001f\u007f]/.test(filename) ||
      !/^[A-Za-z0-9][A-Za-z0-9._-]{0,254}$/.test(filename) || path.basename(filename) !== filename) {
    throw new Error("Invalid file name");
  }

  const root = path.resolve(rootDirectory);
  const candidate = path.resolve(root, filename);
  if (path.dirname(candidate) !== root) throw new Error("Path escapes upload directory");
  return candidate;
}

export function createUploadAuthGuard({ verifyToken, getSecret, requiredRole = "mentor" }) {
  return (req, res, next) => {
    const match = typeof req.headers.authorization === "string" &&
      req.headers.authorization.match(/^Bearer ([^\s]+)$/i);
    if (!match) return res.status(401).json({ message: "Authentication required" });

    let user;
    try {
      user = verifyToken(match[1], getSecret());
    } catch {
      return res.status(403).json({ message: "Invalid authentication token" });
    }

    if (typeof user?.role !== "string" || user.role.toLowerCase() !== requiredRole.toLowerCase()) {
      return res.status(403).json({ message: "Insufficient role" });
    }
    req.user = user;
    return next();
  };
}

export function createReadMethodGuard() {
  return (req, res, next) => {
    if (req.method !== "GET" && req.method !== "HEAD") {
      res.setHeader("Allow", "GET, HEAD");
      return res.status(405).json({ message: "Method not allowed" });
    }
    return next();
  };
}

export function createDeclaredRequestSizeGuard(maxBytes = MAX_MULTIPART_REQUEST_BYTES) {
  return (req, res, next) => {
    const header = req.headers["content-length"];
    if (header === undefined) return next();
    if (!/^\d+$/.test(String(header))) return res.status(400).json({ message: "Invalid Content-Length" });
    if (Number(header) > maxBytes) return res.status(413).json({ message: "Request too large" });
    return next();
  };
}

export function validateRequestSize(value, maxBytes = MAX_MULTIPART_REQUEST_BYTES) {
  if (value === undefined || value === null) return { valid: true };
  if (!/^\d+$/.test(String(value))) return { valid: false, status: 400, reason: "invalid_content_length" };
  if (Number(value) > maxBytes) return { valid: false, status: 413, reason: "request_too_large" };
  return { valid: true };
}

export async function validateFileSignature(filePath, mimeType) {
  const definition = audioTypes.get(String(mimeType).toLowerCase().split(";")[0].trim());
  if (!definition) return false;
  const handle = await open(filePath, "r");
  try {
    const buffer = Buffer.alloc(16);
    const { bytesRead } = await handle.read(buffer, 0, buffer.length, 0);
    return definition.signature(buffer.subarray(0, bytesRead));
  } finally {
    await handle.close();
  }
}

export async function validateUploadedFile(file) {
  const metadata = validateUploadMetadata(file);
  if (!metadata.valid) {
    await removeFile(file?.path);
    return { valid: false, reason: metadata.reason };
  }

  try {
    if (!(await validateFileSignature(file.path, metadata.mimeType))) {
      await removeFile(file.path);
      return { valid: false, reason: "invalid_file_signature" };
    }
    return { valid: true, ...metadata };
  } catch (error) {
    await removeFile(file.path).catch(() => {});
    throw error;
  }
}

export async function removeFile(filePath) {
  if (!filePath) return;
  await unlink(filePath).catch(error => {
    if (error.code !== "ENOENT") throw error;
  });
}

export async function ensureUploadDirectory(directory) {
  await mkdir(directory, { recursive: true });
  return realpath(directory);
}

export async function resolveCanonicalContainedFile(rootDirectory, filename) {
  const root = await realpath(rootDirectory);
  const candidate = resolveContainedPath(root, filename);
  const canonicalFile = await realpath(candidate);
  if (path.dirname(canonicalFile) !== root) throw new Error("Path escapes upload directory");
  const details = await stat(canonicalFile);
  if (!details.isFile()) throw new Error("Not a file");
  return { path: canonicalFile, stat: details };
}

export function createExclusiveDiskStorage(directory) {
  return {
    _handleFile(req, file, callback) {
      const metadata = validateUploadMetadata(file);
      if (!metadata.valid) return callback(Object.assign(new Error("Unsupported upload"), { code: "UPLOAD_REJECTED" }));
      const filename = getStoredFilename(metadata.extension);
      let filePath;
      try {
        filePath = resolveContainedPath(directory, filename);
      } catch (error) {
        return callback(error);
      }

      pipeline(file.stream, createWriteStream(filePath, { flags: "wx", mode: 0o600 }))
        .then(async () => {
          const details = await stat(filePath);
          if (details.size > MAX_FILE_SIZE_BYTES) {
            await removeFile(filePath);
            throw Object.assign(new Error("File too large"), { code: "LIMIT_FILE_SIZE" });
          }
          callback(null, { destination: directory, filename, path: filePath, size: details.size });
        })
        .catch(async error => {
          await removeFile(filePath).catch(() => {});
          callback(error);
        });
    },
    _removeFile(req, file, callback) {
      removeFile(file.path).then(() => callback(null), callback);
    }
  };
}

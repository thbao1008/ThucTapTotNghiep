import express from "express";
import cors from "cors";
import multer from "multer";
import jwt from "jsonwebtoken";
import path from "node:path";
import { createReadStream } from "node:fs";
import {
  createDeclaredRequestSizeGuard,
  createExclusiveDiskStorage,
  createReadMethodGuard,
  createUploadAuthGuard,
  MAX_FILE_SIZE_BYTES,
  MAX_JSON_BODY_BYTES,
  MAX_MULTIPART_REQUEST_BYTES,
  removeFile,
  resolveCanonicalContainedFile,
  resolveContainedPath,
  validateUploadedFile,
  validateUploadMetadata
} from "./fileSecurity.js";
import { createFileReadAuthorizer } from "./fileAuthorization.js";

export function createFileServiceApp({ uploadsDir, jwtSecret, pool, authorizeFileRead } = {}) {
  if (!uploadsDir || typeof jwtSecret !== "string" || jwtSecret.length < 32) {
    throw new TypeError("File Service upload storage and JWT secret are required");
  }

  const app = express();
  app.use(cors({ origin: "http://localhost:5173", credentials: true }));
  app.use(express.json({ limit: MAX_JSON_BODY_BYTES }));

  app.get("/health", (req, res) => {
    res.json({ status: "ok", service: "file-service" });
  });

  const authenticateMentorUpload = createUploadAuthGuard({
    verifyToken: (token, secret) => jwt.verify(token, secret, { algorithms: ["HS256"] }),
    getSecret: () => jwtSecret,
    requiredRole: "mentor"
  });
  const readAuthorizer = authorizeFileRead ||
    (pool ? createFileReadAuthorizer({ pool, jwtSecret }) : async () => ({ allowed: false, status: 503 }));
  const declaredRequestSizeLimit = createDeclaredRequestSizeGuard(MAX_MULTIPART_REQUEST_BYTES);
  const upload = multer({
    storage: createExclusiveDiskStorage(uploadsDir),
    limits: {
      fileSize: MAX_FILE_SIZE_BYTES,
      files: 1,
      fields: 0,
      parts: 1,
      fieldNameSize: 32,
      headerPairs: 32
    },
    fileFilter: (req, file, callback) => {
      const validation = validateUploadMetadata(file);
      if (!validation.valid) {
        return callback(Object.assign(new Error("Unsupported upload"), { code: "UPLOAD_REJECTED" }));
      }
      return callback(null, true);
    }
  });

  app.post("/uploads", declaredRequestSizeLimit, authenticateMentorUpload, upload.single("file"), async (req, res, next) => {
    try {
      if (!req.file) return res.status(400).json({ message: "No file uploaded" });
      const validation = await validateUploadedFile(req.file);
      if (!validation.valid) {
        return res.status(400).json({ message: "Unsupported or invalid audio file" });
      }

      return res.status(201).json({
        url: `/uploads/${req.file.filename}`,
        filename: req.file.filename
      });
    } catch (error) {
      if (req.file?.path) await removeFile(req.file.path).catch(() => {});
      return next(error);
    }
  });

  app.use("/uploads", createReadMethodGuard());
  app.use("/uploads", async (req, res, next) => {
    try {
      let filename;
      try {
        filename = decodeURIComponent(req.path.slice(1));
      } catch {
        return res.status(400).json({ message: "Invalid file path" });
      }
      resolveContainedPath(uploadsDir, filename);
      const access = await readAuthorizer({
        filename,
        authorization: req.headers.authorization
      });
      if (!access.allowed) return res.status(access.status).json({ message: "File not found" });
      req.uploadFilename = filename;
      return next();
    } catch (error) {
      if (error.message === "Invalid file name" || error.message === "Path escapes upload directory") {
        return res.status(400).json({ message: "Invalid file path" });
      }
      console.error("File access authorization failed:", error.code || error.name);
      return res.status(500).json({ message: "Unable to authorize file access" });
    }
  });
  app.use("/uploads", async (req, res) => {
    try {
      const filename = req.uploadFilename;
      if (!filename) return res.status(404).json({ message: "File not found" });
      const file = await resolveCanonicalContainedFile(uploadsDir, filename);
      const ext = path.extname(filename).toLowerCase();
      const mediaTypes = {
        ".webm": "video/webm",
        ".ogg": "audio/ogg",
        ".oga": "audio/ogg",
        ".wav": "audio/wav",
        ".mp3": "audio/mpeg",
        ".m4a": "audio/mp4",
        ".mp4": "video/mp4",
        ".jpg": "image/jpeg",
        ".jpeg": "image/jpeg",
        ".png": "image/png",
        ".gif": "image/gif",
        ".webp": "image/webp",
        ".mov": "video/quicktime",
        ".avi": "video/x-msvideo",
        ".wmv": "video/x-ms-wmv",
        ".flv": "video/x-flv",
        ".mkv": "video/x-matroska",
        ".pdf": "application/pdf"
      };
      res.setHeader("Content-Type", mediaTypes[ext] || "application/octet-stream");
      res.setHeader("Content-Disposition", `inline; filename="${path.basename(filename)}"`);
      res.setHeader("X-Content-Type-Options", "nosniff");
      res.setHeader("Content-Length", file.stat.size);
      if (req.method === "HEAD") return res.status(200).end();

      const stream = createReadStream(file.path);
      stream.on("error", () => {
        if (!res.headersSent) return res.status(500).json({ message: "Unable to read file" });
        return res.destroy();
      });
      return stream.pipe(res);
    } catch (error) {
      if (error.code === "ENOENT") return res.status(404).json({ message: "File not found" });
      if (error.message === "Invalid file name" || error.message === "Path escapes upload directory") {
        return res.status(400).json({ message: "Invalid file path" });
      }
      return res.status(500).json({ message: "Unable to read file" });
    }
  });

  app.use(async (error, req, res, next) => {
    if (req.file?.path) await removeFile(req.file.path).catch(() => {});
    if (res.headersSent) return next(error);
    if (error instanceof multer.MulterError) {
      const status = error.code === "LIMIT_FILE_SIZE" ? 413 : 400;
      return res.status(status).json({ message: "Upload rejected" });
    }
    if (error.code === "UPLOAD_REJECTED") return res.status(415).json({ message: "Unsupported upload type" });
    if (error.type === "entity.too.large") return res.status(413).json({ message: "Request too large" });
    return res.status(500).json({ message: "File operation failed" });
  });

  return app;
}

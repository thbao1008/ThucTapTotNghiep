import "dotenv/config";
import express from "express";
import cors from "cors";
import multer from "multer";
import path from "path";
import fs from "fs";
import { fileURLToPath } from "url";

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

/**
 * Tìm project root (đi lên từ file-service/src đến root)
 */
function getProjectRoot() {
  // __dirname = backend/services/file-service/src
  // Đi lên 3 cấp: src -> file-service -> services -> backend
  return path.resolve(__dirname, "..", "..", "..");
}

// Throttling for repetitive logging
const loggedMessages = new Set();
const messageLogTimestamps = new Map();

function logWithThrottle(message, throttleMs = 30000) {
  const now = Date.now();
  
  if (loggedMessages.has(message)) {
    const lastLogTime = messageLogTimestamps.get(message) || 0;
    if (now - lastLogTime < throttleMs) {
      return; // Skip logging
    }
  }
  
  console.log(message);
  loggedMessages.add(message);
  messageLogTimestamps.set(message, now);
  
  // Cleanup old timestamps (older than 5 minutes)
  for (const [msg, timestamp] of messageLogTimestamps) {
    if (now - timestamp > 300000) { // 5 minutes
      messageLogTimestamps.delete(msg);
      loggedMessages.delete(msg);
    }
  }
}

const app = express();
const PORT = process.env.FILE_SERVICE_PORT || 4011;

// Middleware
app.use(cors({ origin: "http://localhost:5173", credentials: true }));
// NOTE: Do NOT use express.json() globally - it interferes with multipart/form-data
// Only parse JSON for non-upload routes
app.use((req, res, next) => {
  // Skip JSON parsing for multipart/form-data (file uploads)
  if (req.headers['content-type'] && req.headers['content-type'].includes('multipart/form-data')) {
    return next();
  }
  express.json()(req, res, next);
});

// Health check
app.get("/health", (req, res) => {
  res.json({ status: "ok", service: "file-service" });
});

// Ensure uploads directory exists at backend/uploads
const backendDir = getProjectRoot();
const uploadsDir = path.resolve(backendDir, "uploads");
if (!fs.existsSync(uploadsDir)) {
  fs.mkdirSync(uploadsDir, { recursive: true });
}

// Multer config for file uploads
const storage = multer.diskStorage({
  destination: function (req, file, cb) {
    cb(null, uploadsDir);
  },
  filename: function (req, file, cb) {
    // Preserve original extension
    const uniqueSuffix = Date.now() + "-" + Math.round(Math.random() * 1E9);
    const ext = path.extname(file.originalname);
    cb(null, file.fieldname + "-" + uniqueSuffix + ext);
  }
});

const upload = multer({ storage: storage });

// File upload endpoint
app.post("/uploads", upload.single("file"), (req, res) => {
  if (!req.file) {
    return res.status(400).json({ error: "No file uploaded" });
  }
  
  // Verify file exists
  if (!fs.existsSync(req.file.path)) {
    console.error(`[File Service] ERROR: File was not saved! Path: ${req.file.path}`);
    return res.status(500).json({ error: "File upload failed - file not saved" });
  }
  
  // Format file URL to absolute URL (giống code cũ trong src)
  // Sử dụng x-forwarded-host và x-forwarded-proto từ API Gateway
  const protocol = req.get("x-forwarded-proto") || req.protocol || "http";
  const host = req.get("x-forwarded-host") || req.get("host") || "localhost:4000";
  const baseUrl = `${protocol}://${host}`;
  const fileUrl = `${baseUrl}/uploads/${req.file.filename}`;
  
  res.json({ url: fileUrl, filename: req.file.filename });
});

// Static uploads with proper Content-Type
// IMPORTANT: express.static with base path "/uploads" will look for files in uploadsDir/uploads/...
// But we want to serve files directly from uploadsDir, so we need to strip /uploads prefix
app.use("/uploads", (req, res, next) => {
  // Strip /uploads prefix from path
  // req.path from API Gateway will be like "/file-xxx.pdf" (already stripped by Express)
  // But we need to handle both "/file-xxx.pdf" and "/uploads/file-xxx.pdf"
  let filename = req.path.replace(/^\/uploads\//, "").replace(/^\//, "");
  const filePath = path.join(uploadsDir, filename);
  const exists = fs.existsSync(filePath);
  
  logWithThrottle(`[File Service] GET ${req.path} → ${filePath} (exists: ${exists})`);
  
  if (!exists) {
    // List files in uploads directory for debugging
    try {
      const files = fs.readdirSync(uploadsDir);
      const matchingFiles = files.filter(f => f.includes(filename.split('-')[0]) || filename.includes(f.split('-')[0]));
      console.error(`[File Service] File not found: ${filePath}`);
      console.error(`[File Service] Looking for: ${filename}`);
      if (matchingFiles.length > 0) {
        console.error(`[File Service] Similar files found: ${matchingFiles.slice(0, 5).join(', ')}`);
      }
    } catch (err) {
      console.error(`[File Service] Error listing files:`, err);
    }
    return res.status(404).json({ error: "File not found", path: req.path, filename });
  }
  
  // Serve file manually with correct Content-Type
  const ext = path.extname(filePath).toLowerCase();
  const mimeTypes = {
    '.jpg': 'image/jpeg',
    '.jpeg': 'image/jpeg',
    '.png': 'image/png',
    '.gif': 'image/gif',
    '.webp': 'image/webp',
    '.mp4': 'video/mp4',
    '.webm': 'video/webm',
    '.ogg': 'video/ogg',
    '.mov': 'video/quicktime',
    '.avi': 'video/x-msvideo',
    '.wmv': 'video/x-ms-wmv',
    '.flv': 'video/x-flv',
    '.mkv': 'video/x-matroska',
    '.pdf': 'application/pdf',
    '.mp3': 'audio/mpeg',
    '.wav': 'audio/wav',
    '.m4a': 'audio/mp4'
  };
  
  const contentType = mimeTypes[ext] || 'application/octet-stream';
  res.setHeader('Content-Type', contentType);
  res.setHeader('Content-Disposition', `inline; filename="${path.basename(filePath)}"`);
  
  // Stream file
  const fileStream = fs.createReadStream(filePath);
  fileStream.on('error', (err) => {
    console.error(`[File Service] Error reading file: ${filePath}`, err);
    if (!res.headersSent) {
      res.status(500).json({ error: "Error reading file" });
    }
  });
  fileStream.pipe(res);
});

// Error handler
app.use((err, req, res, next) => {
  console.error("File Service error:", err);
  res.status(err.status || 500).json({ 
    message: err.message || "Server error" 
  });
});

app.listen(PORT, () => {
  console.log(`📁 File Service running on port ${PORT}`);
});


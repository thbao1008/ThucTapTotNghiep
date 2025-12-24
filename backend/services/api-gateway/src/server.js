import dotenv from "dotenv";
import express from "express";
import cors from "cors";
import { createProxyMiddleware } from "http-proxy-middleware";
import { execSync } from "child_process";
import path from "path";
import { fileURLToPath } from "url";
import { dirname } from "path";
import fs from "fs";

const __filename = fileURLToPath(import.meta.url);
const __dirname = dirname(__filename);

// Track logged errors to prevent spam
const loggedErrors = new Set();
const errorLogTimestamps = new Map();

// Helper function to log errors with throttling
function logProxyError(errorKey, message, ...args) {
  const now = Date.now();
  const lastLogTime = errorLogTimestamps.get(errorKey) || 0;
  
  // Only log if we haven't logged this error in the last 30 seconds
  if (now - lastLogTime > 30000) {
    console.error(message, ...args);
    errorLogTimestamps.set(errorKey, now);
    
    // Clean up old timestamps (older than 5 minutes)
    for (const [key, timestamp] of errorLogTimestamps.entries()) {
      if (now - timestamp > 300000) {
        errorLogTimestamps.delete(key);
      }
    }
  }
}

// Load .env.docker if DOCKER=true, otherwise use default dotenv
if (process.env.DOCKER === "true") {
  const backendRoot = path.resolve(__dirname, "..", "..", "..", "..");
  const envDockerPath = path.resolve(backendRoot, ".env.docker");
  if (fs.existsSync(envDockerPath)) {
    dotenv.config({ path: envDockerPath });
    console.log(`✅ API Gateway loaded .env.docker from: ${envDockerPath}`);
  } else {
    dotenv.config(); // Fallback to default
  }
} else {
  dotenv.config(); // Default behavior for local development
}

const app = express();
const PORT = process.env.API_GATEWAY_PORT || 4000;

// Function to kill port before starting (for auto-reload)
function killPortBeforeStart(port) {
  const isWindows = process.platform === "win32";
  if (!isWindows) return;
  
  try {
    const currentPid = process.pid;
    const command = `$port = ${port}; $conns = Get-NetTCPConnection -LocalPort $port -State Listen -ErrorAction SilentlyContinue; if ($conns) { $pids = $conns | Select-Object -ExpandProperty OwningProcess -Unique; foreach ($procId in $pids) { if ($procId -and $procId -ne ${currentPid}) { try { taskkill /F /T /PID $procId 2>&1 | Out-Null; Start-Sleep -Milliseconds 300 } catch {} } } }`;
    execSync(`powershell -Command "${command}"`, { stdio: "ignore", timeout: 5000 });
    // Wait a bit for port to be released
    execSync(`powershell -Command "Start-Sleep -Milliseconds 500"`, { stdio: "ignore", timeout: 1000 });
  } catch (e) {
    // Ignore errors
  }
}

// Service URLs
const SERVICES = {
  notification: process.env.NOTIFICATION_SERVICE_URL || "http://localhost:4001",
  community: process.env.COMMUNITY_SERVICE_URL || "http://localhost:4002",
  package: process.env.PACKAGE_SERVICE_URL || "http://localhost:4003",
  purchase: process.env.PURCHASE_SERVICE_URL || "http://localhost:4004",
  user: process.env.USER_SERVICE_URL || "http://localhost:4005",
  mentor: process.env.MENTOR_SERVICE_URL || "http://localhost:4006",
  learner: process.env.LEARNER_SERVICE_URL || "http://localhost:4007",
  admin: process.env.ADMIN_SERVICE_URL || "http://localhost:4008",
  auth: process.env.AUTH_SERVICE_URL || "http://localhost:4009",
  ai: process.env.AI_SERVICE_URL || "http://localhost:4010",
  file: process.env.FILE_SERVICE_URL || "http://localhost:4011",
  // Legacy monolithic (temporary during migration)
  legacy: process.env.LEGACY_SERVICE_URL || "http://localhost:4002"
};

// Middleware
app.use(cors({ origin: "http://localhost:5173", credentials: true }));

// Health check - must be before other routes
app.get("/health", (req, res) => {
  res.json({ status: "ok", service: "api-gateway", timestamp: new Date().toISOString() });
});

// Test route to verify /uploads matching
app.use("/uploads", (req, res, next) => {
  console.log(`[API Gateway] [TEST] /uploads route matched! URL: ${req.url}, Method: ${req.method}`);
  next();
});

// File Service - Static files (MUST be before /api routes to avoid conflicts)
app.use("/uploads", createProxyMiddleware({
  target: SERVICES.file,
  changeOrigin: true,
  pathRewrite: (path, req) => {
    // IMPORTANT: Express strips /uploads prefix before passing to proxy
    // So path is "/file-xxx.webm" not "/uploads/file-xxx.webm"
    // We need to prepend /uploads: "/file-xxx.webm" -> "/uploads/file-xxx.webm"
    const newPath = `/uploads${path}`;
    console.log(`[API Gateway] [pathRewrite] ${path} → ${newPath} (original: ${req.originalUrl || req.url})`);
    return newPath;
  },
  timeout: 30000,
  proxyTimeout: 30000,
  onProxyReq: (proxyReq, req, res) => {
    // Forward all headers (except host and connection)
    Object.keys(req.headers).forEach(key => {
      const lowerKey = key.toLowerCase();
      if (lowerKey !== "host" && lowerKey !== "connection") {
        proxyReq.setHeader(key, req.headers[key]);
      }
    });
    
    // Set x-forwarded-host and x-forwarded-proto for File Service
    proxyReq.setHeader("x-forwarded-host", req.get("host") || "localhost:4000");
    proxyReq.setHeader("x-forwarded-proto", req.protocol || "http");
    
    // Always log /uploads requests for debugging
    console.log(`[API Gateway] [DEBUG] GET ${req.url} → ${SERVICES.file}${req.url}`);
  },
  onProxyRes: (proxyRes, req, res) => {
    // Set CORS headers for static files
    proxyRes.headers["access-control-allow-origin"] = "*";
    proxyRes.headers["access-control-allow-methods"] = "GET, HEAD, OPTIONS";
    proxyRes.headers["access-control-allow-headers"] = "*";
    
    // Always log response status for /uploads
    console.log(`[API Gateway] [ProxyRes] ${req.url} → ${proxyRes.statusCode} (target: ${SERVICES.file})`);
    if (proxyRes.statusCode >= 400) {
      console.error(`[API Gateway] [ProxyRes] Error: ${req.url} → ${proxyRes.statusCode}`);
    }
  },
  onError: (err, req, res) => {
    logProxyError(`uploads_${err.code}`, `[API Gateway] Proxy error for ${req.url}:`, err.message);
    if (!res.headersSent) {
      if (err.code === "ECONNREFUSED" || err.code === "ETIMEDOUT") {
        res.status(503).json({ 
          message: "File Service không khả dụng. Vui lòng kiểm tra service đã chạy chưa.",
          error: process.env.NODE_ENV === "development" ? err.message : undefined
        });
      } else {
        res.status(502).json({ 
          message: "Lỗi kết nối đến File Service.",
          error: process.env.NODE_ENV === "development" ? err.message : undefined
        });
      }
    }
  }
}));

// User & Auth Service
// NOTE: Do NOT use express.json() before proxy - it consumes the body stream
// http-proxy-middleware needs access to the raw body stream

// User Service - User routes (for users to manage their own profile)
app.use("/api/users", createProxyMiddleware({
  target: SERVICES.user,
  changeOrigin: true,
  pathRewrite: (path, req) => {
    // Express strips /api/users, leaving /me/avatar
    // User Service mounts userRoutes at /users, so path should be /users/me/avatar
    // We need to add /users prefix: /me/avatar -> /users/me/avatar
    const newPath = `/users${path}`;
    if (process.env.NODE_ENV === "development") {
      console.log(`[API Gateway] [users] PathRewrite: ${path} → ${newPath}`);
    }
    return newPath;
  },
  timeout: 30000,
  proxyTimeout: 30000,
  onProxyReq: (proxyReq, req, res) => {
    // Forward all headers (except host and connection)
    Object.keys(req.headers).forEach(key => {
      const lowerKey = key.toLowerCase();
      if (lowerKey !== "host" && lowerKey !== "connection") {
        proxyReq.setHeader(key, req.headers[key]);
      }
    });
    
    // Set x-forwarded-host and x-forwarded-proto for microservices to build correct URLs
    proxyReq.setHeader("x-forwarded-host", req.get("host") || "localhost:4000");
    proxyReq.setHeader("x-forwarded-proto", req.protocol || "http");
  },
  onError: (err, req, res) => {
    logProxyError(`users_${err.code}`, `[API Gateway] Proxy error for ${req.url}:`, err.message);
    if (!res.headersSent) {
      if (err.code === "ECONNREFUSED" || err.code === "ETIMEDOUT") {
        res.status(503).json({ 
          message: "User Service không khả dụng. Vui lòng kiểm tra service đã chạy chưa.",
          error: process.env.NODE_ENV === "development" ? err.message : undefined
        });
      } else {
        res.status(502).json({ 
          message: "Lỗi kết nối đến User Service.",
          error: process.env.NODE_ENV === "development" ? err.message : undefined
        });
      }
    }
  }
}));

app.use("/api/auth", createProxyMiddleware({
  target: SERVICES.user,
  changeOrigin: true,
  pathRewrite: (path, req) => {
    // IMPORTANT: Express strips /api/auth before passing to proxy
    // So path is "/login" not "/api/auth/login"
    // We need to add /auth prefix: "/login" -> "/auth/login"
    const newPath = `/auth${path}`;
    console.log(`[API Gateway] /api/auth${path} → ${SERVICES.user}${newPath}`);
    return newPath;
  },
  timeout: 30000, // 30 seconds timeout
  proxyTimeout: 30000,
  ws: true, // Enable websocket proxying
  logLevel: "warn", // Reduce log noise
  onProxyReq: (proxyReq, req, res) => {
    // Forward all headers (except host and connection)
    Object.keys(req.headers).forEach(key => {
      const lowerKey = key.toLowerCase();
      if (lowerKey !== "host" && lowerKey !== "connection") {
        proxyReq.setHeader(key, req.headers[key]);
      }
    });
    
    // http-proxy-middleware automatically forwards the body stream
    // Log request for debugging
    const targetPath = `/auth${req.url.replace("/api/auth", "")}`;
    console.log(`[API Gateway] ${req.method} ${req.url} → ${SERVICES.user}${targetPath}`);
    if (req.body) {
      console.log(`[API Gateway] Body: ${JSON.stringify(req.body).substring(0, 100)}`);
    }
  },
  onError: (err, req, res) => {
    logProxyError(`auth_${err.code}`, `[API Gateway] Proxy error for ${req.url}:`, err.message);
    if (!res.headersSent) {
      // Check error type
      if (err.code === "ECONNREFUSED" || err.code === "ETIMEDOUT") {
        res.status(503).json({ 
          message: "User Service không khả dụng. Vui lòng kiểm tra service đã chạy chưa.",
          error: process.env.NODE_ENV === "development" ? err.message : undefined
        });
      } else if (err.code === "ECONNRESET" || err.message?.includes("socket hang up")) {
        // Client disconnected, don't send error
        return;
      } else {
        res.status(502).json({ 
          message: "Lỗi kết nối đến User Service.",
          error: process.env.NODE_ENV === "development" ? err.message : undefined
        });
      }
    }
  },
  onProxyRes: (proxyRes, req, res) => {
    // Log successful responses in dev mode
    if (process.env.NODE_ENV === "development" && proxyRes.statusCode >= 400) {
      console.log(`[API Gateway] ${req.method} ${req.url} → ${proxyRes.statusCode}`);
    }
  }
}));

// Notification Service
app.use("/api/notifications", createProxyMiddleware({
  target: SERVICES.notification,
  changeOrigin: true,
  pathRewrite: (path, req) => {
    // Express strips /api/notifications, leaving /unread-count
    // We need to add /notifications prefix: /unread-count -> /notifications/unread-count
    const newPath = `/notifications${path}`;
    if (process.env.NODE_ENV === "development") {
      console.log(`[API Gateway] PathRewrite: ${path} → ${newPath} (original URL: ${req.originalUrl || req.url})`);
    }
    return newPath;
  },
  timeout: 30000,
  proxyTimeout: 30000,
  onProxyReq: (proxyReq, req, res) => {
    // Forward all headers (except host and connection)
    Object.keys(req.headers).forEach(key => {
      const lowerKey = key.toLowerCase();
      if (lowerKey !== "host" && lowerKey !== "connection") {
        proxyReq.setHeader(key, req.headers[key]);
      }
    });
    
    // Set x-forwarded-host and x-forwarded-proto for microservices to build correct URLs
    proxyReq.setHeader("x-forwarded-host", req.get("host") || "localhost:4000");
    proxyReq.setHeader("x-forwarded-proto", req.protocol || "http");
  },
  onError: (err, req, res) => {
    logProxyError(`notifications_${err.code}`, "Proxy error for /api/notifications:", err.message);
    if (!res.headersSent) {
      res.status(502).json({ 
        message: "Không thể kết nối đến Notification Service.",
        error: process.env.NODE_ENV === "development" ? err.message : undefined
      });
    }
  }
}));

// Community Service
app.use("/api/community", createProxyMiddleware({
  target: SERVICES.community,
  changeOrigin: true,
  pathRewrite: (path, req) => {
    // Express strips /api/community, leaving /posts
    // We need to add /community prefix: /posts -> /community/posts
    const newPath = `/community${path}`;
    if (process.env.NODE_ENV === "development") {
      console.log(`[API Gateway] PathRewrite: ${path} → ${newPath} (original URL: ${req.originalUrl || req.url})`);
    }
    return newPath;
  },
  timeout: 30000,
  proxyTimeout: 30000,
  onProxyReq: (proxyReq, req, res) => {
    // Forward all headers (except host and connection)
    Object.keys(req.headers).forEach(key => {
      const lowerKey = key.toLowerCase();
      if (lowerKey !== "host" && lowerKey !== "connection") {
        proxyReq.setHeader(key, req.headers[key]);
      }
    });
    
    // Set x-forwarded-host and x-forwarded-proto for microservices to build correct URLs
    proxyReq.setHeader("x-forwarded-host", req.get("host") || "localhost:4000");
    proxyReq.setHeader("x-forwarded-proto", req.protocol || "http");
  },
  onError: (err, req, res) => {
    logProxyError(`community_${err.code}`, "Proxy error for /api/community:", err.message);
    if (!res.headersSent) {
      res.status(502).json({ 
        message: "Không thể kết nối đến Community Service.",
        error: process.env.NODE_ENV === "development" ? err.message : undefined
      });
    }
  }
}));

// Package Service
app.use("/api/packages", createProxyMiddleware({
  target: SERVICES.package,
  changeOrigin: true,
  pathRewrite: (path, req) => {
    // Express strips /api/packages, leaving /public
    // We need to add /packages back: /public -> /packages/public
    return `/packages${path}`;
  },
  onProxyReq: (proxyReq, req, res) => {
    // Forward all headers (except host and connection)
    Object.keys(req.headers).forEach(key => {
      const lowerKey = key.toLowerCase();
      if (lowerKey !== "host" && lowerKey !== "connection") {
        proxyReq.setHeader(key, req.headers[key]);
      }
    });
    
    // Set x-forwarded-host and x-forwarded-proto for microservices to build correct URLs
    proxyReq.setHeader("x-forwarded-host", req.get("host") || "localhost:4000");
    proxyReq.setHeader("x-forwarded-proto", req.protocol || "http");
  },
  onError: (err, req, res) => {
    logProxyError(`packages_${err.code}`, "Proxy error for /api/packages:", err.message);
    if (!res.headersSent) {
      res.status(502).json({ 
        message: "Không thể kết nối đến Package Service.",
        error: process.env.NODE_ENV === "development" ? err.message : undefined
      });
    }
  }
}));

// Purchase Service
app.use("/api/purchases", createProxyMiddleware({
  target: SERVICES.purchase,
  changeOrigin: true,
  pathRewrite: { "^/api": "" },
  onProxyReq: (proxyReq, req, res) => {
    // Forward all headers (except host and connection)
    Object.keys(req.headers).forEach(key => {
      const lowerKey = key.toLowerCase();
      if (lowerKey !== "host" && lowerKey !== "connection") {
        proxyReq.setHeader(key, req.headers[key]);
      }
    });
    
    // Set x-forwarded-host and x-forwarded-proto for microservices to build correct URLs
    proxyReq.setHeader("x-forwarded-host", req.get("host") || "localhost:4000");
    proxyReq.setHeader("x-forwarded-proto", req.protocol || "http");
  }
}));

// Mentor Service
app.use("/api/mentors", createProxyMiddleware({
  target: SERVICES.mentor,
  changeOrigin: true,
  pathRewrite: (path, req) => {
    // Express strips /api/mentors, leaving /by-user/78
    // We need to add /mentors prefix: /by-user/78 -> /mentors/by-user/78
    const newPath = `/mentors${path}`;
    if (process.env.NODE_ENV === "development") {
      console.log(`[API Gateway] PathRewrite: ${path} → ${newPath} (original URL: ${req.originalUrl || req.url})`);
    }
    return newPath;
  },
  timeout: 30000,
  proxyTimeout: 30000,
  onProxyReq: (proxyReq, req, res) => {
    // Forward all headers (except host and connection) for multipart/form-data support
    Object.keys(req.headers).forEach(key => {
      const lowerKey = key.toLowerCase();
      if (lowerKey !== "host" && lowerKey !== "connection") {
        proxyReq.setHeader(key, req.headers[key]);
      }
    });
    
    // Set x-forwarded-host and x-forwarded-proto for microservices to build correct URLs
    proxyReq.setHeader("x-forwarded-host", req.get("host") || "localhost:4000");
    proxyReq.setHeader("x-forwarded-proto", req.protocol || "http");
    
    // http-proxy-middleware automatically forwards the body stream for multipart/form-data
  },
  onError: (err, req, res) => {
    logProxyError(`mentors_${err.code}`, "Proxy error for /api/mentors:", err.message);
    if (!res.headersSent) {
      res.status(502).json({ 
        message: "Không thể kết nối đến Mentor Service.",
        error: process.env.NODE_ENV === "development" ? err.message : undefined
      });
    }
  }
}));

// Challenge routes - proxy to Learner Service (must be before /api/learners)
app.use("/api/challenges", createProxyMiddleware({
  target: SERVICES.learner,
  changeOrigin: true,
  pathRewrite: (path, req) => {
    // Express strips /api/challenges, leaving / or /:id
    // We need to add /learners/challenges prefix: / -> /learners/challenges, /:id -> /learners/challenges/:id
    return `/learners/challenges${path === "/" ? "" : path}`;
  },
  timeout: 30000,
  proxyTimeout: 30000,
  onProxyReq: (proxyReq, req, res) => {
    if (req.headers.authorization) {
      proxyReq.setHeader("authorization", req.headers.authorization);
    }
  },
  onError: (err, req, res) => {
    logProxyError(`challenges_${err.code}`, "Proxy error for /api/challenges:", err.message);
    if (!res.headersSent) {
      res.status(502).json({ 
        message: "Không thể kết nối đến Learner Service.",
        error: process.env.NODE_ENV === "development" ? err.message : undefined
      });
    }
  }
}));

// Learner Service
app.use("/api/learners", createProxyMiddleware({
  target: SERVICES.learner,
  changeOrigin: true,
  pathRewrite: (path, req) => {
    // Express strips /api/learners, leaving /by-user/753 or /speaking-practice/...
    // We need to add /learners prefix: /by-user/753 -> /learners/by-user/753
    const newPath = `/learners${path}`;
    if (process.env.NODE_ENV === "development") {
      console.log(`[API Gateway] PathRewrite: ${path} → ${newPath} (original URL: ${req.originalUrl || req.url})`);
    }
    return newPath;
  },
  timeout: 60000, // 60 seconds for long-running operations (submissions, analysis)
  proxyTimeout: 60000,
  onProxyReq: (proxyReq, req, res) => {
    // Forward all headers (except host and connection)
    Object.keys(req.headers).forEach(key => {
      const lowerKey = key.toLowerCase();
      if (lowerKey !== "host" && lowerKey !== "connection") {
        proxyReq.setHeader(key, req.headers[key]);
      }
    });
    
    // Set x-forwarded-host and x-forwarded-proto for microservices to build correct URLs
    proxyReq.setHeader("x-forwarded-host", req.get("host") || "localhost:4000");
    proxyReq.setHeader("x-forwarded-proto", req.protocol || "http");
    
    // Log request for debugging
    if (process.env.NODE_ENV === "development") {
      console.log(`[API Gateway] Proxying /api/learners${req.url} → ${SERVICES.learner}/learners${req.url}`);
    }
  },
  onProxyRes: (proxyRes, req, res) => {
    // Log response for debugging
    if (process.env.NODE_ENV === "development" && proxyRes.statusCode >= 400) {
      console.error(`[API Gateway] Learner Service error: ${req.url} → ${proxyRes.statusCode}`);
    }
  },
  onError: (err, req, res) => {
    logProxyError(`learners_${err.code}`, `[API Gateway] Proxy error for /api/learners${req.url}:`, err.message, err.code);
    if (!res.headersSent) {
      // Handle socket hang up - connection closed unexpectedly
      if (err.code === 'ECONNRESET' || err.message?.includes('socket hang up')) {
        // Don't send error if client disconnected
        if (req.aborted) {
          return;
        }
        res.status(502).json({ 
          message: "Kết nối đến Learner Service bị đóng đột ngột. Vui lòng thử lại.",
          error: process.env.NODE_ENV === "development" ? err.message : undefined
        });
      } else if (err.code === 'ECONNREFUSED') {
        res.status(503).json({ 
          message: "Learner Service không khả dụng. Vui lòng kiểm tra service đã chạy chưa.",
          error: process.env.NODE_ENV === "development" ? err.message : undefined
        });
      } else if (err.code === 'ETIMEDOUT' || err.message?.includes('timeout')) {
        res.status(504).json({ 
          message: "Learner Service timeout. Request đang xử lý quá lâu, vui lòng thử lại sau.",
          error: process.env.NODE_ENV === "development" ? err.message : undefined
        });
      } else {
        res.status(502).json({ 
          message: "Không thể kết nối đến Learner Service.",
          error: process.env.NODE_ENV === "development" ? err.message : undefined
        });
      }
    }
  }
}));

// Admin Service
app.use("/api/admin", createProxyMiddleware({
  target: SERVICES.admin,
  changeOrigin: true,
  pathRewrite: (path, req) => {
    // Express strips /api/admin, leaving /dashboard/traffic or /users, etc.
    // We need to add /admin prefix: /dashboard/traffic -> /admin/dashboard/traffic
    return `/admin${path}`;
  },
  timeout: 30000,
  proxyTimeout: 30000,
  onProxyReq: (proxyReq, req, res) => {
    // Forward all headers (except host and connection)
    Object.keys(req.headers).forEach(key => {
      const lowerKey = key.toLowerCase();
      if (lowerKey !== "host" && lowerKey !== "connection") {
        proxyReq.setHeader(key, req.headers[key]);
      }
    });
    
    // Set x-forwarded-host and x-forwarded-proto for microservices to build correct URLs
    proxyReq.setHeader("x-forwarded-host", req.get("host") || "localhost:4000");
    proxyReq.setHeader("x-forwarded-proto", req.protocol || "http");
  },
  onError: (err, req, res) => {
    logProxyError(`admin_${err.code}`, "Proxy error for /api/admin:", err.message);
    if (!res.headersSent) {
      res.status(502).json({ 
        message: "Không thể kết nối đến Admin Service.",
        error: process.env.NODE_ENV === "development" ? err.message : undefined
      });
    }
  }
}));

// File Service - File uploads
// IMPORTANT: Must NOT use express.json() before this - multipart/form-data needs raw body stream
app.use("/api/uploads", createProxyMiddleware({
  target: SERVICES.file,
  changeOrigin: true,
  pathRewrite: (path, req) => {
    // IMPORTANT: Express strips /api/uploads before passing to proxy
    // So path is "/" not "/api/uploads"
    // We need to return "/uploads" for File Service
    return "/uploads";
  },
  timeout: 60000, // 60 seconds for large file uploads
  proxyTimeout: 60000,
  onProxyReq: (proxyReq, req, res) => {
    // Forward all headers (except host and connection) for multipart/form-data
    Object.keys(req.headers).forEach(key => {
      const lowerKey = key.toLowerCase();
      if (lowerKey !== "host" && lowerKey !== "connection") {
        proxyReq.setHeader(key, req.headers[key]);
      }
    });
    
    // Set x-forwarded-host and x-forwarded-proto for File Service to build correct URLs
    proxyReq.setHeader("x-forwarded-host", req.get("host") || "localhost:4000");
    proxyReq.setHeader("x-forwarded-proto", req.protocol || "http");
    
    // Only log errors (handled in onError)
  },
  onError: (err, req, res) => {
    logProxyError(`api_uploads_${err.code}`, `[API Gateway] Proxy error for ${req.url}:`, err.message);
    if (!res.headersSent) {
      if (err.code === "ECONNREFUSED" || err.code === "ETIMEDOUT") {
        res.status(503).json({ 
          message: "File Service không khả dụng. Vui lòng kiểm tra service đã chạy chưa.",
          error: process.env.NODE_ENV === "development" ? err.message : undefined
        });
      } else {
        res.status(502).json({ 
          message: "Lỗi kết nối đến File Service.",
          error: process.env.NODE_ENV === "development" ? err.message : undefined
        });
      }
    }
  }
}));

// AI Service
app.use("/api/ai", createProxyMiddleware({
  target: SERVICES.ai,
  changeOrigin: true,
  pathRewrite: (path, req) => {
    // Express strips /api/ai, leaving /assistant/conversation or /call-openrouter, etc.
    // We need to add /ai prefix: /assistant/conversation -> /ai/assistant/conversation
    return `/ai${path}`;
  },
  timeout: 30000,
  proxyTimeout: 30000,
  onProxyReq: (proxyReq, req, res) => {
    // Forward all headers (except host and connection)
    Object.keys(req.headers).forEach(key => {
      const lowerKey = key.toLowerCase();
      if (lowerKey !== "host" && lowerKey !== "connection") {
        proxyReq.setHeader(key, req.headers[key]);
      }
    });
    
    // Set x-forwarded-host and x-forwarded-proto for microservices to build correct URLs
    proxyReq.setHeader("x-forwarded-host", req.get("host") || "localhost:4000");
    proxyReq.setHeader("x-forwarded-proto", req.protocol || "http");
  },
  onError: (err, req, res) => {
    logProxyError(`ai_${err.code}`, "Proxy error for /api/ai:", err.message);
    if (!res.headersSent) {
      res.status(502).json({ 
        message: "Không thể kết nối đến AI Service.",
        error: process.env.NODE_ENV === "development" ? err.message : undefined
      });
    }
  }
}));

// Error handling middleware
app.use((err, req, res, next) => {
  console.error("API Gateway error:", err);
  if (!res.headersSent) {
    res.status(500).json({ 
      message: "Internal server error",
      error: process.env.NODE_ENV === "development" ? err.message : undefined
    });
  }
});

// 404 handler
app.use((req, res) => {
  // Log 404s for /uploads to help debug routing issues
  if (req.url.startsWith("/uploads")) {
    console.error(`[API Gateway] [404] ${req.method} ${req.url} - Route not matched! Check if /uploads proxy is configured correctly`);
    console.error(`[API Gateway] [404] Request headers:`, JSON.stringify(req.headers, null, 2));
  }
  res.status(404).json({ message: "Route not found", path: req.url });
});

// Kill port before starting (for auto-reload with node --watch)
killPortBeforeStart(PORT);

// Create server with retry logic
function startServer() {
  const server = app.listen(PORT, () => {
    console.log(`🚀 API Gateway running on port ${PORT}`);
    console.log(`📡 Services:`);
    Object.entries(SERVICES).forEach(([name, url]) => {
      console.log(`   ${name}: ${url}`);
    });
    console.log(`\n✅ Health check: http://localhost:${PORT}/health\n`);
  });

  server.on("error", (err) => {
    if (err.code === "EADDRINUSE") {
      console.log(`🔄 Port ${PORT} is in use, killing old process...`);
      killPortBeforeStart(PORT);
      // Retry after a short delay
      setTimeout(() => {
        console.log(`🔄 Retrying to start on port ${PORT}...`);
        startServer();
      }, 1000);
    } else {
      console.error(`❌ Error starting API Gateway:`, err);
      process.exit(1);
    }
  });

  return server;
}

startServer();


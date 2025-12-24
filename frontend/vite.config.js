import { defineConfig } from "vite";
import react from "@vitejs/plugin-react";
import { fileURLToPath } from "url";
import { dirname, resolve } from "path";

const __filename = fileURLToPath(import.meta.url);
const __dirname = dirname(__filename);

// Track logged errors to prevent spam
const loggedErrors = new Set();
const errorLogTimestamps = new Map();

export default defineConfig({
  plugins: [react()],
  root: __dirname, // Đảm bảo root là thư mục frontend
  server: {
    port: 5173,
    strictPort: false, // Allow fallback to another port if 5173 is busy
    host: true, // Cho phép truy cập từ network
    open: process.env.DOCKER !== "true", // Tự động mở browser (tắt trong Docker)
    proxy: {
      "/api": {
        target: "http://localhost:4000", // API Gateway
        changeOrigin: true,
        secure: false,
        timeout: 60000, // 60 seconds timeout for long operations
        ws: true, // Enable websocket proxying
        configure: (proxy, options) => {
          proxy.on("error", (err, req, res) => {
            // Handle socket hang up gracefully
            if (err.code === 'ECONNRESET' || err.message?.includes('socket hang up')) {
              // Client disconnected or connection closed - don't log as error
              if (res && !res.headersSent) {
                res.writeHead(502, { "Content-Type": "application/json" });
                res.end(JSON.stringify({ 
                  message: "Kết nối đến backend bị đóng. Vui lòng thử lại.",
                  error: "CONNECTION_CLOSED",
                  details: process.env.NODE_ENV === "development" ? err.message : undefined
                }));
              }
              return;
            }
            
            // Prevent spam logging for repeated errors
            const errorKey = `${err.code}_${req.url}`;
            const now = Date.now();
            const lastLogTime = errorLogTimestamps.get(errorKey) || 0;
            
            // Only log if we haven't logged this error in the last 30 seconds
            if (now - lastLogTime > 30000) {
              console.error("[Vite Proxy] Error:", err.message, err.code);
              errorLogTimestamps.set(errorKey, now);
              
              // Clean up old timestamps (older than 5 minutes)
              for (const [key, timestamp] of errorLogTimestamps.entries()) {
                if (now - timestamp > 300000) {
                  errorLogTimestamps.delete(key);
                }
              }
            }
            
            // Don't crash - return friendly error message
            if (res && !res.headersSent) {
              if (err.code === 'ECONNREFUSED') {
                res.writeHead(503, { "Content-Type": "application/json" });
                res.end(JSON.stringify({ 
                  message: "Backend services chưa sẵn sàng. Vui lòng kiểm tra backend services đã chạy chưa.",
                  error: "BACKEND_NOT_READY",
                  details: process.env.NODE_ENV === "development" ? err.message : undefined
                }));
              } else if (err.code === 'ETIMEDOUT') {
                res.writeHead(504, { "Content-Type": "application/json" });
                res.end(JSON.stringify({ 
                  message: "Request timeout. Vui lòng thử lại sau.",
                  error: "TIMEOUT",
                  details: process.env.NODE_ENV === "development" ? err.message : undefined
                }));
              } else {
                res.writeHead(502, { "Content-Type": "application/json" });
                res.end(JSON.stringify({ 
                  message: "Lỗi kết nối đến backend.",
                  error: "PROXY_ERROR",
                  details: process.env.NODE_ENV === "development" ? err.message : undefined
                }));
              }
            }
            // Don't throw - let Vite continue running
          });
          proxy.on("proxyReq", (proxyReq, req, res) => {
            // Only log errors
          });
          proxy.on("proxyRes", (proxyRes, req, res) => {
            // Only log errors
            if (proxyRes.statusCode >= 400) {
              console.error(`[Vite Proxy] ${req.method} ${req.url} → ${proxyRes.statusCode}`);
            }
          });
        }
      },
      "/uploads": {
        target: "http://localhost:4000", // API Gateway (proxies to File Service)
        changeOrigin: true,
        secure: false,
        timeout: 30000,
        configure: (proxy, options) => {
          proxy.on("error", (err, req, res) => {
            // Prevent spam logging for repeated errors
            const errorKey = `uploads_${err.code}`;
            const now = Date.now();
            const lastLogTime = errorLogTimestamps.get(errorKey) || 0;
            
            // Only log if we haven't logged this error in the last 30 seconds
            if (now - lastLogTime > 30000) {
              console.error("[Vite Proxy /uploads] Error:", err.message);
              errorLogTimestamps.set(errorKey, now);
            }
            
            if (res && !res.headersSent) {
              res.writeHead(502, { "Content-Type": "application/json" });
              res.end(JSON.stringify({ 
                message: "Không thể tải file. Vui lòng kiểm tra File Service đã chạy chưa.",
                error: "FILE_SERVICE_NOT_READY"
              }));
            }
          });
          proxy.on("proxyReq", (proxyReq, req, res) => {
            // Forward all headers
            if (process.env.NODE_ENV === "development") {
              console.log(`[Vite Proxy] GET ${req.url} → http://localhost:4000${req.url}`);
            }
          });
          proxy.on("proxyRes", (proxyRes, req, res) => {
            if (proxyRes.statusCode >= 400) {
              console.error(`[Vite Proxy /uploads] ${req.url} → ${proxyRes.statusCode}`);
            }
          });
        }
      }
    }
  },
  build: {
    outDir: "dist",
    emptyOutDir: true
  },
  // Đảm bảo Vite xử lý đúng các route của React Router
  preview: {
    port: 5173,
    host: true
  }
});

import cors from "cors";
import express from "express";
import { createProxyMiddleware } from "http-proxy-middleware";

export function createUploadsProxy(fileServiceUrl, { onProxyError = console.error } = {}) {
  if (typeof fileServiceUrl !== "string" || !/^https?:\/\//.test(fileServiceUrl)) {
    throw new TypeError("A valid File Service URL is required");
  }

  return createProxyMiddleware({
    target: fileServiceUrl,
    changeOrigin: true,
    pathRewrite: requestPath => `/uploads${requestPath}`,
    timeout: 30_000,
    proxyTimeout: 30_000,
    on: {
      proxyReq(proxyReq, req) {
        for (const [name, value] of Object.entries(req.headers)) {
          const lowerName = name.toLowerCase();
          if (lowerName !== "host" && lowerName !== "connection") {
            proxyReq.setHeader(name, value);
          }
        }
        proxyReq.setHeader("x-forwarded-host", req.get("host") || "localhost");
        proxyReq.setHeader("x-forwarded-proto", req.protocol || "http");
      },
      proxyRes(proxyRes, req) {
        proxyRes.headers["access-control-allow-origin"] = "*";
        proxyRes.headers["access-control-allow-methods"] = "GET, HEAD, OPTIONS";
        proxyRes.headers["access-control-allow-headers"] = "*";
        console.log(`[API Gateway] /uploads ${req.method} ${req.path || "/"} -> ${proxyRes.statusCode}`);
      },
      error(error, req, res) {
        onProxyError(`[API Gateway] /uploads proxy failed (${error.code || error.name})`);
        if (res.headersSent) return;
        const status = ["ECONNREFUSED", "ETIMEDOUT"].includes(error.code) ? 503 : 502;
        res.status(status).json({
          message: status === 503
            ? "File Service is unavailable."
            : "Unable to reach File Service."
        });
      }
    }
  });
}

export function createUploadsGatewayApp({ fileServiceUrl, onProxyError } = {}) {
  const app = express();
  app.use(cors({ origin: "http://localhost:5173", credentials: true }));
  app.get("/health", (req, res) => res.json({ status: "ok", service: "api-gateway" }));
  app.use("/uploads", createUploadsProxy(fileServiceUrl, { onProxyError }));
  app.use((req, res) => res.status(404).json({ message: "Route not found" }));
  return app;
}

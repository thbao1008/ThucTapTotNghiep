// Load .env from backend/ai_models/.env
import dotenv from "dotenv";
import path from "path";
import fs from "fs";
import { fileURLToPath } from "url";
import { dirname } from "path";

const __filename = fileURLToPath(import.meta.url);
const __dirname = dirname(__filename);
const backendRoot = path.resolve(__dirname, "..", "..", "..");

// Try multiple .env locations: backend/ai_models/.env, backend/.env.local, backend/.env.docker
const envPaths = [
  path.resolve(backendRoot, "ai_models", ".env"), // Primary location
  path.resolve(backendRoot, ".env.local"),
  path.resolve(backendRoot, ".env.docker"),
  path.resolve(backendRoot, ".env")
];

let loaded = false;
for (const envPath of envPaths) {
  if (fs.existsSync(envPath)) {
    dotenv.config({ path: envPath });
    console.log(`✅ Loaded .env from: ${envPath}`);
    loaded = true;
    break;
  }
}

if (!loaded) {
  console.warn(`⚠️ .env file not found. Tried: ${envPaths.join(", ")}`);
  dotenv.config(); // Try default locations
}
import express from "express";
import cors from "cors";
// Import db first to ensure connection is established
import "./config/db.js";
import { authGuard } from "./middleware/authGuard.js";
import { packageGuard } from "./middleware/packageGuard.js";
import learnerRoutes from "./routes/learnerRoutes.js";
import "./queueHandlers.js"; // Register queue processors

const app = express();
const PORT = process.env.LEARNER_SERVICE_PORT || 4007;

app.use(cors({ origin: "http://localhost:5173", credentials: true }));
app.use(express.json());

app.get("/health", (req, res) => {
  res.json({ status: "ok", service: "learner-service" });
});

// Middleware to check package for non-dashboard routes
const conditionalPackageGuard = (req, res, next) => {
  // Skip package check for all learner routes (check moved to login)
  return next();
};

// Routes
app.use("/learners", authGuard, conditionalPackageGuard, learnerRoutes);

// Error handler
app.use((err, req, res, next) => {
  console.error("Learner Service error:", err);
  res.status(err.status || 500).json({ 
    message: err.message || "Server error" 
  });
});

app.listen(PORT, () => {
  console.log(`📚 Learner Service running on port ${PORT}`);
  console.log(`✅ Health check: http://localhost:${PORT}/health`);
}).on("error", (err) => {
  if (err.code === "EADDRINUSE") {
    console.error(`❌ Port ${PORT} is already in use!`);
  } else {
    console.error(`❌ Error starting Learner Service:`, err);
  }
  process.exit(1);
});

process.on("uncaughtException", (err) => {
  console.error("❌ Uncaught Exception:", err);
  process.exit(1);
});

process.on("unhandledRejection", (reason, promise) => {
  console.error("❌ Unhandled Rejection at:", promise, "reason:", reason);
});


import "./config/loadEnv.js";
import express from "express";
import cors from "cors";
// Import db first to ensure connection is established
import "./config/db.js";
import aiRoutes from "./routes/aiRoutes.js";
import { validateAIAuthEnvironment } from "./middleware/securityPrimitives.js";
import { getProviderStatus } from "./config/providerConfig.js";

const app = express();
const PORT = process.env.AI_SERVICE_PORT || 4010;

validateAIAuthEnvironment(process.env);

// Middleware
app.use(cors({ origin: "http://localhost:5173", credentials: true }));
app.use(express.json());

// Health check
app.get("/health", (req, res) => {
  res.json({ 
    status: "ok", 
    service: "ai-service",
    ai: getProviderStatus(),
    groq: !!process.env.GROQ_API_KEY,
    groq_model: process.env.GROQ_MODEL || 'openai/gpt-oss-20b'
  });
});

// Routes
app.use("/ai", aiRoutes);

// Error handler
app.use((err, req, res, next) => {
  console.error("AI Service error:", err);
  res.status(err.status || 500).json({ 
    message: err.message || "Server error" 
  });
});

app.listen(PORT, () => {
  console.log(`🤖 AI Service running on port ${PORT}`);
  console.log(`✅ Health check: http://localhost:${PORT}/health`);
  const ai = getProviderStatus();
  console.log(`   AI provider: ${ai.provider} (${ai.configured ? "configured" : "not configured"})`);
}).on("error", (err) => {
  if (err.code === "EADDRINUSE") {
    console.error(`❌ Port ${PORT} is already in use!`);
  } else {
    console.error(`❌ Error starting AI Service:`, err);
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


import "dotenv/config";
import express from "express";
import cors from "cors";
// Import db first to ensure connection is established
import "./config/db.js";
import { authGuard } from "./middleware/authGuard.js";
import { packageGuard } from "./middleware/packageGuard.js";
import mentorRoutes from "./routes/mentorRoutes.js";
import pool from './config/db.js';
import { createClassroomRouter } from './classroom/classroomRouter.js';

const app = express();
const PORT = process.env.MENTOR_SERVICE_PORT || 4006;

app.use(cors({ origin: "http://localhost:5173", credentials: true }));
app.use(express.json());

app.get("/health", (req, res) => {
  res.json({ status: "ok", service: "mentor-service" });
});

// Middleware to check package for non-dashboard routes
const conditionalPackageGuard = (req, res, next) => {
  const isDashboardRoute = req.path.includes('/dashboard/') ||
                          req.path.includes('/ai/') ||
                          req.path === '/';

  if (isDashboardRoute) {
    return next(); // Skip package check for dashboard
  }

  return packageGuard(req, res, next);
};

// Routes
// Shared classes/chat are available to active signed-in learners and mentors,
// independently of the private assigned-Mentor schedule/package workflow.
app.use('/mentors/classroom', authGuard, createClassroomRouter({ pool }));
app.use("/mentors", authGuard, conditionalPackageGuard, mentorRoutes);

// Error handler
app.use((err, req, res, next) => {
  console.error("Mentor Service error:", err);
  res.status(err.status || 500).json({ 
    message: err.message || "Server error" 
  });
});

app.listen(PORT, () => {
  console.log(`👨‍🏫 Mentor Service running on port ${PORT}`);
  console.log(`✅ Health check: http://localhost:${PORT}/health`);
}).on("error", (err) => {
  if (err.code === "EADDRINUSE") {
    console.error(`❌ Port ${PORT} is already in use!`);
  } else {
    console.error(`❌ Error starting Mentor Service:`, err);
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


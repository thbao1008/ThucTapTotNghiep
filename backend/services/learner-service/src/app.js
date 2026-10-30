import express from "express";
import cors from "cors";

export function createLearnerApp({ authGuard, learnerRoutes, packageGuard } = {}) {
  if (typeof authGuard !== "function" || !learnerRoutes) {
    throw new TypeError("Learner app authentication and routes are required");
  }

  const app = express();
  app.use(cors({ origin: "http://localhost:5173", credentials: true }));
  app.use(express.json());

  app.get("/health", (req, res) => {
    res.json({ status: "ok", service: "learner-service" });
  });

  const conditionalPackageGuard = (req, res, next) => {
    const isDashboardRoute = req.path.includes("/progress-analytics")
      || req.path.includes("/by-user/")
      || /^\/\d+\/weekly-goal$/.test(req.path)
      || req.path === "/"
      || /^\/speaking-practice\/sessions\/[1-9]\d*\/end$/.test(req.path);
    return isDashboardRoute || typeof packageGuard !== "function"
      ? next()
      : packageGuard(req, res, next);
  };
  app.use("/learners", authGuard, conditionalPackageGuard, learnerRoutes);

  app.use((err, req, res, next) => {
    console.error("Learner Service error:", err);
    if (err.code === "LIMIT_FILE_SIZE") {
      return res.status(413).json({ message: "Audio file exceeds the upload size limit" });
    }
    if (err.code === "UPLOAD_REJECTED" || err.code?.startsWith("LIMIT_")) {
      return res.status(400).json({ message: "Audio upload was rejected" });
    }
    res.status(err.status || 500).json({
      message: err.message || "Server error"
    });
  });

  return app;
}

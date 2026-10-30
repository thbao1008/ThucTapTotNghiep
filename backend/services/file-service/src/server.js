import "../../shared/loadBackendEnv.js";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { requireJwtSecret } from "../../shared/jwtConfig.js";
import { ensureUploadDirectory } from "./fileSecurity.js";
import pool from "./config/db.js";
import { createFileServiceApp } from "./app.js";

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
const backendRoot = path.resolve(__dirname, "..", "..", "..");
const uploadsDir = await ensureUploadDirectory(path.resolve(backendRoot, "uploads"));
const PORT = process.env.FILE_SERVICE_PORT || 4011;
const app = createFileServiceApp({ uploadsDir, jwtSecret: requireJwtSecret(), pool });

app.listen(PORT, () => {
  console.log(`File Service listening on port ${PORT}`);
});

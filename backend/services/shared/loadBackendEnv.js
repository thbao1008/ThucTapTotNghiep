import dotenv from "dotenv";
import path from "path";
import { fileURLToPath } from "url";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const backendRoot = path.resolve(__dirname, "..", "..");
// Local-only application. Resolve independently of the launch directory.
const primaryEnv = ".env.local";

dotenv.config({ path: path.resolve(backendRoot, primaryEnv) });
dotenv.config({ path: path.resolve(backendRoot, ".env"), override: false });

import pkg from "pg";
import "../../../shared/loadBackendEnv.js";

const { Pool } = pkg;
const host = process.env.DB_HOST || "localhost";

const pool = new Pool({
  user: process.env.DB_USER || "postgres",
  host: host,
  database: process.env.DB_NAME || "aesp",
  password: String(process.env.DB_PASSWORD || ""), // ép thành string
  port: parseInt(process.env.DB_PORT, 10) || 5432,
  options: "-c search_path=public",
});

// test query để chắc chắn pool hoạt động
pool.query("SELECT NOW()")
  .then(res => console.log("✅ Connected to PostgreSQL: - db.js:34", res.rows[0]))
  .catch(err => console.error("❌ DB connection error: - db.js:35", err));

export default pool;

import pool from "../config/db.js";

export function createPackageGuard({ sessionPool = pool } = {}) {
  return async function packageGuard(req, res, next) {
    try {
      const userId = req.user?.id || req.user?.user_id || req.user?._id;
    if (!userId) {
      return res.status(401).json({ message: "Unauthorized" });
    }

    if (req.user?.role?.toLowerCase() !== "learner") {
      return next();
    }

    const result = await sessionPool.query(`
      SELECT EXISTS (
        SELECT 1
        FROM learners l
        JOIN purchases p ON p.learner_id = l.id AND p.status = 'active'
        JOIN packages pkg ON pkg.id = p.package_id
        WHERE l.user_id = $1
          AND (
            COALESCE(
              p.expiry_date,
              p.created_at + (COALESCE(pkg.duration_days, 0) * INTERVAL '1 day')
            ) + (COALESCE(p.extra_days, 0) * INTERVAL '1 day')
          ) > NOW()
      ) AS has_active_package
    `, [userId]);

    if (!result.rows[0]?.has_active_package) {
      return res.status(403).json({
        message: "Gói dịch vụ không còn hiệu lực. Vui lòng liên hệ hỗ trợ.",
        expired: true
      });
    }

      return next();
    } catch (err) {
      console.error("Unable to validate Learner package entitlement:", err);
      return res.status(503).json({ message: "Không thể xác minh gói dịch vụ" });
    }
  };
}

export const packageGuard = createPackageGuard();

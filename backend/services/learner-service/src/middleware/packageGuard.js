import pool from "../config/db.js";

export async function packageGuard(req, res, next) {
  try {
    const userId = req.user?.id || req.user?.user_id || req.user?._id;
    if (!userId) {
      return res.status(401).json({ message: "Unauthorized" });
    }

    // Chỉ áp dụng package guard cho learners
    if (req.user?.role !== 'learner') {
      return next();
    }

    // Kiểm tra trạng thái package của user
    const result = await pool.query(`
      SELECT
        lp.status
      FROM users u
      LEFT JOIN learners l ON l.user_id = u.id
      LEFT JOIN learner_package_view lp ON lp.learner_id = l.id
      WHERE u.id = $1
    `, [userId]);

    if (result.rows.length === 0) {
      return res.status(403).json({
        message: "Gói dịch vụ đã hết hạn. Vui lòng liên hệ 0123456789 để hỗ trợ.",
        expired: true,
        supportContact: "0123456789"
      });
    }

    const packageData = result.rows[0];
    const packageStatus = packageData.status || 'no-package';

    // Nếu package hết hạn, chặn truy cập
    if (packageStatus === 'expired') {
      return res.status(403).json({
        message: "Gói dịch vụ đã hết hạn. Vui lòng liên hệ 0123456789 để hỗ trợ.",
        expired: true,
        supportContact: "0123456789"
      });
    }

    // Nếu không có package, cũng chặn truy cập
    if (packageStatus === 'no-package') {
      return res.status(403).json({
        message: "Bạn chưa có gói dịch vụ. Vui lòng liên hệ 0123456789 để đăng ký.",
        noPackage: true,
        supportContact: "0123456789"
      });
    }

    // Package active, cho phép truy cập
    next();
  } catch (err) {
    console.error("❌ Package guard error:", err);
    return res.status(500).json({ message: "Lỗi kiểm tra gói dịch vụ. Vui lòng thử lại." });
  }
}
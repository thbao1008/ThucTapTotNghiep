import { getProviderStatus } from "../../../ai-service/src/config/providerConfig.js";
import pool from "../config/db.js";

// Lấy thống kê tổng quan cho dashboard
export async function getDashboardStats() {
  try {
    // Tổng số học viên
    const learnersResult = await pool.query(`SELECT COUNT(*) as count FROM learners`);
    const totalLearners = parseInt(learnersResult.rows[0].count) || 0;

    // Tổng số giảng viên
    const mentorsResult = await pool.query(`SELECT COUNT(*) as count FROM mentors`);
    const totalMentors = parseInt(mentorsResult.rows[0].count) || 0;

    // Tổng doanh thu: tính TẤT CẢ purchases khi được tạo (không phụ thuộc vào status)
    // Giá trị đăng ký theo giá niêm yết hiện tại; không phải doanh thu đã thanh toán.
    const revenueResult = await pool.query(`
      SELECT COALESCE(SUM(p.price), 0) as total_revenue
      FROM purchases pur
      JOIN packages p ON pur.package_id = p.id
      -- Không filter theo status: tính tất cả purchases khi được tạo
    `);
    const totalRevenue = parseFloat(revenueResult.rows[0].total_revenue) || 0;

    // Tổng số gói dịch vụ
    const packagesResult = await pool.query(`SELECT COUNT(*) as count FROM packages`);
    const totalPackages = parseInt(packagesResult.rows[0].count) || 0;

    // Tổng số challenge
    const challengesResult = await pool.query(`SELECT COUNT(*) as count FROM challenges`);
    const totalChallenges = parseInt(challengesResult.rows[0].count) || 0;

    // Tài khoản đang hoạt động.
    const usersResult = await pool.query(`
      SELECT COUNT(*) as count 
      FROM users WHERE status = 'active'
    `);
    const totalActiveUsers = parseInt(usersResult.rows[0].count) || 0;

    return {
      totalLearners,
      totalMentors,
      totalRevenue,
      revenueBasis: "current_catalog_value",
      totalPackages,
      totalChallenges,
      totalActiveUsers
    };
  } catch (err) {
    console.error("Error getDashboardStats:", err);
    throw err;
  }
}

// Lấy tần suất hoạt động của users (ai hoạt động nhiều nhất, ít nhất)
export async function getRecentActivity(limit=10) {
  const safeLimit=Math.max(1,Math.min(100,Number.parseInt(limit,10)||10));
  const {rows}=await pool.query(`WITH events AS (
    SELECT l.user_id,'practice' AS kind,r.created_at AS at FROM speaking_practice_rounds r JOIN speaking_practice_sessions s ON s.id=r.session_id JOIN learners l ON l.id=s.learner_id
    UNION ALL SELECT l.user_id,'submission',s.created_at FROM submissions s JOIN learners l ON l.id=s.learner_id
    UNION ALL SELECT l.user_id,'world',w.updated_at FROM scenario_world_sessions w JOIN learners l ON l.id=w.learner_id WHERE w.status='completed' AND w.revision>0
    UNION ALL SELECT m.user_id,'feedback',f.created_at FROM feedbacks f JOIN mentors m ON m.id=f.mentor_id
    UNION ALL SELECT m.user_id,'schedule',c.created_at FROM online_classes c JOIN mentors m ON m.id=c.mentor_id WHERE c.status='scheduled'
  ) SELECT u.id AS user_id,u.name AS user_name,u.email,u.role AS actor_type,COUNT(*)::int AS activity_count,MAX(e.at) AS last_activity,
    COUNT(*) FILTER (WHERE kind='practice')::int AS practice_count,COUNT(*) FILTER (WHERE kind='submission')::int AS submission_count,
    COUNT(*) FILTER (WHERE kind='world')::int AS scenario_world_count,COUNT(*) FILTER (WHERE kind='feedback')::int AS feedback_count,COUNT(*) FILTER (WHERE kind='schedule')::int AS schedule_count
    FROM events e JOIN users u ON u.id=e.user_id WHERE e.at>=NOW()-INTERVAL '7 days' AND e.at<=NOW()
    GROUP BY u.id,u.name,u.email,u.role ORDER BY activity_count DESC,last_activity DESC,u.id DESC LIMIT $1`,[safeLimit]);
  return rows;
}

// Lấy traffic stats
export async function getTrafficStats() {
  try {
    // Tổng traffic (từ daily_traffic_stats)
    const totalTrafficResult = await pool.query(`
      SELECT COALESCE(SUM(total_requests), 0) as total
      FROM daily_traffic_stats
    `);
    const totalTraffic = parseInt(totalTrafficResult.rows[0].total) || 0;

    // Số người đang online (trong 5 phút gần đây)
    // Đếm DISTINCT user_id (nếu có) + số anonymous sessions (user_id IS NULL)
    const onlineUsersResult = await pool.query(`
      SELECT 
        COUNT(DISTINCT user_id) FILTER (WHERE user_id IS NOT NULL) as logged_in_users,
        COUNT(*) FILTER (WHERE user_id IS NULL) as anonymous_sessions
      FROM online_users
      WHERE last_activity > NOW() - INTERVAL '5 minutes'
    `);
    const loggedInUsers = parseInt(onlineUsersResult.rows[0].logged_in_users) || 0;
    const anonymousSessions = parseInt(onlineUsersResult.rows[0].anonymous_sessions) || 0;
    const onlineUsers = loggedInUsers + anonymousSessions;

    // Traffic hôm nay
    const today = new Intl.DateTimeFormat('en-CA', {timeZone:'Asia/Ho_Chi_Minh',year:'numeric',month:'2-digit',day:'2-digit'}).format(new Date());
    const todayTrafficResult = await pool.query(`
      SELECT total_requests, unique_visitors
      FROM daily_traffic_stats
      WHERE date = $1
    `, [today]);
    const todayStats = todayTrafficResult.rows[0] || { total_requests: 0, unique_visitors: 0 };

    // Traffic 7 ngày qua (lấy dữ liệu chi tiết cho biểu đồ)
    const weekTrafficResult = await pool.query(`
      SELECT 
        date,
        unique_visitors,
        total_requests
      FROM daily_traffic_stats
      WHERE date >= CURRENT_DATE - INTERVAL '7 days'
      ORDER BY date ASC
    `);
    const weekData = weekTrafficResult.rows || [];
    const weekTraffic = weekData.reduce((sum, day) => sum + (parseInt(day.total_requests) || 0), 0);
    const weekUniqueVisitors = weekData.reduce((sum, day) => sum + (parseInt(day.unique_visitors) || 0), 0);

    return {
      totalTraffic,
      onlineUsers,
      todayTraffic: parseInt(todayStats.total_requests) || 0,
      todayUniqueVisitors: parseInt(todayStats.unique_visitors) || 0,
      weekTraffic,
      weekUniqueVisitors,
      weekData: weekData.map(row => ({
        date: row.date,
        visitors: parseInt(row.unique_visitors) || 0,
        requests: parseInt(row.total_requests) || 0
      }))
    };
  } catch (err) {
    console.error("Error getTrafficStats:", err);
    throw err;
  }
}

// Safe provider configuration; no inferred quota or model accuracy.
export async function getAIProgress() {
  return { ...getProviderStatus(), tokenUsage: null, usageMeasured: false };
}

// Lấy dữ liệu biểu đồ cho Dashboard với timeframe và period offset
export async function getChartData(
  revenueTimeframe = 'month', 
  usersTimeframe = 'month', 
  trafficTimeframe = 'week', 
  dailyTimeframe = 'week',
  revenueOffset = 0,
  usersOffset = 0,
  trafficOffset = 0,
  dailyOffset = 0
) {
  try {
    // Helper function để xác định interval và trunc với offset
    const getTimeframeConfig = (tf, offset = 0) => {
      let baseInterval = '';
      let trunc = '';
      
      switch(tf) {
        case 'year':
          trunc = 'year';
          baseInterval = '2 years';
          break;
        case 'month':
          trunc = 'month';
          baseInterval = '12 months';
          break;
        case 'week':
          trunc = 'week';
          baseInterval = '12 weeks';
          break;
        default:
          trunc = 'month';
          baseInterval = '6 months';
      }
      
      // Tính toán date range dựa trên offset
      // offset = 0: period hiện tại
      // offset < 0: lùi về quá khứ
      // offset > 0: tiến tới tương lai
      let startDate = '';
      let endDate = '';
      
      if (tf === 'week') {
        // Tính thứ 2 của tuần hiện tại, sau đó áp dụng offset
        // DATE_TRUNC('week', date) trả về thứ 2 của tuần đó
        startDate = `(DATE_TRUNC('week', CURRENT_DATE) + INTERVAL '${offset} weeks')::date`;
        endDate = `((DATE_TRUNC('week', CURRENT_DATE) + INTERVAL '${offset} weeks') + INTERVAL '6 days')::date`;
      } else if (tf === 'month') {
        // Tính tháng hiện tại (hoặc tháng offset)
        startDate = `(DATE_TRUNC('month', CURRENT_DATE) + INTERVAL '${offset} months')::date`;
        endDate = `((DATE_TRUNC('month', CURRENT_DATE) + INTERVAL '${offset} months') + INTERVAL '1 month' - INTERVAL '1 day')::date`;
      } else if (tf === 'year') {
        // Tính năm hiện tại (hoặc năm offset)
        startDate = `(DATE_TRUNC('year', CURRENT_DATE) + INTERVAL '${offset} years')::date`;
        endDate = `((DATE_TRUNC('year', CURRENT_DATE) + INTERVAL '${offset} years') + INTERVAL '1 year' - INTERVAL '1 day')::date`;
      } else {
        // Fallback: dùng baseInterval
        startDate = `(CURRENT_DATE - INTERVAL '${baseInterval}')::date`;
        endDate = `CURRENT_DATE`;
      }
      
      return { 
        trunc, 
        interval: baseInterval, 
        startDate, 
        endDate,
        label: tf === 'year' ? 'năm' : tf === 'month' ? 'tháng' : 'tuần' 
      };
    };

    const revenueConfig = getTimeframeConfig(revenueTimeframe, revenueOffset);
    const usersConfig = getTimeframeConfig(usersTimeframe, usersOffset);
    const trafficConfig = getTimeframeConfig(trafficTimeframe, trafficOffset);
    const dailyConfig = getTimeframeConfig(dailyTimeframe, dailyOffset);

    // Traffic theo timeframe với offset
    let trafficQuery = '';
    if (trafficTimeframe === 'week') {
      trafficQuery = `
        SELECT 
          date,
          COALESCE(unique_visitors, 0) as visitors,
          COALESCE(total_requests, 0) as requests
        FROM daily_traffic_stats
        WHERE date >= ${trafficConfig.startDate}
          AND date <= ${trafficConfig.endDate}
        ORDER BY date ASC
      `;
    } else {
      trafficQuery = `
        SELECT 
          DATE_TRUNC('${trafficConfig.trunc}', date) as period,
          SUM(COALESCE(unique_visitors, 0)) as visitors,
          SUM(COALESCE(total_requests, 0)) as requests
        FROM daily_traffic_stats
        WHERE date >= ${trafficConfig.startDate}
          AND date <= ${trafficConfig.endDate}
        GROUP BY DATE_TRUNC('${trafficConfig.trunc}', date)
        ORDER BY period ASC
      `;
    }
    const traffic7Days = await pool.query(trafficQuery);

    // Revenue theo timeframe với offset
    // Tính tất cả purchases khi được tạo (không filter theo status)
    const revenue6Months = await pool.query(`
      SELECT 
        DATE_TRUNC('${revenueConfig.trunc}', pur.created_at) as period,
        COALESCE(SUM(p.price), 0) as revenue
      FROM purchases pur
      JOIN packages p ON pur.package_id = p.id
      WHERE pur.created_at >= ${revenueConfig.startDate}::timestamp
        AND pur.created_at < (${revenueConfig.endDate} + INTERVAL '1 day')::timestamp
      GROUP BY DATE_TRUNC('${revenueConfig.trunc}', pur.created_at)
      ORDER BY period ASC
    `);

    // User growth theo timeframe với offset
    const userGrowth = await pool.query(`
      SELECT 
        DATE_TRUNC('${usersConfig.trunc}', created_at) as period,
        COUNT(*) FILTER (WHERE role = 'learner') as learners,
        COUNT(*) FILTER (WHERE role = 'mentor') as mentors
      FROM users
      WHERE created_at >= ${usersConfig.startDate}::timestamp
        AND created_at < (${usersConfig.endDate} + INTERVAL '1 day')::timestamp
      GROUP BY DATE_TRUNC('${usersConfig.trunc}', created_at)
      ORDER BY period ASC
    `);

    // Daily Revenue theo timeframe với offset
    // Tính tất cả purchases khi được tạo (không filter theo status)
    let dailyRevenueQuery = '';
    if (dailyTimeframe === 'week') {
      dailyRevenueQuery = `
        SELECT 
          DATE(pur.created_at) as period,
          COALESCE(SUM(p.price), 0) as revenue
        FROM purchases pur
        JOIN packages p ON pur.package_id = p.id
        WHERE pur.created_at >= ${dailyConfig.startDate}::timestamp
          AND pur.created_at < (${dailyConfig.endDate} + INTERVAL '1 day')::timestamp
        GROUP BY DATE(pur.created_at)
        ORDER BY period ASC
      `;
    } else {
      dailyRevenueQuery = `
        SELECT 
          DATE_TRUNC('${dailyConfig.trunc}', pur.created_at) as period,
          COALESCE(SUM(p.price), 0) as revenue
        FROM purchases pur
        JOIN packages p ON pur.package_id = p.id
        WHERE pur.created_at >= ${dailyConfig.startDate}::timestamp
          AND pur.created_at < (${dailyConfig.endDate} + INTERVAL '1 day')::timestamp
        GROUP BY DATE_TRUNC('${dailyConfig.trunc}', pur.created_at)
        ORDER BY period ASC
      `;
    }
    const dailyRevenue = await pool.query(dailyRevenueQuery);

    // Package Distribution (Donut chart) - số lượng purchase theo package
    const packageDistribution = await pool.query(`
      SELECT 
        p.id,
        p.name,
        p.price,
        COUNT(pur.id) as purchase_count,
        COALESCE(SUM(p.price), 0) as total_revenue
      FROM packages p
      LEFT JOIN purchases pur ON p.id = pur.package_id 
        AND pur.status IN ('active', 'expired')
      GROUP BY p.id, p.name, p.price
      ORDER BY purchase_count DESC
    `);

    // Revenue by Package (Horizontal Bar chart) - Top 10 packages
    const revenueByPackage = await pool.query(`
      SELECT 
        p.id,
        p.name,
        COALESCE(SUM(p.price), 0) as total_revenue,
        COUNT(pur.id) as purchase_count
      FROM packages p
      LEFT JOIN purchases pur ON p.id = pur.package_id 
        AND pur.status IN ('active', 'expired')
      GROUP BY p.id, p.name
      HAVING COUNT(pur.id) > 0
      ORDER BY total_revenue DESC
      LIMIT 10
    `);

    // User Status Breakdown (Stacked Bar chart)
    const userStatusBreakdown = await pool.query(`
      SELECT 
        role,
        status,
        COUNT(*) as count
      FROM users
      GROUP BY role, status
      ORDER BY role, status
    `);

    // Purchase Status Distribution (Pie chart)
    const purchaseStatusDistribution = await pool.query(`
      SELECT 
        status,
        COUNT(*) as count,
        COALESCE(SUM(p.price), 0) as revenue
      FROM purchases pur
      JOIN packages p ON pur.package_id = p.id
      GROUP BY status
      ORDER BY count DESC
    `);

    // Growth Metrics (Month-over-month)
    const growthMetrics = await pool.query(`
      WITH monthly_stats AS (
        SELECT 
          DATE_TRUNC('month', pur.created_at) as month,
          COALESCE(SUM(p.price), 0) as revenue,
          COUNT(DISTINCT l.user_id) as new_customers
        FROM purchases pur
        JOIN packages p ON pur.package_id = p.id
        JOIN learners l ON pur.learner_id = l.id
        WHERE pur.created_at >= CURRENT_DATE - INTERVAL '6 months'
        GROUP BY DATE_TRUNC('month', pur.created_at)
      ),
      monthly_users AS (
        SELECT 
          DATE_TRUNC('month', created_at) as month,
          COUNT(*) FILTER (WHERE role = 'learner') as new_learners,
          COUNT(*) FILTER (WHERE role = 'mentor') as new_mentors
        FROM users
        WHERE created_at >= CURRENT_DATE - INTERVAL '6 months'
        GROUP BY DATE_TRUNC('month', created_at)
      )
      SELECT 
        COALESCE(ms.month, mu.month) as month,
        COALESCE(ms.revenue, 0) as revenue,
        COALESCE(ms.new_customers, 0) as new_customers,
        COALESCE(mu.new_learners, 0) as new_learners,
        COALESCE(mu.new_mentors, 0) as new_mentors
      FROM monthly_stats ms
      FULL OUTER JOIN monthly_users mu ON ms.month = mu.month
      ORDER BY month ASC
    `);

    return {
      traffic7Days: traffic7Days.rows.map(row => ({
        date: row.date || row.period,
        period: row.period || row.date,
        visitors: parseInt(row.visitors) || 0,
        requests: parseInt(row.requests) || 0
      })),
      revenue6Months: revenue6Months.rows.map(row => ({
        period: row.period,
        revenue: parseFloat(row.revenue) || 0
      })),
      userGrowth: userGrowth.rows.map(row => ({
        period: row.period,
        learners: parseInt(row.learners) || 0,
        mentors: parseInt(row.mentors) || 0
      })),
      dailyRevenue: dailyRevenue.rows.map(row => ({
        date: row.period,
        period: row.period,
        revenue: parseFloat(row.revenue) || 0
      })),
      packageDistribution: packageDistribution.rows.map(row => ({
        id: row.id,
        name: row.name,
        price: parseFloat(row.price) || 0,
        purchaseCount: parseInt(row.purchase_count) || 0,
        totalRevenue: parseFloat(row.total_revenue) || 0
      })),
      revenueByPackage: revenueByPackage.rows.map(row => ({
        id: row.id,
        name: row.name,
        totalRevenue: parseFloat(row.total_revenue) || 0,
        purchaseCount: parseInt(row.purchase_count) || 0
      })),
      userStatusBreakdown: userStatusBreakdown.rows.map(row => ({
        role: row.role,
        status: row.status,
        count: parseInt(row.count) || 0
      })),
      purchaseStatusDistribution: purchaseStatusDistribution.rows.map(row => ({
        status: row.status,
        count: parseInt(row.count) || 0,
        revenue: parseFloat(row.revenue) || 0
      })),
      growthMetrics: growthMetrics.rows.map(row => ({
        month: row.month,
        revenue: parseFloat(row.revenue) || 0,
        newCustomers: parseInt(row.new_customers) || 0,
        newLearners: parseInt(row.new_learners) || 0,
        newMentors: parseInt(row.new_mentors) || 0
      }))
    };
  } catch (err) {
    console.error("Error getChartData:", err);
    throw err;
  }
}


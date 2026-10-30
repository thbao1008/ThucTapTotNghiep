function id(value) {
  if (!/^\d+$/.test(String(value)) || !Number.isSafeInteger(Number(value)) || Number(value) < 1) throw Object.assign(new Error('Mã không hợp lệ'), { status: 400 });
  return Number(value);
}
export const PURCHASE_EXPIRY = `COALESCE(p.expiry_date,p.created_at+COALESCE(pkg.duration_days,0)*INTERVAL '1 day')+COALESCE(p.extra_days,0)*INTERVAL '1 day'`;
// Prefer a valid entitlement over a newer expired purchase, with exactly one row per Learner.
export const CURRENT_PURCHASE_JOIN = `LEFT JOIN LATERAL (
  SELECT p.id AS purchase_id,p.package_id,p.created_at,p.extra_days,
    pkg.name AS package_name,pkg.duration_days,(${PURCHASE_EXPIRY}) AS expiry_date,
    CASE WHEN (${PURCHASE_EXPIRY})<=NOW() THEN 'expired' WHEN p.status='active' THEN 'active' ELSE 'unavailable' END AS status,
    (p.status='active' AND (${PURCHASE_EXPIRY})>NOW()) AS is_active,
    GREATEST(0,CEIL(EXTRACT(EPOCH FROM ((${PURCHASE_EXPIRY})-NOW()))/86400))::int AS days_left
  FROM purchases p JOIN packages pkg ON pkg.id=p.package_id WHERE p.learner_id=l.id
  ORDER BY (p.status='active' AND (${PURCHASE_EXPIRY})>NOW()) DESC,p.created_at DESC,p.id DESC LIMIT 1
) lp ON TRUE`;
const projection = `SELECT l.id AS learner_id,u.name AS learner_name,u.email,u.phone,pkg.id AS package_id,pkg.name AS package_name,
  p.id AS purchase_id,p.created_at,p.status AS purchase_status,p.status,pkg.price,pkg.original_price,pkg.duration_days,(${PURCHASE_EXPIRY}) AS expiry_date,p.extra_days,
  GREATEST(0,CEIL(EXTRACT(EPOCH FROM ((${PURCHASE_EXPIRY})-NOW()))/86400))::int AS days_left,
  (p.status='active' AND (${PURCHASE_EXPIRY})>NOW()) AS is_active,
  CASE WHEN (${PURCHASE_EXPIRY})<=NOW() THEN 'expired' WHEN p.status='active' THEN 'active' ELSE 'unavailable' END AS effective_status
  FROM purchases p JOIN learners l ON l.id=p.learner_id JOIN users u ON u.id=l.user_id JOIN packages pkg ON pkg.id=p.package_id`;

export async function listPurchaseLedger(database, { learnerId, phone } = {}) {
  const values = [], filters = [];
  if (learnerId !== undefined) { values.push(id(learnerId)); filters.push(`l.id=$${values.length}`); }
  if (phone?.trim()) { values.push(`%${phone.trim()}%`); filters.push(`u.phone LIKE $${values.length}`); }
  const { rows } = await database.query(`${projection}${filters.length ? ' WHERE '+filters.join(' AND ') : ''} ORDER BY p.created_at DESC,p.id DESC`, values);
  return rows;
}

// Serialize on the Learner row so repeated/concurrent Admin requests cannot create two live packages.
// Renew/change are available after expiry, matching the Admin page's existing policy.
export async function addPurchase(database, { learnerId, packageId, renewPurchaseId }) {
  if (renewPurchaseId !== undefined) renewPurchaseId=id(renewPurchaseId);
  else { learnerId=id(learnerId); packageId=id(packageId); }
  const client=await database.connect();
  try {
    await client.query('BEGIN');
    if (renewPurchaseId !== undefined) {
      const {rows:[old]}=await client.query('SELECT learner_id,package_id FROM purchases WHERE id=$1',[renewPurchaseId]);
      if (!old) throw Object.assign(new Error('Không tìm thấy lượt đăng ký'),{status:404});
      learnerId=old.learner_id;packageId=old.package_id;
    }
    const {rows:[learner]}=await client.query('SELECT l.id,u.status FROM learners l JOIN users u ON u.id=l.user_id WHERE l.id=$1 FOR UPDATE OF l',[learnerId]);
    if (!learner) throw Object.assign(new Error('Không tìm thấy học viên'),{status:404});
    if (learner.status !== 'active') throw Object.assign(new Error('Tài khoản đang bị khóa'),{status:409});
    const {rows:[pkg]}=await client.query('SELECT duration_days FROM packages WHERE id=$1 FOR SHARE',[packageId]);
    if (!pkg || !(pkg.duration_days>0)) throw Object.assign(new Error('Gói học không hợp lệ'),{status:400});
    const {rows:active}=await client.query(`SELECT p.id FROM purchases p JOIN packages pkg ON pkg.id=p.package_id
      WHERE p.learner_id=$1 AND p.status='active' AND (${PURCHASE_EXPIRY})>NOW()`,[learnerId]);
    if (active.length) throw Object.assign(new Error('Học viên vẫn còn gói học có hiệu lực'),{status:409});
    if (renewPurchaseId !== undefined) {
      const {rows:[latest]}=await client.query('SELECT id FROM purchases WHERE learner_id=$1 ORDER BY created_at DESC,id DESC LIMIT 1',[learnerId]);
      if (latest.id!==renewPurchaseId) throw Object.assign(new Error('Chỉ gia hạn lượt đăng ký gần nhất'),{status:409});
    }
    await client.query(`UPDATE purchases p SET status='expired' FROM packages pkg WHERE pkg.id=p.package_id AND p.learner_id=$1
      AND p.status='active' AND (${PURCHASE_EXPIRY})<=NOW()`,[learnerId]);
    const {rows:[purchase]}=await client.query(`INSERT INTO purchases (learner_id,package_id,status,created_at,expiry_date,extra_days)
      VALUES ($1,$2,'active',NOW(),NOW()+$3*INTERVAL '1 day',0) RETURNING id`,[learnerId,packageId,pkg.duration_days]);
    const {rows:[detail]}=await client.query(`${projection} WHERE p.id=$1`,[purchase.id]);
    await client.query('COMMIT');return detail;
  } catch(error) {await client.query('ROLLBACK');throw error;} finally {client.release();}
}

import { createHmac, timingSafeEqual } from 'node:crypto';

export function publicUser(user) {
  if (!user) return null;
  const result = { ...user };
  delete result.password;
  delete result.security_answer;
  return result;
}

export function denyPublicRegistration(_request, response) {
  return response.status(403).json({
    message: 'Accounts are provisioned by Admin. Contact support for access.',
    code: 'ACCOUNT_PROVISIONING_REQUIRED'
  });
}

export function passwordVersion(user, secret) {
  return createHmac('sha256', secret)
    .update(`aesp-password-reset:${user.id}:${user.password}`)
    .digest('hex');
}

export function matchesPasswordVersion(value, user, secret) {
  if (typeof value !== 'string' || !/^[a-f0-9]{64}$/.test(value) ||
      !user || typeof user.password !== 'string') return false;
  return timingSafeEqual(
    Buffer.from(value, 'hex'), Buffer.from(passwordVersion(user, secret), 'hex')
  );
}

export async function rotatePassword(database, userId, newHash, expectedHash) {
  const client = await database.connect();
  let open = false;
  try {
    await client.query('BEGIN');
    open = true;
    // Serialize against login and another recovery/password change for this account.
    const { rows: [user] } = await client.query(
      'SELECT id,password FROM users WHERE id=$1 FOR UPDATE', [userId]
    );
    if (!user || user.password !== expectedHash) {
      throw Object.assign(Error('Credentials changed. Start password recovery again.'), {
        status: 409, code: 'PASSWORD_STATE_CHANGED'
      });
    }
    await client.query('UPDATE users SET password=$2,updated_at=NOW() WHERE id=$1', [userId, newHash]);
    await client.query('UPDATE user_sessions SET is_active=FALSE WHERE user_id=$1 AND is_active=TRUE', [userId]);
    await client.query('COMMIT');
    open = false;
    return user.id;
  } catch (error) {
    if (open) await client.query('ROLLBACK');
    throw error;
  } finally {
    client.release();
  }
}

import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { randomBytes } from 'node:crypto';
import { validateAIAuthEnvironment } from '../ai-service/src/middleware/securityPrimitives.js';

const servicesRoot = fileURLToPath(new URL('../', import.meta.url));
const services = [
  ['notification', 4001], ['community', 4002], ['package', 4003],
  ['purchase', 4004], ['user', 4005], ['mentor', 4006], ['learner', 4007],
  ['admin', 4008], ['ai', 4010], ['file', 4011], ['api-gateway', 4000]
];
const problem = message => Object.assign(new Error(message), { code: 'LOCAL_CONFIG_INVALID' });

export function createLocalServicePlan(source = process.env) {
  const env = { ...source }, plans = [];
  for (const [id, fallback] of services) {
    const prefix = id === 'api-gateway' ? 'API_GATEWAY' : `${id.toUpperCase()}_SERVICE`;
    const portKey = `${prefix}_PORT`, urlKey = `${prefix}_URL`;
    const configuredPort = env[portKey];
    let urlPort;
    if (env[urlKey]) {
      let url;
      try { url = new URL(env[urlKey]); } catch { throw problem(`${urlKey} phải là địa chỉ localhost hợp lệ.`); }
      if (url.protocol !== 'http:' || !['localhost', '127.0.0.1', '[::1]'].includes(url.hostname)
        || url.username || url.password || url.pathname !== '/' || url.search || url.hash) {
        throw problem(`${urlKey} phải trỏ đến localhost qua HTTP.`);
      }
      urlPort = Number(url.port || 80);
    }
    if (configuredPort && !/^[1-9]\d{0,4}$/.test(configuredPort)) throw problem(`${portKey} chưa hợp lệ.`);
    const port = Number(configuredPort || urlPort || fallback);
    if (!Number.isSafeInteger(port) || port < 1 || port > 65535 || urlPort && port !== urlPort) {
      throw problem(`Cổng và địa chỉ của ${id} chưa khớp nhau.`);
    }
    env[portKey] = String(port);
    env[urlKey] = `http://127.0.0.1:${port}`;
    const cwd = path.join(servicesRoot, id === 'api-gateway' ? id : `${id}-service`);
    plans.push({ name: id, port, cwd, entry: path.join(cwd, 'src/server.js'), service: id === 'api-gateway' ? id : `${id}-service` });
  }
  if (new Set(plans.map(plan => plan.port)).size !== plans.length) throw problem('Các dịch vụ localhost đang dùng trùng cổng.');
  // Opening a local demo must not consume old queue jobs or capture training.
  env.ENABLE_STALE_ROUND_RECOVERY = 'false';
  env.ENABLE_SUBMISSION_RECOVERY = 'false';
  env.ENABLE_AI_TRAINING_CAPTURE = 'false';
  env.REDIS_URL = '';
  for (const key of ['AESP_LEARNER_SERVICE_TOKEN', 'AESP_MENTOR_SERVICE_TOKEN']) {
    if (!env[key]) env[key] = randomBytes(40).toString('hex');
  }
  validateAIAuthEnvironment(env);
  return { plans, env };
}

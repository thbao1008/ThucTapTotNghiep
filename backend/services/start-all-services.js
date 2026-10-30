#!/usr/bin/env node
import './shared/loadBackendEnv.js';
import { pathToFileURL } from 'node:url';
import { createLocalServicePlan } from './shared/localServicePlan.js';
import { checkLocalPlans, startLocalProcesses } from './shared/localProcessSupervisor.js';
import { verifyWorldTarget } from './learner-service/src/services/scenarioWorldStore.js';

export async function verifyLocalDatabase(env) {
  const { Client } = await import('pg');
  const client = new Client({ host: env.DB_HOST || 'localhost', port: Number(env.DB_PORT || 5432),
    database: env.DB_NAME || 'aesp', user: env.DB_USER || 'postgres', password: String(env.DB_PASSWORD || ''),
    connectionTimeoutMillis: 4000, statement_timeout: 4000, options: '-c search_path=public' });
  try {
    await client.connect();
    await client.query('BEGIN READ ONLY');
    return await verifyWorldTarget(client);
  } catch {
    throw Object.assign(new Error('Chưa xác minh được PostgreSQL aesp.public trên localhost:5432. Chưa mở dịch vụ nào.'), { code: 'LOCAL_DATABASE_UNVERIFIED' });
  } finally { await client.end(); }
}

export async function startLocalBackend({ env: source = process.env, withFrontend = false,
  checkOnly = false, signal, startProcesses = startLocalProcesses } = {}) {
  const { plans, env } = createLocalServicePlan(source);
  if (withFrontend) {
    const { createFrontendPlan, checkFrontendFiles } = await import('../../frontend/start-frontend.js');
    const plan = createFrontendPlan();
    await checkFrontendFiles(plan);
    plans.push(plan);
  }
  await checkLocalPlans(plans);
  await verifyLocalDatabase(env);
  if (checkOnly) return { plans: plans.map(({ name, port }) => ({ name, port })), database: 'aesp.public loopback:5432' };
  return startProcesses({ plans, env, signal });
}

if (process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href) {
  const controller = new AbortController();
  let supervisor;
  const stop = () => { controller.abort(); void supervisor?.stop(); };
  process.on('SIGINT', stop); process.on('SIGTERM', stop);
  try {
    const options = process.argv.slice(2);
    if (options.some(option => !['--with-frontend', '--check'].includes(option))) throw Error('Chỉ hỗ trợ --with-frontend và --check.');
    const result = await startLocalBackend({ withFrontend: options.includes('--with-frontend'),
      checkOnly: options.includes('--check'), signal: controller.signal });
    if (options.includes('--check')) console.log(JSON.stringify(result));
    else { supervisor = result; process.exitCode = await supervisor.done; }
  } catch (error) { console.error(error.message); process.exitCode = error.code === 'LOCAL_START_CANCELLED' ? 0 : 1; }
  finally { process.off('SIGINT', stop); process.off('SIGTERM', stop); }
}

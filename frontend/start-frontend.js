#!/usr/bin/env node
import { existsSync } from 'node:fs';
import { dirname, join, resolve } from 'node:path';
import { fileURLToPath, pathToFileURL } from 'node:url';

const frontendDir = dirname(fileURLToPath(import.meta.url));

export function createFrontendPlan({ port = 5173 } = {}) {
  return {
    name: 'Frontend',
    port,
    entry: join(frontendDir, 'node_modules', 'vite', 'bin', 'vite.js'),
    cwd: frontendDir,
    args: ['--host', '127.0.0.1', '--port', String(port), '--strictPort'],
    healthPath: '/',
  };
}

export function checkFrontendFiles() {
  const required = ['index.html', 'src/main.jsx', 'vite.config.js', 'node_modules/vite/bin/vite.js'];
  const missing = required.filter(file => !existsSync(join(frontendDir, file)));
  if (missing.length) {
    throw new Error(`Frontend files are missing: ${missing.join(', ')}. Install frontend dependencies before starting.`);
  }
}

export async function startFrontend({ env = process.env, port = 5173, startProcesses, signal } = {}) {
  checkFrontendFiles();
  const start = startProcesses ?? (await import('../backend/services/shared/localProcessSupervisor.js')).startLocalProcesses;
  return start({ plans: [createFrontendPlan({ port })], env, signal });
}

async function main() {
  let supervisor;
  const controller = new AbortController();
  const stop = () => { controller.abort(); void supervisor?.stop(); };
  process.on('SIGINT', stop);
  process.on('SIGTERM', stop);
  try {
    supervisor = await startFrontend({ signal: controller.signal });
    const result = await supervisor.done;
    if (typeof result === 'number') process.exitCode = result;
  } catch (error) {
    console.error(`Frontend could not start: ${error.message}`);
    process.exitCode = error.code === 'LOCAL_START_CANCELLED' ? 0 : 1;
  } finally {
    process.off('SIGINT', stop);
    process.off('SIGTERM', stop);
  }
}

if (process.argv[1] && pathToFileURL(resolve(process.argv[1])).href === import.meta.url) {
  await main();
}

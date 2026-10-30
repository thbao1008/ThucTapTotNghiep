import net from 'node:net';
import { spawn } from 'node:child_process';
import { access } from 'node:fs/promises';
import { fileURLToPath } from 'node:url';

const bootstrap = fileURLToPath(new URL('./localProcessChild.js', import.meta.url));
const delay = ms => new Promise(resolve => setTimeout(resolve, ms));
const failure = (code, message) => Object.assign(new Error(message), { code });

function probePort(port, host) {
  return new Promise((resolve, reject) => {
    const listener = net.createServer();
    listener.once('error', reject);
    listener.listen({ port, host, exclusive: true, ipv6Only: false }, () => listener.close(resolve));
  });
}

// Probe exact loopback AND wildcard addresses in both families. On Windows a
// wildcard probe alone can coexist with a listener on a specific address.
export async function assertPortsAvailable(plans) {
  const ports = new Set();
  for (const plan of plans) {
    if (!Number.isSafeInteger(plan.port) || plan.port < 1 || plan.port > 65535 || ports.has(plan.port)) {
      throw failure('LOCAL_PORT_INVALID', 'Các cổng localhost phải hợp lệ và khác nhau.');
    }
    ports.add(plan.port);
    for (const host of ['127.0.0.1', '::1', '0.0.0.0', '::']) {
      try { await probePort(plan.port, host); }
      catch (error) {
        if (host.includes(':') && ['EAFNOSUPPORT', 'EADDRNOTAVAIL'].includes(error.code)) continue;
        throw failure('LOCAL_PORT_BUSY', `Cổng ${plan.port} đang được dùng hoặc chưa thể mở. Phiên đang chạy được giữ nguyên.`);
      }
    }
  }
}

export async function checkLocalPlans(plans) {
  for (const plan of plans) {
    try { await access(plan.entry); await access(plan.cwd); }
    catch { throw failure('LOCAL_FILES_MISSING', `Thiếu tệp khởi động của ${plan.name}.`); }
  }
  await assertPortsAvailable(plans);
}

export async function startLocalProcesses({ plans, env = process.env, log = console.log,
  readyTimeoutMs = 20000, stopTimeoutMs = 9000, signal, fetchImpl = fetch, spawnImpl = spawn } = {}) {
  await checkLocalPlans(plans);
  const owned = [];
  let stopping = false, stopTask, settleDone;
  const done = new Promise(resolve => { settleDone = resolve; });
  const aborted = () => signal?.aborted;

  async function stop(code = 0) {
    if (stopTask) return stopTask;
    stopping = true;
    stopTask = (async () => {
      for (const record of [...owned].reverse()) {
        if (record.exited) continue;
        try {
          if (record.child.connected) record.child.send('aesp:shutdown', () => {});
          else record.child.kill('SIGTERM');
        } catch { /* An owned child may already have exited. */ }
      }
      let timer;
      await Promise.race([
        Promise.all(owned.map(record => record.finished)),
        new Promise(resolve => { timer = setTimeout(resolve, stopTimeoutMs); })
      ]);
      clearTimeout(timer);
      for (const record of owned) if (!record.exited) {
        // Only the returned child handle; never a PID found by port/name.
        try { record.child.kill('SIGTERM'); } catch { /* Already exited. */ }
      }
      signal?.removeEventListener('abort', onAbort);
      settleDone(code);
    })();
    return stopTask;
  }
  const onAbort = () => { void stop(0); };
  signal?.addEventListener('abort', onAbort, { once: true });

  try {
    if (aborted()) throw failure('LOCAL_START_CANCELLED', 'Đã hủy khởi động localhost.');
    // A single env snapshot keeps caller credentials and service URLs aligned.
    for (const plan of plans) {
      if (stopping || aborted()) throw failure('LOCAL_START_CANCELLED', 'Đã hủy khởi động localhost.');
      const child = spawnImpl(process.execPath, [bootstrap, plan.entry, ...(plan.args || [])], {
        cwd: plan.cwd, env: { ...env }, shell: false, windowsHide: true,
        stdio: ['ignore', 'inherit', 'inherit', 'ipc']
      });
      let finish;
      const record = { child, plan, exited: false, loaded: false, failure: null,
        finished: new Promise(resolve => { finish = resolve; }) };
      owned.push(record);
      child.on('message', message => { if (message === 'aesp:loaded') record.loaded = true; });
      child.once('error', () => {
        record.failure = failure('LOCAL_CHILD_FAILED', `Chưa thể khởi động ${plan.name}.`);
        record.exited = true; finish();
        if (!stopping) void stop(1);
      });
      child.once('exit', () => {
        record.exited = true; finish();
        if (!stopping) {
          record.failure ??= failure('LOCAL_CHILD_EXITED', `${plan.name} đã dừng. Các phiên khác được giữ nguyên.`);
          void stop(1);
        }
      });
    }
    const deadline = Date.now() + readyTimeoutMs;
    for (const record of owned) {
      let ready = false;
      while (Date.now() < deadline && !stopping && !aborted()) {
        if (record.failure) throw record.failure;
        try {
          const response = await fetchImpl(`http://127.0.0.1:${record.plan.port}${record.plan.healthPath || '/health'}`, {
            signal: AbortSignal.timeout(Math.min(1000, Math.max(1, deadline - Date.now()))), redirect: 'error'
          });
          if (record.plan.service) {
            const value = await response.json();
            ready = response.ok && record.loaded && value?.service === record.plan.service && value?.status === 'ok';
          } else {
            ready = response.ok && record.loaded;
            await response.body?.cancel();
          }
          if (ready) break;
        } catch { /* Bounded readiness wait; never resends application writes. */ }
        await delay(100);
      }
      if (aborted()) throw failure('LOCAL_START_CANCELLED', 'Đã hủy khởi động localhost.');
      if (record.failure) throw record.failure;
      if (!ready || stopping || aborted()) throw failure('LOCAL_NOT_READY', `${record.plan.name} chưa sẵn sàng; đã dừng các tiến trình vừa mở.`);
      log(`${record.plan.name}: http://127.0.0.1:${record.plan.port}`);
    }
    return { stop, done };
  } catch (error) {
    await stop(1);
    throw error;
  }
}

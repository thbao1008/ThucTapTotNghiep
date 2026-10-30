// The launcher owns this direct Node child. IPC permits graceful shutdown on
// Windows without looking up or terminating the current owner of a port.
import { pathToFileURL } from 'node:url';

let stopping = false;
function shutdown() {
  if (stopping) return;
  stopping = true;
  const handled = process.emit('SIGTERM');
  if (!handled) process.exit(0);
  setTimeout(() => process.exit(1), 8000).unref();
}
process.on('message', message => { if (message === 'aesp:shutdown') shutdown(); });
process.on('disconnect', shutdown);
const entry = process.argv[2];
process.argv = [process.execPath, entry, ...process.argv.slice(3)];
try {
  await import(pathToFileURL(entry).href);
  await new Promise(resolve => setImmediate(resolve));
  if (process.exitCode) process.exit(process.exitCode);
  if (!stopping && process.connected) process.send('aesp:loaded');
}
catch (error) {
  // Do not print a configuration object, request body, or credentials.
  console.error(`Local service failed: ${/^[A-Z0-9_]+$/.test(error?.code) ? error.code : 'STARTUP_FAILED'}`);
  process.exit(1);
}

// Queue utility - supports Bull (Redis) or EventEmitter fallback
import EventEmitter from "events";
import { randomUUID } from "node:crypto";

const REDIS_URL = process.env.REDIS_URL;

let enqueue;
let registerProcessor;  
let closeAll;

if (REDIS_URL) {
  const Queue = (await import("bull")).default;
  const queues = new Map();

  function getQueue(name) {
    if (!queues.has(name)) {
      const q = new Queue(name, REDIS_URL);
      queues.set(name, q);
    }
    return queues.get(name);
  }

  enqueue = async function(name, data = {}, opts = {}) {
    const q = getQueue(name);
    return q.add(data, opts);
  };

  registerProcessor = function(name, handler) {
    const q = getQueue(name);
    q.process(async (job) => {
      try {
        return await handler(job);
      } catch (err) {
        console.error(`Queue handler error for ${name}: - queue.js:33`, err);
        throw err;
      }
    });
  };

  closeAll = async function() {
    for (const q of queues.values()) {
      await q.close();
    }
  };
} else {
  const emitter = new EventEmitter();
  const processors = new Map();
  const active = new Set();
  let closing = false;
  let closePromise;

  // One listener regardless of processor count; completed jobs are not retained.
  emitter.on("job", (handler, job) => {
    const work = Promise.resolve().then(() => handler(job)).catch(error => {
      console.error("EventEmitter handler failed", error?.code || error?.name || "UNKNOWN_ERROR");
    }).finally(() => active.delete(work));
    active.add(work);
  });

  enqueue = async function(name, data = {}, opts = {}) {
    if (closing) throw Object.assign(new Error("Queue is closed"), { code: "QUEUE_CLOSED" });
    const handler = processors.get(name);
    if (!handler) throw Object.assign(new Error("Queue processor is not registered"), { code: "QUEUE_PROCESSOR_MISSING" });
    const job = { id: randomUUID(), data, opts };
    emitter.emit("job", handler, job);
    return { id: job.id };
  };

  registerProcessor = function(name, handler) {
    if (closing) throw new Error("Queue is closed");
    if (typeof name !== "string" || !name || typeof handler !== "function") throw new TypeError("Invalid queue processor");
    if (processors.has(name)) throw new Error("Queue processor is already registered");
    processors.set(name, handler);
  };

  closeAll = function() {
    if (!closePromise) {
      closing = true;
      emitter.removeAllListeners();
      closePromise = Promise.all([...active]).then(() => { processors.clear(); });
    }
    return closePromise;
  };
}

export { enqueue, registerProcessor, closeAll };


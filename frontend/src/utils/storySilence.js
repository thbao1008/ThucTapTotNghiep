// Local level detection only: never transcribes or sends audio to another service.
export function createStorySilenceGate({ silenceMs = 2000, speechMs = 300, threshold = 0.02 } = {}) {
  let previous = null, voicedMs = 0, lastVoice = null, heardSpeech = false, finished = false;
  return {
    sample(level, time) {
      if (finished || !Number.isFinite(time) || !Number.isFinite(level)) return false;
      const elapsed = previous === null ? 0 : Math.max(0, Math.min(250, time - previous));
      previous = time;
      if (level >= threshold) {
        voicedMs += elapsed; lastVoice = time;
        if (voicedMs >= speechMs) heardSpeech = true;
      } else {
        voicedMs = 0;
        if (heardSpeech && time - lastVoice >= silenceMs) { finished = true; return true; }
      }
      return false;
    },
    cancel() { finished = true; }
  };
}

export function monitorStorySilence(stream, onSilence, {
  AudioContextClass = globalThis.AudioContext || globalThis.webkitAudioContext,
  schedule = setTimeout, unschedule = clearTimeout, now = () => performance.now(),
  onUnavailable = () => {}
} = {}) {
  let context, source, analyser, timer, closed = false;
  const gate = createStorySilenceGate();
  const stop = () => {
    if (closed) return;
    closed = true; gate.cancel(); unschedule(timer);
    try { source?.disconnect(); analyser?.disconnect(); } catch { /* Already disconnected. */ }
    try { Promise.resolve(context?.close()).catch(() => {}); } catch { /* Already closed. */ }
  };
  const unavailable = () => { if (!closed) { stop(); onUnavailable(); } };
  const begin = async () => {
    try {
      if (!AudioContextClass) return unavailable();
      context = new AudioContextClass();
      if (context.state === 'suspended') await context.resume();
      if (closed) return;
      if (context.state !== 'running') return unavailable();
      source = context.createMediaStreamSource(stream);
      analyser = context.createAnalyser(); analyser.fftSize = 2048;
      source.connect(analyser); // No speaker connection: avoid microphone echo.
      const samples = new Float32Array(analyser.fftSize);
      const tick = () => {
        if (closed) return;
        try {
          analyser.getFloatTimeDomainData(samples);
          const rms = Math.sqrt(samples.reduce((sum, value) => sum + value * value, 0) / samples.length);
          if (gate.sample(rms, now())) { stop(); onSilence(); return; }
          timer = schedule(tick, 100);
        } catch { unavailable(); }
      };
      tick();
    } catch { unavailable(); }
  };
  void begin();
  return { stop };
}

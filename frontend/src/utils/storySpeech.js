// English practice must keep English pronunciation, even when an Asian voice is preferred.
export function selectStoryVoice(voices, type, origin) {
  const english = voices.filter(voice => /^en(?:[-_]|$)/i.test(voice.lang));
  const names = type === 'male' ? /\b(david|mark|richard|male)\b/i : /\b(zira|samantha|karen|susan|female)\b/i;
  const preferred = origin === 'asian'
    ? english.filter(voice => /^en[-_](IN|SG|PH|HK)/i.test(voice.lang))
    : english.filter(voice => /^en[-_]US/i.test(voice.lang));
  return preferred.find(voice => voice.gender === type || names.test(voice.name))
    || english.find(voice => voice.gender === type || names.test(voice.name))
    || preferred[0] || english[0] || null;
}

export function createStorySpeech({ synthesis, Utterance, AudioClass, getRemoteAudio,
  createUrl, revokeUrl, onPlaying, onStatus = () => {}, setTimer = setTimeout, clearTimer = clearTimeout }) {
  let revision = 0;
  let pendingRemote;
  const remoteCache = new Map();
  let dispose = () => {};
  const remoteCode = value => ['FPT_RATE_LIMITED','FPT_AUTH_FAILED','FPT_TIMEOUT','FPT_AUDIO_UNAVAILABLE'].includes(value)
    ? value : 'FPT_AUDIO_UNAVAILABLE';
  const cancel = () => {
    revision++;
    pendingRemote?.abort();
    pendingRemote = null;
    dispose();
    dispose = () => {};
    synthesis?.cancel();
    onPlaying(null);
  };
  const speak = async (text, id, type = 'female', origin = 'native') => {
    cancel();
    const current = revision;
    const active = () => revision === current;
    onStatus({ event: 'request', provider: origin === 'asian' && type === 'female' ? 'fpt' : 'browser' });
    const browser = () => {
      if (!active() || !synthesis || !Utterance) return;
      let started = false;
      let timer;
      const detach = () => {
        clearTimer(timer);
        synthesis.removeEventListener('voiceschanged', start);
      };
      const start = () => {
        if (!active() || started) return;
        started = true;
        detach();
        const utterance = new Utterance(text);
        const voice = selectStoryVoice(synthesis.getVoices(), type, origin);
        utterance.lang = voice?.lang || 'en-US';
        if (voice) utterance.voice = voice;
        utterance.rate = 0.85;
        utterance.pitch = type === 'male' ? 0.85 : 1.1;
        utterance.onstart = () => { if (active()) { onPlaying(id); onStatus({ event: 'start', lang: utterance.lang, voice: voice?.name || 'default' }); } };
        utterance.onend = () => { if (active()) { onPlaying(null); onStatus({ event: 'end' }); } };
        utterance.onerror = event => { if (active()) { onPlaying(null); onStatus({ event: 'error', error: event.error }); } };
        synthesis.speak(utterance);
      };
      dispose = detach;
      if (synthesis.getVoices().length) start();
      else {
        synthesis.addEventListener('voiceschanged', start);
        // Some engines never dispatch voiceschanged; still try the English default.
        timer = setTimer(start, 1000);
      }
    };
    if (origin === 'asian' && type === 'female' && getRemoteAudio) {
      try {
        const key = JSON.stringify([text, type, origin]);
        const controller = new AbortController();
        pendingRemote = controller;
        const result = remoteCache.get(key) || await getRemoteAudio(text, type, origin, { signal: controller.signal });
        if (!active()) return;
        pendingRemote = null;
        if (result?.success && result.audioBase64) {
          if (!remoteCache.has(key)) {
            if (remoteCache.size >= 5) remoteCache.delete(remoteCache.keys().next().value);
            remoteCache.set(key, result);
          }
          let url,audio;
          try { url=createUrl(result);audio=new AudioClass(url); }
          catch(error){remoteCache.delete(key);if(url)revokeUrl(url);throw error;}
          let released = false;
          const release = () => {
            if (released) return;
            released = true;
            audio.onplay = audio.onended = audio.onerror = null;
            audio.pause();
            revokeUrl(url);
          };
          dispose = release;
          audio.onplay = () => { if (active()) onPlaying(id); };
          audio.onended = () => { if (active()) { release(); onPlaying(null); dispose = () => {}; } };
          const fallback = () => { if (active() && !released) {
            remoteCache.delete(key);
            release(); onPlaying(null);
            onStatus({ event: 'fallback', provider: 'browser', requestedProvider: 'fpt',code:'FPT_AUDIO_UNAVAILABLE' });
            browser();
          } };
          audio.onerror = fallback;
          try { await audio.play(); }
          catch(error) {
            if(error?.name==='NotAllowedError'){
              if(active()&&!released){
                release();onPlaying(null);dispose=()=>{};
                // Keep valid speech bytes: a direct Play click can replay them
                // immediately without losing its user gesture to an HTTP wait.
                onStatus({event:'blocked',provider:'fpt',code:'PLAYBACK_BLOCKED'});
              }
            } else fallback();
          }
          return;
        }
        onStatus({ event: 'fallback', provider: 'browser', requestedProvider: 'fpt',code:remoteCode(result?.code),retryAfterSeconds:result?.retryAfterSeconds });
      } catch(error) {
        if (active()) { pendingRemote = null; onStatus({ event: 'fallback', provider: 'browser', requestedProvider: 'fpt',code:remoteCode(error?.response?.data?.code) }); }
      }
    }
    browser();
  };
  return { speak, cancel };
}

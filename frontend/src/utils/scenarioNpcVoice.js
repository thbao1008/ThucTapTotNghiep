// Scenario speech uses installed English voices only. Never fall back to an
// arbitrary browser default or a cloud voice for this optional local control.
export function selectScenarioEnglishVoice(voices) {
  if (!Array.isArray(voices)) return null;
  const english = voices.filter(voice => voice?.localService === true && /^en(?:[-_]|$)/i.test(voice.lang));
  return english.find(voice => voice.default) || english.find(voice => /^en[-_]US$/i.test(voice.lang)) || english[0] || null;
}

export function createScenarioNpcSpeech({ synthesis, Utterance, onState = () => {}, onEvent = () => {},
  setTimer = setTimeout, clearTimer = clearTimeout, voiceWaitMs = 1500, startWaitMs = 8000 }) {
  const supported = Boolean(synthesis && typeof synthesis.speak === 'function' && typeof synthesis.cancel === 'function'
    && typeof synthesis.getVoices === 'function' && typeof Utterance === 'function');
  let revision = 0, phase = 'idle', disposed = false, utterance = null, ownsSpeech = false;
  let voiceTimer, startTimer, voiceListener, playback = null;
  const observe = (type, details = {}) => { try { onEvent({type,...(playback || {}),...details}); } catch {} };
  const emit = (status, message = '') => { phase = status; if (!disposed) onState({ status, message }); };
  const clearWaiting = () => {
    if (voiceTimer !== undefined) clearTimer(voiceTimer);
    if (startTimer !== undefined) clearTimer(startTimer);
    voiceTimer = startTimer = undefined;
    if (voiceListener) synthesis?.removeEventListener?.('voiceschanged', voiceListener);
    voiceListener = null;
  };
  const detach = () => {
    if (utterance) utterance.onstart = utterance.onend = utterance.onerror = null;
    utterance = null;
  };
  function stop() {
    revision++;
    clearWaiting(); detach();
    if (ownsSpeech) { ownsSpeech = false; try { synthesis.cancel(); observe('cancel-requested'); } catch {} }
    playback = null;
    emit('idle');
  }
  function play(text, speakerId) {
    if (disposed || ['loading','starting','playing'].includes(phase)) return false;
    if (!supported) { emit('unavailable', 'Trình duyệt này chưa hỗ trợ đọc lời thoại.'); return false; }
    if (typeof text !== 'string' || !text.trim() || text.length > 1000 || typeof speakerId !== 'string' || !speakerId
      || /[\u0000-\u0008\u000b\u000c\u000e-\u001f]/.test(text)) { emit('error', 'Chưa có lời thoại hợp lệ để nghe.'); return false; }
    // Do not stop or queue behind unrelated speech from another component.
    if (synthesis.speaking || synthesis.pending) { emit('error', 'Một đoạn đọc khác đang phát. Hãy dừng đoạn đó rồi nghe lại.'); return false; }
    const current = ++revision;
    const active = () => !disposed && revision === current;
    const unavailable = () => {
      if (!active()) return;
      clearWaiting();
      emit('unavailable', 'Chưa có giọng tiếng Anh cài trên máy. Bạn vẫn có thể đọc lời thoại.');
    };
    const voices = () => { try { return synthesis.getVoices(); } catch { return []; } };
    const start = () => {
      if (!active() || ['starting','playing'].includes(phase)) return;
      const voice = selectScenarioEnglishVoice(voices());
      if (!voice) return;
      clearWaiting();
      // Voice discovery can finish after another component begins speaking.
      // Do not enqueue behind that utterance or later cancel its playback.
      if (synthesis.speaking || synthesis.pending) {
        emit('error', 'Một đoạn đọc khác đang phát. Hãy dừng đoạn đó rồi nghe lại.');
        return;
      }
      try {
        playback = {speakerId,text:text.trim(),voice:voice.name,lang:voice.lang,localService:voice.localService===true};
        utterance = new Utterance(text.trim());
        utterance.voice = voice; utterance.lang = voice.lang; utterance.rate = 0.9;
        utterance.onstart = () => {
          if (!active()) return;
          if (startTimer !== undefined) clearTimer(startTimer);
          startTimer = undefined;
          emit('playing');observe('start');
        };
        utterance.onend = () => { if (active()) { observe('end');clearWaiting(); ownsSpeech = false; detach();playback=null;emit('idle'); } };
        utterance.onerror = event => { if (active()) { observe('error',{error:typeof event?.error==='string'?event.error.slice(0,80):'synthesis-error'});clearWaiting(); ownsSpeech = false; detach();playback=null;emit('error', 'Chưa phát được giọng đọc. Bạn có thể thử nghe lại.'); } };
        ownsSpeech = true; emit('starting');
        startTimer = setTimer(() => {
          if (!active() || phase !== 'starting') return;
          stop(); emit('error', 'Giọng đọc chưa bắt đầu. Bạn có thể thử nghe lại.');
        }, startWaitMs);
        observe('speak-requested');synthesis.speak(utterance);
      } catch {
        if (active()) { stop(); emit('error', 'Chưa phát được giọng đọc. Bạn có thể thử nghe lại.'); }
      }
    };
    emit('loading');
    if (selectScenarioEnglishVoice(voices())) start();
    else {
      voiceListener = start;
      synthesis.addEventListener?.('voiceschanged', voiceListener);
      voiceTimer = setTimer(() => { if (!active()) return; start(); if (phase === 'loading') unavailable(); }, voiceWaitMs);
    }
    return true;
  }
  return { supported, play, stop, dispose() { disposed = true; stop(); } };
}

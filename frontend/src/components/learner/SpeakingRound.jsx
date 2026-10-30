import React, { useEffect, useRef, useState } from 'react';
import { FaMicrophone } from 'react-icons/fa';
import api from '../../api';
import { UiText } from '../../i18n/UiLanguage.jsx';
import { createMicrophoneRequest, discardRecorder, microphoneErrorMessage } from '../../utils/microphoneRequest.js';
import { createSpokenWordProgress } from '../../utils/spokenWordProgress.js';
import '../../styles/speaking-practice.css';

export default function SpeakingRound({ sessionId, roundNumber, level, onSave, onCancel }) {
  const [prompt, setPrompt] = useState(''), [timeRemaining, setTimeRemaining] = useState(0);
  const [loadingPrompt, setLoadingPrompt] = useState(true), [promptError, setPromptError] = useState('');
  const [preparing, setPreparing] = useState(false), [requestingMic, setRequestingMic] = useState(false);
  const [isRecording, setIsRecording] = useState(false), [submitting, setSubmitting] = useState(false);
  const [finalizing, setFinalizing] = useState(false);
  const [leaving, setLeaving] = useState(false);
  const [exitRequested, setExitRequested] = useState(false);
  const [audioBlob, setAudioBlob] = useState(null), [recordingNotice, setRecordingNotice] = useState('');
  const [saveFailed, setSaveFailed] = useState(false);
  const [speechNotice, setSpeechNotice] = useState(''), [progress, setProgress] = useState(null);
  const [wordTooltip, setWordTooltip] = useState(null), [loadingWord, setLoadingWord] = useState('');
  const cacheRef = useRef(null);
  if (!cacheRef.current) {
    try { cacheRef.current = JSON.parse(localStorage.getItem('wordDefinitionsCache') || '{}'); }
    catch { cacheRef.current = {}; }
  }
  const mountedRef = useRef(false), promptDataRef = useRef(null), trackerRef = useRef(null);
  const microphoneRef = useRef(null), recorderRef = useRef(null), recognitionRef = useRef(null);
  const chunksRef = useRef([]), recordingRef = useRef(false), submittingRef = useRef(false);
  const finalizingRef = useRef(false);
  const leavingRef = useRef(false);
  const exitRequestedRef = useRef(false);
  const startTimeRef = useRef(0), elapsedRef = useRef(0), finishRef = useRef(false);
  const ownedTimers = useRef(new Set()), promptRequestRef = useRef(null), uploadRequestRef = useRef(null);
  const dictionaryRequestRef = useRef(null);
  if (!microphoneRef.current) microphoneRef.current = createMicrophoneRequest();

  function later(callback, delay) {
    const timer = setTimeout(() => { ownedTimers.current.delete(timer); if (mountedRef.current) callback(); }, delay);
    ownedTimers.current.add(timer); return timer;
  }
  function stopRecognition() {
    const recognition = recognitionRef.current; recognitionRef.current = null;
    if (recognition) {
      recognition.onend = null; recognition.onerror = null; recognition.onresult = null;
      try { recognition.abort(); } catch { /* Already stopped. */ }
    }
  }
  const elapsedSeconds = () => Math.min(promptDataRef.current?.timeLimit || 30,
    Math.max(1, Math.ceil((Date.now() - startTimeRef.current) / 1000)));
  function cancelCapture() {
    recordingRef.current = false; finishRef.current = false;
    finalizingRef.current = false;
    for (const timer of ownedTimers.current) clearTimeout(timer);
    ownedTimers.current.clear(); stopRecognition();
    discardRecorder(recorderRef.current); recorderRef.current = null;
    microphoneRef.current.cancel(); chunksRef.current = [];
    window.speechSynthesis?.cancel();
  }
  function pauseCapture() {
    if (finalizingRef.current || submittingRef.current) return;
    cancelCapture(); setPreparing(false); setIsRecording(false); setRequestingMic(false);
    setProgress(null); setAudioBlob(null); trackerRef.current = null;
    setTimeRemaining(promptDataRef.current?.timeLimit || 0);
    setRecordingNotice('Microphone paused. Resume to start this sentence again.');
  }
  async function leaveRound() {
    if (leavingRef.current) return;
    leavingRef.current = true; exitRequestedRef.current = true;
    setLeaving(true); setExitRequested(true); cancelCapture();
    promptRequestRef.current?.abort(); uploadRequestRef.current?.abort(); dictionaryRequestRef.current?.abort();
    setPreparing(false); setIsRecording(false); setRequestingMic(false); setFinalizing(false);
    try {
      const ended = await onCancel?.();
      if (ended === false && mountedRef.current) {
        // Keep the round fenced: a save already sent may have reached the server.
        setRecordingNotice('The session could not be ended. Please try leaving again.');
      }
    } catch {
      if (mountedRef.current) setRecordingNotice('The session could not be ended. Please try leaving again.');
    } finally { if (mountedRef.current) { leavingRef.current = false; setLeaving(false); } }
  }

  useEffect(() => {
    mountedRef.current = true;
    const suspend = () => {
      // A finished take is already being saved. Keep its pending onstop handler.
      if (finalizingRef.current || submittingRef.current) { stopRecognition(); microphoneRef.current.cancel(); }
      else pauseCapture();
    };
    const visibility = () => { if (document.hidden) suspend(); };
    window.addEventListener('pagehide', suspend); document.addEventListener('visibilitychange', visibility);
    return () => {
      mountedRef.current = false; cancelCapture(); promptRequestRef.current?.abort();
      uploadRequestRef.current?.abort(); dictionaryRequestRef.current?.abort();
      window.removeEventListener('pagehide', suspend); document.removeEventListener('visibilitychange', visibility);
    };
  }, []);

  useEffect(() => {
    void fetchPrompt();
    return () => { promptRequestRef.current?.abort(); cancelCapture(); };
  }, [sessionId, roundNumber, level]);

  // Wall time remains correct even when interval callbacks are delayed.
  useEffect(() => {
    if (!isRecording) return;
    const timer = setInterval(() => {
      if (!recordingRef.current) return;
      const remaining = Math.max(0, Math.ceil(promptDataRef.current.timeLimit - (Date.now() - startTimeRef.current) / 1000));
      setTimeRemaining(remaining);
      if (!remaining) finishRecording();
    }, 100);
    return () => clearInterval(timer);
  }, [isRecording]);

  async function fetchPrompt() {
    cancelCapture(); setPreparing(false); setLoadingPrompt(true); setPromptError('');
    promptRequestRef.current?.abort();
    const controller = new AbortController(); promptRequestRef.current = controller;
    try {
      const { data } = await api.get(`/learners/speaking-practice/sessions/${sessionId}/prompt`, {
        params: { round: roundNumber }, signal: controller.signal
      });
      if (!mountedRef.current || controller.signal.aborted) return;
      if (typeof data?.prompt !== 'string' || !data.prompt.trim()) throw new Error('Invalid sentence');
      const timeLimit = Number(data.time_limit) > 0 ? Number(data.time_limit) : 30;
      promptDataRef.current = { prompt: data.prompt.trim(), timeLimit };
      setPrompt(data.prompt.trim()); setTimeRemaining(timeLimit); setProgress(null);
      setAudioBlob(null); setSaveFailed(false); setRecordingNotice(''); setSpeechNotice(''); setIsRecording(false);
      setFinalizing(false);
      submittingRef.current = false; setSubmitting(false); setLoadingPrompt(false); setPreparing(true);
      later(() => { setPreparing(false); if (!document.hidden) void startRecording(); }, 600);
    } catch (error) {
      if (!mountedRef.current || controller.signal.aborted) return;
      setPromptError(error?.response?.data?.message || 'The sentence could not be loaded. Please try again.');
      setLoadingPrompt(false);
    }
  }

  async function startRecording() {
    if (!mountedRef.current || exitRequestedRef.current || microphoneRef.current.busy() || !promptDataRef.current || submittingRef.current || finalizingRef.current) return;
    setRequestingMic(true); setRecordingNotice(''); setSpeechNotice(''); setWordTooltip(null);
    window.speechSynthesis?.cancel();
    try {
      const stream = await microphoneRef.current.acquire();
      if (!stream || !mountedRef.current || !microphoneRef.current.owns(stream)) return;
      const options = MediaRecorder.isTypeSupported?.('audio/webm') ? { mimeType: 'audio/webm' } : undefined;
      const recorder = new MediaRecorder(stream, options); recorderRef.current = recorder; chunksRef.current = [];
      recorder.ondataavailable = event => {
        if (mountedRef.current && recorderRef.current === recorder && event.data?.size) chunksRef.current.push(event.data);
      };
      recorder.onstop = () => {
        if (!mountedRef.current || recorderRef.current !== recorder) return;
        const expectedStop = finishRef.current;
        recordingRef.current = false; setIsRecording(false); stopRecognition();
        if (!expectedStop) elapsedRef.current = elapsedSeconds();
        const blob = new Blob(chunksRef.current, { type: recorder.mimeType || chunksRef.current[0]?.type || 'audio/webm' });
        recorderRef.current = null; chunksRef.current = []; microphoneRef.current.cancel();
        finalizingRef.current = false; setFinalizing(false);
        if (!blob.size) { setRecordingNotice('No audio was captured. Please try again.'); return; }
        setAudioBlob(blob);
        if (finishRef.current) { finishRef.current = false; void handleSubmit(blob); }
        else setRecordingNotice('Recording stopped unexpectedly. Save this recording to continue.');
      };
      recorder.onerror = () => {
        cancelCapture(); if (mountedRef.current) { setIsRecording(false); setFinalizing(false); setRecordingNotice('Recording was interrupted. Please try again.'); }
      };
      trackerRef.current = createSpokenWordProgress(promptDataRef.current.prompt);
      setProgress(trackerRef.current.snapshot()); setAudioBlob(null); setSaveFailed(false); finishRef.current = false;
      setTimeRemaining(promptDataRef.current.timeLimit); elapsedRef.current = 0;
      recordingRef.current = true; startTimeRef.current = Date.now();
      recorder.start(); setIsRecording(true); startRecognition();
    } catch (error) {
      cancelCapture(); if (mountedRef.current) { setIsRecording(false); setRecordingNotice(microphoneErrorMessage(error)); }
    } finally { if (mountedRef.current) setRequestingMic(false); }
  }

  function startRecognition() {
    const Recognition = window.SpeechRecognition || window.webkitSpeechRecognition;
    if (typeof Recognition !== 'function') {
      setSpeechNotice('Live word tracking is unavailable in this browser. Your recording will still be assessed when the timer ends.'); return;
    }
    const recognition = new Recognition(); recognitionRef.current = recognition;
    recognition.continuous = true; recognition.interimResults = true; recognition.lang = 'en-US';
    let failed = false, restarts = 0;
    const start = () => {
      if (!recordingRef.current || recognitionRef.current !== recognition || failed) return;
      try { trackerRef.current.beginRecognition(); recognition.start(); }
      catch { failed = true; setSpeechNotice('Live word tracking is unavailable. You can keep reading until the timer ends.'); }
    };
    recognition.onresult = event => {
      if (!recordingRef.current || recognitionRef.current !== recognition) return;
      restarts = 0;
      const next = trackerRef.current.update(event.results); setProgress(next);
      if (next.complete) finishRecording();
    };
    recognition.onerror = event => {
      if (!recordingRef.current || recognitionRef.current !== recognition || event.error === 'aborted') return;
      if (['not-allowed', 'service-not-allowed', 'audio-capture', 'language-not-supported'].includes(event.error) || ++restarts > 2) failed = true;
      if (event.error !== 'no-speech') setSpeechNotice('Live word tracking was interrupted. Your recording continues; the timer will finish this round.');
    };
    recognition.onend = () => { if (!failed) later(start, 250); };
    start();
  }

  function finishRecording() {
    if (!recordingRef.current) return;
    recordingRef.current = false; finishRef.current = true;
    finalizingRef.current = true; setFinalizing(true);
    elapsedRef.current = elapsedSeconds();
    setIsRecording(false); setRecordingNotice(''); stopRecognition();
    // onstop receives the final audio chunk before submitting, exactly once.
    const recorder = recorderRef.current;
    if (!recorder) {
      finalizingRef.current = false; setFinalizing(false); finishRef.current = false;
      microphoneRef.current.cancel(); setRecordingNotice('Recording was interrupted. Please try again.'); return;
    }
    if (recorder && recorder.state !== 'inactive') recorder.stop();
    microphoneRef.current.cancel();
  }

  async function handleSubmit(blob = audioBlob) {
    if (!mountedRef.current || exitRequestedRef.current || submittingRef.current || !blob) return;
    submittingRef.current = true; setSubmitting(true);
    const controller = new AbortController(); uploadRequestRef.current = controller;
    const snapshot = trackerRef.current?.snapshot();
    const data = new FormData(); data.append('audio', blob, `round-${roundNumber}.webm`);
    data.append('round_number', roundNumber); data.append('time_taken', elapsedRef.current);
    data.append('prompt', promptDataRef.current.prompt);
    data.append('web_speech_transcript', snapshot?.transcript || '');
    data.append('web_speech_highlights', JSON.stringify([...(snapshot?.finalIndices || [])]));
    try {
      const { data: result } = await api.post(`/learners/speaking-practice/sessions/${sessionId}/rounds`, data, { signal: controller.signal });
      if (!mountedRef.current || controller.signal.aborted || leavingRef.current) return;
      if (!Number.isSafeInteger(Number(result?.round_id)) || Number(result.round_id) <= 0) throw new Error('Invalid saved round');
      // Recording analysis continues on the server; do not hold up the next sentence.
      onSave?.({ timeTaken: elapsedRef.current, prompt: promptDataRef.current.prompt,
        round_id: result.round_id, analysis_status: result.status || 'processing', missing_words: [] });
    } catch {
      if (!mountedRef.current || controller.signal.aborted) return;
      submittingRef.current = false; setSubmitting(false);
      setSaveFailed(true);
      setRecordingNotice('The save could not be confirmed. Retry saving this recording before starting another sentence.');
    }
  }

  async function handleWordClick(word) {
    if (recordingRef.current || microphoneRef.current.busy() || finalizingRef.current || submittingRef.current || exitRequestedRef.current) return;
    if (wordTooltip?.word === word) { setWordTooltip(null); return; }
    if (window.speechSynthesis && typeof SpeechSynthesisUtterance === 'function') {
      window.speechSynthesis.cancel(); const speech = new SpeechSynthesisUtterance(word);
      speech.lang = 'en-US'; speech.rate = 0.8; window.speechSynthesis.speak(speech);
    }
    let definition = cacheRef.current[word];
    if (!definition) {
      dictionaryRequestRef.current?.abort(); const controller = new AbortController(); dictionaryRequestRef.current = controller;
      setLoadingWord(word);
      try {
        const { data } = await api.get(`/learners/dictionary/${encodeURIComponent(word)}`, { signal: controller.signal });
        if (!mountedRef.current || controller.signal.aborted) return;
        definition = data; cacheRef.current[word] = data;
        try { localStorage.setItem('wordDefinitionsCache', JSON.stringify(Object.fromEntries(Object.entries(cacheRef.current).slice(-100)))); } catch { /* Cache optional. */ }
      } catch { if (!mountedRef.current || controller.signal.aborted) return; }
      finally { if (mountedRef.current && !controller.signal.aborted) setLoadingWord(''); }
    }
    if (mountedRef.current) setWordTooltip({ word, ...definition, definition: definition?.definition || 'The dictionary is temporarily unavailable. You can continue practicing.' });
  }

  const words = prompt ? prompt.split(/\s+/) : [];
  const total = progress?.totalWords ?? words.length, matched = progress?.matchedWords || 0;
  const difficulty = ({ 1: 'Easy', 2: 'Medium', 3: 'Hard' })[level] || 'Easy';
  const formatTime = seconds => `${Math.floor(seconds / 60)}:${String(seconds % 60).padStart(2, '0')}`;
  return <section className="reading-workspace">
    <div className="reading-workspace-top"><div><p className="workspace-eyebrow"><UiText text="Luyện đọc thành tiếng"/></p><h1><UiText text="Từng câu, từng bước tiến."/></h1></div><button className="workspace-back" disabled={leaving} onClick={leaveRound}><UiText text="Rời bài luyện"/></button></div>
    <div className="reading-progress"><span><UiText text="Vòng"/> {roundNumber}<span className="muted"> / 10</span></span><div className="reading-progress-track"><span style={{ width: `${roundNumber * 10}%` }}/></div><span className={`reading-time ${isRecording ? 'is-live' : ''}`} aria-label="Time remaining">{formatTime(timeRemaining)}</span></div>
    <div className="reading-workspace-grid">
      <article className="reading-paper"><div className="reading-paper-heading"><span><UiText text="Read aloud"/></span><span><UiText text={difficulty}/></span></div>
        {loadingPrompt ? <p role="status"><UiText text="Đang tải đề bài..."/></p> : promptError ? <div role="alert"><UiText>{promptError}</UiText><button onClick={fetchPrompt}><UiText text="Thử lại"/></button></div> : <p lang="en" className="reading-passage">{words.map((word, index) => <React.Fragment key={index}><button data-word-index={index} data-matched={progress?.highlightedIndices.has(index) || false} className={`reading-word ${progress?.highlightedIndices.has(index) ? 'is-matched' : ''}`} disabled={isRecording || requestingMic || preparing || submitting} onClick={() => handleWordClick(word.replace(/[^a-zA-Z'-]/g, '').toLowerCase())}>{word}</button>{index < words.length - 1 ? ' ' : ''}</React.Fragment>)}</p>}
        {!loadingPrompt && !promptError && <div className="reading-word-progress"><div className="reading-word-progress-track" role="progressbar" aria-label="Recognized words" aria-valuemin={0} aria-valuemax={total} aria-valuenow={matched}><span style={{ width: `${total ? matched / total * 100 : 0}%` }}/></div><span>{matched} / {total} <UiText text="words recognized"/></span></div>}
        <p className="reading-hint"><UiText text="Read in any order. Each repeated word needs another spoken occurrence."/></p>
        {wordTooltip && <aside className="reading-dictionary"><div><strong lang="en">{wordTooltip.word}</strong><button aria-label="Close dictionary" onClick={() => setWordTooltip(null)}>×</button></div><p>{wordTooltip.pronunciation}</p><p>{wordTooltip.definition}</p>{wordTooltip.usage && <p>{wordTooltip.usage}</p>}{wordTooltip.example && <p lang="en">{wordTooltip.example}</p>}</aside>}
        {loadingWord && <p role="status"><UiText text="Đang tải..."/></p>}
      </article>
      <aside className="reading-recorder"><span className={`recorder-orb ${isRecording ? 'is-recording' : ''}`}><FaMicrophone aria-hidden="true"/></span>
        <h2><UiText text={submitting || finalizing ? 'Saving your round' : isRecording ? 'Listening to you' : preparing ? 'Get ready' : requestingMic ? 'Waiting for microphone' : 'Microphone paused'}/></h2>
        <p><UiText text={submitting || finalizing ? 'Saving your recording. The next sentence will open shortly.' : isRecording ? 'Words light up as you speak. The next sentence starts automatically when all words are confirmed.' : preparing || requestingMic ? 'Your microphone starts automatically for each sentence.' : 'Resume when you are ready to read this sentence.'}/></p>
        {isRecording || requestingMic || preparing ? <button className="recorder-primary is-stop" onClick={pauseCapture}><UiText text="Pause microphone"/></button> : <button className="recorder-primary" disabled={loadingPrompt || !!promptError || submitting || finalizing || exitRequested} onClick={() => audioBlob ? handleSubmit() : startRecording()}><UiText text={submitting || finalizing ? 'Đang lưu...' : audioBlob ? (saveFailed ? 'Retry saving' : 'Save recording') : 'Resume microphone'}/></button>}
        {isRecording && <button className="reading-save-early" onClick={finishRecording}><UiText text="Finish this round"/></button>}
        {recordingNotice && <p role="status" className="workspace-notice"><UiText>{recordingNotice}</UiText></p>}
        {speechNotice && <p role="status" className="workspace-notice"><UiText>{speechNotice}</UiText></p>}
        <div className="recording-privacy"><UiText text="Leaving this page or switching tabs stops the microphone. An unfinished take is discarded."/></div>
      </aside>
    </div>
  </section>;
}

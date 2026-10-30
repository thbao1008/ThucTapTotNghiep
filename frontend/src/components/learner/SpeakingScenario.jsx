import { UiOption } from '../../i18n/UiLanguage.jsx';
import { englishText } from '../../i18n/uiLanguage.js';
import { UiText } from '../../i18n/UiLanguage.jsx';
import React, { useState, useEffect, useRef } from "react";
import api from "../../api";
import { FaMicrophone } from "react-icons/fa";
import "../../styles/speaking-scenario.css";
import { normalizeAudioUrl } from "../../utils/apiHelpers.js";
import { AuthenticatedMedia, loadAuthenticatedMediaUrl } from "../../utils/authenticatedMedia.jsx";
import { getScenarioScores } from "../../utils/practiceScore.js";
import { createAsyncViewScope } from '../../utils/asyncViewScope.js';
import RecordedAudio from '../common/RecordedAudio.jsx';
import { createStorySpeech } from '../../utils/storySpeech.js';
import { restoreScenario } from "../../utils/restoreConversation.js";
import { createMicrophoneRequest, discardRecorder, microphoneErrorMessage } from "../../utils/microphoneRequest.js";

export default function SpeakingScenario({ sessionId, scenario, onComplete, onCancel }) {
  const [vocabulary, setVocabulary] = useState([]);
  const [showVocabulary, setShowVocabulary] = useState(true);
  const [conversation, setConversation] = useState([]);
  const [isRecording, setIsRecording] = useState(false);
  const [requestingMic, setRequestingMic] = useState(false);
  const [isProcessing, setIsProcessing] = useState(false);
  const [taskCompleted, setTaskCompleted] = useState(false);
  const [audioBlob, setAudioBlob] = useState(null);
  const [isPlayingAI, setIsPlayingAI] = useState(false);
  const [voiceSelection, setVoiceSelection] = useState('native-female');
  const [voiceNotice, setVoiceNotice] = useState('');
  const voiceSelectionRef = useRef(voiceSelection);
  voiceSelectionRef.current = voiceSelection;
  const pendingSpeechRef = useRef(null);
  const speechPlayerRef = useRef(null);
  if (!speechPlayerRef.current) speechPlayerRef.current = createStorySpeech({
    synthesis: window.speechSynthesis, Utterance: window.SpeechSynthesisUtterance, AudioClass: window.Audio,
    onPlaying: id => setIsPlayingAI(id !== null),
    onStatus: status => {
      if (status.event === 'request') setVoiceNotice('');
      if (status.event === 'fallback') setVoiceNotice('FPT.AI chưa sẵn sàng; đang dùng giọng trình duyệt thay thế.');
    },
    getRemoteAudio: async (text, voiceType, voiceOrigin, options) =>
      (await api.post('/learners/tts/generate', { text, voiceType, voiceOrigin }, { signal: options.signal })).data,
    createUrl: result => URL.createObjectURL(new Blob([
      Uint8Array.from(atob(result.audioBase64), char => char.charCodeAt(0))
    ], { type: result.mimeType || 'audio/mpeg' })),
    revokeUrl: url => URL.revokeObjectURL(url)
  });
  const [hint, setHint] = useState(null);
  const [loadingHint, setLoadingHint] = useState(false);
  const [finalScore, setFinalScore] = useState(null);
  const [showScoreModal, setShowScoreModal] = useState(false);
  const [isEvaluating, setIsEvaluating] = useState(false);
  const [currentScore, setCurrentScore] = useState(100);
  const [hintsUsed, setHintsUsed] = useState(0);
  const [restoring, setRestoring] = useState(true);
  const [restoreError, setRestoreError] = useState("");
  const [restoreAttempt, setRestoreAttempt] = useState(0);
  const verifiedScores = getScenarioScores(finalScore);
  
  const mediaRecorderRef = useRef(null);
  const mediaStreamRef = useRef(null);
  const audioChunksRef = useRef([]);
  const conversationEndRef = useRef(null);
  const sendingRef = useRef(false);
  const sentRecordingsRef = useRef(new WeakSet());
  const revisionRef = useRef(null);
  const mountedRef = useRef(false);
  const scoringRef = useRef(false);
  const playbackRef = useRef(null);
  const viewScopeRef = useRef(null);
  if (!viewScopeRef.current) viewScopeRef.current = createAsyncViewScope();
  const microphoneRef = useRef(null);
  if (!microphoneRef.current) microphoneRef.current = createMicrophoneRequest();

  useEffect(() => {
    mountedRef.current = true;
    viewScopeRef.current.open();
    sendingRef.current = false;
    scoringRef.current = false;
    setIsProcessing(false); setIsEvaluating(false); setRequestingMic(false);
    setIsRecording(false); setAudioBlob(null);
    return () => {
      mountedRef.current = false;
      pendingSpeechRef.current?.();
      pendingSpeechRef.current = null;
      viewScopeRef.current.close();
      playbackRef.current?.();
      speechPlayerRef.current.cancel();
      discardRecorder(mediaRecorderRef.current);
      microphoneRef.current.cancel();
      mediaRecorderRef.current = null;
      mediaStreamRef.current = null;
      audioChunksRef.current = [];
    };
  }, [sessionId]);

  useEffect(() => {
    if (scenario?.vocabulary) {
      // Parse vocabulary từ JSONB nếu là string
      const vocab = typeof scenario.vocabulary === 'string' 
        ? JSON.parse(scenario.vocabulary) 
        : scenario.vocabulary;
      setVocabulary(Array.isArray(vocab) ? vocab : []);
    }
  }, [scenario]);

  useEffect(() => {
    // Scroll to bottom when conversation updates
    if (conversationEndRef.current) {
      conversationEndRef.current.scrollIntoView({ behavior: "smooth" });
    }
  }, [conversation]);

  useEffect(() => {
    let active = true;
    setRestoring(true);
    setRestoreError("");
    restoreScenario(api, sessionId).then(data => {
      if (!active) return;
      setConversation(data.conversations);
      revisionRef.current = data.revision;
      setCurrentScore(data.score);
      setHintsUsed(data.hints_used);
      setTaskCompleted(data.status === "completed");
      setFinalScore(data.final_assessment);
      setShowScoreModal(Boolean(data.final_assessment));
      setShowVocabulary(data.conversations.length === 1);
    }).catch(() => {
      if (active) setRestoreError("Không thể khôi phục hội thoại. Dữ liệu đã lưu vẫn được giữ nguyên.");
    }).finally(() => {
      if (active) setRestoring(false);
    });
    return () => { active = false; };
  }, [sessionId, restoreAttempt]);

  const startRecording = async () => {
    if (microphoneRef.current.busy() || isProcessing || restoring || restoreError) return;
    pendingSpeechRef.current?.();
    pendingSpeechRef.current = null;
    playbackRef.current?.();
    speechPlayerRef.current.cancel();
    setRequestingMic(true);
    try {
      const stream = await microphoneRef.current.acquire();
      if (!stream || !mountedRef.current || !microphoneRef.current.owns(stream)) return;
      mediaStreamRef.current = stream;
      audioChunksRef.current = [];
      
      const options = 
        typeof MediaRecorder !== "undefined" &&
        MediaRecorder.isTypeSupported &&
        MediaRecorder.isTypeSupported("audio/webm")
          ? { mimeType: "audio/webm" }
          : undefined;
      
      const mr = new MediaRecorder(stream, options);
      mediaRecorderRef.current = mr;
      
      mr.ondataavailable = (e) => {
        if (!mountedRef.current || !microphoneRef.current.owns(stream)) return;
        if (e.data && e.data.size > 0) {
          audioChunksRef.current.push(e.data);
        }
      };
      
      mr.onstop = () => {
        if (!mountedRef.current || !microphoneRef.current.owns(stream)) return;
        const blob = new Blob(audioChunksRef.current, { 
          type: audioChunksRef.current[0]?.type || "audio/webm" 
        });
        setAudioBlob(blob);
        setIsRecording(false);
        microphoneRef.current.cancel();
        mediaStreamRef.current = null;
      };
      
      mr.start();
      setIsRecording(true);
    } catch (err) {
      discardRecorder(mediaRecorderRef.current);
      microphoneRef.current.cancel();
      if (!mountedRef.current) return;
      setIsRecording(false);
      console.error("❌ Error starting recording:", err);
      alert(microphoneErrorMessage(err));
    } finally {
      if (mountedRef.current && !microphoneRef.current.pending()) setRequestingMic(false);
    }
  };

  const stopRecording = () => {
    if (mediaRecorderRef.current && mediaRecorderRef.current.state !== "inactive") {
      mediaRecorderRef.current.stop();
    }
    setIsRecording(false);
  };

  const handleSendMessage = async (audio) => {
    if (!audio || sendingRef.current || sentRecordingsRef.current.has(audio) || revisionRef.current === null || restoring || restoreError) return;
    sendingRef.current = true;
    const isCurrent = viewScopeRef.current.capture();
    sentRecordingsRef.current.add(audio);
    
    const userMessage = {
      speaker: "learner",
      text: "[Audio message]",
      audio: audio,
      timestamp: new Date()
    };
    
    setConversation(prev => [...prev, userMessage]);
    setIsProcessing(true);
    
    try {
      // Gửi audio với FormData
      const formData = new FormData();
      formData.append("audio", audio);
      formData.append("expected_revision", revisionRef.current);
      
      const res = await api.post(
        `/learners/speaking-practice/scenario/sessions/${sessionId}/message`,
        formData,
        { headers: { "Content-Type": "multipart/form-data" } }
      );
      if (!isCurrent()) return;
      if (!Number.isSafeInteger(res.data.revision)) throw new Error("Invalid conversation revision");
      revisionRef.current = res.data.revision;
      const savedUserMessage = { ...userMessage, text: res.data.transcript || userMessage.text };
      let completedConversation = [...conversation, savedUserMessage];
      setConversation(prev => prev.map(message => message === userMessage ? savedUserMessage : message));
      
      if (res.data.message) {
        const aiMessage = {
          speaker: "ai",
          text: res.data.message,
          audio_url: res.data.audio_url || null,
          timestamp: new Date()
        };
        setConversation(prev => [...prev, aiMessage]);
        completedConversation = [...completedConversation, aiMessage];
        
        // Text-only AI replies still have a voice; delayed speech is scoped to this view.
        pendingSpeechRef.current?.();
        pendingSpeechRef.current = viewScopeRef.current.later(() => {
          pendingSpeechRef.current = null;
          if (!microphoneRef.current.busy()) playAIResponse(aiMessage);
        }, 500);
      }
      
      // Kiểm tra xem task đã hoàn thành chưa
      if (res.data.task_completed) {
        setTaskCompleted(true);
        // Tự động chấm điểm cuối cùng
        handleEvaluateFinalScore(completedConversation);
      }
    } catch (err) {
      if (!isCurrent()) return;
      console.error("❌ Error sending message:", err);
      revisionRef.current = null;
      setRestoring(true);
      setRestoreAttempt(n => n + 1);
      alert(englishText("Đang tải lại hội thoại để kiểm tra lượt đã lưu. Không tự động gửi lại bản ghi âm."));
    } finally {
      if (isCurrent()) {
        sendingRef.current = false;
        setIsProcessing(false);
        setAudioBlob(null);
      }
    }
  };

  const playAIAudio = async (audioUrl) => {
    const isCurrent = viewScopeRef.current.capture();
    playbackRef.current?.();
    let cleanupMedia;
    try {
      const media = await loadAuthenticatedMediaUrl(normalizeAudioUrl(audioUrl));
      cleanupMedia = media.cleanup;
      if (!isCurrent()) { cleanupMedia(); return; }
      const audio = new Audio(media.url);
      let released = false;
      const stopPlayback = () => {
        if (released) return;
        released = true;
        audio.onended = audio.onerror = null;
        audio.pause();
        if (isCurrent()) setIsPlayingAI(false);
        if (cleanupMedia) cleanupMedia();
      };
      playbackRef.current = stopPlayback;
      setIsPlayingAI(true);
      audio.onended = stopPlayback;
      audio.onerror = () => {
        stopPlayback();
        console.error("Unable to play scenario response audio");
      };
      await audio.play();
    } catch (error) {
      if (cleanupMedia) cleanupMedia();
      if (isCurrent()) setIsPlayingAI(false);
      console.error("Unable to play scenario response audio:", error.message);
    }
  };

  const playAIResponse = message => {
    pendingSpeechRef.current?.();
    pendingSpeechRef.current = null;
    playbackRef.current?.();
    speechPlayerRef.current.cancel();
    if (message.audio_url) return playAIAudio(message.audio_url);
    const [origin, type] = voiceSelectionRef.current.split('-');
    return speechPlayerRef.current.speak(message.text, 'scenario-response', type, origin);
  };

  const handleSubmitAudio = () => {
    if (audioBlob) {
      handleSendMessage(audioBlob);
    }
  };

  const handleRecordClick = () => {
    if (isRecording) {
      stopRecording();
    } else {
      startRecording();
    }
  };

  const handleGetHint = async () => {
    if (loadingHint) return;
    
    setLoadingHint(true);
    const isCurrent = viewScopeRef.current.capture();
    try {
      const res = await api.get(
        `/learners/speaking-practice/scenario/sessions/${sessionId}/hint`
      );
      
      if (!isCurrent()) return;
      setHint({
        english: res.data.hint_english || "",
        vietnamese: res.data.hint_vietnamese || "",
        context: res.data.context || ""
      });
      
      // Cập nhật điểm và số lần dùng gợi ý
      if (res.data.current_score !== undefined) {
        setCurrentScore(res.data.current_score);
      }
      if (res.data.hints_used !== undefined) {
        setHintsUsed(res.data.hints_used);
      }
    } catch (err) {
      console.error("❌ Error getting hint:", err);
      if (isCurrent()) alert(englishText("Không thể lấy gợi ý. Vui lòng thử lại."));
    } finally {
      if (isCurrent()) setLoadingHint(false);
    }
  };

  const handleEvaluateFinalScore = async (conversationSnapshot = conversation) => {
    if (!mountedRef.current || scoringRef.current) return;
    scoringRef.current = true;
    setIsEvaluating(true);
    const isCurrent = viewScopeRef.current.capture();
    try {
      const res = await api.post(
        `/learners/speaking-practice/scenario/sessions/${sessionId}/evaluate`
      );
      if (!isCurrent()) return;
      if (!getScenarioScores(res.data)) {
        throw new Error("Kết quả chưa có điểm được xác minh. Vui lòng thử lại.");
      }
      
      setFinalScore(res.data);
      setShowScoreModal(true);
      
      // Gọi onComplete sau khi hiển thị điểm
      if (onComplete) {
        viewScopeRef.current.later(() => {
          viewScopeRef.current.once('completion', () => onComplete({
            sessionId,
            scenario: scenario,
            conversation: conversationSnapshot,
            finalScore: res.data
          }));
        }, 5000); // Cho người dùng xem điểm 5 giây
      }
    } catch (err) {
      console.error("❌ Error evaluating final score:", err);
      if (isCurrent()) alert(err?.message || englishText("Không thể chấm điểm. Vui lòng thử lại."));
    } finally {
      if (isCurrent()) { scoringRef.current = false; setIsEvaluating(false); }
    }
  };

  // Màn hình vocabulary trước khi bắt đầu
  if (restoring || restoreError) {
    return <div role="status">
      <p><UiText>{restoring ? "Đang khôi phục hội thoại..." : restoreError}</UiText></p>
      {restoreError && <button onClick={() => setRestoreAttempt(n => n + 1)}><UiText text={"Thử lại"} /></button>}
      <button onClick={onCancel}><UiText text={"Quay lại"} /></button>
    </div>;
  }
  if (showVocabulary && vocabulary.length > 0) {
    return (
      <div className="speaking-scenario">
        <div className="scenario-header">
          <h3>{scenario.title}</h3>
          <button className="btn-cancel" onClick={onCancel}>{" "}<UiText text={"Hủy"} />{" "}</button>
        </div>
        
        <div className="scenario-content">
          <div className="scenario-intro" style={{ marginBottom: 30 }}>
            <h4><UiText text={"Mô tả tình huống:"} /></h4>
            <p>{scenario.description}</p>
            <h4 style={{ marginTop: 20 }}><UiText text={"Nhiệm vụ:"} /></h4>
            <p><UiText>{scenario.task}</UiText></p>
          </div>
          
          <div className="vocabulary-section" style={{ background: "#f9fafb", padding: 20, borderRadius: 8 }}>
            <h4><UiText text={"Gợi ý từ vựng:"} /></h4>
            <div className="vocabulary-list" style={{ display: "grid", gridTemplateColumns: "repeat(auto-fill, minmax(200px, 1fr))", gap: 10, marginTop: 15 }}>
              {vocabulary.map((vocab, idx) => (
                <div key={idx} style={{ padding: 10, background: "white", borderRadius: 4, border: "1px solid #e5e7eb" }}>
                  <strong>{vocab.word}</strong>
                  {vocab.pronunciation && (
                    <div style={{ fontSize: 12, color: "#10b981" }}>/<UiText>{vocab.pronunciation}</UiText>/</div>
                  )}
                  {vocab.meaning && (
                    <div style={{ fontSize: 12, color: "#666", marginTop: 4 }}><UiText>{vocab.meaning}</UiText></div>
                  )}
                </div>
              ))}
            </div>
          </div>
          
          <button
            className="btn-primary"
            onClick={() => setShowVocabulary(false)}
            style={{ marginTop: 30, padding: "12px 24px", background: "#10b981", color: "white", border: "none", borderRadius: 4, cursor: "pointer", fontSize: 16 }}
          >{" "}<UiText text={"Bắt đầu trò chuyện"} />{" "}</button>
        </div>
      </div>
    );
  }

  // Màn hình conversation
  return (
    <div className="speaking-scenario">
      <div className="scenario-header">
        <h3>{scenario.title}</h3>
        <button className="btn-cancel" onClick={onCancel}>{" "}<UiText text={"Hủy"} />{" "}</button>
      </div>
      
      <div className="scenario-content">
        <label><UiText text={"Giọng AI:"} />{" "}<select aria-label={englishText("Giọng AI Scenario")} value={voiceSelection} onChange={event => {
          playbackRef.current?.(); speechPlayerRef.current.cancel(); setVoiceSelection(event.target.value);
        }}>
          <UiOption value="native-female">{"Nữ bản địa"}</UiOption>
          <UiOption value="native-male">{"Nam bản địa"}</UiOption>
          <UiOption value="asian-female">{"Nữ Việt Nam (FPT)"}</UiOption>
        </select></label>
        {voiceNotice && <p role="status"><UiText>{voiceNotice}</UiText></p>}
        <div className="conversation-container" style={{ 
          height: "400px", 
          overflowY: "auto", 
          padding: 20, 
          background: "#f9fafb", 
          borderRadius: 8,
          marginBottom: 20 
        }}>
          {conversation.map((msg, idx) => (
            <div
              key={idx}
              style={{
                marginBottom: 15,
                display: "flex",
                justifyContent: msg.speaker === "learner" ? "flex-end" : "flex-start"
              }}
            >
              <div
                style={{
                  maxWidth: "70%",
                  padding: "12px 16px",
                  borderRadius: 12,
                  background: msg.speaker === "learner" ? "#10b981" : "white",
                  color: msg.speaker === "learner" ? "white" : "#333",
                  boxShadow: "0 2px 4px rgba(0,0,0,0.1)"
                }}
              >
                <div style={{ fontSize: 12, opacity: 0.8, marginBottom: 4 }}>
                  <UiText>{msg.speaker === "learner" ? "Bạn" : scenario.character_name || "AI"}</UiText>
                </div>
                <div>{msg.text}</div>
                {msg.speaker === 'ai' && msg.text && <button aria-label={englishText("Phát lại giọng AI")} disabled={isRecording || requestingMic}
                  onClick={() => playAIResponse(msg)}><UiText text={"Phát lại"} /></button>}
                {msg.audio && (
                  <RecordedAudio controls blob={msg.audio} style={{ marginTop: 8, width: "100%" }} />
                )}
                {!msg.audio && msg.speaker === 'learner' && msg.audio_url && (
                  <AuthenticatedMedia controls src={normalizeAudioUrl(msg.audio_url)}
                    aria-label={englishText("Bản ghi Scenario đã lưu")} style={{ marginTop: 8, width: "100%" }} />
                )}
              </div>
            </div>
          ))}
          {isProcessing && (
            <div style={{ display: "flex", justifyContent: "flex-start" }}>
              <div style={{ padding: "12px 16px", background: "white", borderRadius: 12 }}>
                <div style={{ fontSize: 12, opacity: 0.8, marginBottom: 4 }}>
                  <UiText>{scenario.character_name || "AI"}</UiText>
                </div>
                <div><UiText text={"Đang suy nghĩ..."} /></div>
              </div>
            </div>
          )}
          <div ref={conversationEndRef} />
        </div>

        {taskCompleted ? (
          <div style={{ textAlign: "center", padding: 30, background: "#f0fdf4", borderRadius: 8 }}>
            <h3 style={{ color: "#10b981", marginBottom: 10 }}><UiText text={"🎉 Chúc mừng!"} /></h3>
            <p><UiText text={"Bạn đã hoàn thành nhiệm vụ!"} /></p>
            {isEvaluating && <p role="status"><UiText text={"Đang chấm điểm..."} /></p>}
            {!verifiedScores && !isEvaluating && <button onClick={() => handleEvaluateFinalScore()}><UiText text={"Thử lấy kết quả"} /></button>}
            {finalScore && (
              <div style={{ marginTop: 20 }}>
                <p style={{ fontSize: 18, fontWeight: "bold", color: "#10b981" }}>{" "}<UiText text={"Điểm phù hợp nhiệm vụ:"} />{" "}<UiText>{verifiedScores === null ? "Chưa có điểm xác minh" : `${verifiedScores.final_score}/100`}</UiText>
                </p>
              </div>
            )}
          </div>
        ) : (
          <div className="message-input-section" style={{ textAlign: "center" }}>
            {isProcessing ? (
              <div style={{ padding: 20 }}>
                <p style={{ color: "#666", marginBottom: 10 }}><UiText text={"Đang xử lý..."} /></p>
                {isPlayingAI && (
                  <div style={{ fontSize: 14, color: "#10b981" }}>{" "}<UiText text={"🔊 AI đang nói..."} />{" "}</div>
                )}
              </div>
            ) : (
              <>
                {/* Hiển thị điểm hiện tại và số lần dùng gợi ý */}
                <div style={{ 
                  marginBottom: 15, 
                  padding: "10px 15px", 
                  background: "#f9fafb", 
                  borderRadius: 8,
                  display: "flex",
                  justifyContent: "space-between",
                  alignItems: "center"
                }}>
                  <div>
                    <span style={{ fontSize: 14, color: "#666" }}><UiText text={"Điểm còn lại sau gợi ý:"} />{" "}</span>
                    <span style={{ fontSize: 18, fontWeight: "bold", color: "#10b981" }}>
                      <UiText>{currentScore}</UiText>/100
                    </span>
                  </div>
                  <div>
                    <span style={{ fontSize: 14, color: "#666" }}><UiText text={"Gợi ý đã dùng:"} />{" "}</span>
                    <span style={{ fontSize: 16, fontWeight: "600", color: "#ef4444" }}>
                      <UiText>{hintsUsed}</UiText>
                    </span>
                  </div>
                </div>

                {/* Hiển thị gợi ý nếu có */}
                {hint && (
                  <div style={{ 
                    marginBottom: 15, 
                    padding: 15, 
                    background: "#fff3cd", 
                    borderRadius: 8,
                    border: "1px solid #ffc107"
                  }}>
                    <div style={{ fontSize: 12, color: "#856404", marginBottom: 8, fontWeight: "600" }}>{" "}<UiText text={"💡 Gợi ý (mất 15 điểm mỗi lần dùng):"} />{" "}</div>
                    <div style={{ fontSize: 16, color: "#333", marginBottom: 8, fontStyle: "italic" }}>
                      "<UiText>{hint.english}</UiText>"
                    </div>
                    <div style={{ fontSize: 14, color: "#666" }}>
                      <UiText>{hint.vietnamese}</UiText>
                    </div>
                  </div>
                )}

                <div style={{ marginBottom: 20, display: "flex", gap: 10, justifyContent: "center" }}>
                  <button
                    onClick={handleRecordClick}
                    disabled={isProcessing || requestingMic}
                    style={{
                      padding: "15px 30px",
                      background: isRecording ? "#ef4444" : "#10b981",
                      color: "white",
                      border: "none",
                      borderRadius: 50,
                      cursor: "pointer",
                      display: "flex",
                      alignItems: "center",
                      gap: 10,
                      fontSize: 16
                    }}
                  >
                    <FaMicrophone size={20} />
                    <UiText>{requestingMic ? "Đang chờ quyền microphone..." : isRecording ? "Dừng ghi âm" : "Nhấn để nói"}</UiText>
                  </button>
                  
                  <button
                    onClick={handleGetHint}
                    disabled={isProcessing || isPlayingAI || loadingHint}
                    style={{
                      padding: "15px 20px",
                      background: "#ffc107",
                      color: "#333",
                      border: "none",
                      borderRadius: 50,
                      cursor: loadingHint ? "not-allowed" : "pointer",
                      display: "flex",
                      alignItems: "center",
                      gap: 8,
                      fontSize: 14,
                      fontWeight: "600",
                      opacity: loadingHint ? 0.6 : 1
                    }}
                  >{" "}<UiText text={"💡 Gợi ý"} />{" "}<UiText>{loadingHint ? "(Đang tải...)" : ""}</UiText>
                  </button>
                </div>
                
                {requestingMic && <div role="status">
                  <p><UiText text={"Đang chờ quyền microphone. Bạn có thể hủy yêu cầu."} /></p>
                  <button onClick={() => { microphoneRef.current.cancel(); setRequestingMic(false); }}><UiText text={"Hủy yêu cầu microphone"} /></button>
                </div>}
                {audioBlob && !isRecording && !requestingMic && (
                  <div style={{ marginBottom: 15 }}>
                    <p style={{ fontSize: 14, color: "#666", marginBottom: 8 }}><UiText text={"Audio đã ghi:"} /></p>
                    <RecordedAudio controls blob={audioBlob} style={{ width: "100%", marginBottom: 10 }} />
                    <button
                      onClick={handleSubmitAudio}
                      disabled={isProcessing}
                      style={{
                        padding: "10px 20px",
                        background: "#10b981",
                        color: "white",
                        border: "none",
                        borderRadius: 4,
                        cursor: "pointer"
                      }}
                    >{" "}<UiText text={"Gửi audio"} />{" "}</button>
                  </div>
                )}
                
                {isRecording && (
                  <div style={{ marginTop: 15 }}>
                    <div style={{ fontSize: 14, color: "#ef4444" }}>
                      <span className="pulse" style={{ display: "inline-block", width: 10, height: 10, background: "#ef4444", borderRadius: "50%", marginRight: 8 }}></span>{" "}<UiText text={"Đang ghi âm..."} />{" "}</div>
                    <p style={{ fontSize: 12, color: "#666", marginTop: 5 }}>{" "}<UiText text={"Nhấn lại nút để dừng và gửi"} />{" "}</p>
                  </div>
                )}
              </>
            )}
          </div>
        )}
      </div>

      {/* Modal hiển thị điểm cuối cùng */}
      {showScoreModal && finalScore && (
        <div 
          style={{
            position: "fixed",
            top: 0,
            left: 0,
            right: 0,
            bottom: 0,
            background: "rgba(0,0,0,0.5)",
            display: "flex",
            justifyContent: "center",
            alignItems: "center",
            zIndex: 1000
          }}
          onClick={() => setShowScoreModal(false)}
        >
          <div 
            style={{
              background: "white",
              borderRadius: 16,
              padding: 30,
              maxWidth: 500,
              width: "90%",
              boxShadow: "0 10px 40px rgba(0,0,0,0.2)"
            }}
            onClick={(e) => e.stopPropagation()}
          >
            <h2 style={{ marginBottom: 20, color: "#10b981", textAlign: "center" }}>{" "}<UiText text={"🎉 Kết quả chấm điểm"} />{" "}</h2>
            
            <div style={{ textAlign: "center", marginBottom: 25 }}>
              <div style={{ fontSize: 48, fontWeight: "bold", color: "#10b981", marginBottom: 10 }}>
                <UiText>{verifiedScores === null ? "Chưa có điểm xác minh" : `${verifiedScores.final_score}/100`}</UiText>
              </div>
              <div style={{ fontSize: 18, color: "#666" }}><UiText text={"Mức độ phù hợp nhiệm vụ"} /></div>
              <p><UiText text={"Đánh giá từ nội dung hội thoại; chưa đánh giá phát âm hoặc độ trôi chảy."} /></p>
            </div>

            <div style={{ marginBottom: 20 }}>
              <div style={{ 
                display: "flex", 
                justifyContent: "space-between", 
                padding: "10px 0",
                borderBottom: "1px solid #e5e7eb"
              }}>
                <span style={{ color: "#666" }}><UiText text={"Độ hợp lý:"} /></span>
                <span style={{ fontWeight: "600" }}><UiText>{verifiedScores?.reasonableness_score == null ? "Chưa đánh giá" : `${verifiedScores.reasonableness_score}/40`}</UiText></span>
              </div>
              <div style={{ 
                display: "flex", 
                justifyContent: "space-between", 
                padding: "10px 0",
                borderBottom: "1px solid #e5e7eb"
              }}>
                <span style={{ color: "#666" }}><UiText text={"Khả năng phản xạ:"} /></span>
                <span style={{ fontWeight: "600" }}><UiText>{verifiedScores?.reflex_score == null ? "Chưa đánh giá" : `${verifiedScores.reflex_score}/30`}</UiText></span>
              </div>
              <div style={{ 
                display: "flex", 
                justifyContent: "space-between", 
                padding: "10px 0",
                borderBottom: "1px solid #e5e7eb"
              }}>
                <span style={{ color: "#666" }}><UiText text={"Hoàn thành mục tiêu:"} /></span>
                <span style={{ fontWeight: "600" }}><UiText>{verifiedScores?.task_completion_score == null ? "Chưa đánh giá" : `${verifiedScores.task_completion_score}/20`}</UiText></span>
              </div>
              <div style={{ 
                display: "flex", 
                justifyContent: "space-between", 
                padding: "10px 0"
              }}>
                <span style={{ color: "#666" }}><UiText text={"Độc lập (không dùng gợi ý):"} /></span>
                <span style={{ fontWeight: "600" }}><UiText>{verifiedScores?.independence_score == null ? "Chưa đánh giá" : `${verifiedScores.independence_score}/10`}</UiText></span>
              </div>
            </div>

            {finalScore.feedback && (
              <div style={{ 
                padding: 15, 
                background: "#f9fafb", 
                borderRadius: 8,
                marginBottom: 20
              }}>
                <div style={{ fontSize: 14, fontWeight: "600", marginBottom: 8, color: "#333" }}>{" "}<UiText text={"Nhận xét:"} />{" "}</div>
                <div style={{ fontSize: 14, color: "#666", lineHeight: 1.6 }}>
                  {finalScore.feedback}
                </div>
              </div>
            )}

            <button
              onClick={() => {
                setShowScoreModal(false);
                if (onComplete) {
                  viewScopeRef.current.once('completion', () => onComplete({
                    sessionId,
                    scenario: scenario,
                    conversation: conversation,
                    finalScore: finalScore
                  }));
                }
              }}
              style={{
                width: "100%",
                padding: "12px 24px",
                background: "#10b981",
                color: "white",
                border: "none",
                borderRadius: 8,
                cursor: "pointer",
                fontSize: 16,
                fontWeight: "600"
              }}
            >{" "}<UiText text={"Đóng"} />{" "}</button>
          </div>
        </div>
      )}
    </div>
  );
}

import {UiOption} from '../../i18n/UiLanguage.jsx';
import { englishText } from '../../i18n/uiLanguage.js';
import { UiText } from '../../i18n/UiLanguage.jsx';
import React, { useState, useRef, useEffect } from "react";
import { createPortal } from "react-dom";
import { useNavigate } from "react-router-dom";
import { getAuth } from "../../utils/auth";
import { AuthenticatedMedia } from "../../utils/authenticatedMedia.jsx";
import api from "../../api";
import { createStoryInitializer, restoreStoryHistory } from "../../utils/restoreConversation.js";
import { formatConversationTime } from "../../utils/conversationTime.js";
import { createStorySpeech } from "../../utils/storySpeech.js";
import { createAsyncViewScope } from '../../utils/asyncViewScope.js';
import { recoverStoryTurn, STORY_REQUEST_TIMEOUT_MS } from '../../utils/storyRecovery.js';
import { monitorStorySilence } from '../../utils/storySilence.js';
import { createMicrophoneRequest, discardRecorder, microphoneErrorMessage } from "../../utils/microphoneRequest.js";
import { FaMicrophone, FaRedo } from "react-icons/fa";
import "../../styles/tell-me-story.css";

// Component tooltip thông minh với tự động điều chỉnh vị trí
const WordTooltipWrapper = ({ word, cleanWord, isOpen, tooltip, loading, onWordClick, onClose, anchorRef }) => {
  const wordRef = useRef(null);
  const tooltipRef = useRef(null);
  const [tooltipPosition, setTooltipPosition] = useState('top'); // 'top' or 'bottom'

  useEffect(() => {
    if (isOpen && tooltipRef.current) {
      // Đợi một chút để tooltip render xong
      const timer = setTimeout(() => {
        if (tooltipRef.current) {
          const tooltip = tooltipRef.current;
          const tooltipHeight = tooltip.offsetHeight || 180;
          const tooltipWidth = tooltip.offsetWidth || 280;
          const viewportWidth = window.innerWidth;
          const viewportHeight = window.innerHeight;
          const padding = 20;
          
          // Tìm mic button để đặt tooltip gần đó
          const micButton = anchorRef?.current ||
                           document.querySelector('.story-input button') ||
                           document.querySelector('button[style*="borderRadius"]');
          
          if (micButton) {
            const micRect = micButton.getBoundingClientRect();
            // Đặt tooltip bên phải mic button, căn giữa theo chiều dọc
            let left = micRect.right + 20;
            let top = micRect.top + (micRect.height / 2) - (tooltipHeight / 2);
            
            // Nếu không đủ không gian bên phải, đặt bên trái
            if (left + tooltipWidth + padding > viewportWidth) {
              left = micRect.left - tooltipWidth - 20;
              if (left < padding) {
                left = padding;
              }
            }
            
            // Đảm bảo không bị tràn phía trên/dưới
            if (top + tooltipHeight > viewportHeight - padding) {
              top = viewportHeight - tooltipHeight - padding;
            }
            if (top < padding) {
              top = padding;
            }
            
            tooltip.style.top = `${top}px`;
            tooltip.style.left = `${left}px`;
          } else {
            // Fallback: đặt ở góc dưới bên phải
            tooltip.style.bottom = `${padding}px`;
            tooltip.style.right = `${padding}px`;
            tooltip.style.top = 'auto';
            tooltip.style.left = 'auto';
          }
        }
      }, 50);
      return () => clearTimeout(timer);
    }
  }, [isOpen, tooltip, anchorRef]);

  return (
    <span
      ref={wordRef}
      className="story-dictionary-word"
      role="button"
      tabIndex={0}
      aria-label={englishText(`Tra nghĩa từ ${cleanWord}`)}
      onClick={onWordClick}
      onKeyDown={event => {
        if (event.target === event.currentTarget && ['Enter', ' '].includes(event.key)) {
          event.preventDefault(); onWordClick();
        }
      }}
      style={{
        cursor: "pointer",
        position: "relative",
        display: "inline-block",
        padding: "1px 0",
        borderRadius: "3px",
        transition: "background-color 0.2s",
        backgroundColor: isOpen ? "#e0f2fe" : "transparent"
      }}
      onMouseEnter={(e) => {
        if (!isOpen) {
          e.target.style.backgroundColor = "#f0f9ff";
        }
      }}
      onMouseLeave={(e) => {
        if (!isOpen) {
          e.target.style.backgroundColor = "transparent";
        }
      }}
    >
      {word}
      {isOpen && tooltip && createPortal(
        <div
          ref={tooltipRef}
          role="tooltip"
          style={{
            position: "fixed",
            zIndex: 10000,
            background: "white",
            color: "#111827",
            border: "2px solid #10b981",
            borderRadius: 12,
            padding: 16,
            boxShadow: "0 8px 32px rgba(0, 0, 0, 0.2)",
            minWidth: 240,
            maxWidth: 340,
            fontSize: 14,
            pointerEvents: "auto",
            animation: "fadeIn 0.2s ease-in"
          }}
          onClick={(e) => e.stopPropagation()}
        >
          <div style={{ marginBottom: 8 }}>
            <strong style={{ fontSize: 16, color: "#10b981" }}>{tooltip.word}</strong>
            {loading && (
              <span style={{ marginLeft: 8, color: "#999", fontSize: 12 }}><UiText text={"Đang tải..."} /></span>
            )}
          </div>
          {tooltip.pronunciation && (
            <div style={{ marginBottom: 6, color: "#10b981", fontWeight: "bold" }}>
              <strong><UiText text={"Phát âm:"} /></strong> /<UiText>{tooltip.pronunciation}</UiText>/
            </div>
          )}
          {tooltip.definition && (
            <div style={{ marginBottom: 6 }}>
              <strong><UiText text={"Nghĩa:"} /></strong> <UiText>{tooltip.definition}</UiText>
            </div>
          )}
          <button
            onClick={onClose}
            style={{
              marginTop: 8,
              padding: "4px 12px",
              background: "#6b7280",
              color: "white",
              border: "none",
              borderRadius: 4,
              cursor: "pointer",
              fontSize: 12
            }}
          >{" "}<UiText text={"Đóng"} />{" "}</button>
        </div>,
        document.body
      )}
    </span>
  );
};

export default function TellMeYourStory({ onBack }) {
  const navigate = useNavigate();
  const auth = getAuth();
  const [conversation, setConversation] = useState([]);
  const [isRecording, setIsRecording] = useState(false);
  const [requestingMic, setRequestingMic] = useState(false);
  const [sending, setSending] = useState(false);
  const [sendNotice, setSendNotice] = useState('');
  const [sessionId, setSessionId] = useState(null);
  const [initializing, setInitializing] = useState(true);
  const [initializationError, setInitializationError] = useState("");
  const [initializationAttempt, setInitializationAttempt] = useState(0);
  const storyInitializerRef = useRef(null);
  const sendingRef = useRef(false);
  const sentRecordingsRef = useRef(new WeakSet());
  const messageRequestRef = useRef(null);
  const revisionRef = useRef(null);
  if (!storyInitializerRef.current) storyInitializerRef.current = createStoryInitializer(api);
  const [playingAudio, setPlayingAudio] = useState(null); // Track which message is playing TTS
  const [voiceNotice, setVoiceNotice] = useState('');
  const speechPlayerRef = useRef(null);
  const pendingSpeechRef = useRef(null);
  const viewScopeRef = useRef(null);
  if (!viewScopeRef.current) viewScopeRef.current = createAsyncViewScope();
  if (!speechPlayerRef.current) speechPlayerRef.current = createStorySpeech({
    synthesis: window.speechSynthesis,
    Utterance: window.SpeechSynthesisUtterance,
    AudioClass: window.Audio,
    getRemoteAudio: async (text, voiceType, voiceOrigin, options) =>
      (await api.post('/learners/tts/generate', { text, voiceType, voiceOrigin, region: 'north' }, { signal: options.signal })).data,
    createUrl: result => URL.createObjectURL(new Blob([
      Uint8Array.from(atob(result.audioBase64), char => char.charCodeAt(0))
    ], { type: result.mimeType || 'audio/mpeg' })),
    revokeUrl: url => URL.revokeObjectURL(url),
    onPlaying: setPlayingAudio,
    onStatus: status => {
      if (status.event === 'request') setVoiceNotice('');
      if (status.event === 'blocked' && status.code === 'PLAYBACK_BLOCKED')
        setVoiceNotice('Giọng FPT đã sẵn sàng. Nhấn nút phát để cho phép âm thanh.');
      if (status.event === 'fallback') setVoiceNotice({
        FPT_RATE_LIMITED:'FPT tạm giới hạn lượt tạo giọng. Đang dùng giọng trình duyệt; hãy thử lại sau.',
        FPT_AUTH_FAILED:'FPT không xác thực được khóa truy cập. Đang dùng giọng trình duyệt.',
        FPT_TIMEOUT:'FPT chưa tạo giọng kịp thời. Đang dùng giọng trình duyệt.',
      }[status.code] || 'FPT.AI chưa sẵn sàng; đang dùng giọng trình duyệt thay thế.');
    }
  });
  const [wordTooltip, setWordTooltip] = useState(null); // Dictionary tooltip
  const [openWordTooltip, setOpenWordTooltip] = useState(null); // Word đang mở tooltip
  const [loadingWord, setLoadingWord] = useState(false); // Loading state cho dictionary
  const [hasRecordedAudio, setHasRecordedAudio] = useState(false); // Track if there's recorded audio to send
  const [voiceType, setVoiceType] = useState('female'); // 'male' hoặc 'female'
  const [voiceOrigin, setVoiceOrigin] = useState('native'); // 'native' hoặc 'asian'
  const selectedVoiceRef = useRef({ type: voiceType, origin: voiceOrigin });
  selectedVoiceRef.current = { type: voiceType, origin: voiceOrigin };
  const [showVoiceSubmenu, setShowVoiceSubmenu] = useState(null); // 'male', 'female', hoặc null
  const userAudioRefs = useRef({}); // Lưu audio refs cho user messages
  const userBlobUrlsRef = useRef(new Set());
  const messagesEndRef = useRef(null);
  const micButtonRef = useRef(null); // Ref cho mic button
  
  // Audio recording refs
  const mediaRecorderRef = useRef(null);
  const mediaStreamRef = useRef(null);
  const audioChunksRef = useRef([]);
  const silenceMonitorRef = useRef(null);
  const [recordingNotice, setRecordingNotice] = useState('');
  
  // Timeout 30 phút cho conversation history
  const conversationTimeoutRef = useRef(null);
  const lastActivityRef = useRef(Date.now());
  const mountedRef = useRef(false);
  const microphoneRef = useRef(null);
  if (!microphoneRef.current) microphoneRef.current = createMicrophoneRequest();

  function discardStoryCapture(){
    discardRecorder(mediaRecorderRef.current);mediaRecorderRef.current=null;
    microphoneRef.current.cancel();mediaStreamRef.current?.getTracks().forEach(track=>track.stop());mediaStreamRef.current=null;
    silenceMonitorRef.current?.stop();silenceMonitorRef.current=null;audioChunksRef.current=[];
    pendingSpeechRef.current?.();pendingSpeechRef.current=null;speechPlayerRef.current.cancel();
    Object.values(userAudioRefs.current).forEach(audio=>{try{audio?.pause();}catch{}});
    clearTimeout(conversationTimeoutRef.current);
  }
  function leaveStory(){messageRequestRef.current?.abort();discardStoryCapture();viewScopeRef.current.close();onBack?.();}
  useEffect(()=>{
    const suspend=()=>{discardStoryCapture();if(mountedRef.current){setIsRecording(false);setRequestingMic(false);setPlayingAudio(null);setRecordingNotice('Ghi âm đã dừng khi bạn rời bài. Nhấn mic để ghi lại.');}};
    const hidden=()=>{if(document.hidden)suspend();};window.addEventListener('pagehide',suspend);document.addEventListener('visibilitychange',hidden);
    return()=>{window.removeEventListener('pagehide',suspend);document.removeEventListener('visibilitychange',hidden);};
  },[]);
  useEffect(() => {
    mountedRef.current = true;
    viewScopeRef.current.open();
    return () => {
      mountedRef.current = false;
      messageRequestRef.current?.abort();
      discardStoryCapture();
      viewScopeRef.current.close();
      for (const url of userBlobUrlsRef.current) URL.revokeObjectURL(url);
      userBlobUrlsRef.current.clear();
      discardRecorder(mediaRecorderRef.current);
      microphoneRef.current.cancel();
      silenceMonitorRef.current?.stop();
      silenceMonitorRef.current = null;
      mediaRecorderRef.current = null;
      mediaStreamRef.current = null;
      audioChunksRef.current = [];
    };
  }, []);

  useEffect(() => {
    let active = true;
    startConversation(false, () => active);
    // Không xóa conversation khi unmount - chỉ cleanup audio/recording
    return () => {
      active = false;
      // Cleanup: stop recording and close streams
      if (mediaStreamRef.current) {
        mediaStreamRef.current.getTracks().forEach(track => track.stop());
      }
      speechPlayerRef.current.cancel();
      // Clear timeout nếu có
      if (conversationTimeoutRef.current) {
        clearTimeout(conversationTimeoutRef.current);
      }
    };
  }, [initializationAttempt]);
  
  // Reset timeout mỗi khi có message mới
  useEffect(() => {
    if (conversation.length > 0) {
      lastActivityRef.current = Date.now();
      
      // Clear timeout cũ
      if (conversationTimeoutRef.current) {
        clearTimeout(conversationTimeoutRef.current);
      }
      
      // Set timeout mới: 30 phút = 30 * 60 * 1000 = 1800000ms
      conversationTimeoutRef.current = setTimeout(() => {
        // Nếu không có hoạt động trong 30 phút, xóa conversation và tạo mới
        const timeSinceLastActivity = Date.now() - lastActivityRef.current;
        if (timeSinceLastActivity >= 30 * 60 * 1000) {
          handleNewConversation();
        }
      }, 30 * 60 * 1000); // 30 phút
    }
    
    return () => {
      if (conversationTimeoutRef.current) {
        clearTimeout(conversationTimeoutRef.current);
      }
    };
  }, [conversation]);


  useEffect(() => {
    scrollToBottom();
  }, [conversation]);

  const scrollToBottom = () => {
    messagesEndRef.current?.scrollIntoView({ behavior: "smooth" });
  };

  const startConversation = async (forceNew = true, isActive = () => true) => {
    setInitializing(true);
    setInitializationError("");
    try {
      const restored = await storyInitializerRef.current({ forceNew, sessionId });
      if (!isActive()) return;
      setSessionId(restored.sessionId);
      revisionRef.current = restored.revision;
      setConversation(restored.conversation);
      
      // Reset last activity
      lastActivityRef.current = Date.now();
      
      // Tự động phát âm message đầu tiên
      if (!restored.resumed) speakText(restored.conversation[0].text, 'initial');
    } catch (err) {
      if (isActive()) setInitializationError("Không thể mở hội thoại. Phiên đã lưu không bị thay đổi; vui lòng thử lại.");
    } finally {
      if (isActive()) setInitializing(false);
    }
  };
  
  // Hàm tạo cuộc trò chuyện mới
  const handleNewConversation = async () => {
    if (initializing || sending || isRecording || requestingMic || initializationError) return;
    pendingSpeechRef.current?.();
    pendingSpeechRef.current = null;
    // Clear timeout
    if (conversationTimeoutRef.current) {
      clearTimeout(conversationTimeoutRef.current);
    }
    
    // Keep saved conversation visible until the replacement session succeeds.
    
    userAudioRefs.current = {};
    
    // Dừng TTS nếu đang phát
    speechPlayerRef.current.cancel();
    setPlayingAudio(null);
    
    // Tạo conversation mới
    await startConversation();
  };

  // A single player owns both remote audio and browser speech, including cleanup.
  const speakText = (text, messageId, overrideVoiceType = null, overrideVoiceOrigin = null) => {
    pendingSpeechRef.current?.();
    pendingSpeechRef.current = null;
    return speechPlayerRef.current.speak(text, messageId,
      overrideVoiceType ?? selectedVoiceRef.current.type, overrideVoiceOrigin ?? selectedVoiceRef.current.origin);
  };

  // Play audio segment từ word đến hết (giống challenge)
  const playSegment = (messageId, start, end, wordIdx) => {
    const audio = userAudioRefs.current[messageId];
    if (!audio) {
      console.warn("Audio not found for message:", messageId, "Available refs:", Object.keys(userAudioRefs.current));
      return;
    }
    
    if (typeof start !== "number" || typeof end !== "number") {
      console.warn("Invalid start/end time:", { start, end });
      return;
    }
    
    console.log("Playing segment:", { messageId, start, end, wordIdx, audioSrc: audio.src });
    
    // Đảm bảo audio đã được load
    const tryPlay = () => {
      if (audio.readyState >= 2) {
        const startTime = start > 1000 ? start / 1000 : start;
        
        // Pause trước để reset
        audio.pause();
        
        // Set currentTime và phát từ đó đến hết
        const onSeeked = () => {
          const playPromise = audio.play();
          if (playPromise !== undefined) {
            playPromise
              .then(() => {
                console.log("Audio playing from", audio.currentTime);
              })
              .catch(error => {
                console.error("Audio play error:", error);
              });
          }
          audio.removeEventListener('seeked', onSeeked);
        };
        
        audio.addEventListener('seeked', onSeeked, { once: true });
        audio.currentTime = Math.max(0, startTime);
        console.log("Setting currentTime to:", startTime);
        
        // Fallback: nếu seeked không fire trong 500ms, thử phát luôn
        setTimeout(() => {
          if (audio.paused && Math.abs(audio.currentTime - startTime) < 0.1) {
            console.log("Seeked event timeout, playing anyway");
            onSeeked();
          }
        }, 500);
      } else {
        console.log("Audio not ready, waiting...", audio.readyState);
        setTimeout(tryPlay, 100);
      }
    };
    
    if (audio.readyState === 0) {
      audio.load();
      audio.addEventListener('loadeddata', tryPlay, { once: true });
    } else {
      tryPlay();
    }
    
    // Scroll đến từ được click
    setTimeout(() => {
      const el = document.querySelector(`[data-word-idx="${wordIdx}"][data-message-id="${messageId}"]`);
      if (el) {
        el.scrollIntoView({ behavior: "smooth", block: "center", inline: "center" });
      }
    }, 100);
  };

  // Fetch word definition từ dictionary API
  const fetchWordDefinition = async (word) => {
    if (loadingWord) return;
    
    setLoadingWord(true);
    setOpenWordTooltip(word);
    
    try {
      const res = await api.get(`/learners/dictionary/${encodeURIComponent(word)}`);
      setWordTooltip(res.data);
    } catch (err) {
      console.error("❌ Error fetching word definition:", err);
      setWordTooltip({ word, definition: "Từ điển tạm thời chưa phản hồi. Bạn có thể tiếp tục bài học." });
    } finally {
      setLoadingWord(false);
    }
  };

  // Render transcript với words có thể click để phát audio (giống challenge)
  const renderTranscriptWithWords = (msg) => {
    if (!msg.transcriptJson || !msg.audioUrl) {
      // Fallback: render text thông thường
      return <p style={{ margin: 0, color: "white" }}>{msg.text}</p>;
    }
    
    const words = msg.transcriptJson.words || [];
    if (words.length === 0) {
      return <p style={{ margin: 0, color: "white" }}>{msg.text}</p>;
    }
    
    const messageId = msg.id || `user-${msg.timestamp?.getTime() || Date.now()}`;
    
    return (
      <div style={{ 
        display: "flex", 
        flexWrap: "wrap", 
        gap: "6px", 
        lineHeight: 1.8,
        alignItems: "center"
      }}>
        {words.map((w, idx) => {
          const wordText = String(w.word || "").toLowerCase().trim();
          if (!wordText) return null;
          
          const playStart = typeof w.start === "number" ? w.start : 0;
          const playEnd = typeof w.end === "number" ? w.end : (playStart + 2);
          
          return (
            <button
              key={idx}
              type="button"
              data-word-idx={idx}
              data-message-id={messageId}
              onClick={(e) => {
                e.stopPropagation();
                playSegment(messageId, playStart, playEnd, idx);
              }}
              style={{
                background: "rgba(255, 255, 255, 0.25)",
                border: "1px solid rgba(255, 255, 255, 0.3)",
                borderRadius: 6,
                padding: "4px 8px",
                color: "white",
                cursor: "pointer",
                fontSize: 15,
                fontWeight: 500,
                transition: "all 0.2s ease",
                textTransform: "lowercase",
                whiteSpace: "nowrap",
                boxShadow: "0 2px 4px rgba(0, 0, 0, 0.1)"
              }}
              onMouseEnter={(e) => {
                e.target.style.background = "rgba(255, 255, 255, 0.4)";
                e.target.style.borderColor = "rgba(255, 255, 255, 0.5)";
                e.target.style.transform = "translateY(-2px)";
                e.target.style.boxShadow = "0 4px 8px rgba(0, 0, 0, 0.15)";
              }}
              onMouseLeave={(e) => {
                e.target.style.background = "rgba(255, 255, 255, 0.25)";
                e.target.style.borderColor = "rgba(255, 255, 255, 0.3)";
                e.target.style.transform = "translateY(0)";
                e.target.style.boxShadow = "0 2px 4px rgba(0, 0, 0, 0.1)";
              }}
            >
              <UiText>{wordText}</UiText>
            </button>
          );
        })}
      </div>
    );
  };

  // Tạo word timings giả cho AI message dựa trên text và audio duration
  // Tính toán dựa trên vị trí của từ trong text (tỷ lệ)
  const createAIWordTimings = (text, audioDuration) => {
    if (!text || !audioDuration || audioDuration <= 0) return [];
    
    // Tách text thành words và giữ lại vị trí trong text gốc
    const words = [];
    const regex = /\b\w+\b/g;
    let match;
    let lastIndex = 0;
    
    while ((match = regex.exec(text)) !== null) {
      const word = match[0];
      const startPos = match.index; // Vị trí bắt đầu của từ trong text
      const endPos = match.index + word.length; // Vị trí kết thúc
      
      words.push({
        word: word,
        startPos: startPos,
        endPos: endPos
      });
    }
    
    if (words.length === 0) return [];
    
    const totalLength = text.length;
    const wordsWithTimings = [];
    
    words.forEach((wordInfo, idx) => {
      // Tính thời gian dựa trên vị trí của từ trong text (tỷ lệ)
      // startPos / totalLength = tỷ lệ vị trí trong text
      // Tỷ lệ này tương ứng với thời gian trong audio
      const startRatio = wordInfo.startPos / totalLength;
      const endRatio = wordInfo.endPos / totalLength;
      
      const start = startRatio * audioDuration;
      const end = endRatio * audioDuration;
      
      wordsWithTimings.push({
        word: wordInfo.word,
        start: start,
        end: end
      });
    });
    
    console.log("Created word timings:", wordsWithTimings.slice(0, 5), "...");
    return wordsWithTimings;
  };

  // Play AI audio từ word đến hết (giống challenge detail)
  const playAIAudioFromWord = (messageId, wordIndex, text) => {
    console.log("playAIAudioFromWord called:", { messageId, wordIndex, text, availableRefs: Object.keys(userAudioRefs.current) });
    
    const audio = userAudioRefs.current[`ai-${messageId}`] || userAudioRefs.current[messageId];
    if (!audio) {
      console.warn("AI Audio not found for message:", messageId, "Available refs:", Object.keys(userAudioRefs.current));
      // Thử tìm lại sau một chút
      setTimeout(() => {
        const retryAudio = userAudioRefs.current[`ai-${messageId}`] || userAudioRefs.current[messageId];
        if (retryAudio) {
          playAIAudioFromWord(messageId, wordIndex, text);
        }
      }, 200);
      return;
    }
    
    console.log("Audio found:", { src: audio.src, duration: audio.duration, readyState: audio.readyState });
    
    // Lấy audio duration
    const audioDuration = audio.duration || 0;
    if (!audioDuration || isNaN(audioDuration)) {
      console.log("Audio duration not available, waiting for loadedmetadata...");
      // Nếu chưa có duration, đợi loadedmetadata
      const onLoadedMetadata = () => {
        console.log("Audio metadata loaded, duration:", audio.duration);
        const words = createAIWordTimings(text, audio.duration);
        console.log("Created word timings:", words);
        if (words[wordIndex]) {
          playAIAudioSegment(messageId, words[wordIndex].start, audio.duration, wordIndex);
        } else {
          // Fallback: phát từ đầu
          playAIAudio(messageId);
        }
      };
      
      if (audio.readyState >= 1) {
        // Metadata đã có, thử lấy duration
        if (audio.duration && !isNaN(audio.duration)) {
          onLoadedMetadata();
        } else {
          audio.addEventListener('loadedmetadata', onLoadedMetadata, { once: true });
          audio.load();
        }
      } else {
        audio.addEventListener('loadedmetadata', onLoadedMetadata, { once: true });
        audio.load();
      }
      return;
    }
    
    // Tạo word timings
    const words = createAIWordTimings(text, audioDuration);
    console.log("Word timings:", words, "wordIndex:", wordIndex);
    if (words[wordIndex]) {
      playAIAudioSegment(messageId, words[wordIndex].start, audioDuration, wordIndex);
    } else {
      // Fallback: phát từ đầu
      console.log("Word index not found, playing from start");
      playAIAudio(messageId);
    }
  };

  // Play AI audio segment từ start đến hết (giống ChallengeDetail)
  const playAIAudioSegment = (messageId, start, end, wordIdx) => {
    const audio = userAudioRefs.current[`ai-${messageId}`] || userAudioRefs.current[messageId];
    if (!audio) {
      console.warn("Audio not found for message:", messageId);
      return;
    }
    
    if (typeof start !== "number" || isNaN(start)) {
      console.warn("Invalid start time:", start);
      return;
    }
    
    // Đảm bảo start là số giây (không phải milliseconds)
    const startTime = start > 1000 ? start / 1000 : start;
    
    console.log("Playing AI audio segment:", { messageId, startTime, audioDuration: audio.duration, readyState: audio.readyState });
    
    // Đảm bảo audio đã được load
    const tryPlay = () => {
      if (audio.readyState >= 2) { // HAVE_CURRENT_DATA hoặc cao hơn
        // Pause trước để reset
        audio.pause();
        
        // Set currentTime và đợi seeked event để đảm bảo đã seek xong
        const onSeeked = () => {
          // Phát audio sau khi đã seek xong - phát tiếp đến hết, không dừng
          const playPromise = audio.play();
          if (playPromise !== undefined) {
            playPromise
              .then(() => {
                console.log("✅ AI audio playing from", audio.currentTime, "- will continue to end");
                setPlayingAudio(messageId);
              })
              .catch(error => {
                console.error("❌ AI Audio play error:", error);
                setPlayingAudio(null);
              });
          }
          audio.removeEventListener('seeked', onSeeked);
        };
        
        audio.addEventListener('seeked', onSeeked, { once: true });
        audio.currentTime = Math.max(0, startTime);
        console.log("Setting currentTime to:", startTime, "seconds");
        
        // Fallback: nếu seeked không fire trong 500ms, thử phát luôn
        setTimeout(() => {
          if (audio.paused && Math.abs(audio.currentTime - startTime) < 0.1) {
            console.log("Seeked event timeout, playing anyway");
            onSeeked();
          }
        }, 500);
      } else {
        // Nếu chưa load xong, đợi một chút rồi thử lại
        console.log("Audio not ready, waiting...", audio.readyState);
        setTimeout(tryPlay, 100);
      }
    };
    
    // Thử phát ngay hoặc đợi audio load
    if (audio.readyState === 0) {
      // Nếu chưa load, load trước
      audio.load();
      audio.addEventListener('loadeddata', tryPlay, { once: true });
    } else {
      tryPlay();
    }
  };

  // Play AI audio từ đầu (fallback)
  const playAIAudio = (messageId) => {
    const audio = userAudioRefs.current[`ai-${messageId}`] || userAudioRefs.current[messageId];
    if (!audio) {
      console.warn("AI Audio not found for message:", messageId);
      return;
    }
    
    // Phát từ đầu
    audio.currentTime = 0;
    const playPromise = audio.play();
    if (playPromise !== undefined) {
      playPromise
        .then(() => {
          console.log("AI audio playing from start");
          setPlayingAudio(messageId);
        })
        .catch(error => {
          console.error("AI Audio play error:", error);
        });
    }
  };

  // Render text với clickable words cho dictionary (cho AI messages)
  const renderTextWithDictionary = (text, messageId) => {
    if (!text) return null;
    
    // Split text thành words và spaces, giữ lại index của từ
    const parts = text.split(/(\s+|[.,!?;:])/);
    let wordIndex = -1; // Index của từ (không tính spaces và punctuation)
    
    return (
      <>
        {parts.map((part, idx) => {
          // Nếu là khoảng trắng hoặc punctuation, render trực tiếp
          if (/^\s+$/.test(part) || /^[.,!?;:]+$/.test(part)) {
            return <span key={idx}><UiText>{part}</UiText></span>;
          }
          
          // Clean word (remove punctuation)
          const cleanWord = part.replace(/[.,!?;:]/g, "").toLowerCase();
          
          // Chỉ làm clickable nếu là từ tiếng Anh (có chữ cái)
          if (cleanWord.match(/^[a-z]+$/i) && cleanWord.length > 1) {
            wordIndex++; // Tăng index cho từ
            const currentWordIndex = wordIndex; // Lưu lại để dùng trong onClick
            
            return (
              <WordTooltipWrapper
                key={idx}
                anchorRef={micButtonRef}
                word={part}
                cleanWord={cleanWord}
                isOpen={openWordTooltip === cleanWord}
                tooltip={wordTooltip}
                loading={loadingWord}
                onWordClick={() => {
                  // Click vào từ chỉ để mở tooltip - KHÔNG phát audio
                  // Audio chỉ phát khi click vào nút phát lại bên cạnh timestamp
                  fetchWordDefinition(cleanWord);
                }}
                onClose={() => {
                  setOpenWordTooltip(null);
                  setWordTooltip(null);
                }}
              />
            );
          }
          
          return <span key={idx}><UiText>{part}</UiText></span>;
        })}
      </>
    );
  };

  // Record locally; silence detection does not invoke browser speech services.
  const startRecording = async () => {
    if (microphoneRef.current.busy() || initializing || sending || initializationError) return;
    pendingSpeechRef.current?.();
    pendingSpeechRef.current = null;
    // Dừng TTS nếu đang phát (cho phép cắt ngang)
    speechPlayerRef.current.cancel();
    setPlayingAudio(null);
    
    // Nếu đang recording, không làm gì (đã xử lý trong onClick)
    if (isRecording) {
      return;
    }
    
    setRequestingMic(true);
    setRecordingNotice('');
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
        if (!mountedRef.current || mediaRecorderRef.current !== mr || !microphoneRef.current.owns(stream)) return;
        silenceMonitorRef.current?.stop();
        silenceMonitorRef.current = null;
        const blob = new Blob(audioChunksRef.current, { 
          type: audioChunksRef.current[0]?.type || "audio/webm" 
        });
        
        // Luôn tự động gửi khi dừng recording (nếu có audio)
        if (blob && blob.size > 500) { // Ít nhất 500 bytes
          handleAudioRecorded(blob);
        } else {
          // Nếu không có audio, reset
          audioChunksRef.current = [];
          setHasRecordedAudio(false);
          setRecordingNotice('Bản ghi quá ngắn, chưa được gửi. Hãy giữ mic lâu hơn rồi thử lại.');
        }
        
        setIsRecording(false);
        microphoneRef.current.cancel();
        mediaRecorderRef.current = null;
        mediaStreamRef.current = null;
      };

      mr.onerror = () => {
        if (!mountedRef.current || mediaRecorderRef.current !== mr) return;
        discardRecorder(mr);
        silenceMonitorRef.current?.stop(); silenceMonitorRef.current = null;
        microphoneRef.current.cancel(); mediaRecorderRef.current = null; mediaStreamRef.current = null;
        audioChunksRef.current = []; setIsRecording(false);
        setRecordingNotice('Ghi âm bị gián đoạn. Bản ghi chưa được gửi; hãy thử lại.');
      };

      mr.start();
      setIsRecording(true);

      silenceMonitorRef.current = monitorStorySilence(stream, () => {
        if (mountedRef.current && mediaRecorderRef.current === mr) stopRecording();
      }, { onUnavailable: () => {
        if (mountedRef.current && mediaRecorderRef.current === mr)
          setRecordingNotice('Không thể tự phát hiện im lặng. Bấm mic để dừng và gửi.');
      } });
    } catch (err) {
      discardRecorder(mediaRecorderRef.current);
      silenceMonitorRef.current?.stop(); silenceMonitorRef.current = null;
      microphoneRef.current.cancel();
      if (!mountedRef.current) return;
      setIsRecording(false);
      console.error("❌ Error starting recording:", err);
      alert(microphoneErrorMessage(err));
    } finally {
      if (mountedRef.current && !microphoneRef.current.pending()) setRequestingMic(false);
    }
  };

  // Dừng ghi âm
  const stopRecording = () => {
    // Đặt isRecording = false ngay để tránh các logic khác chạy
    setIsRecording(false);
    
    silenceMonitorRef.current?.stop(); silenceMonitorRef.current = null;
    
    // Dừng MediaRecorder
    if (mediaRecorderRef.current) {
      try {
        if (mediaRecorderRef.current.state === "recording") {
          mediaRecorderRef.current.stop();
        } else if (mediaRecorderRef.current.state === "paused") {
          mediaRecorderRef.current.stop();
        }
      } catch (e) {
        // A broken recorder must release ownership too, otherwise mic retry stays blocked.
        mediaRecorderRef.current?.onerror?.();
      }
    }
    
    // Stop all tracks
    if (mediaStreamRef.current) {
      mediaStreamRef.current.getTracks().forEach(track => {
        track.stop();
      });
      mediaStreamRef.current = null;
    }
  };


  // Xử lý audio đã ghi
  const handleAudioRecorded = (blob) => {
    // Chỉ tự động gửi nếu có audio data
    if (blob && blob.size > 0) {
      sendMessage(null, blob);
    }
  };

  // Gửi message (chỉ audio)
  const sendMessage = async (text = null, audio = null) => {
    if (!audio || sendingRef.current || sentRecordingsRef.current.has(audio) || initializing || initializationError || revisionRef.current === null) return;
    sendingRef.current = true;
    setSendNotice('');
    const expectedRevision = revisionRef.current;
    const isCurrent = viewScopeRef.current.capture();
    sentRecordingsRef.current.add(audio);

    const userMessage = {
      type: "user",
      text: englishText("[Đang xử lý...]"),
      audio: audio,
      timestamp: new Date(),
      id: `user-${Date.now()}`
    };

    setConversation(prev => [...prev, userMessage]);
    setSending(true);
    const request = new AbortController();
    messageRequestRef.current = request;

    try {
      const formData = new FormData();
      if (audio) formData.append("audio", audio);
      formData.append("session_id", sessionId);
      formData.append("expected_revision", expectedRevision);

      const res = await api.post(
        "/learners/speaking-practice/story/message",
        formData,
        { headers: { "Content-Type": "multipart/form-data" }, timeout: STORY_REQUEST_TIMEOUT_MS, signal: request.signal }
      );
      if (!isCurrent()) return;
      if (!Number.isSafeInteger(res.data.revision)) throw new Error("Invalid conversation revision");
      revisionRef.current = res.data.revision;

      // Tạo audio URL trước khi cập nhật message
      const audioUrl = URL.createObjectURL(audio);
      userBlobUrlsRef.current.add(audioUrl);
      
      // Cập nhật user message với transcript và transcriptJson nếu có
      const updatedUserMessage = {
        ...userMessage,
        text: res.data.transcript || "[Audio message]",
        transcriptJson: res.data.transcriptJson || null, // Full transcript với words và timings
        audioUrl: audioUrl, // Lưu audio URL để phát lại
        audio: audio // Giữ lại audio blob
      };
      
      console.log("Updated user message:", {
        id: updatedUserMessage.id,
        hasAudioUrl: !!updatedUserMessage.audioUrl,
        hasTranscriptJson: !!updatedUserMessage.transcriptJson,
        wordsCount: updatedUserMessage.transcriptJson?.words?.length || 0
      });

      const aiMessage = {
        type: "ai",
        text: res.data.response,
        timestamp: new Date(),
        id: `ai-${Date.now()}`
      };

      setConversation(prev => {
        const newConv = [...prev];
        const userIdx = newConv.length - 1;
        newConv[userIdx] = updatedUserMessage;
        return [...newConv, aiMessage];
      });

      // Reset audio chunks sau khi gửi thành công
      audioChunksRef.current = [];
      setHasRecordedAudio(false);
      
      // Cập nhật last activity khi có message mới
      lastActivityRef.current = Date.now();

      // Tự động phát âm AI response (KHÔNG tự động mở mic sau khi nói xong)
      pendingSpeechRef.current?.();
      pendingSpeechRef.current = null;
      if (!microphoneRef.current.busy()) speakText(res.data.response, aiMessage.id);
    } catch (err) {
      if (!isCurrent() || request.signal.aborted || err.requiresLogin) return;
      console.error("❌ Error sending message:", err);
      revisionRef.current = null;
      try {
        const restored = await restoreStoryHistory(api, sessionId);
        if (!isCurrent()) return;
        setConversation(restored.conversation);
        revisionRef.current = restored.revision;
        const recovery = recoverStoryTurn(restored, expectedRevision);
        setSendNotice(recovery.notice);
        if (recovery.reply) speakText(recovery.reply.text, recovery.reply.id);
      } catch {
        if (isCurrent()) setInitializationError("Không thể đồng bộ hội thoại. Vui lòng thử lại trước khi ghi âm tiếp.");
      }
    } finally {
      if (messageRequestRef.current === request) messageRequestRef.current = null;
      if (isCurrent()) { sendingRef.current = false; setSending(false); }
    }
  };

  return (
    <div className="tell-me-story" style={{ 
      display: "flex", 
      flexDirection: "column", 
      height: "100vh",
      background: "linear-gradient(135deg, #667eea 0%, #764ba2 50%, #f093fb 100%)",
      position: "relative",
      overflow: "hidden"
    }}>
      {sendNotice && <div role="status" style={{ zIndex: 3, background: '#fff7d6', padding: 12 }}><UiText>{sendNotice}</UiText></div>}
      {recordingNotice && <div role="status" style={{ zIndex: 3, background: '#fff7d6', padding: 12 }}><UiText>{recordingNotice}</UiText></div>}
      {(initializing || initializationError) && <div role="status" style={{ zIndex: 3, background: "white", padding: 12 }}>
        <UiText>{initializing ? "Đang khôi phục hội thoại..." : initializationError}</UiText>
        {initializationError && <button onClick={() => setInitializationAttempt(n => n + 1)}><UiText text={"Thử lại"} /></button>}
      </div>}
      <header className="story-workspace-header">
        <div className="story-heading-row"><button className="workspace-back" onClick={leaveStory}><UiText text="← Quay lại"/></button><div><p className="workspace-eyebrow"><UiText text="Không gian kể chuyện"/></p><h1><UiText text="Tell me your story"/></h1></div><button className="workspace-new" onClick={handleNewConversation} disabled={initializing||sending||isRecording||requestingMic||!!initializationError}><FaRedo aria-hidden="true"/><UiText text="Cuộc trò chuyện mới"/></button></div>
        <div className="story-heading-meta"><p><UiText text="Một ý tưởng, một câu chuyện. Nhấn mic khi bạn sẵn sàng."/></p><label><UiText text="Giọng AI:"/><select aria-label={englishText('Giọng AI:')} value={voiceOrigin==='asian'?'vi-female':voiceType==='male'?'native-male':'native-female'} onChange={e=>{const value=e.target.value;setVoiceOrigin(value==='vi-female'?'asian':'native');setVoiceType(value==='native-male'?'male':'female');speechPlayerRef.current.cancel();setPlayingAudio(null);}}><UiOption value="native-female">{'Nữ bản địa'}</UiOption><UiOption value="native-male">{'Nam bản địa'}</UiOption><UiOption value="vi-female">{'Nữ Việt Nam'}</UiOption></select></label></div>
        {voiceNotice&&<p role="status" className="workspace-notice"><UiText>{voiceNotice}</UiText></p>}
      </header>      <div className="story-conversation" style={{
        flex: 1,
        display: "flex",
        flexDirection: "column",
        overflow: "hidden",
        position: "relative",
        zIndex: 1
      }}>
        <div className="messages-container" style={{
          flex: 1,
          overflowY: "auto",
          padding: "24px 20px",
          background: "rgba(255, 255, 255, 0.08)",
          backdropFilter: "blur(15px)",
          scrollBehavior: "smooth"
        }}>
          {conversation.map((msg, idx) => (
            <div
              key={idx}
              style={{
                display: "flex",
                justifyContent: msg.type === "user" ? "flex-end" : "flex-start",
                marginBottom: 20,
                animation: "fadeIn 0.3s ease-in"
              }}
            >
              <div className={`story-message-bubble ${msg.type==='user'?'is-user':'is-ai'}`} style={{
                maxWidth: "70%",
                padding: "14px 18px",
                borderRadius: 20,
                background: msg.type === "user" 
                  ? "#287d6c"
                  : "linear-gradient(135deg, #ffffff 0%, #f8f9fa 100%)",
                color: msg.type === "user" ? "white" : "#333",
                boxShadow: msg.type === "user"
                  ? "0 3px 10px rgba(29, 83, 66, 0.08)"
                  : "0 3px 10px rgba(29, 83, 66, 0.04)",
                position: "relative",
                border: msg.type === "ai" ? "1px solid rgba(0, 0, 0, 0.05)" : "none"
              }}>
                <span className="story-speaker-label"><UiText text={msg.type==='user'?'Bạn':'Người bạn AI'}/></span>
                {/* User message: Audio ref ẩn để phát lại */}
                {msg.type === "user" && msg.audioUrl && (
                  <AuthenticatedMedia as="audio"
                    ref={(el) => {
                      if (el) {
                        const msgId = msg.id || `user-${msg.timestamp?.getTime() || Date.now()}`;
                        userAudioRefs.current[msgId] = el;
                      }
                    }}
                    src={msg.audioUrl}
                    preload="auto"
                    style={{ display: "none" }}
                  />
                )}
                
                {/* User message: Transcript với words có thể click */}
                {msg.type === "user" && (
                  <div style={{ 
                    margin: 0, 
                    lineHeight: 1.6,
                    fontSize: 15,
                    fontWeight: 500,
                    wordBreak: "break-word"
                  }}>
                    {msg.text === "[Đang xử lý...]" ? (
                      <p style={{ margin: 0, color: "rgba(255, 255, 255, 0.8)", fontStyle: "italic" }}>
                        <span style={{ display: "inline-block", animation: "pulse 1.5s infinite" }}>●</span>{" "}<UiText text={"Đang xử lý..."} />{" "}</p>
                    ) : msg.transcriptJson && msg.audioUrl ? (
                      <div><UiText>{renderTranscriptWithWords(msg)}</UiText></div>
                    ) : msg.text && msg.text !== "[Audio message]" ? (
                      <p style={{ margin: 0, color: "white" }}>{msg.text}</p>
                    ) : null}
                  </div>
                )}
                
                {/* AI message: Text với dictionary */}
                {msg.type === "ai" && (
                  <>
                    
                    <div style={{ 
                      margin: 0, 
                      lineHeight: 1.6,
                      fontSize: 15,
                      position: "relative",
                      wordBreak: "break-word"
                    }}>
                      {renderTextWithDictionary(msg.text, msg.id || idx)}
                    </div>
                    
                    {/* Speaking indicator */}
                    {playingAudio === msg.id && (
                      <div style={{
                        position: "absolute",
                        top: 12,
                        right: 12,
                        display: "flex",
                        alignItems: "center",
                        gap: 6,
                        background: "rgba(16, 185, 129, 0.15)",
                        padding: "4px 8px",
                        borderRadius: 12,
                        fontSize: 11,
                        color: "#10b981",
                        fontWeight: 600
                      }}>
                        <div style={{
                          width: 6,
                          height: 6,
                          borderRadius: "50%",
                          background: "#10b981",
                          animation: "pulse 1s infinite"
                        }}></div>{" "}<UiText text={"Đang phát"} />{" "}</div>
                    )}
                  </>
                )}
                
                {/* Timestamp với nút phát lại (chỉ cho AI messages) */}
                <div style={{
                  display: "flex",
                  alignItems: "center",
                  justifyContent: "flex-end",
                  gap: 8,
                  marginTop: 8
                }}>
                  {/* Nút phát lại nhỏ nhỏ (chỉ hiện cho AI messages) */}
                  {msg.type === "ai" && (
                    <button
                      onClick={(e) => {
                        e.stopPropagation();
                        if (msg.text) speakText(msg.text, msg.id);
                      }}
                      style={{
                        background: "transparent",
                        border: "none",
                        cursor: "pointer",
                        padding: "4px",
                        display: "flex",
                        alignItems: "center",
                        justifyContent: "center",
                        borderRadius: "50%",
                        transition: "all 0.2s",
                        opacity: 0.6,
                        minWidth: "20px",
                        minHeight: "20px"
                      }}
                      onMouseEnter={(e) => {
                        e.currentTarget.style.opacity = "1";
                        e.currentTarget.style.background = "rgba(16, 185, 129, 0.1)";
                      }}
                      onMouseLeave={(e) => {
                        e.currentTarget.style.opacity = "0.6";
                        e.currentTarget.style.background = "transparent";
                      }}
                      title={englishText("Phát lại")}
                    >
                      <FaRedo size={12} color="#10b981" />
                    </button>
                  )}
                  <div style={{
                    fontSize: 11,
                    opacity: 0.7,
                    color: msg.type === "user" ? "rgba(255, 255, 255, 0.9)" : "#666"
                  }}>
                    <UiText>{formatConversationTime(msg.timestamp)}</UiText>
                  </div>
                </div>
              </div>
            </div>
          ))}
          {sending && (
            <div style={{
              display: "flex",
              justifyContent: "flex-start",
              marginBottom: 20
            }}>
              <div style={{
                padding: "12px 16px",
                borderRadius: 18,
                background: "white",
                boxShadow: "0 2px 8px rgba(0,0,0,0.15)"
              }}>
                <div style={{ display: "flex", alignItems: "center", gap: 8 }}>
                  <div style={{
                    width: 8,
                    height: 8,
                    borderRadius: "50%",
                    background: "#10b981",
                    animation: "pulse 1s infinite"
                  }}></div>
                  <span style={{ color: "#666", fontSize: 14 }}><UiText text={"AI đang suy nghĩ..."} /></span>
                </div>
              </div>
            </div>
          )}
          <div ref={messagesEndRef} />
        </div>

        <div className="story-input" style={{
          padding: "24px 20px",
          background: "rgba(255, 255, 255, 0.98)",
          boxShadow: "0 -4px 20px rgba(0,0,0,0.1)",
          display: "flex",
          flexDirection: "column",
          alignItems: "center",
          gap: 14,
          position: "relative",
          zIndex: 2
        }}>
          {/* Mic button ở giữa - click để bắt đầu/dừng recording */}
          <button
            ref={micButtonRef}
            className={`story-record-button ${isRecording?'is-recording':''}`}
            aria-label={englishText(requestingMic ? "Đang chờ quyền microphone" : isRecording ? "Dừng ghi âm" : "Bắt đầu ghi âm")}
            onClick={() => {
              if (sending) return; // Không làm gì nếu đang gửi
              
              // Dừng TTS nếu đang phát (cho phép cắt ngang)
              if (playingAudio) {
                speechPlayerRef.current.cancel();
                setPlayingAudio(null);
              }
              
              // Nếu đang recording, dừng và gửi
              if (isRecording) {
                stopRecording();
                return;
              }
              
              // Nếu chưa recording, bắt đầu ghi âm
              startRecording();
            }}
            disabled={sending || initializing || requestingMic || !!initializationError || !sessionId}
            style={{
              width: 80,
              height: 80,
              borderRadius: "50%",
              border: "none",
              background: isRecording 
                ? "linear-gradient(135deg, #ef4444 0%, #dc2626 100%)"
                : "#287d6c",
              color: "white",
              cursor: sending ? "not-allowed" : "pointer",
              display: "flex",
              alignItems: "center",
              justifyContent: "center",
              boxShadow: isRecording 
                ? "0 0 20px rgba(239, 68, 68, 0.6)"
                : "0 4px 15px rgba(102, 126, 234, 0.4)",
              transition: "all 0.3s",
              transform: isRecording ? "scale(1.1)" : "scale(1)",
              zIndex: 10
            }}
          >
            <FaMicrophone size={32} />
          </button>
          
          {/* Status text */}
          <div style={{ textAlign: "center" }}>
            <p style={{ 
              margin: 0, 
              color: "#666", 
              fontSize: 14,
              fontWeight: 500
            }}>
              <UiText>{requestingMic ? "Đang chờ quyền microphone..." : isRecording
                ? "Đang ghi âm... (Tự động gửi khi im lặng 2 giây hoặc bấm mic để dừng và gửi)" 
                : playingAudio
                ? "AI đang nói... (Ấn vào mic để cắt ngang và nói)"
                : "Nhấn vào mic để bắt đầu ghi âm"}</UiText>
            </p>
          </div>
          {requestingMic && <div role="status">
            <button onClick={() => { microphoneRef.current.cancel(); setRequestingMic(false); }}><UiText text={"Hủy yêu cầu microphone"} /></button>
          </div>}
        </div>
      </div>

      <style>{`
        @keyframes fadeIn {
          from {
            opacity: 0;
            transform: translateY(10px);
          }
          to {
            opacity: 1;
            transform: translateY(0);
          }
        }
        @keyframes pulse {
          0%, 100% {
            opacity: 1;
          }
          50% {
            opacity: 0.5;
          }
        }
      `}</style>
    </div>
  );
}

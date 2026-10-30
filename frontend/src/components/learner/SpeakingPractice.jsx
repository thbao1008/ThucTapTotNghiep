import { englishText } from '../../i18n/uiLanguage.js';
import { UiText } from '../../i18n/UiLanguage.jsx';
import React, { useState, useEffect, useRef } from "react";
import { getAuth } from "../../utils/auth";
import api from "../../api";
import { formatDashboardScore } from "../../utils/dashboardScore.js";
import { restorePracticeSession } from "../../utils/restorePracticeSession.js";
import SpeakingRound from "./SpeakingRound";
import SpeakingSummary from "./SpeakingSummary";

import TellMeYourStory from "./TellMeYourStory";
import ScenarioWorldPreview from './ScenarioWorldPreview';
import { useSearchParams } from 'react-router-dom';
import SemanticInput from "./SemanticInput";
import "../../styles/speaking-practice.css";
import { FaTrophy, FaClock, FaUser } from "react-icons/fa";
import { FiMic, FiBookOpen, FiUsers } from 'react-icons/fi';

const rawPracticeFields = new Set(['audio', 'audioBlob', 'audio_url', 'audioUrl', 'transcript', 'transcriptJson', 'transcript_json', 'response']);
const keepGradedRound = round => Object.fromEntries(Object.entries(round || {}).filter(([key]) => !rawPracticeFields.has(key)));
const keepGradedSummary = summary => ({ ...summary,
  ...(Array.isArray(summary?.rounds) ? { rounds: summary.rounds.map(keepGradedRound) } : {}),
});

export default function SpeakingPractice() {
  const auth = getAuth();
  const [searchParams,setSearchParams]=useSearchParams();
  const readMode=value=>value==='scenario-world'?'world':['story'].includes(value)?value:'practice';
  const [mode,setModeState]=useState(()=>readMode(searchParams.get('mode')));
  function setMode(next) {
    setModeState(next);
    setSearchParams(previous=>{
      const params=new URLSearchParams(previous);
      if(next==='practice')params.delete('mode');else params.set('mode',next==='world'?'scenario-world':next);
      return params;
    },{replace:true});
  }
  useEffect(()=>{setModeState(readMode(searchParams.get('mode')));},[searchParams]);
  const [level, setLevel] = useState(1);
  const [sessionId, setSessionId] = useState(null);
  const [currentRound, setCurrentRound] = useState(0);
  const [rounds, setRounds] = useState([]);
  const [sessionData, setSessionData] = useState(null);
  const [loading, setLoading] = useState(false);
  const [restoringSession, setRestoringSession] = useState(false);
  const [error, setError] = useState("");
  const [showSemanticInput, setShowSemanticInput] = useState(false);
  const [analyzing, setAnalyzing] = useState(false);



  const [recentActivities, setRecentActivities] = useState([]);
  const [competitionScore, setCompetitionScore] = useState(null);
  const [loadingDashboard, setLoadingDashboard] = useState(false);
  const [showHistoryModal, setShowHistoryModal] = useState(false);
  const [weeklyHistory, setWeeklyHistory] = useState([]);
  const [loadingHistory, setLoadingHistory] = useState(false);
  const [incompleteSession, setIncompleteSession] = useState(null);

  const [topRatings, setTopRatings] = useState([]);
  const [historyOffset, setHistoryOffset] = useState(0);
   // Chỉ hiển thị danh sách scenarios khi đã click "Bắt đầu làm bài"

  const mountedRef = useRef(false);
  const currentSessionRef = useRef(null);
  const endingRequestsRef = useRef(new Map());
  function endPracticeSession(session = currentSessionRef.current) {
    if (!session || getAuth()?.token !== session.token) return Promise.resolve(null);
    const key = `${session.id}:${session.token}`;
    if (endingRequestsRef.current.has(key)) return endingRequestsRef.current.get(key);
    const request = api.post(`/learners/speaking-practice/sessions/${session.id}/end`).then(({ data }) => {
      if (Number(data?.session_id) !== Number(session.id)) throw new Error('Invalid practice end response');
      return data;
    }).catch(error => { endingRequestsRef.current.delete(key); throw error; });
    endingRequestsRef.current.set(key, request);
    return request;
  }
  useEffect(() => {
    mountedRef.current = true;
    return () => {
      mountedRef.current = false;
      // The initial StrictMode cleanup sees no adopted session. Mode switches keep
      // this component mounted; only leaving the whole practice page ends it.
      void endPracticeSession().catch(() => {});
    };
  }, []);

  useEffect(() => {
    if (sessionData?.summary?.status !== 'completed') return;
    setRounds(previous => previous.map(keepGradedRound));
    setSessionData(previous => previous?.summary?.status !== 'completed' ? previous : ({ ...keepGradedRound(previous),
      ...(Array.isArray(previous?.rounds) ? { rounds: previous.rounds.map(keepGradedRound) } : {}),
      summary: keepGradedSummary(previous?.summary),
    }));
  }, [sessionId, sessionData?.summary?.status]);

  // Tạo session mới
  const createSession = async () => {
    const ownerToken = auth?.token;
    setLoading(true);
    setError("");
    try {
      const userId = auth?.user?._id || auth?.user?.id;
      const learnerId = auth?.user?.learner_id;
      
      if (!userId && !learnerId) {
        setError("Không tìm thấy thông tin học viên");
        return;
      }

      const res = await api.post("/learners/speaking-practice/sessions", {
        learner_id: learnerId,
        user_id: userId,
        level: level,
        mode: "practice"
      });

      const session = { id: res.data.session_id, token: ownerToken };
      if (!mountedRef.current || getAuth()?.token !== ownerToken) {
        void endPracticeSession(session).catch(() => {}); return;
      }
      currentSessionRef.current = session;
      setSessionId(session.id);
      setCurrentRound(0);
      setRounds([]);
      setSessionData(res.data);
      setLevel(Number(res.data.level) || level);
      setIncompleteSession(null);
    } catch (err) {
      if (!mountedRef.current) return;
      console.error("❌ Error creating session:", err);
      // Nếu có session đang dở dang, lưu thông tin
      if (err?.response?.data?.incomplete_session) {
        setIncompleteSession(err.response.data.incomplete_session);
        setError(err.response.data.message || "Bạn có một bài luyện tập chưa hoàn thành.");
      } else {
        setError(err?.response?.data?.message || "Không thể tạo session. Vui lòng thử lại.");
      }
    } finally {
      if (mountedRef.current) setLoading(false);
    }
  };

  // Lưu vòng nói (chuyển vòng ngay, không học nghĩa từ)
  const saveRound = async (roundData) => {
    if (!sessionId) {
      console.error("❌ No sessionId, cannot save round");
      return;
    }

    // Nếu đã có round_id, nghĩa là đã submit rồi
    if (roundData.round_id) {
      // Lưu round data (chưa có analysis, sẽ được cập nhật sau)
      const newRound = {
        ...roundData,
        round_number: currentRound + 1,
        status: roundData.analysis_status || "processing"
      };

      setRounds(prev => {
        const updated = [...prev, newRound];
        return updated;
      });

      // Chuyển sang vòng tiếp theo ngay (không học nghĩa từ)
      const nextRound = currentRound + 1;
      if (nextRound >= 10) {
        // Đã đủ 10 vòng, cập nhật currentRound và hiển thị màn hình nhập ngữ nghĩa
        setCurrentRound(10);
        setShowSemanticInput(true);
      } else {
        // Chuyển sang vòng tiếp theo ngay
        setCurrentRound(nextRound);
      }
      return;
    }
    try {
      const formData = new FormData();
      formData.append("audio", roundData.audioBlob, `round-${currentRound + 1}.webm`);
      formData.append("time_taken", roundData.timeTaken);
      formData.append("round_number", currentRound + 1);

      // Gửi request, không đợi analysis
      const res = await api.post(
        `/learners/speaking-practice/sessions/${sessionId}/rounds`,
        formData,
        { headers: { "Content-Type": "multipart/form-data" } }
      );

      // Lưu round data (chưa có analysis, sẽ được cập nhật sau)
      const newRound = {
        ...roundData,
        round_number: currentRound + 1,
        round_id: res.data.round_id,
        status: roundData.analysis_status || "processing"
      };

      setRounds(prev => [...prev, newRound]);

      // Chuyển sang vòng tiếp theo ngay (không đợi analysis)
      const nextRound = currentRound + 1;
      if (nextRound >= 10) {
        // Đã đủ 10 vòng, cập nhật currentRound và hiển thị màn hình nhập ngữ nghĩa
        setCurrentRound(10);
        setShowSemanticInput(true);
      } else {
        // Chuyển sang vòng tiếp theo ngay
        setCurrentRound(nextRound);
      }
    } catch (err) {
      console.error("❌ Error saving round:", err);
      setError(err?.response?.data?.message || "Không thể lưu vòng nói. Vui lòng thử lại.");
    }
  };

  // Reset session
  const resetSession = async () => {
    const session = currentSessionRef.current;
    try { await endPracticeSession(session); }
    catch {
      if (mountedRef.current) setError('Không thể kết thúc bài luyện tập. Vui lòng thử lại.');
      return false;
    }
    if (!mountedRef.current || currentSessionRef.current !== session) return false;
    currentSessionRef.current = null;
    setSessionId(null);
    setCurrentRound(0);
    setRounds([]);
    setSessionData(null);
    setError("");
    setShowSemanticInput(false);
    setAnalyzing(false);
    return true;
  };

  // Load scenarios chỉ khi showScenarioList = true


  // Load dashboard data (recent activities và top ratings)
  useEffect(() => {
    if (mode === "practice" && !sessionId) {
      fetchDashboardData();
      checkIncompleteSession();
    }
  }, [mode, sessionId]);

  const checkIncompleteSession = async () => {
    try {
      const userId = auth?.user?._id || auth?.user?.id;
      const learnerId = auth?.user?.learner_id;
      
      const res = await api.get(`/learners/speaking-practice/incomplete-session?${learnerId ? `learner_id=${learnerId}` : `user_id=${userId}`}`);
      if (res.data.incomplete_session) {
        setIncompleteSession(res.data.incomplete_session);
        // Tự động hiển thị thông báo khi có session chưa hoàn thành
        if (!error || !error.includes("chưa hoàn thành")) {
          setError(`Bạn đang có một bài luyện tập chưa hoàn thành (${res.data.incomplete_session.rounds_count}/10 vòng).`);
        }
      } else {
        // Không có session chưa hoàn thành, clear state
        setIncompleteSession(null);
        // Chỉ clear error nếu error liên quan đến incomplete session
        if (error && error.includes("chưa hoàn thành") && !error.includes("giao tiếp")) {
          setError("");
        }
      }
    } catch (err) {
      console.error("❌ Error checking incomplete session:", err);
      // Nếu có lỗi, không block user, chỉ log
    }
  };



  const continueIncompleteSession = async () => {
    if (incompleteSession && !restoringSession) {
      const session = { id: incompleteSession.session_id, token: auth?.token };
      setRestoringSession(true);
      try {
        const restored = await restorePracticeSession(api, incompleteSession.session_id);
        if (!mountedRef.current || getAuth()?.token !== session.token) {
          void endPracticeSession(session).catch(() => {}); return;
        }
        currentSessionRef.current = session;
        setSessionId(incompleteSession.session_id);
        setCurrentRound(restored.currentRound);
        setRounds(restored.rounds);
        setSessionData(restored.sessionData);
        setLevel(Number(restored.sessionData.level) || 1);
        setIncompleteSession(null);
        setError("");
      } catch (err) {
        if (!mountedRef.current) return;
        console.error("❌ Error restoring speaking practice results:", err);
        setError(err?.response?.data?.message || err?.message || "Không thể khôi phục kết quả. Vui lòng tải lại.");
      } finally {
        if (mountedRef.current) setRestoringSession(false);
      }
    }
  };

  const fetchDashboardData = async () => {
    setLoadingDashboard(true);
    try {
      const userId = auth?.user?._id || auth?.user?.id;
      const learnerId = auth?.user?.learner_id;
      
      const [activitiesRes, scoreRes, ratingsRes] = await Promise.all([
        api.get(`/learners/speaking-practice/recent-activities?limit=3&${learnerId ? `learner_id=${learnerId}` : `user_id=${userId}`}`),
        api.get(`/learners/speaking-practice/competition-score?${learnerId ? `learner_id=${learnerId}` : `user_id=${userId}`}`),
        api.get(`/learners/speaking-practice/top-ratings?limit=5`)
      ]);
      setRecentActivities(activitiesRes.data.activities || []);
      setCompetitionScore(scoreRes.data.score || { average_score: null, total_days: 0, rank: null, assessment_status: "not_assessed" });
      setTopRatings((ratingsRes.data.ratings || []).filter(row =>
        row.assessment_status === "completed" && typeof row.average_score === "number" &&
        Number.isFinite(row.average_score) && row.average_score >= 0 && row.average_score <= 100
      ));
    } catch (err) {
      console.error("❌ Error fetching dashboard data:", err);
    } finally {
      setLoadingDashboard(false);
    }
  };

  const fetchWeeklyHistory = async (offset = 0) => {
    setLoadingHistory(true);
    try {
      const userId = auth?.user?._id || auth?.user?.id;
      const learnerId = auth?.user?.learner_id;
      
      const res = await api.get(`/learners/speaking-practice/weekly-history?offset=${offset}&limit=1&${learnerId ? `learner_id=${learnerId}` : `user_id=${userId}`}`);
      setWeeklyHistory(res.data.history || []);
    } catch (err) {
      console.error("❌ Error fetching weekly history:", err);
    } finally {
      setLoadingHistory(false);
    }
  };

  const handleHistoryPrev = () => {
    const newOffset = historyOffset + 1;
    setHistoryOffset(newOffset);
    fetchWeeklyHistory(newOffset);
  };

  const handleHistoryNext = () => {
    if (historyOffset > 0) {
      const newOffset = historyOffset - 1;
      setHistoryOffset(newOffset);
      fetchWeeklyHistory(newOffset);
    }
  };

  const handleViewHistory = () => {
    setShowHistoryModal(true);
    setHistoryOffset(0);
    fetchWeeklyHistory(0);
  };







  useEffect(() => {
    if (
      mode !== "practice" ||
      currentRound < 10 ||
      !sessionId ||
      sessionData?.summary?.status !== "processing"
    ) {
      return undefined;
    }

    let cancelled = false;
    let timeoutId;
    const pollSummary = async () => {
      try {
        const response = await api.post(
          `/learners/speaking-practice/sessions/${sessionId}/analyze-and-summary`
        );
        if (cancelled) return;

        const summary = response.data;
        setSessionData(previous => ({ ...previous, summary }));
        if (Array.isArray(summary.rounds)) {
          setRounds(summary.rounds);
        }
        if (summary.status === "completed") {
          try {
            await api.post(`/learners/speaking-practice/sessions/${sessionId}/save-to-history`);
          } catch (err) {
            console.error("❌ Error saving completed practice to history:", err);
          }
        } else if (summary.status === "processing") {
          timeoutId = setTimeout(pollSummary, 2000);
        }
      } catch (err) {
        if (!cancelled) {
          setSessionData(previous => ({
            ...previous,
            summary: {
              status: "failed",
              message: err?.response?.data?.message || "Không thể tải kết quả. Vui lòng thử lại."
            }
          }));
        }
      }
    };

    timeoutId = setTimeout(pollSummary, 2000);
    return () => {
      cancelled = true;
      clearTimeout(timeoutId);
    };
  }, [mode, currentRound, sessionId, sessionData?.summary?.status]);

  if (mode === "story") {
    return <TellMeYourStory onBack={() => setMode("practice")} />;
  }
  if (mode === 'world') {
    return <ScenarioWorldPreview onBack={()=>setMode('practice')} />;
  }

  // Màn hình chọn scenario (chỉ hiển thị khi showScenarioList = true)


  // Màn hình scenario đang chơi


  // Xử lý khi hoàn thành semantic input
  const handleSemanticComplete = async () => {
    setShowSemanticInput(false);
    setAnalyzing(true);
    
    try {
      // Gọi API để phân tích tất cả các vòng và tạo summary
      const summaryRes = await api.post(
        `/learners/speaking-practice/sessions/${sessionId}/analyze-and-summary`
      );
      setSessionData(prev => ({ ...prev, summary: summaryRes.data }));
      
      // Cập nhật rounds với dữ liệu từ summary (có missing_words)
      if (summaryRes.data.rounds && Array.isArray(summaryRes.data.rounds)) {
        setRounds(summaryRes.data.rounds);
      }
      
      if (summaryRes.data.status !== "completed") {
        return;
      }

      // Lưu vào lịch sử làm bài
      try {
        await api.post(`/learners/speaking-practice/sessions/${sessionId}/save-to-history`);
      } catch (err) {
        console.error("❌ Error saving to history:", err);
      }
    } catch (err) {
      console.error("❌ Error analyzing and generating summary:", err);
      setSessionData(prev => ({
        ...prev,
        summary: {
          status: "failed",
          message: err?.response?.data?.message || "Không thể tải kết quả. Vui lòng thử lại."
        }
      }));
    } finally {
      setAnalyzing(false);
    }
  };

  const handleSemanticSkip = async () => {
    setShowSemanticInput(false);
    setAnalyzing(true);
    
    try {
      // Gọi API để phân tích tất cả các vòng và tạo summary
      const summaryRes = await api.post(
        `/learners/speaking-practice/sessions/${sessionId}/analyze-and-summary`
      );
      setSessionData(prev => ({ ...prev, summary: summaryRes.data }));
      
      // Cập nhật rounds với dữ liệu từ summary (có missing_words)
      if (summaryRes.data.rounds && Array.isArray(summaryRes.data.rounds)) {
        setRounds(summaryRes.data.rounds);
      }
      
      if (summaryRes.data.status !== "completed") {
        return;
      }

      // Lưu vào lịch sử làm bài
      try {
        await api.post(`/learners/speaking-practice/sessions/${sessionId}/save-to-history`);
      } catch (err) {
        console.error("❌ Error saving to history:", err);
      }
    } catch (err) {
      console.error("❌ Error analyzing and generating summary:", err);
      setSessionData(prev => ({
        ...prev,
        summary: {
          status: "failed",
          message: err?.response?.data?.message || "Không thể tải kết quả. Vui lòng thử lại."
        }
      }));
    } finally {
      setAnalyzing(false);
    }
  };

  // Hiển thị loading khi đang phân tích
  if (analyzing) {
    return (
      <div className="speaking-practice-page">
        <div className="practice-header">
          <h2><UiText text={"Đang phân tích kết quả..."} /></h2>
        </div>
        <div style={{ textAlign: "center", padding: 40 }}>
          <p style={{ fontSize: 18, color: "#666" }}><UiText text={"Vui lòng đợi trong giây lát..."} /></p>
        </div>
      </div>
    );
  }

  // Hiển thị semantic input sau khi hoàn thành 10 vòng
  if (showSemanticInput && sessionId !== null) {
    return (
      <SemanticInput
        sessionId={sessionId}
        rounds={rounds}
        onComplete={handleSemanticComplete}
        onSkip={handleSemanticSkip}
      />
    );
  }

  // Nếu đã đủ 10 vòng và có summary, hiển thị tổng kết
  if (currentRound >= 10 && sessionData?.summary) {
    return (
      <SpeakingSummary
        sessionData={sessionData}
        rounds={rounds}
        onRestart={resetSession}
        onFinish={resetSession}
        endError={error}
        onRetry={handleSemanticSkip}
      />
    );
  }

  // Nếu đang trong session, hiển thị vòng nói
  if (sessionId !== null && currentRound < 10) {
    
    return <>
      {error && <p role="alert" style={{ color: '#b91c1c', padding: '12px 20px' }}><UiText>{error}</UiText></p>}
      <SpeakingRound
        key={`round-${currentRound}-${sessionId}`} // Force re-render khi round thay đổi
        sessionId={sessionId}
        roundNumber={currentRound + 1}
        level={level}
        onSave={saveRound}
        onCancel={resetSession}
      />
    </>;
  }

  // Màn hình chọn level và bắt đầu
  return (
    <div className="speaking-practice-page">
      <div className="practice-header">
        <h2><UiText text={"Luyện tập cùng AI"} /></h2>
        <p><UiText text="Choose your pace. Read 10 sentences with automatic microphone and live word tracking." /></p>
      </div>

      <div className="practice-modes">
        <button
          className={`mode-btn ${mode === "practice" ? "active" : ""}`}
          onClick={() => {
            setMode("practice");
            checkIncompleteSession();
          }}
        ><FiMic aria-hidden="true"/><span><strong><UiText text={"Luyện phát âm"}/></strong><small><UiText text="Đọc thành tiếng và luyện từng đoạn ngắn."/></small></span></button>

        <button
          className={`mode-btn ${mode === "story" ? "active" : ""}`}
          onClick={() => setMode("story")}
        ><FiBookOpen aria-hidden="true"/><span><strong><UiText text={"Tell me your story"}/></strong><small><UiText text="Kể một câu chuyện theo cách của bạn."/></small></span></button>
        <button className={`mode-btn ${mode==='world'?'active':''}`} onClick={()=>setMode('world')}><FiUsers aria-hidden="true"/><span><strong><UiText text={"Scenario Studio · NPC & phân cảnh"}/></strong><small><UiText text="Gặp nhân vật và chọn lời đáp tiếp theo."/></small></span></button>
      </div>

      {/* Chỉ hiển thị thông báo và nút khi đã chọn mode practice hoặc scenario */}
      {mode === "practice" && (
        <>
          {/* Mode practice: chỉ hiển thị thông báo và nút cho practice session */}
          {mode === "practice" && (error || incompleteSession) && (
            <div className="error-message" style={{ 
              background: incompleteSession ? "#fef3c7" : "#fee2e2",
              border: `1px solid ${incompleteSession ? "#fbbf24" : "#ef4444"}`,
              padding: "16px",
              borderRadius: "8px",
              marginBottom: "16px"
            }}>
              <UiText>{error || (incompleteSession && `Bạn đang có một bài luyện tập chưa hoàn thành (${incompleteSession.rounds_count}/10 vòng).`)}</UiText>
              {incompleteSession && (
                <div style={{ marginTop: "12px" }}>
                  <p style={{ margin: "0 0 8px 0", fontSize: "14px", color: "#111" }}>{" "}<UiText text={"Vui lòng hoàn thành bài luyện tập trước khi bắt đầu bài mới."} />{" "}</p>
                  <button
                    onClick={continueIncompleteSession}
                    disabled={restoringSession}
                    style={{
                      padding: "8px 16px",
                      background: "#10b981",
                      color: "white",
                      border: "none",
                      borderRadius: "6px",
                      cursor: "pointer",
                      fontSize: "14px",
                      fontWeight: "500"
                    }}
                  >{" "}<UiText text={"Tiếp tục bài luyện tập"} />{" "}</button>
                </div>
              )}
            </div>
          )}

          {/* Mode scenario: chỉ hiển thị thông báo và nút cho scenario session */}


          <fieldset className="practice-difficulty" disabled={loading || incompleteSession !== null}>
            <legend><UiText text="Choose a difficulty"/></legend>
            <div className="practice-difficulty-options">
              {[
                { value: 1, name: 'Easy', detail: 'Everyday vocabulary · 5–12 words', time: 'About 28–37 seconds per sentence' },
                { value: 2, name: 'Medium', detail: 'Broader topics · 12–22 words', time: 'About 35–47 seconds per sentence' },
                { value: 3, name: 'Hard', detail: 'Advanced vocabulary · 22–35 words', time: 'About 45–57 seconds per sentence' }
              ].map(option => <label key={option.value} className={`practice-difficulty-card ${level === option.value ? 'is-selected' : ''}`}>
                <input type="radio" name="speaking-difficulty" value={option.value} checked={level === option.value} onChange={() => setLevel(option.value)}/>
                <span><strong><UiText text={option.name}/></strong><span><UiText text={option.detail}/></span><small><UiText text={option.time}/></small></span>
              </label>)}
            </div>
          </fieldset>
          <div className="practice-actions">
            {mode === "practice" && (
              <button
                className="btn-start"
                onClick={createSession}
                disabled={loading || incompleteSession !== null}
              >
                <UiText>{loading ? "Đang tạo session..." : incompleteSession ? "Vui lòng hoàn thành bài trước" : "Bắt đầu luyện tập"}</UiText>
              </button>
            )}

          </div>
        </>
      )}

      {/* Dashboard: Điểm thi đua và Bảng xếp hạng - Chỉ hiển thị cho mode practice */}
      {mode === "practice" && (
      <div style={{ 
        marginTop: "40px",
        padding: "20px",
        display: "grid",
        gridTemplateColumns: "1fr 1fr",
        gap: "20px",
        maxWidth: "1200px",
        margin: "40px auto 0"
      }}>
        {/* Block điểm cá nhân */}
        <div style={{
          background: "white",
          borderRadius: "12px",
          padding: "24px",
          boxShadow: "0 2px 8px rgba(0,0,0,0.1)"
        }}>
          {/* Điểm thi đua hiện tại */}
          <h3 style={{ 
            margin: 0,
            marginBottom: "20px",
            color: "#f59e0b",
            display: "flex",
            alignItems: "center",
            gap: "8px"
          }}>
            <FaTrophy />{" "}<UiText text={"Điểm thi đua hiện tại"} />{" "}</h3>
          {loadingDashboard ? (
            <p style={{ textAlign: "center", color: "#666" }}><UiText text={"Đang tải..."} /></p>
          ) : (
            <>
              <div style={{ textAlign: "center", marginBottom: "16px" }}>
                <div style={{ 
                  fontWeight: "700", 
                  color: "#f59e0b",
                  fontSize: "48px",
                  lineHeight: "1",
                  marginBottom: "8px"
                }}>
                  <UiText>{formatDashboardScore(competitionScore?.average_score, competitionScore?.assessment_status)}</UiText>
                </div>
                {competitionScore?.assessment_status === "completed" && competitionScore?.rank > 0 && (
                  <div style={{ 
                    fontSize: "16px", 
                    color: "#666",
                    marginBottom: "8px"
                  }}>{" "}<UiText text={"Thứ hạng:"} />{" "}<strong style={{ color: "#f59e0b" }}><UiText text={"#"} /><UiText>{competitionScore.rank}</UiText></strong>
                  </div>
                )}
                <div style={{ fontSize: "14px", color: "#999" }}>
                  <UiText>{competitionScore?.total_days || 0}</UiText>{" "}<UiText text={"ngày luyện tập"} />{" "}</div>
                <div style={{ fontSize: "12px", color: "#999", marginTop: "4px" }}>{" "}<UiText text={"Tuần này (Reset mỗi thứ 2)"} />{" "}</div>
              </div>
            </>
          )}

          {/* Hoạt động gần nhất */}
          <div style={{ marginTop: "24px", paddingTop: "20px", borderTop: "2px solid #e5e7eb" }}>
            <div style={{
              display: "flex",
              justifyContent: "space-between",
              alignItems: "center",
              marginBottom: "16px"
            }}>
              <h3 style={{ 
                margin: 0,
                color: "#10b981",
                display: "flex",
                alignItems: "center",
                gap: "8px"
              }}>
                <FaClock />{" "}<UiText text={"Hoạt động gần nhất"} />{" "}</h3>
              <button
                onClick={handleViewHistory}
                style={{
                  padding: "8px 16px",
                  background: "#10b981",
                  color: "white",
                  border: "none",
                  borderRadius: "6px",
                  cursor: "pointer",
                  fontSize: "14px",
                  fontWeight: "500"
                }}
              >{" "}<UiText text={"Xem lịch sử"} />{" "}</button>
            </div>
            {loadingDashboard ? (
              <p style={{ textAlign: "center", color: "#666" }}><UiText text={"Đang tải..."} /></p>
            ) : recentActivities.length === 0 ? (
              <p style={{ textAlign: "center", color: "#999", fontSize: "14px" }}>{" "}<UiText text={"Chưa có hoạt động nào"} />{" "}</p>
            ) : (
              <div style={{ display: "flex", flexDirection: "column", gap: "12px" }}>
                {recentActivities.map((activity, index) => (
                  <div 
                    key={index}
                    style={{
                      padding: "12px",
                      background: "#f9fafb",
                      borderRadius: "8px",
                      border: "1px solid #e5e7eb"
                    }}
                  >
                    <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center" }}>
                      <div>
                        <div style={{ fontWeight: "600", color: "#111", marginBottom: "4px" }}>
                          <UiText>{new Date(activity.practice_day).toLocaleDateString('en-GB', {
                            day: "2-digit",
                            month: "2-digit",
                            year: "numeric"
                          })}</UiText>
                        </div>
                        <div style={{ fontSize: "12px", color: "#666" }}>
                          <UiText>{activity.total_sessions}</UiText>{" "}<UiText text={"lần luyện tập"} />{" "}</div>
                      </div>
                      <div style={{ textAlign: "right" }}>
                        <div style={{ 
                          fontWeight: "700", 
                          color: activity.is_future || activity.max_score === null ? "#999" : "#10b981",
                          fontSize: "20px"
                        }}>
                          <UiText>{activity.is_future ? "Chưa đến ngày" : formatDashboardScore(activity.max_score, activity.assessment_status)}</UiText>
                        </div>
                        <div style={{ fontSize: "11px", color: "#999", marginTop: "2px" }}>{" "}<UiText text={"Điểm cao nhất"} />{" "}</div>
                      </div>
                    </div>
                  </div>
                ))}
              </div>
            )}
          </div>
        </div>

        {/* Bảng xếp hạng */}
        <div style={{
          background: "white",
          borderRadius: "12px",
          padding: "24px",
          boxShadow: "0 2px 8px rgba(0,0,0,0.1)"
        }}>
          <h3 style={{ 
            margin: 0,
            marginBottom: "20px",
            color: "#f59e0b",
            display: "flex",
            alignItems: "center",
            gap: "8px"
          }}>
            <FaTrophy />{" "}<UiText text={"Bảng xếp hạng"} />{" "}</h3>
          {loadingDashboard ? (
            <p style={{ textAlign: "center", color: "#666" }}><UiText text={"Đang tải..."} /></p>
          ) : topRatings.length === 0 ? (
            <p style={{ textAlign: "center", color: "#999", fontSize: "14px" }}>{" "}<UiText text={"Chưa đủ kết quả đánh giá để xếp hạng."} />{" "}</p>
          ) : (
            <div style={{ display: "flex", flexDirection: "column", gap: "12px" }}>
              {topRatings.map((rating) => (
                <div 
                  key={rating.learner_id}
                  style={{
                    padding: "12px",
                    background: rating.rank <= 3 ? "#fef3c7" : "#f9fafb",
                    borderRadius: "8px",
                    border: `2px solid ${rating.rank === 1 ? "#fbbf24" : rating.rank === 2 ? "#94a3b8" : rating.rank === 3 ? "#f97316" : "#e5e7eb"}`,
                    display: "flex",
                    alignItems: "center",
                    gap: "12px"
                  }}
                >
                  <div style={{
                    width: "32px",
                    height: "32px",
                    borderRadius: "50%",
                    background: rating.rank === 1 ? "#fbbf24" : rating.rank === 2 ? "#94a3b8" : rating.rank === 3 ? "#f97316" : "#e5e7eb",
                    color: "white",
                    display: "flex",
                    alignItems: "center",
                    justifyContent: "center",
                    fontWeight: "700",
                    fontSize: "14px"
                  }}>
                    <UiText>{rating.rank}</UiText>
                  </div>
                  <div style={{ flex: 1 }}>
                    <div style={{ fontWeight: "600", color: "#111", marginBottom: "4px" }}>
                      {rating.learner_name}
                    </div>
                    <div style={{ fontSize: "12px", color: "#666" }}>
                      <UiText>{rating.total_days}</UiText>{" "}<UiText text={"ngày luyện tập"} />{" "}</div>
                  </div>
                  <div style={{ textAlign: "right" }}>
                    <div style={{ 
                      fontWeight: "700", 
                      color: "#f59e0b",
                      fontSize: "18px"
                    }}>
                      <UiText>{formatDashboardScore(rating.average_score, rating.assessment_status)}</UiText>
                    </div>
                  </div>
                </div>
              ))}
            </div>
          )}
        </div>
      </div>
      )}

      {/* Modal Lịch sử theo tuần - Chỉ hiển thị cho mode practice */}
      {mode === "practice" && showHistoryModal && (
        <div style={{
          position: "fixed",
          top: 0,
          left: 0,
          right: 0,
          bottom: 0,
          background: "rgba(0,0,0,0.5)",
          display: "flex",
          alignItems: "center",
          justifyContent: "center",
          zIndex: 1000,
          padding: "20px"
        }} onClick={() => setShowHistoryModal(false)}>
          <div style={{
            background: "white",
            borderRadius: "12px",
            padding: "24px",
            maxWidth: "800px",
            width: "100%",
            maxHeight: "80vh",
            overflow: "auto",
            boxShadow: "0 4px 20px rgba(0,0,0,0.2)"
          }} onClick={(e) => e.stopPropagation()}>
            <div style={{
              display: "flex",
              justifyContent: "space-between",
              alignItems: "center",
              marginBottom: "20px"
            }}>
              <h2 style={{ margin: 0, color: "#10b981" }}><UiText text={"Lịch sử luyện tập"} /></h2>
              <button
                onClick={() => setShowHistoryModal(false)}
                style={{
                  background: "none",
                  border: "none",
                  fontSize: "24px",
                  cursor: "pointer",
                  color: "#666"
                }}
              >{" "}<UiText text={"×"} />{" "}</button>
            </div>
            {loadingHistory ? (
              <p style={{ textAlign: "center", color: "#666" }}><UiText text={"Đang tải..."} /></p>
            ) : weeklyHistory.length === 0 ? (
              <p style={{ textAlign: "center", color: "#999" }}><UiText text={"Chưa có lịch sử"} /></p>
            ) : (
              <>
                {/* Navigation */}
                <div style={{
                  display: "flex",
                  justifyContent: "space-between",
                  alignItems: "center",
                  marginBottom: "20px",
                  padding: "12px",
                  background: "#f9fafb",
                  borderRadius: "8px"
                }}>
                  <button
                    onClick={handleHistoryPrev}
                    disabled={loadingHistory}
                    style={{
                      padding: "8px 16px",
                      background: historyOffset === 0 ? "#e5e7eb" : "#10b981",
                      color: historyOffset === 0 ? "#999" : "white",
                      border: "none",
                      borderRadius: "6px",
                      cursor: historyOffset === 0 ? "not-allowed" : "pointer",
                      fontSize: "14px",
                      fontWeight: "500"
                    }}
                  >{" "}<UiText text={"← Tuần trước"} />{" "}</button>
                  <div style={{ fontSize: "14px", color: "#666" }}>
                    <UiText>{historyOffset === 0 ? "Tuần hiện tại" : `Tuần trước ${historyOffset}`}</UiText>
                  </div>
                  <button
                    onClick={handleHistoryNext}
                    disabled={loadingHistory || historyOffset === 0}
                    style={{
                      padding: "8px 16px",
                      background: historyOffset === 0 ? "#e5e7eb" : "#10b981",
                      color: historyOffset === 0 ? "#999" : "white",
                      border: "none",
                      borderRadius: "6px",
                      cursor: historyOffset === 0 ? "not-allowed" : "pointer",
                      fontSize: "14px",
                      fontWeight: "500"
                    }}
                  >{" "}<UiText text={"Tuần sau →"} />{" "}</button>
                </div>

                {/* Weekly History */}
                <div style={{ display: "flex", flexDirection: "column", gap: "20px" }}>
                  {weeklyHistory.map((week, weekIndex) => {
                    const weekStart = new Date(week.week_start);
                    const weekEnd = new Date(weekStart);
                    weekEnd.setDate(weekEnd.getDate() + 6);
                    return (
                      <div key={weekIndex} style={{
                        border: "1px solid #e5e7eb",
                        borderRadius: "8px",
                        padding: "16px"
                      }}>
                        <div style={{
                          display: "flex",
                          justifyContent: "space-between",
                          alignItems: "center",
                          marginBottom: "12px"
                        }}>
                          <div style={{
                            fontWeight: "600",
                            color: "#111",
                            fontSize: "16px"
                          }}>
                            <UiText>{weekStart.toLocaleDateString('en-GB', {
                              day: "2-digit",
                              month: "2-digit"
                            })}</UiText> - <UiText>{weekEnd.toLocaleDateString('en-GB', {
                              day: "2-digit",
                              month: "2-digit",
                              year: "numeric"
                            })}</UiText>
                          </div>
                          <div style={{
                            display: "flex",
                            gap: "16px",
                            fontSize: "14px",
                            color: "#666"
                          }}>
                            <div>
                              <strong style={{ color: "#10b981" }}><UiText>{week.total_sessions}</UiText></strong>{" "}<UiText text={"lần luyện tập"} />{" "}</div>
                            <div>{" "}<UiText text={"Điểm TB:"} />{" "}<strong style={{ color: "#10b981" }}><UiText>{formatDashboardScore(week.average_score, week.assessment_status)}</UiText></strong>
                            </div>
                          </div>
                        </div>
                        <div style={{ display: "flex", flexDirection: "column", gap: "8px" }}>
                          {week.activities.map((activity) => (
                            <div key={activity.id} style={{
                              padding: "10px",
                              background: "#f9fafb",
                              borderRadius: "6px",
                              display: "flex",
                              justifyContent: "space-between",
                              alignItems: "center"
                            }}>
                              <div>
                                <div style={{ fontWeight: "500", color: "#111", fontSize: "14px" }}>
                                  <UiText>{activity.activity_type}</UiText>
                                </div>
                                <div style={{ fontSize: "12px", color: "#666", marginTop: "4px" }}>
                                  <UiText>{new Date(activity.practice_date).toLocaleDateString('en-GB', {
                                    day: "2-digit",
                                    month: "2-digit",
                                    hour: "2-digit",
                                    minute: "2-digit"
                                  })}</UiText>
                                </div>
                              </div>
                              <div style={{
                                fontWeight: "700",
                                color: "#10b981",
                                fontSize: "18px"
                              }}>
                                <UiText>{formatDashboardScore(activity.average_score, activity.assessment_status)}</UiText>
                              </div>
                            </div>
                          ))}
                        </div>
                      </div>
                    );
                  })}
                </div>
              </>
            )}
          </div>
        </div>
      )}
    </div>
  );
}

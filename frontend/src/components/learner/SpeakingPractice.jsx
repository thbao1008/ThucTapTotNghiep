import React, { useState, useEffect } from "react";
import { getAuth } from "../../utils/auth";
import api from "../../api";
import SpeakingRound from "./SpeakingRound";
import SpeakingSummary from "./SpeakingSummary";
import SpeakingScenario from "./SpeakingScenario";
import TellMeYourStory from "./TellMeYourStory";
import SemanticInput from "./SemanticInput";
import "../../styles/speaking-practice.css";
import { FaTrophy, FaClock, FaUser } from "react-icons/fa";

export default function SpeakingPractice() {
  const auth = getAuth();
  const [mode, setMode] = useState("practice"); // "practice" or "story"
  const [level] = useState(1); // Luôn dùng level 1 (đã gộp thành 1 level)
  const [sessionId, setSessionId] = useState(null);
  const [currentRound, setCurrentRound] = useState(0);
  const [rounds, setRounds] = useState([]);
  const [sessionData, setSessionData] = useState(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState("");
  const [showSemanticInput, setShowSemanticInput] = useState(false);
  const [analyzing, setAnalyzing] = useState(false);
  const [scenarios, setScenarios] = useState([]);
  const [selectedScenario, setSelectedScenario] = useState(null);
  const [scenarioSessionId, setScenarioSessionId] = useState(null);
  const [recentActivities, setRecentActivities] = useState([]);
  const [competitionScore, setCompetitionScore] = useState(null);
  const [loadingDashboard, setLoadingDashboard] = useState(false);
  const [showHistoryModal, setShowHistoryModal] = useState(false);
  const [weeklyHistory, setWeeklyHistory] = useState([]);
  const [loadingHistory, setLoadingHistory] = useState(false);
  const [incompleteSession, setIncompleteSession] = useState(null);
  const [incompleteScenarioSession, setIncompleteScenarioSession] = useState(null);
  const [topRatings, setTopRatings] = useState([]);
  const [historyOffset, setHistoryOffset] = useState(0);
  const [showScenarioList, setShowScenarioList] = useState(false); // Chỉ hiển thị danh sách scenarios khi đã click "Bắt đầu làm bài"

  // Tạo session mới
  const createSession = async () => {
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

      setSessionId(res.data.session_id);
      setCurrentRound(0);
      setRounds([]);
      setSessionData(res.data);
      setIncompleteSession(null);
    } catch (err) {
      console.error("❌ Error creating session:", err);
      // Nếu có session đang dở dang, lưu thông tin
      if (err?.response?.data?.incomplete_session) {
        setIncompleteSession(err.response.data.incomplete_session);
        setError(err.response.data.message || "Bạn có một bài luyện tập chưa hoàn thành.");
      } else {
        setError(err?.response?.data?.message || "Không thể tạo session. Vui lòng thử lại.");
      }
    } finally {
      setLoading(false);
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
        status: "processing"
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
        // Đợi một chút để state được update
        setTimeout(() => {
          setShowSemanticInput(true);
        }, 100);
      } else {
        // Chuyển sang vòng tiếp theo ngay
        setCurrentRound(nextRound);
      }
      return;
    }
    try {
      const formData = new FormData();
      formData.append("audio", roundData.audioBlob);
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
        status: "processing"
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
  const resetSession = () => {
    setSessionId(null);
    setCurrentRound(0);
    setRounds([]);
    setSessionData(null);
    setError("");
    setShowSemanticInput(false);
    setAnalyzing(false);
  };

  // Load scenarios chỉ khi showScenarioList = true
  useEffect(() => {
    if (mode === "scenario" && showScenarioList) {
      fetchScenarios();
    }
  }, [mode, showScenarioList]);

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

  const checkIncompleteScenarioSession = async () => {
    try {
      const userId = auth?.user?._id || auth?.user?.id;
      const learnerId = auth?.user?.learner_id;
      
      // Kiểm tra scenario session chưa hoàn thành
      const res = await api.get(`/learners/speaking-practice/scenario/incomplete-session?${learnerId ? `learner_id=${learnerId}` : `user_id=${userId}`}`);
      if (res.data.incomplete_session) {
        setIncompleteScenarioSession(res.data.incomplete_session);
        if (!error || !error.includes("giao tiếp")) {
          setError(`Bạn đang có một bài luyện giao tiếp chưa hoàn thành.`);
        }
      } else {
        setIncompleteScenarioSession(null);
        if (error && error.includes("giao tiếp")) {
          setError("");
        }
      }
    } catch (err) {
      console.error("❌ Error checking incomplete scenario session:", err);
    }
  };

  const continueIncompleteSession = () => {
    if (incompleteSession) {
      setSessionId(incompleteSession.session_id);
      setCurrentRound(incompleteSession.rounds_count);
      setRounds([]);
      setIncompleteSession(null);
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
      setCompetitionScore(scoreRes.data.score || { average_score: 0, total_days: 0, rank: 0 });
      setTopRatings(ratingsRes.data.ratings || []);
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

  const fetchScenarios = async () => {
    try {
      const res = await api.get("/learners/speaking-practice/scenarios");
      setScenarios(res.data.scenarios || []);
    } catch (err) {
      console.error("❌ Error fetching scenarios:", err);
    }
  };

  const startScenario = async (scenario) => {
    try {
      const userId = auth?.user?._id || auth?.user?.id;
      const learnerId = auth?.user?.learner_id;
      
      const res = await api.post("/learners/speaking-practice/scenario/sessions", {
        scenario_id: scenario.id,
        learner_id: learnerId,
        user_id: userId
      });
      setScenarioSessionId(res.data.session_id);
      setSelectedScenario(scenario);
    } catch (err) {
      console.error("❌ Error starting scenario:", err);
      alert("Không thể bắt đầu tình huống. Vui lòng thử lại.");
    }
  };

  const handleScenarioComplete = (data) => {
    alert("Chúc mừng! Bạn đã hoàn thành tình huống!");
    setSelectedScenario(null);
    setScenarioSessionId(null);
    setMode("practice");
  };

  if (mode === "story") {
    return <TellMeYourStory onBack={() => setMode("practice")} />;
  }

  // Màn hình chọn scenario (chỉ hiển thị khi showScenarioList = true)
  if (mode === "scenario" && showScenarioList && !selectedScenario) {
    return (
      <div className="speaking-practice-page">
        <div className="practice-header">
          <h2>Luyện giao tiếp</h2>
          <button 
            className="btn-back" 
            onClick={() => {
              setShowScenarioList(false);
              setSelectedScenario(null);
            }} 
            style={{ padding: "8px 16px", background: "#6b7280", color: "white", border: "none", borderRadius: 4, cursor: "pointer" }}
          >
            Quay lại
          </button>
        </div>
        <div className="scenarios-list" style={{ padding: 20 }}>
          {scenarios.length === 0 ? (
            <p style={{ textAlign: "center", color: "#666" }}>Đang tải tình huống...</p>
          ) : (
            scenarios.map((scenario) => (
              <div
                key={scenario.id}
                style={{
                  padding: 20,
                  marginBottom: 15,
                  background: "white",
                  borderRadius: 8,
                  border: "1px solid #e5e7eb",
                  cursor: "pointer",
                  transition: "all 0.2s"
                }}
                onClick={() => startScenario(scenario)}
                onMouseEnter={(e) => e.currentTarget.style.borderColor = "#10b981"}
                onMouseLeave={(e) => e.currentTarget.style.borderColor = "#e5e7eb"}
              >
                <h3 style={{ marginBottom: 10, color: "#10b981" }}>{scenario.title}</h3>
                <p style={{ color: "#666", marginBottom: 10 }}>{scenario.description}</p>
                <div style={{ fontSize: 14, color: "#999" }}>
                  <strong>Nhiệm vụ:</strong> {scenario.task}
                </div>
                <div style={{ fontSize: 12, color: "#999", marginTop: 5 }}>
                  Độ khó: {scenario.difficulty_level === 1 ? "Dễ" : scenario.difficulty_level === 2 ? "Trung bình" : "Khó"}
                </div>
              </div>
            ))
          )}
        </div>
      </div>
    );
  }

  // Màn hình scenario đang chơi
  if (mode === "scenario" && selectedScenario && scenarioSessionId) {
    return (
      <SpeakingScenario
        sessionId={scenarioSessionId}
        scenario={selectedScenario}
        onComplete={handleScenarioComplete}
        onCancel={() => {
          setSelectedScenario(null);
          setScenarioSessionId(null);
          setMode("practice");
        }}
      />
    );
  }

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
      
      // Lưu vào lịch sử làm bài
      try {
        await api.post(`/learners/speaking-practice/sessions/${sessionId}/save-to-history`);
      } catch (err) {
        console.error("❌ Error saving to history:", err);
      }
    } catch (err) {
      console.error("❌ Error analyzing and generating summary:", err);
      // Nếu API không tồn tại, thử API cũ
      try {
        const summaryRes = await api.get(
          `/learners/speaking-practice/sessions/${sessionId}/summary`
        );
        setSessionData(prev => ({ ...prev, summary: summaryRes.data }));
        
        // Cập nhật rounds với dữ liệu từ summary
        if (summaryRes.data.rounds && Array.isArray(summaryRes.data.rounds)) {
          setRounds(summaryRes.data.rounds);
        }
      } catch (err2) {
        console.error("❌ Error fetching summary:", err2);
      }
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
      
      // Lưu vào lịch sử làm bài
      try {
        await api.post(`/learners/speaking-practice/sessions/${sessionId}/save-to-history`);
      } catch (err) {
        console.error("❌ Error saving to history:", err);
      }
    } catch (err) {
      console.error("❌ Error analyzing and generating summary:", err);
      // Nếu API không tồn tại, thử API cũ
      try {
        const summaryRes = await api.get(
          `/learners/speaking-practice/sessions/${sessionId}/summary`
        );
        setSessionData(prev => ({ ...prev, summary: summaryRes.data }));
        
        // Cập nhật rounds với dữ liệu từ summary
        if (summaryRes.data.rounds && Array.isArray(summaryRes.data.rounds)) {
          setRounds(summaryRes.data.rounds);
        }
      } catch (err2) {
        console.error("❌ Error fetching summary:", err2);
      }
    } finally {
      setAnalyzing(false);
    }
  };

  // Hiển thị loading khi đang phân tích
  if (analyzing) {
    return (
      <div className="speaking-practice-page">
        <div className="practice-header">
          <h2>Đang phân tích kết quả...</h2>
        </div>
        <div style={{ textAlign: "center", padding: 40 }}>
          <p style={{ fontSize: 18, color: "#666" }}>Vui lòng đợi trong giây lát...</p>
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
      />
    );
  }

  // Nếu đang trong session, hiển thị vòng nói
  if (sessionId !== null && currentRound < 10) {
    
    return (
      <SpeakingRound
        key={`round-${currentRound}-${sessionId}`} // Force re-render khi round thay đổi
        sessionId={sessionId}
        roundNumber={currentRound + 1}
        level={level}
        onSave={saveRound}
        onCancel={resetSession}
      />
    );
  }

  // Màn hình chọn level và bắt đầu
  return (
    <div className="speaking-practice-page">
      <div className="practice-header">
        <h2>Luyện tập cùng AI</h2>
        <p>Bắt đầu luyện tập. Bạn sẽ có 10 vòng nói với AI. Độ khó sẽ được điều chỉnh tự động dựa trên trình độ của bạn.</p>
      </div>

      <div className="practice-modes">
        <button
          className={`mode-btn ${mode === "practice" ? "active" : ""}`}
          onClick={() => {
            setMode("practice");
            checkIncompleteSession();
          }}
        >
          Luyện phát âm
        </button>
        <button
          className={`mode-btn ${mode === "scenario" ? "active" : ""}`}
          onClick={() => {
            setMode("scenario");
            setShowScenarioList(false); // Reset về màn hình chọn
            checkIncompleteScenarioSession();
          }}
        >
          Luyện giao tiếp
        </button>
        <button
          className={`mode-btn ${mode === "story" ? "active" : ""}`}
          onClick={() => setMode("story")}
        >
          Tell me your story
        </button>
      </div>

      {/* Chỉ hiển thị thông báo và nút khi đã chọn mode practice hoặc scenario */}
      {(mode === "practice" || mode === "scenario") && (
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
              {error || (incompleteSession && `Bạn đang có một bài luyện tập chưa hoàn thành (${incompleteSession.rounds_count}/10 vòng).`)}
              {incompleteSession && (
                <div style={{ marginTop: "12px" }}>
                  <p style={{ margin: "0 0 8px 0", fontSize: "14px", color: "#111" }}>
                    Vui lòng hoàn thành bài luyện tập trước khi bắt đầu bài mới.
                  </p>
                  <button
                    onClick={continueIncompleteSession}
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
                  >
                    Tiếp tục bài luyện tập
                  </button>
                </div>
              )}
            </div>
          )}

          {/* Mode scenario: chỉ hiển thị thông báo và nút cho scenario session */}
          {mode === "scenario" && (error || incompleteScenarioSession) && (
            <div className="error-message" style={{ 
              background: incompleteScenarioSession ? "#fef3c7" : "#fee2e2",
              border: `1px solid ${incompleteScenarioSession ? "#fbbf24" : "#ef4444"}`,
              padding: "16px",
              borderRadius: "8px",
              marginBottom: "16px"
            }}>
              {error || (incompleteScenarioSession && "Bạn đang có một bài luyện giao tiếp chưa hoàn thành.")}
              {incompleteScenarioSession && (
                <div style={{ marginTop: "12px" }}>
                  <p style={{ margin: "0 0 8px 0", fontSize: "14px", color: "#111" }}>
                    Vui lòng hoàn thành bài luyện tập trước khi bắt đầu bài mới.
                  </p>
                  <button
                    onClick={async () => {
                      // Load lại scenario session
                      try {
                        setScenarioSessionId(incompleteScenarioSession.session_id);
                        // Fetch scenarios để lấy thông tin scenario
                        await fetchScenarios();
                        // Tìm scenario từ scenario_id
                        const scenario = scenarios.find(s => s.id === incompleteScenarioSession.scenario_id);
                        if (scenario) {
                          setSelectedScenario(scenario);
                          setShowScenarioList(false);
                        } else {
                          // Nếu chưa có trong list, fetch lại
                          const res = await api.get("/learners/speaking-practice/scenarios");
                          const allScenarios = res.data.scenarios || [];
                          const foundScenario = allScenarios.find(s => s.id === incompleteScenarioSession.scenario_id);
                          if (foundScenario) {
                            setSelectedScenario(foundScenario);
                            setShowScenarioList(false);
                          }
                        }
                      } catch (err) {
                        console.error("❌ Error continuing scenario session:", err);
                        alert("Không thể tiếp tục bài luyện tập. Vui lòng thử lại.");
                      }
                    }}
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
                  >
                    Tiếp tục bài luyện giao tiếp
                  </button>
                </div>
              )}
            </div>
          )}

          <div className="practice-actions">
            {mode === "practice" && (
              <button
                className="btn-start"
                onClick={createSession}
                disabled={loading || incompleteSession !== null}
              >
                {loading ? "Đang tạo session..." : incompleteSession ? "Vui lòng hoàn thành bài trước" : "Bắt đầu luyện tập"}
              </button>
            )}
            {mode === "scenario" && !showScenarioList && (
              <button
                className="btn-start"
                onClick={() => {
                  if (!incompleteScenarioSession) {
                    setShowScenarioList(true);
                    fetchScenarios();
                  }
                }}
                disabled={loading || incompleteScenarioSession !== null}
              >
                {loading ? "Đang tải..." : incompleteScenarioSession ? "Vui lòng hoàn thành bài trước" : "Bắt đầu làm bài"}
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
            <FaTrophy /> Điểm thi đua hiện tại
          </h3>
          {loadingDashboard ? (
            <p style={{ textAlign: "center", color: "#666" }}>Đang tải...</p>
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
                  {competitionScore?.average_score || 0}/100
                </div>
                {competitionScore?.rank > 0 && (
                  <div style={{ 
                    fontSize: "16px", 
                    color: "#666",
                    marginBottom: "8px"
                  }}>
                    Thứ hạng: <strong style={{ color: "#f59e0b" }}>#{competitionScore.rank}</strong>
                  </div>
                )}
                <div style={{ fontSize: "14px", color: "#999" }}>
                  {competitionScore?.total_days || 0} ngày luyện tập
                </div>
                <div style={{ fontSize: "12px", color: "#999", marginTop: "4px" }}>
                  Tuần này (Reset mỗi thứ 2)
                </div>
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
                <FaClock /> Hoạt động gần nhất
              </h3>
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
              >
                Xem lịch sử
              </button>
            </div>
            {loadingDashboard ? (
              <p style={{ textAlign: "center", color: "#666" }}>Đang tải...</p>
            ) : recentActivities.length === 0 ? (
              <p style={{ textAlign: "center", color: "#999", fontSize: "14px" }}>
                Chưa có hoạt động nào
              </p>
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
                          {new Date(activity.practice_day).toLocaleDateString("vi-VN", {
                            day: "2-digit",
                            month: "2-digit",
                            year: "numeric"
                          })}
                        </div>
                        <div style={{ fontSize: "12px", color: "#666" }}>
                          {activity.total_sessions} lần luyện tập
                        </div>
                      </div>
                      <div style={{ textAlign: "right" }}>
                        <div style={{ 
                          fontWeight: "700", 
                          color: activity.is_future || activity.max_score === null ? "#999" : "#10b981",
                          fontSize: "20px"
                        }}>
                          {activity.is_future || activity.max_score === null ? "?" : `${activity.max_score}/100`}
                        </div>
                        <div style={{ fontSize: "11px", color: "#999", marginTop: "2px" }}>
                          Điểm cao nhất
                        </div>
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
            <FaTrophy /> Bảng xếp hạng
          </h3>
          {loadingDashboard ? (
            <p style={{ textAlign: "center", color: "#666" }}>Đang tải...</p>
          ) : topRatings.length === 0 ? (
            <p style={{ textAlign: "center", color: "#999", fontSize: "14px" }}>
              Chưa có dữ liệu
            </p>
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
                    {rating.rank}
                  </div>
                  <div style={{ flex: 1 }}>
                    <div style={{ fontWeight: "600", color: "#111", marginBottom: "4px" }}>
                      {rating.learner_name}
                    </div>
                    <div style={{ fontSize: "12px", color: "#666" }}>
                      {rating.total_days} ngày luyện tập
                    </div>
                  </div>
                  <div style={{ textAlign: "right" }}>
                    <div style={{ 
                      fontWeight: "700", 
                      color: "#f59e0b",
                      fontSize: "18px"
                    }}>
                      {rating.average_score}/100
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
              <h2 style={{ margin: 0, color: "#10b981" }}>Lịch sử luyện tập</h2>
              <button
                onClick={() => setShowHistoryModal(false)}
                style={{
                  background: "none",
                  border: "none",
                  fontSize: "24px",
                  cursor: "pointer",
                  color: "#666"
                }}
              >
                ×
              </button>
            </div>
            {loadingHistory ? (
              <p style={{ textAlign: "center", color: "#666" }}>Đang tải...</p>
            ) : weeklyHistory.length === 0 ? (
              <p style={{ textAlign: "center", color: "#999" }}>Chưa có lịch sử</p>
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
                  >
                    ← Tuần trước
                  </button>
                  <div style={{ fontSize: "14px", color: "#666" }}>
                    {historyOffset === 0 ? "Tuần hiện tại" : `Tuần trước ${historyOffset}`}
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
                  >
                    Tuần sau →
                  </button>
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
                            {weekStart.toLocaleDateString("vi-VN", {
                              day: "2-digit",
                              month: "2-digit"
                            })} - {weekEnd.toLocaleDateString("vi-VN", {
                              day: "2-digit",
                              month: "2-digit",
                              year: "numeric"
                            })}
                          </div>
                          <div style={{
                            display: "flex",
                            gap: "16px",
                            fontSize: "14px",
                            color: "#666"
                          }}>
                            <div>
                              <strong style={{ color: "#10b981" }}>{week.total_sessions}</strong> lần luyện tập
                            </div>
                            <div>
                              Điểm TB: <strong style={{ color: "#10b981" }}>{week.average_score}/100</strong>
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
                                  {activity.activity_type}
                                </div>
                                <div style={{ fontSize: "12px", color: "#666", marginTop: "4px" }}>
                                  {new Date(activity.practice_date).toLocaleDateString("vi-VN", {
                                    day: "2-digit",
                                    month: "2-digit",
                                    hour: "2-digit",
                                    minute: "2-digit"
                                  })}
                                </div>
                              </div>
                              <div style={{
                                fontWeight: "700",
                                color: "#10b981",
                                fontSize: "18px"
                              }}>
                                {activity.average_score}/100
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
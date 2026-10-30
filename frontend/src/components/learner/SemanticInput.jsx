import { englishText } from '../../i18n/uiLanguage.js';
import { UiText } from '../../i18n/UiLanguage.jsx';
import React, { useState } from "react";
import api from "../../api";
import "../../styles/speaking-practice.css";

export default function SemanticInput({ sessionId, rounds, onComplete, onSkip }) {
  const [translations, setTranslations] = useState({});
  const [submitting, setSubmitting] = useState(false);
  const [submittedRounds, setSubmittedRounds] = useState(new Set());

  const handleTranslationChange = (roundId, value) => {
    setTranslations(prev => ({
      ...prev,
      [roundId]: value
    }));
  };

  const handleSubmitTranslation = async (roundId) => {
    const translation = translations[roundId]?.trim();
    if (!translation) {
      alert(englishText("Vui lòng viết nghĩa của đoạn văn"));
      return;
    }

    try {
      setSubmitting(true);
      const res = await api.post(
        `/learners/speaking-practice/sessions/${sessionId}/rounds/${roundId}/translation`,
        { translation }
      );

      if (res.data.correct) {
        // Không hiển thị alert, chỉ đánh dấu đã submit
        setSubmittedRounds(prev => new Set([...prev, roundId]));
      } else {
        alert(`Chưa chính xác. ${res.data.feedback || englishText("Hãy thử lại.")}`);
      }
    } catch (err) {
      console.error("❌ Error submitting translation:", err);
      alert(englishText("Có lỗi xảy ra. Vui lòng thử lại."));
    } finally {
      setSubmitting(false);
    }
  };

  const handleSkip = () => {
    // Khi bỏ qua, tự động hiển thị kết quả
    if (onComplete) {
      onComplete();
    }
  };

  return (
    <div className="semantic-input">
      <div className="semantic-header">
        <h2><UiText text={"Nhập ngữ nghĩa"} /></h2>
        <p><UiText text={"Viết nghĩa tiếng Việt của các đoạn văn bạn đã nói (không bắt buộc)"} /></p>
      </div>

      <div className="semantic-content" style={{ maxHeight: "70vh", overflowY: "auto", padding: "0 10px" }}>
        {rounds.length === 0 ? (
          <div style={{ textAlign: "center", padding: 40, color: "#666" }}>
            <p><UiText text={"Đang tải dữ liệu các vòng..."} /></p>
          </div>
        ) : (
          rounds.map((round, idx) => {
          const roundKey = round.round_id || `round-${idx}`;
          const roundId = round.round_id;
          
          return (
            <div key={roundKey} className="translation-item" style={{ marginBottom: 30, padding: 20, background: "#f9fafb", borderRadius: 8, border: "1px solid #e5e7eb" }}>
              <div className="translation-prompt">
                <strong style={{ fontSize: 18, color: "#10b981" }}><UiText text={"Vòng"} />{" "}<UiText>{round.round_number || idx + 1}</UiText>:</strong>
                <p style={{ marginTop: 10, fontSize: 16, color: "#333", lineHeight: 1.6 }}><UiText>{round.prompt}</UiText></p>
              </div>
              <textarea
                value={translations[roundKey] || ""}
                onChange={(e) => handleTranslationChange(roundKey, e.target.value)}
                rows="3"
                placeholder={englishText("Viết nghĩa tiếng Việt của đoạn văn trên (không bắt buộc)...")}
                className="translation-input"
                disabled={submittedRounds.has(roundKey) || !roundId}
                style={{
                  width: "100%",
                  padding: 12,
                  borderRadius: 6,
                  border: submittedRounds.has(roundKey) ? "2px solid #10b981" : "1px solid #ddd",
                  marginTop: 12,
                  marginBottom: 10,
                  fontSize: 14,
                  fontFamily: "inherit",
                  resize: "vertical",
                  opacity: !roundId ? 0.6 : 1
                }}
              />
              {!roundId ? (
                <div style={{ color: "#999", marginBottom: 15, fontSize: 12 }}>{" "}<UiText text={"⏳ Đang xử lý, vui lòng đợi..."} />{" "}</div>
              ) : submittedRounds.has(roundKey) ? (
                <div style={{ color: "#10b981", marginBottom: 15, fontSize: 14, fontWeight: 500 }}>{" "}<UiText text={"✅ Đã kiểm tra"} />{" "}</div>
              ) : (
                <button
                  onClick={() => handleSubmitTranslation(roundId)}
                  disabled={!translations[roundKey]?.trim() || submitting}
                  style={{
                    padding: "8px 20px",
                    background: translations[roundKey]?.trim() && !submitting ? "#10b981" : "#9ca3af",
                    color: "white",
                    border: "none",
                    borderRadius: 6,
                    cursor: translations[roundKey]?.trim() && !submitting ? "pointer" : "not-allowed",
                    fontSize: 14,
                    fontWeight: 500,
                    marginBottom: 15,
                    transition: "all 0.2s"
                  }}
                >
                  <UiText>{submitting ? "Đang kiểm tra..." : "Kiểm tra"}</UiText>
                </button>
              )}
            </div>
          );
        })
        )}
      </div>

      <div className="semantic-actions" style={{ marginTop: 30, display: "flex", gap: 10, justifyContent: "center", paddingBottom: "20px" }}>
        <button
          onClick={handleSkip}
          style={{
            padding: "12px 24px",
            background: "#10b981",
            color: "white",
            border: "none",
            borderRadius: 8,
            cursor: "pointer",
            fontSize: 16,
            fontWeight: 600,
            boxShadow: "0 2px 8px rgba(16, 185, 129, 0.3)",
            transition: "all 0.2s"
          }}
          onMouseEnter={(e) => {
            e.target.style.transform = "translateY(-2px)";
            e.target.style.boxShadow = "0 4px 12px rgba(16, 185, 129, 0.4)";
          }}
          onMouseLeave={(e) => {
            e.target.style.transform = "translateY(0)";
            e.target.style.boxShadow = "0 2px 8px rgba(16, 185, 129, 0.3)";
          }}
        >{" "}<UiText text={"Bỏ qua"} />{" "}</button>
      </div>
    </div>
  );
}


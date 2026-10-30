import { UiText } from '../../i18n/UiLanguage.jsx';
﻿// src/components/mentor/AssessmentPanel.jsx
import React, { useEffect, useState, useMemo } from "react";
import api from "../../api";
import { getAuth } from "../../utils/auth";
import AssessmentModal from "./AssessmentModal";
import { FiCheckCircle, FiClock, FiEye } from "react-icons/fi";
import "../../styles/assessment.css";

export default function AssessmentPanel() {
  const [mentorId, setMentorId] = useState(null);
  const [submissions, setSubmissions] = useState([]);
  const [selectedId, setSelectedId] = useState(null);
  const [loading, setLoading] = useState(true);
  const [err, setErr] = useState("");
  const [showAiResultsOnly, setShowAiResultsOnly] = useState(false);

  useEffect(() => {
    async function fetchSubmissions() {
      console.log("[AssessmentPanel] Bắt đầu đọc auth từ localStorage...");
      try {
        const auth = getAuth();
        if (!auth || !auth.user) {
          console.warn("[AssessmentPanel] Không tìm thấy auth");
          setErr("Không tìm thấy thông tin đăng nhập");
          setLoading(false);
          return;
        }

        const userId = auth.user._id || auth.user.id || auth.user.user_id;
        console.log("[AssessmentPanel] auth.user:", auth.user);

        if (!userId) {
          console.warn("[AssessmentPanel] Không tìm thấy userId trong auth.user");
          setErr("Không xác định được người dùng");
          setLoading(false);
          return;
        }

        console.log(`[AssessmentPanel] Gọi API /mentors/by-user/${userId}`);
        const mentorRes = await api.get(`/mentors/by-user/${userId}`);
        console.log("[AssessmentPanel] Kết quả mentor:", mentorRes.data);

        const mid = mentorRes.data.mentor_id || mentorRes.data.id;
        if (!mid) {
          console.warn("[AssessmentPanel] Không tìm thấy mentor_id trong kết quả");
          setErr("Không tìm thấy mentor tương ứng");
          setLoading(false);
          return;
        }

        setMentorId(mid);

        console.log(`[AssessmentPanel] Gọi API /mentors/${mid}/submissions`);
        const submissionsRes = await api.get(`/mentors/${mid}/submissions`);
        console.log("[AssessmentPanel] Kết quả submissions:", submissionsRes.data);

        setSubmissions(submissionsRes.data.submissions || []);
      } catch (error) {
        console.error("[AssessmentPanel] Lỗi khi fetch submissions:", {
          message: error?.message,
          status: error?.response?.status,
          data: error?.response?.data,
        });
        setErr(error?.response?.data?.error || error?.response?.data?.message || "Không thể tải submissions");
      } finally {
        setLoading(false);
      }
    }

    fetchSubmissions();
  }, []);

  const hasAiResult = (submission) => {
    const contract = submission.ai_assessment_contract;
    const score = contract?.metrics?.language_quality;
    return contract?.status === "completed" &&
      typeof score === "number" && Number.isFinite(score) && score >= 0 && score <= 100;
  };

  const filteredSubmissions = useMemo(
    () => showAiResultsOnly ? submissions.filter(hasAiResult) : submissions,
    [submissions, showAiResultsOnly]
  );

  if (loading) return <div className="assessment-panel-loading"><UiText text={"Đang tải submissions..."} /></div>;
  if (err) return <div className="assessment-panel-error"><UiText>{err}</UiText></div>;

  const aiResultCount = submissions.filter(hasAiResult).length;
  const totalCount = submissions.length;

  return (
    <div className="assessment-panel">
      <div className="assessment-panel-header">
        <div className="assessment-panel-title">
          <h2><UiText text={"Kết quả AI của học viên được phân công"} /></h2>
          <span className="submission-count">
            <UiText>{filteredSubmissions.length}</UiText> / <UiText>{totalCount}</UiText>{" "}<UiText text={"bài"} />{" "}</span>
        </div>
        <div className="assessment-panel-filter">
          <label className="filter-checkbox">
            <input
              type="checkbox"
              checked={showAiResultsOnly}
              onChange={(e) => setShowAiResultsOnly(e.target.checked)}
            />
            <span className="filter-label">
              <FiCheckCircle className="filter-icon" />{" "}<UiText text={"Chỉ hiện bài đã có kết quả AI ("} /><UiText>{aiResultCount}</UiText>)
            </span>
          </label>
        </div>
      </div>

      {filteredSubmissions.length === 0 ? (
        <div className="assessment-panel-empty">
          <p><UiText>{showAiResultsOnly ? "Chưa có kết quả AI nào." : "Chưa có bài nộp của học viên được phân công."}</UiText></p>
        </div>
      ) : (
        <div className="submission-grid">
          {filteredSubmissions.map((s, idx) => {
            const hasResult = hasAiResult(s);
            return (
              <div key={s.id} className="submission-card-item">
                <div className="submission-card-number">
                  <span className="card-number"><UiText>{idx + 1}</UiText></span>
                </div>
                <div className="submission-card-content">
                  <div className="submission-card-header">
                    <h3 className="submission-card-title">
                      {s.title || `Bài nộp #${s.id}`}
                    </h3>
                    {hasResult && (
                      <span className="submission-badge graded">
                        <FiCheckCircle />{" "}<UiText text={"AI đã phân tích"} />{" "}</span>
                    )}
                    {!hasResult && (
                      <span className="submission-badge pending">
                        <FiClock />{" "}<UiText text={"Đang chờ AI"} />{" "}</span>
                    )}
                  </div>
                  <div className="submission-card-info">
                    <div className="submission-info-row">
                      <span className="info-label"><UiText text={"Học viên:"} /></span>
                      <span className="info-value">{s.learner_name || "N/A"}</span>
                    </div>
                    {s.created_at && (
                      <div className="submission-info-row">
                        <span className="info-label"><UiText text={"Ngày nộp:"} /></span>
                        <span className="info-value">
                          <UiText>{new Date(s.created_at).toLocaleDateString('en-GB')}</UiText>
                        </span>
                      </div>
                    )}
                    {hasResult && (
                      <div className="submission-info-row">
                        <span className="info-label"><UiText text={"Điểm AI:"} /></span>
                        <span className="info-value score"><UiText>{Number(s.ai_assessment_contract.metrics.language_quality).toFixed(1)}</UiText>/100</span>
                      </div>
                    )}
                  </div>
                  <div className="submission-card-actions">
                    <button
                      className="btn-view-detail"
                      onClick={() => setSelectedId(s.id)}
                    >
                      <FiEye />{" "}<UiText text={"Xem chi tiết"} />{" "}</button>
                  </div>
                </div>
              </div>
            );
          })}
        </div>
      )}

      {selectedId && (
        <div className="modal-overlay" onClick={(e) => {
          if (e.target === e.currentTarget) setSelectedId(null);
        }}>
          <div className="modal-card" onClick={(e) => e.stopPropagation()}>
            <AssessmentModal
              submissionId={selectedId}
              onClose={() => setSelectedId(null)}
            />
          </div>
        </div>
      )}
    </div>
  );
}

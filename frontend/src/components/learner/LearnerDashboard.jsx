import { UiText } from '../../i18n/UiLanguage.jsx';
// frontend/src/components/learner/LearnerDashboard.jsx
import React, { useState, useEffect } from "react";
import { Link } from "react-router-dom";
import { getAuth } from "../../utils/auth";
import { useAuth } from "../../context/AuthContext";
import api from "../../api";
import ProgressAnalytics from "./ProgressAnalytics";
import WeeklyLearningGoal from './WeeklyLearningGoal';
import OnlineClasses from '../common/OnlineClasses';
import { FiCheckCircle, FiAlertCircle, FiTarget } from "react-icons/fi";
import "../../styles/learner-dashboard.css";
import { presentProgressRecommendations } from "../../utils/progressAnalytics.js";

export default function LearnerDashboard() {
  const auth = getAuth();
  const { } = useAuth();
  const userId = auth?.user?.id ?? auth?.user?._id ?? auth?.user?.user_id ?? null;
  const [learnerId, setLearnerId] = useState(null);
  const [loading, setLoading] = useState(true);
  const [analytics, setAnalytics] = useState(null);
  const [loadingAnalytics, setLoadingAnalytics] = useState(true);
  const [analyticsError, setAnalyticsError] = useState("");
  const [goalSaveVersion, setGoalSaveVersion] = useState(0);
  const recommendations = presentProgressRecommendations(analytics?.recommendations);

  useEffect(() => {
    const controller = new AbortController();
    const { signal } = controller;
    setLearnerId(null);
    setAnalytics(null);
    setAnalyticsError("");
    if (!userId) {
      setLoading(false);
      return () => controller.abort();
    }

    async function load() {
      try {
        setLoading(true);
        const lres = await api.get(`/learners/by-user/${userId}`, { signal });
        if (signal.aborted) return;
        const learnerObj = lres.data?.learner ?? lres.data ?? null;
        const lid = learnerObj?.id ?? learnerObj?.learner_id ?? null;
        setLearnerId(lid);
      } catch (err) {
        if (!signal.aborted) setLearnerId(null);
      } finally {
        if (!signal.aborted) setLoading(false);
      }
    }

    load();
    return () => controller.abort();
  }, [userId]);

  useEffect(() => {
    const controller = new AbortController();
    const { signal } = controller;
    setAnalytics(null);
    setAnalyticsError("");
    if (!learnerId) {
      setLoadingAnalytics(false);
      return () => controller.abort();
    }

    async function loadAnalytics() {
      try {
        setLoadingAnalytics(true);
        const res = await api.get(`/learners/${learnerId}/progress-analytics`, { signal });
        if (!signal.aborted) setAnalytics(res.data);
      } catch (err) {
        if (!signal.aborted) setAnalyticsError("Không thể tải tiến độ lúc này. Vui lòng tải lại trang để thử lại.");
      } finally {
        if (!signal.aborted) setLoadingAnalytics(false);
      }
    }

    loadAnalytics();
    return () => controller.abort();
  }, [learnerId, goalSaveVersion]);

  if (loading) {
    return (
      <div className="learner-dashboard">
        <div className="loading-state"><UiText text={"Đang tải..."} /></div>
      </div>
    );
  }

  if (!learnerId) {
    return (
      <div className="learner-dashboard">
        <div className="error-state"><UiText text={"Không tìm thấy thông tin học viên"} /></div>
      </div>
    );
  }

  return (
    <div className="learner-dashboard">
      <div className="dashboard-header">
        <h1><UiText text={"Dashboard"} /></h1>
        <p><UiText text={"Xem tiến độ học tập và lịch học của bạn, hoặc bắt đầu luyện tập cùng AI."} /></p>
        <Link className="btn btn-primary dashboard-practice-link" to="/learn/practice">{" "}<UiText text={"Bắt đầu luyện tập cùng AI"} />{" "}</Link>
      </div>

      <WeeklyLearningGoal key={`${userId}:${learnerId}`} learnerId={learnerId} onGoalSaved={() => setGoalSaveVersion(version => version + 1)} />

      <div className="dashboard-grid">
        {/* Left Column: Progress Analytics */}
        <div className="dashboard-left-column">
          <div className="dashboard-section analytics-section">
            <div className="section-header">
              <h2><UiText text={"Phân tích tiến độ"} /></h2>
              <p className="section-subtitle"><UiText text={"Xem chi tiết tiến độ học tập và số liệu thống kê"} /></p>
            </div>
            <div className="analytics-content">
              {loadingAnalytics ? (
                <div className="loading-state"><UiText text={"Đang tải dữ liệu phân tích..."} /></div>
              ) : analyticsError ? (
                <div className="error-state" role="alert"><UiText>{analyticsError}</UiText></div>
              ) : analytics ? (
                <ProgressAnalytics analytics={analytics} hideRecommendations={true} />
              ) : (
                <div className="empty-state"><UiText text={"Chưa có dữ liệu phân tích. Hãy bắt đầu luyện tập!"} /></div>
              )}
            </div>
          </div>
        </div>

        {/* Right Column: Calendar + Recommendations */}
        <div className="dashboard-right-column">
          {/* Calendar */}
          <div className="dashboard-section calendar-section">
            <OnlineClasses compact />
          </div>

          {/* AI Recommendations */}
          {analytics && (
            <div className="dashboard-section recommendations-section">
              <div className="section-header">
                <h2><UiText>{recommendations.heading}</UiText></h2>
                <p className="section-subtitle"><UiText text={"Gợi ý hỗ trợ tự học cùng AI; bạn có thể liên hệ Mentor khi cần."} /></p>
              </div>
              <div className="recommendations-content">
                {recommendations.notice && <p className="help-text" role="status"><UiText>{recommendations.notice}</UiText></p>}
                {recommendations.recommendation_source === 'ai_generated' && recommendations.overall_assessment && (
                  <div className="assessment-box">
                    <p><UiText>{recommendations.overall_assessment}</UiText></p>
                  </div>
                )}

                {recommendations.strengths.length > 0 && (
                  <div className="recommendations-group">
                    <h4>
                      <FiCheckCircle className="icon-success" />{" "}<UiText text={"Điểm Mạnh"} />{" "}</h4>
                    <ul className="recommendations-list">
                      {recommendations.strengths.map((strength, idx) => (
                        <li key={idx}><UiText>{strength}</UiText></li>
                      ))}
                    </ul>
                  </div>
                )}

                {recommendations.improvements_needed.length > 0 && (
                  <div className="recommendations-group">
                    <h4>
                      <FiAlertCircle className="icon-warning" />{" "}<UiText text={"Cần Cải Thiện"} />{" "}</h4>
                    <ul className="recommendations-list">
                      {recommendations.improvements_needed.map((improvement, idx) => (
                        <li key={idx}><UiText>{improvement}</UiText></li>
                      ))}
                    </ul>
                  </div>
                )}

                {recommendations.recommendations.length > 0 && (
                  <div className="recommendations-group">
                    <h4>
                      <FiTarget className="icon-primary" />{" "}<UiText text={"Gợi Ý Cải Thiện"} />{" "}</h4>
                    <ul className="recommendations-list">
                      {recommendations.recommendations.map((rec, idx) => (
                        <li key={idx}><UiText>{rec}</UiText></li>
                      ))}
                    </ul>
                  </div>
                )}

                {recommendations.priority_areas.length > 0 && (
                  <div className="recommendations-group">
                    <h4>
                      <FiTarget className="icon-primary" />{" "}<UiText text={"Lĩnh Vực Ưu Tiên"} />{" "}</h4>
                    <ul className="recommendations-list">
                      {recommendations.priority_areas.map((area, idx) => (
                        <li key={idx}><UiText>{area}</UiText></li>
                      ))}
                    </ul>
                  </div>
                )}
              </div>
            </div>
          )}
        </div>
      </div>
    </div>
  );
}
